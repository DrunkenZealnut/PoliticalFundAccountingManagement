import { describe, it, expect, vi } from "vitest";

// route.ts는 모듈 로드 시 createClient(url,...)를 실행하므로 import 이전에 유효 URL 주입(parity test 패턴).
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
});

import {
  allocateCandidateAccBookForExport,
  normalizeOfficialExpenseRow,
  stripAppOnlyAccBookColumns,
  splitOfficialReceiptNo,
} from "./route";
import { fillExportSortNumbers } from "@/lib/accounting/acc-book-sort";
import { fillExportReceiptNumbers, type ReceiptCodeNames } from "@/lib/accounting/receipt-no";

/**
 * .db 생성 시 "수입·지출 분할" 비대칭 계약 회귀 (export-db-split-verification, FR-01·FR-02):
 *   - ACC_BOOK       = 보고용 장부  → allocateCandidateAccBookForExport(=buildAdjustedAccBook)로 **분할** 적용.
 *   - ACC_BOOK_BAK   = 변경이력 백업 → 분할 미적용, **원본** 보존.
 * route.ts:768~780 의 finalAccBook / finalAccBookBak 구성을 그대로 재현한다(full 모드 =
 * remapOrgId/filterByExportOrgId no-op). 이 비대칭이 깨지면(예: BAK도 분할, ACC_BOOK 분할 제거)
 * CI가 실패해 사전 차단한다.
 */
const NAMES: ReceiptCodeNames = {
  acc: { 82: "보조금", 83: "보조금외지원금", 84: "후보자등자산", 85: "후원회기부금" },
  item: { 86: "선거비용", 87: "선거비용외정치자금" },
};

const row = (p: Record<string, unknown>): Record<string, unknown> => ({
  acc_book_id: 1,
  org_id: 1,
  incm_sec_cd: 1,
  acc_sec_cd: 84,
  item_sec_cd: 86,
  exp_sec_cd: -1,
  cust_id: 1,
  acc_date: "20260101",
  content: "x",
  acc_amt: 0,
  rcp_yn: "Y",
  rcp_no: null,
  rcp_no2: null,
  acc_ins_type: "",
  bigo: null,
  ...p,
});

/** ACC_BOOK 경로(route.ts, full 모드): allocate(분할)→normalize→sort→strip→receipt→공식 분리. */
const accBookExport = (fixture: Record<string, unknown>[]) =>
  fillExportReceiptNumbers(
    fillExportSortNumbers(
      allocateCandidateAccBookForExport(fixture).map(normalizeOfficialExpenseRow),
    ).map(stripAppOnlyAccBookColumns),
    NAMES,
  ).map(splitOfficialReceiptNo);

/** ACC_BOOK_BAK 경로(route.ts:775~780): allocate **없이** normalize→sort→strip→receipt. */
const accBookBakExport = (fixture: Record<string, unknown>[]) =>
  fillExportReceiptNumbers(
    fillExportSortNumbers(fixture.map(normalizeOfficialExpenseRow)).map(stripAppOnlyAccBookColumns),
    NAMES,
  );

// 후보자 분할 픽스처: 84 자금원 지출 150,000이 84 가용 100,000 소진 → 50,000을 85로 이동/분할.
const FIXTURE = [
  row({ acc_book_id: 1, acc_sec_cd: 84, incm_sec_cd: 1, item_sec_cd: 86, acc_amt: 100000, acc_date: "20260101", rcp_yn: "N" }),
  row({ acc_book_id: 2, acc_sec_cd: 85, incm_sec_cd: 1, item_sec_cd: 86, acc_amt: 100000, acc_date: "20260102", rcp_yn: "N" }),
  row({ acc_book_id: 3, acc_sec_cd: 84, incm_sec_cd: 2, item_sec_cd: 86, acc_amt: 150000, acc_date: "20260103", rcp_yn: "Y", acc_ins_type: "118" }),
];

const expenseRows = (rows: Record<string, unknown>[]) => rows.filter((r) => Number(r.incm_sec_cd) === 2);
const sumExpense = (rows: Record<string, unknown>[]) =>
  expenseRows(rows).reduce((s, r) => s + Number(r.acc_amt), 0);

