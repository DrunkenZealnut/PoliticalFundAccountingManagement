import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import {
  buildStandardCombos,
  buildDataCombos,
  buildReportWorkbook,
  type AccRecord,
  type Customer,
} from "./build-report-workbook";

describe("buildStandardCombos", () => {
  it("orgSecCd 없으면 빈 배열", () => {
    expect(buildStandardCombos(null, () => [], () => [])).toEqual([]);
  });

  it("수입(1)·지출(2) 각 계정×과목을 전개하고 중복을 dedup", () => {
    const getAccounts = (_orgSecCd: number, incm: number) =>
      incm === 1 ? [{ cv_id: 82 }] : [{ cv_id: 82 }, { cv_id: 84 }];
    const getItems = (_orgSecCd: number, _incm: number, accSecCd: number) =>
      accSecCd === 82 ? [{ cv_id: 86 }, { cv_id: 87 }] : [{ cv_id: 86 }];

    const combos = buildStandardCombos(10, getAccounts, getItems);
    expect(combos).toEqual([
      { accSecCd: 82, itemSecCd: 86 },
      { accSecCd: 82, itemSecCd: 87 },
      { accSecCd: 84, itemSecCd: 86 },
    ]);
  });

  it("수입·지출 양쪽에 같은 (계정×과목)이 있으면 1개만 남는다", () => {
    const getAccounts = () => [{ cv_id: 82 }];
    const getItems = () => [{ cv_id: 86 }];
    expect(buildStandardCombos(10, getAccounts, getItems)).toEqual([
      { accSecCd: 82, itemSecCd: 86 },
    ]);
  });
});

describe("buildDataCombos", () => {
  const row = (over: Partial<AccRecord>): AccRecord => ({
    acc_book_id: 1,
    org_id: 1,
    incm_sec_cd: 1,
    acc_sec_cd: 82,
    item_sec_cd: 86,
    exp_sec_cd: 0,
    cust_id: 0,
    acc_date: "20260101",
    content: "",
    acc_amt: 0,
    rcp_yn: "N",
    rcp_no: null,
    rcp_no2: null,
    bigo: null,
    ...over,
  });

  it("레코드 0건 → 빈 배열", () => {
    expect(buildDataCombos([])).toEqual([]);
  });

  it("실거래에 존재하는 (계정×과목) 조합만 dedup 추출", () => {
    const records = [
      row({ acc_sec_cd: 82, item_sec_cd: 86 }),
      row({ acc_sec_cd: 82, item_sec_cd: 86 }), // 중복
      row({ acc_sec_cd: 84, item_sec_cd: 87 }),
    ];
    expect(buildDataCombos(records)).toEqual([
      { accSecCd: 82, itemSecCd: 86 },
      { accSecCd: 84, itemSecCd: 87 },
    ]);
  });
});

