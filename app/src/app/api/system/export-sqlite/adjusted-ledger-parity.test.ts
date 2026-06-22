import { describe, it, expect, vi } from "vitest";

// route.ts는 모듈 로드 시 createClient(url,...)를 실행하므로 import 이전에 유효 URL 주입(normalize.test.ts 패턴).
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
});

import {
  allocateCandidateAccBookForExport,
  normalizeOfficialExpenseRow,
  stripAppOnlyAccBookColumns,
} from "./route";
import { buildAdjustedAccBook } from "@/lib/accounting/adjusted-ledger";
import { fillExportSortNumbers } from "@/lib/accounting/acc-book-sort";
import { fillExportReceiptNumbers, type ReceiptCodeNames } from "@/lib/accounting/receipt-no";

/**
 * TC-2 (FR-04): 재조정 데이터 뷰어(income-expense-book) 경로와 export-sqlite 경로가
 * 동일 픽스처에서 **동일한 영수증일련번호**를 산출하는지 교차 회귀.
 *
 * 두 경로 모두 채번 전 fillExportSortNumbers로 acc_sort_num을 재계산한다(SSOT 동일):
 * - 뷰어:   buildAdjustedAccBook → fillExportSortNumbers → fillExportReceiptNumbers
 * - export: allocateCandidateAccBookForExport(=동일 함수) → normalizeOfficialExpenseRow
 *           → fillExportSortNumbers → stripAppOnlyAccBookColumns → fillExportReceiptNumbers
 *
 * fillExportReceiptNumbers는 acc_date→acc_sort_num→acc_book_id 순으로 채번하므로, 뷰어가
 * fillExportSortNumbers를 빼면 같은 날 acc_time이 다른 거래의 순번이 .db와 어긋난다(CodeRabbit
 * #90 지적). 아래 "같은 날·다른 acc_time" 케이스가 그 회귀를 고정한다.
 */
const NAMES: ReceiptCodeNames = {
  acc: { 82: "보조금", 84: "후보자등자산" },
  item: { 86: "선거비용", 87: "선거비용외정치자금" },
};

const row = (p: Record<string, unknown>): Record<string, unknown> => ({
  acc_book_id: 1,
  incm_sec_cd: 1,
  acc_sec_cd: 84,
  item_sec_cd: 86,
  acc_date: "20260101",
  acc_time: null,
  content: "x",
  acc_amt: 0,
  rcp_yn: "Y",
  rcp_no: null,
  rcp_no2: null,
  bigo: null,
  cust_id: 1,
  ...p,
});

/** acc_book_id → rcp_no 맵(채번 결과 비교용). */
const rcpById = (rows: Record<string, unknown>[]) =>
  new Map(rows.map((r) => [Number(r.acc_book_id), (r.rcp_no as string | null) ?? null]));

/** 뷰어(page.tsx handleQuery) 채번 경로 재현. */
const viewerReceipts = (fixture: Record<string, unknown>[]) =>
  fillExportReceiptNumbers(fillExportSortNumbers(buildAdjustedAccBook(fixture)), NAMES);

/** export-sqlite(route.ts) 채번 경로 재현(normalize→sort→strip→fillReceipt). */
const exportReceipts = (fixture: Record<string, unknown>[]) =>
  fillExportReceiptNumbers(
    fillExportSortNumbers(
      allocateCandidateAccBookForExport(fixture).map(normalizeOfficialExpenseRow),
    ).map(stripAppOnlyAccBookColumns),
    NAMES,
  );

describe("재조정 뷰어 == export-sqlite 영수증번호 교차 정합(TC-2)", () => {
  it("후보자 분할 픽스처: 두 경로의 acc_book_id별 rcp_no 완전 일치", () => {
    const fixture = [
      row({ acc_book_id: 1, incm_sec_cd: 1, acc_sec_cd: 84, item_sec_cd: 86, acc_amt: 100000, acc_date: "20260101" }),
      row({ acc_book_id: 2, incm_sec_cd: 1, acc_sec_cd: 82, item_sec_cd: 86, acc_amt: 30000, acc_date: "20260102" }),
      row({ acc_book_id: 3, incm_sec_cd: 2, acc_sec_cd: 82, item_sec_cd: 86, acc_amt: 50000, acc_date: "20260103" }),
    ];

    const vMap = rcpById(viewerReceipts(fixture));
    const eMap = rcpById(exportReceipts(fixture));

    // 같은 acc_book_id 집합 + 같은 rcp_no
    expect([...eMap.keys()].sort()).toEqual([...vMap.keys()].sort());
    for (const [id, rcp] of vMap) expect(eMap.get(id)).toBe(rcp);

    // 회귀 고정값: 82 지출(잔류)=보(비)-1, 84 지출(이동분)=자(비)-1
    const movedIds = [...vMap.keys()].filter((id) => id !== 1 && id !== 2 && id !== 3);
    expect(movedIds).toHaveLength(1); // 분할 이동분이 정확히 1행 생성됨을 명시 검증
    expect(vMap.get(3)).toBe("보(비)-1");
    expect(vMap.get(movedIds[0])).toBe("자(비)-1");
  });

  it("같은 날·다른 acc_time: acc_sort_num 재계산 없으면 갈리는 채번을 정합 고정", () => {
    // 같은 날(20260301) 84/86 수입 2건 — acc_time 순서(0900→1400)와 acc_book_id 순서(1,2)가 불일치.
    //   export는 fillExportSortNumbers로 acc_time 우선 정렬해 id=2(09:00)가 자(비)-1, id=1(14:00)이 자(비)-2.
    //   뷰어가 fillExportSortNumbers를 빠뜨리면 id 순서대로 id=1이 자(비)-1이 되어 .db와 어긋난다.
    const fixture = [
      row({ acc_book_id: 1, incm_sec_cd: 1, acc_sec_cd: 84, item_sec_cd: 86, acc_amt: 100000, acc_date: "20260301", acc_time: "1400" }),
      row({ acc_book_id: 2, incm_sec_cd: 1, acc_sec_cd: 84, item_sec_cd: 86, acc_amt: 30000, acc_date: "20260301", acc_time: "0900" }),
    ];

    const vMap = rcpById(viewerReceipts(fixture));
    const eMap = rcpById(exportReceipts(fixture));

    for (const [id, rcp] of vMap) expect(eMap.get(id)).toBe(rcp);
    // acc_time 빠른 거래(09:00, id=2)가 자(비)-1, 늦은 거래(14:00, id=1)가 자(비)-2.
    expect(vMap.get(2)).toBe("자(비)-1");
    expect(vMap.get(1)).toBe("자(비)-2");
  });
});
