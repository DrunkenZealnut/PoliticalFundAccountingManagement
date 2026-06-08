/**
 * 통합 테스트: 회계보고서 22-1(총괄표)·22-4(수입·지출부) 실제 템플릿 →
 * 모델 렌더 → 재패키징 → 다시 열어 무결성 검증 (한글 실오픈 자동화 대체).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import JSZip from "jszip";
import { repackageSection, generateHwpx } from "./generate";
import { renderIncomeLedgerSection } from "./owpml-table";
import { buildIncomeLedgerModel, type IncomeLedgerInputRow } from "./income-ledger-builder";
import {
  buildReportSummaryModel,
  summaryTokens,
  type ReportSummaryInputRow,
} from "./report-summary-builder";

const SECTION = "Contents/section0.xml";
const getName = (cv: number) =>
  ({ 82: "보조금인 지원금", 83: "보조금외 지원금", 84: "후보자 자산", 85: "후원회 기부금", 10: "선거비용", 11: "선거비용외 정치자금" }[cv] ?? `코드${cv}`);

async function readSection(bytes: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(bytes);
  return zip.file(SECTION)!.async("string");
}

function assertBalanced(xml: string) {
  for (const tag of ["hp:tbl", "hp:tr", "hp:tc", "hp:p", "hp:run"]) {
    const open = (xml.match(new RegExp(`<${tag}\\b(?![^>]*/>)`, "g")) ?? []).length;
    const close = (xml.match(new RegExp(`</${tag}>`, "g")) ?? []).length;
    expect(open, `${tag} 불균형 open=${open} close=${close}`).toBe(close);
  }
}

/* ----------------------------- 22-4 수입·지출부 ----------------------------- */
function ledgerRow(p: Partial<IncomeLedgerInputRow>): IncomeLedgerInputRow {
  return {
    acc_date: "20260521", incm_sec_cd: 1, acc_sec_cd: 84, item_sec_cd: 10, content: "내역",
    acc_amt: 1000, rcp_no: null, cust_id: 1,
    customer: { name: "홍길동", reg_num: "570923", addr: "서울 종로", addr_detail: "1", job: "정치인", tel: "02-1" },
    ...p,
  };
}

async function gen224(rows: IncomeLedgerInputRow[]): Promise<Uint8Array> {
  const template = new Uint8Array(readFileSync(join(process.cwd(), "public/hwpx-templates/form-22-4-fill.hwpx")));
  const zip = await JSZip.loadAsync(template);
  const section = await zip.file(SECTION)!.async("string");
  const model = buildIncomeLedgerModel(rows, getName);
  return repackageSection(template, renderIncomeLedgerSection(section, model));
}

describe("회계보고서 22-4 통합 (form-22-4-fill.hwpx)", () => {
  it("수입·지출이 한 표에 채워지고 잔액 계산 + 비고 컬럼 토큰 치환", async () => {
    const bytes = await gen224([
      ledgerRow({ incm_sec_cd: 1, acc_sec_cd: 84, item_sec_cd: 10, acc_date: "20260521", acc_amt: 10000000, content: "자산 출연" }),
      ledgerRow({ incm_sec_cd: 2, acc_sec_cd: 84, item_sec_cd: 10, acc_date: "20260604", acc_amt: 5000000, content: "수당 지급" }),
    ]);
    const sec = await readSection(bytes);
    expect((sec.match(/<hp:tbl\b/g) ?? []).length).toBe(1);
    expect(sec).toContain("자산 출연");
    expect(sec).toContain("수당 지급");
    expect(sec).toContain("10,000,000");
    expect(sec).toContain("5,000,000"); // 잔액 = 10,000,000 - 5,000,000
    expect(sec).not.toMatch(/\{\{[^}]+\}\}/); // 비고 토큰도 ""로 치환·정리됨
    expect(sec).not.toMatch(/<!--LEDGER:/);
    assertBalanced(sec);
  });

  it("빈 데이터도 유효한 hwpx", async () => {
    const bytes = await gen224([]);
    const sec = await readSection(bytes);
    expect((sec.match(/<hp:tbl\b/g) ?? []).length).toBe(1);
    expect(sec).not.toMatch(/\{\{[^}]+\}\}/);
    assertBalanced(sec);
  });
});

/* ----------------------------- 22-1 총괄표 ----------------------------- */
function sumRow(p: Partial<ReportSummaryInputRow>): ReportSummaryInputRow {
  return { incm_sec_cd: 1, acc_sec_cd: 84, item_sec_cd: 10, acc_amt: 1000, ...p };
}

async function gen221(rows: ReportSummaryInputRow[]) {
  const template = new Uint8Array(readFileSync(join(process.cwd(), "public/hwpx-templates/form-22-1-fill.hwpx")));
  const model = buildReportSummaryModel(rows, getName);
  return generateHwpx(template, summaryTokens(model));
}

describe("회계보고서 22-1 통합 (form-22-1-fill.hwpx)", () => {
  it("구분별 집계가 총괄표 셀에 채워지고 잔여 토큰 0", async () => {
    const { bytes, unresolved } = await gen221([
      sumRow({ incm_sec_cd: 1, acc_sec_cd: 84, acc_amt: 90000000 }),
      sumRow({ incm_sec_cd: 2, acc_sec_cd: 84, item_sec_cd: 10, acc_amt: 60000000 }),
      sumRow({ incm_sec_cd: 2, acc_sec_cd: 84, item_sec_cd: 11, acc_amt: 30000000 }),
      sumRow({ incm_sec_cd: 1, acc_sec_cd: 85, acc_amt: 3500000 }),
    ]);
    expect(unresolved).toEqual([]);
    const sec = await readSection(bytes);
    expect(sec).toContain("90,000,000"); // 자산 수입/소계
    expect(sec).toContain("60,000,000"); // 자산 선거비용
    expect(sec).toContain("30,000,000"); // 자산 선거비용외
    expect(sec).toContain("3,500,000"); // 후원회기부금 수입
    expect(sec).toContain("93,500,000"); // 합계 수입
    assertBalanced(sec);
  });

  it("빈 데이터도 유효한 hwpx (합계 0, 잔여 토큰 0)", async () => {
    const { bytes, unresolved } = await gen221([]);
    expect(unresolved).toEqual([]);
    const sec = await readSection(bytes);
    expect(sec).not.toMatch(/\{\{[^}]+\}\}/);
    assertBalanced(sec);
  });

  it("mimetype 이 STORED 첫 엔트리로 보존된다", async () => {
    const { bytes } = await gen221([sumRow({})]);
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    expect(bytes[8]).toBe(0); // STORED
    expect(Buffer.from(bytes.slice(30, 38)).toString("utf8")).toBe("mimetype");
  });
});