/* ------------------------------------------------------------------ */
/*  buildReportWorkbook — ExcelJS 라운드트립(write→reload)으로 실제 셀     */
/*  수치를 검증한다. 계산과 셀쓰기가 buildSummarySheet/buildLedgerSheet    */
/*  안에서 결합돼 있어(reports/page.tsx 원본 구조 그대로 추출) 모델만      */
/*  분리 테스트할 수 없다 — 이 파일의 유일한 검증 경로.                    */
/* ------------------------------------------------------------------ */
describe("buildReportWorkbook (라운드트립)", () => {
  const NAMES: Record<number, string> = { 82: "보조금", 86: "선거비용" };
  const getName = (id: number) => NAMES[id] ?? String(id);

  const acc = (over: Partial<AccRecord>): AccRecord => ({
    acc_book_id: 1,
    org_id: 1,
    incm_sec_cd: 1,
    acc_sec_cd: 82,
    item_sec_cd: 86,
    exp_sec_cd: 0,
    cust_id: 0,
    acc_date: "20260101",
    content: "",
    acc_amt: 0,
    rcp_yn: "N",
    rcp_no: null,
    rcp_no2: null,
    bigo: null,
    ...over,
  });

  async function buildAndReload(records: AccRecord[]) {
    const { buffer, sheetCount, comboCount } = await buildReportWorkbook({
      records,
      custMap: new Map<number, Customer>(),
      estates: [],
      combos: [{ accSecCd: 82, itemSecCd: 86 }],
      covers: { accountCover: false, subjectCover: false },
      orgName: "테스트기관",
      orgSecCd: 10,
      acctName: "홍길동",
      electionName: "",
      districtName: "",
      dateFrom: "2026-01-01",
      dateTo: "2026-12-31",
      getName,
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ledger = wb.worksheets.find((ws) => ws.name.includes("보조금"));
    return { wb, ledger: ledger!, sheetCount, comboCount };
  }

  it("수입·지출 누계와 잔액을 순서대로 누적한다", async () => {
    const records = [
      acc({ acc_book_id: 1, incm_sec_cd: 1, acc_amt: 100_000, acc_date: "20260101", rcp_yn: "Y" }),
      acc({ acc_book_id: 2, incm_sec_cd: 2, acc_amt: 40_000, acc_date: "20260102", rcp_yn: "N" }),
    ];
    const { ledger } = await buildAndReload(records);

    // 데이터 행은 7행부터(헤더 5-6행)
    expect(ledger.getRow(7).getCell(4).value).toBe(100_000); // 수입 누계
    expect(ledger.getRow(8).getCell(6).value).toBe(40_000); // 지출 누계
    expect(ledger.getRow(8).getCell(7).value).toBe(60_000); // 잔액

    // 합계 행(데이터 2행 다음 = 9행)
    const totalRow = ledger.getRow(9);
    expect(totalRow.getCell(3).value).toBe(100_000);
    expect(totalRow.getCell(5).value).toBe(40_000);
    expect(totalRow.getCell(7).value).toBe(60_000);
    expect(totalRow.getCell(13).value).toBe("2건");
  });

  it("영수증 첨부(Y)·생략(N) 금액을 수입/지출별로 분리 집계한다", async () => {
    const records = [
      acc({ acc_book_id: 1, incm_sec_cd: 1, acc_amt: 100_000, acc_date: "20260101", rcp_yn: "Y" }),
      acc({ acc_book_id: 2, incm_sec_cd: 2, acc_amt: 40_000, acc_date: "20260102", rcp_yn: "N" }),
    ];
    const { ledger } = await buildAndReload(records);

    // 합계(9) 다음: 첨부분(10) · 생략분(11)
    const attachRow = ledger.getRow(10);
    expect(attachRow.getCell(3).value).toBe(100_000); // 첨부분 수입
    expect(attachRow.getCell(5).value).toBe(0); // 첨부분 지출(없음)
    const skipRow = ledger.getRow(11);
    expect(skipRow.getCell(3).value).toBe(0); // 생략분 수입(없음)
    expect(skipRow.getCell(5).value).toBe(40_000); // 생략분 지출
  });

  it("같은 날짜는 수입(incm=1)을 지출보다 먼저 정렬한다(잔액 음수 방지 tie-break)", async () => {
    const records = [
      acc({ acc_book_id: 1, incm_sec_cd: 2, acc_amt: 30_000, acc_date: "20260101" }), // 지출 먼저 입력
      acc({ acc_book_id: 2, incm_sec_cd: 1, acc_amt: 50_000, acc_date: "20260101" }), // 수입, 같은 날짜
    ];
    const { ledger } = await buildAndReload(records);

    // tie-break 로 수입(50000)이 7행에 먼저, 지출(30000)이 8행에 와야 함
    expect(ledger.getRow(7).getCell(3).value).toBe(50_000); // 수입 금회
    expect(ledger.getRow(8).getCell(5).value).toBe(30_000); // 지출 금회
    expect(ledger.getRow(8).getCell(7).value).toBe(20_000); // 잔액 = 50000-30000
  });

  it("거래 0건인 (계정×과목)은 손기입용 빈 행 1개를 남긴다", async () => {
    const { ledger } = await buildAndReload([]);
    // 데이터 0행 → 빈 행(7) + 합계(8)
    expect(ledger.getRow(7).getCell(1).value).toBeNull();
    const totalRow = ledger.getRow(8);
    expect(totalRow.getCell(3).value).toBe(0);
    expect(totalRow.getCell(13).value).toBe("0건");
  });

  it("시트 수·콤보 수를 결과로 반환한다(총괄1+재산2+표지1+콤보N)", async () => {
    const { sheetCount, comboCount, wb } = await buildAndReload([
      acc({ acc_book_id: 1, incm_sec_cd: 1, acc_amt: 10_000 }),
    ]);
    expect(comboCount).toBe(1);
    expect(sheetCount).toBe(wb.worksheets.length);
    expect(sheetCount).toBe(5); // 총괄표+재산명세서+재산구분별+표지+콤보1(커버 끔)
  });
});
