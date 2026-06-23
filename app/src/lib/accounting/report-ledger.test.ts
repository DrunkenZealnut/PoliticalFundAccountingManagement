import { describe, it, expect } from "vitest";
import { buildReportLedgerRecords } from "./report-ledger";
import { buildAdjustedAccBook } from "./adjusted-ledger";
import { fillExportReceiptNumbers, type ReceiptCodeNames } from "./receipt-no";

/** acc_book 행 헬퍼(reports AccRecord 호환 스냅샷 키). */
const row = (p: Record<string, unknown>): Record<string, unknown> => ({
  acc_book_id: 1,
  incm_sec_cd: 1,
  acc_sec_cd: 84,
  item_sec_cd: 86,
  acc_date: "20260101",
  content: "x",
  acc_amt: 0,
  rcp_yn: "N",
  rcp_no: null,
  rcp_no2: null,
  bigo: null,
  cust_id: 1,
  ...p,
});

/** 후보자 코드명: 84=후보자등자산('자'), 85=후원회기부금('후'), 86=선거비용, 87=선거비용외. */
const ACC_NAME: Record<number, string> = {
  82: "보조금",
  83: "보조금외지원금",
  84: "후보자등자산",
  85: "후원회기부금",
  86: "선거비용",
  87: "선거비용외정치자금",
};
const getName = (id: number) => ACC_NAME[id] ?? String(id);
const codeNamesFrom = (rows: Record<string, unknown>[]): ReceiptCodeNames => {
  const cn: ReceiptCodeNames = { acc: {}, item: {} };
  for (const r of rows) {
    cn.acc[Number(r.acc_sec_cd)] = getName(Number(r.acc_sec_cd));
    cn.item[Number(r.item_sec_cd)] = getName(Number(r.item_sec_cd));
  }
  return cn;
};

const prefix = (rcp: unknown): string => String(rcp ?? "").replace(/-\d+$/, "");

describe("buildReportLedgerRecords — 영수증 재배분 정합 (reports == 뷰어/export SSOT)", () => {
  // 감사 재현: 84 자금원 지출이 84 소진분(자(비)-1 유지) + 85 이동분으로 분할.
  //   이동분은 원본 '자(비)-1'을 물려받지만(stale), 85 자금원 접두사 '후(비)'로 재채번돼야 한다.
  const FIXTURE = [
    row({ acc_book_id: 1, acc_sec_cd: 84, incm_sec_cd: 1, item_sec_cd: 86, acc_amt: 100000, acc_date: "20260101" }),
    row({ acc_book_id: 2, acc_sec_cd: 85, incm_sec_cd: 1, item_sec_cd: 86, acc_amt: 100000, acc_date: "20260102" }),
    row({
      acc_book_id: 3, acc_sec_cd: 84, incm_sec_cd: 2, item_sec_cd: 86, acc_amt: 150000,
      acc_date: "20260103", rcp_yn: "Y", rcp_no: "자(비)-1", rcp_no2: 1, content: "현수막",
    }),
  ];

  it("분할/이동 조각이 자금원별 고유 접두사로 재채번 — 중복 영수증번호 0", () => {
    const out = buildReportLedgerRecords(FIXTURE, getName, true);
    const numbered = out.filter((r) => String(r.rcp_yn) === "Y");

    // 지출 150,000이 84:100,000 + 85:50,000으로 분할
    expect(numbered).toHaveLength(2);
    const by = (acc: number) => numbered.find((r) => Number(r.acc_sec_cd) === acc)!;
    expect(Number(by(84).acc_amt)).toBe(100000);
    expect(Number(by(85).acc_amt)).toBe(50000);

    // 84 소진분은 접두사 일치 → 원번호 보존, 85 이동분은 stale → '후(비)'로 재홈잉
    expect(by(84).rcp_no).toBe("자(비)-1");
    expect(prefix(by(85).rcp_no)).toBe("후(비)");

    // 영수증번호 전역 중복 0 (감사 버그: 두 조각이 '자(비)-1' 공유)
    const nos = numbered.map((r) => r.rcp_no);
    expect(new Set(nos).size).toBe(nos.length);
  });

  it("각 영수증번호 접두사 == 그 행의 자금원 약자 (접두사 정합)", () => {
    const ABBR: Record<number, string> = { 82: "보", 83: "외", 84: "자", 85: "후" };
    const out = buildReportLedgerRecords(FIXTURE, getName, true);
    for (const r of out.filter((x) => String(x.rcp_yn) === "Y")) {
      // 선거비용(86) → '{약자}(비)'
      expect(prefix(r.rcp_no)).toBe(`${ABBR[Number(r.acc_sec_cd)]}(비)`);
    }
  });

  it("뷰어/export 파이프라인과 행 단위 동일 (buildAdjustedAccBook + fillExportReceiptNumbers)", () => {
    const viaHelper = buildReportLedgerRecords(FIXTURE, getName, true);
    const adjusted = buildAdjustedAccBook(FIXTURE);
    const viaDirect = fillExportReceiptNumbers(adjusted, codeNamesFrom(adjusted));
    expect(viaHelper).toEqual(viaDirect);
  });

  it("배분은 금액 보존 — 수입·지출 합계 불변", () => {
    const out = buildReportLedgerRecords(FIXTURE, getName, true);
    const sum = (incm: number) =>
      out.filter((r) => Number(r.incm_sec_cd) === incm).reduce((s, r) => s + Number(r.acc_amt), 0);
    expect(sum(1)).toBe(200000); // 수입 100,000 + 100,000
    expect(sum(2)).toBe(150000); // 지출 150,000 (분할 후에도 보존)
  });

  it("비후보자(isCandidate=false)는 입력 그대로 반환(무변경)", () => {
    const input = [
      row({ acc_book_id: 1, acc_sec_cd: 1, incm_sec_cd: 1, item_sec_cd: 94, acc_amt: 1000 }),
      row({ acc_book_id: 2, acc_sec_cd: 2, incm_sec_cd: 2, item_sec_cd: 97, acc_amt: 500, rcp_yn: "Y", rcp_no: "기-1" }),
    ];
    expect(buildReportLedgerRecords(input, getName, false)).toBe(input);
  });
});
