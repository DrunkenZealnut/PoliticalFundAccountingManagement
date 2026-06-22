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
 * - 뷰어:   buildAdjustedAccBook → fillExportReceiptNumbers
 * - export: allocateCandidateAccBookForExport(=동일 함수) → normalizeOfficialExpenseRow
 *           → fillExportSortNumbers → stripAppOnlyAccBookColumns → fillExportReceiptNumbers
 *
 * export만 거치는 sort/normalize/strip 단계가 채번(acc_sec_cd·item_sec_cd·incm_sec_cd·정렬)에
 * 영향을 주지 않아야 화면 == .db == HWPX 가 보장된다. (정렬 차이로 어긋나면 이 테스트가 잡는다.)
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

describe("재조정 뷰어 == export-sqlite 영수증번호 교차 정합(TC-2)", () => {
  it("후보자 분할 픽스처: 두 경로의 acc_book_id별 rcp_no 완전 일치", () => {
    const fixture = [
      row({ acc_book_id: 1, incm_sec_cd: 1, acc_sec_cd: 84, item_sec_cd: 86, acc_amt: 100000, acc_date: "20260101" }),
      row({ acc_book_id: 2, incm_sec_cd: 1, acc_sec_cd: 82, item_sec_cd: 86, acc_amt: 30000, acc_date: "20260102" }),
      row({ acc_book_id: 3, incm_sec_cd: 2, acc_sec_cd: 82, item_sec_cd: 86, acc_amt: 50000, acc_date: "20260103" }),
    ];

    // 뷰어 경로
    const viewer = fillExportReceiptNumbers(buildAdjustedAccBook(fixture), NAMES);

    // export 경로(실제 route 순서 재현)
    const exported = fillExportReceiptNumbers(
      fillExportSortNumbers(
        allocateCandidateAccBookForExport(fixture).map(normalizeOfficialExpenseRow),
      ).map(stripAppOnlyAccBookColumns),
      NAMES,
    );

    const vMap = rcpById(viewer);
    const eMap = rcpById(exported);

    // 같은 acc_book_id 집합 + 같은 rcp_no
    expect([...eMap.keys()].sort()).toEqual([...vMap.keys()].sort());
    for (const [id, rcp] of vMap) expect(eMap.get(id)).toBe(rcp);

    // 회귀 고정값: 82 지출(잔류)=보(비)-1, 84 지출(이동분)=자(비)-1
    const movedId = [...vMap.keys()].find((id) => id !== 1 && id !== 2 && id !== 3)!;
    expect(vMap.get(3)).toBe("보(비)-1");
    expect(vMap.get(movedId)).toBe("자(비)-1");
  });
});