describe("export .db 수입·지출 분할 계약 — ACC_BOOK 분할 / ACC_BOOK_BAK 원본", () => {
  it("FR-01: ACC_BOOK은 분할 적용 — 지출이 84/85 두 자금원으로 쪼개진다", () => {
    const acc = accBookExport(FIXTURE);
    const exp = expenseRows(acc);

    // 원본 지출 1건이 84(잔류)+85(이동)로 분할 → 지출 2행
    expect(exp).toHaveLength(2);
    expect(exp.some((r) => Number(r.acc_sec_cd) === 84 && Number(r.acc_amt) === 100000)).toBe(true);
    expect(exp.some((r) => Number(r.acc_sec_cd) === 85 && Number(r.acc_amt) === 50000)).toBe(true);
    // 분할로 전체 행 수가 원본보다 증가(3 → 4)
    expect(acc.length).toBeGreaterThan(FIXTURE.length);
  });

  it("회귀: ACC_BOOK 산출 행에 공식 DDL 외 키 누출 없음 (customer→CUSTOMER 방지)", () => {
    // buildAdjustedAccBook이 후보자 행에 customer 키를 주입(adjusted-ledger.ts) →
    // strip이 제거 못하면 insertRows가 "table ACC_BOOK has no column named CUSTOMER"로 실패.
    const acc = accBookExport(FIXTURE);
    const forbidden = [
      "customer", "claim_amt", "alloc_src_id", "alloc_seq",
      "raw_incm_sec_cd", "raw_acc_sec_cd", "raw_item_sec_cd", "raw_acc_amt", "alloc_gen",
    ];
    for (const r of acc) {
      for (const k of forbidden) {
        expect(`${k} present? ${k in r}`).toBe(`${k} present? false`);
      }
    }
  });

  it("FR-02: ACC_BOOK_BAK은 원본 보존 — 분할 없이 행 수·자금원 유지", () => {
    const bak = accBookBakExport(FIXTURE);

    // 행 수가 입력과 동일(분할로 늘지 않음)
    expect(bak).toHaveLength(FIXTURE.length);
    // 지출은 원본 그대로 84 자금원 1건 150,000 (85로 이동 없음)
    const exp = expenseRows(bak);
    expect(exp).toHaveLength(1);
    expect(Number(exp[0].acc_sec_cd)).toBe(84);
    expect(Number(exp[0].acc_amt)).toBe(150000);
  });

  it("분할 전후 지출 총액 보존 (ACC_BOOK 분할합 == ACC_BOOK_BAK 원본)", () => {
    expect(sumExpense(accBookExport(FIXTURE))).toBe(150000);
    expect(sumExpense(accBookBakExport(FIXTURE))).toBe(150000);
  });

  it("비후보자(자금원 82~85 없음)는 ACC_BOOK도 분할하지 않는다(원본 반환)", () => {
    const nonCandidate = [
      row({ acc_book_id: 1, acc_sec_cd: 1, incm_sec_cd: 1, item_sec_cd: 94, acc_amt: 1000, rcp_yn: "N" }),
      row({ acc_book_id: 2, acc_sec_cd: 2, incm_sec_cd: 2, item_sec_cd: 97, acc_amt: 500, acc_ins_type: "118" }),
    ];
    expect(accBookExport(nonCandidate)).toHaveLength(nonCandidate.length);
  });

  // ── 영수증번호 공식 분리 포맷(윈도우 프로그램 RCP_NO+RCP_NO2 덧붙임 방지) ──
  it("splitOfficialReceiptNo: '자(비)-24' → RCP_NO='자(비)-', RCP_NO2=24 (덧붙음 버그 단위 재현)", () => {
    // 버그 전: RCP_NO='자(비)-24' + RCP_NO2=67 → 윈도우 표시 '자(비)-2467'
    expect(splitOfficialReceiptNo({ rcp_no: "자(비)-24", rcp_no2: 67 })).toMatchObject({
      rcp_no: "자(비)-",
      rcp_no2: 24,
    });
    // 선거비용외(자-N), 후원회(후-N)도 동일
    expect(splitOfficialReceiptNo({ rcp_no: "자-4", rcp_no2: 99 })).toMatchObject({ rcp_no: "자-", rcp_no2: 4 });
    // 숫자형 영수증 아님(빈값/미지급) → RCP_NO2=0 (덧붙음 방지)
    expect(splitOfficialReceiptNo({ rcp_no: null, rcp_no2: 5 }).rcp_no2).toBe(0);
    expect(splitOfficialReceiptNo({ rcp_no: "미지급", rcp_no2: 5 }).rcp_no2).toBe(0);
  });

  it("회귀: ACC_BOOK export 영수증 행은 공식 분리 포맷 — RCP_NO은 접두사('-'로 끝), RCP_NO2은 숫자", () => {
    const acc = accBookExport(FIXTURE);
    const numbered = acc.filter(
      (r) => String(r.rcp_yn) === "Y" && String(r.rcp_no ?? "") !== "",
    );
    expect(numbered.length).toBeGreaterThan(0);
    for (const r of numbered) {
      const no = String(r.rcp_no);
      expect(no.endsWith("-")).toBe(true); // 접두사만 (예 '자(비)-')
      expect(/\d/.test(no)).toBe(false); // 숫자가 RCP_NO에 남아있지 않음 (덧붙음 방지)
      expect(Number.isInteger(r.rcp_no2 as number)).toBe(true);
      expect(Number(r.rcp_no2)).toBeGreaterThan(0); // 숫자 시퀀스는 RCP_NO2에
    }
  });
});
