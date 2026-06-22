/**
 * 통합 테스트: 실제 form-7-fill.hwpx 템플릿 → 모델 렌더 → 재패키징 →
 * 다시 열어 무결성 검증 (한글 실오픈 검증의 자동화 대체).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import JSZip from "jszip";
import { repackageSection } from "./generate";
import { renderIncomeLedgerSection } from "./owpml-table";
import {
  buildIncomeLedgerModel,
  type IncomeLedgerInputRow,
  type LedgerAccountItem,
} from "./income-ledger-builder";

const TEMPLATE = join(process.cwd(), "public/hwpx-templates/form-7-fill.hwpx");
const SECTION = "Contents/section0.xml";

const getName = (cv: number) =>
  ({ 84: "후보자 자산", 85: "후원회 기부금", 10: "선거비용", 11: "선거비용외 정치자금" }[cv] ?? `코드${cv}`);

function row(p: Partial<IncomeLedgerInputRow>): IncomeLedgerInputRow {
  return {
    acc_book_id: 1,
    acc_date: "20260521", incm_sec_cd: 1, acc_sec_cd: 84, item_sec_cd: 10, content: "내역",
    acc_amt: 1000, rcp_no: null, cust_id: 1,
    customer: { name: "홍길동", reg_num: "570923", addr: "서울 종로", addr_detail: "1", job: "회사원", tel: "02-1-2" },
    ...p,
  };
}

async function generate(
  rows: IncomeLedgerInputRow[],
  standardCombos?: LedgerAccountItem[],
): Promise<Uint8Array> {
  const template = new Uint8Array(readFileSync(TEMPLATE));
  const zip = await JSZip.loadAsync(template);
  const section = await zip.file(SECTION)!.async("string");
  const model = buildIncomeLedgerModel(rows, getName, standardCombos);
  const newSection = renderIncomeLedgerSection(section, model);
  return repackageSection(template, newSection);
}

async function readSection(bytes: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(bytes);
  return zip.file(SECTION)!.async("string");
}

/** XML 태그 균형 간이 검증 (well-formed 근사). */
function assertBalanced(xml: string) {
  for (const tag of ["hp:tbl", "hp:tr", "hp:tc", "hp:p", "hp:run"]) {
    const open = (xml.match(new RegExp(`<${tag}\\b(?![^>]*/>)`, "g")) ?? []).length;
    const close = (xml.match(new RegExp(`</${tag}>`, "g")) ?? []).length;
    expect(open, `${tag} 불균형 open=${open} close=${close}`).toBe(close);
  }
}

describe("income-ledger 통합 (실제 form-7-fill.hwpx)", () => {
  it("계정+과목 2그룹/3행을 생성하고 데이터를 채운다", async () => {
    const bytes = await generate([
      row({ acc_sec_cd: 84, item_sec_cd: 10, acc_date: "20260521", acc_amt: 20000000, content: "후보자 자산 출연", customer: { name: "홍길동", reg_num: "570923", addr: "○○도 ○○시", addr_detail: "1", job: "정치인", tel: "02-1" } }),
      row({ acc_sec_cd: 84, item_sec_cd: 10, acc_date: "20260522", acc_amt: 1500000, content: "추가 출연" }),
      row({ acc_sec_cd: 85, item_sec_cd: 10, acc_date: "20260523", acc_amt: 5000000, content: "후원금" }),
    ]);
    const sec = await readSection(bytes);

    expect((sec.match(/<hp:tbl\b/g) ?? []).length).toBe(2);
    expect(sec).toContain("후보자 자산");
    expect(sec).toContain("후원회 기부금");
    expect(sec).toContain("후보자 자산 출연");
    expect(sec).toContain("21,500,000"); // 그룹1 누계=잔액
    expect(sec).toContain("홍길동");
    expect(sec).toContain("57/09/23");
  });

  it("수입·지출이 한 표에 함께 채워지고 잔액(수입누계-지출누계)이 계산된다", async () => {
    const bytes = await generate([
      row({ incm_sec_cd: 1, acc_sec_cd: 85, item_sec_cd: 10, acc_date: "20260521", acc_amt: 5000000, content: "후원금 수입" }),
      row({ incm_sec_cd: 2, acc_sec_cd: 85, item_sec_cd: 10, acc_date: "20260522", acc_amt: 2000000, content: "광고비 지출" }),
    ]);
    const sec = await readSection(bytes);
    expect((sec.match(/<hp:tbl\b/g) ?? []).length).toBe(1); // 수입·지출이 한 표
    expect(sec).toContain("후원금 수입");
    expect(sec).toContain("광고비 지출");
    expect(sec).toContain("5,000,000"); // 수입 금회/누계
    expect(sec).toContain("2,000,000"); // 지출 금회/누계
    expect(sec).toContain("3,000,000"); // 잔액 = 5,000,000 - 2,000,000
    assertBalanced(sec);
  });

  it("잔여 토큰·마커가 없고 태그 균형이 맞는다", async () => {
    const bytes = await generate([row({}), row({ acc_sec_cd: 85, content: "B" })]);
    const sec = await readSection(bytes);
    expect(sec).not.toMatch(/\{\{[^}]+\}\}/);
    expect(sec).not.toMatch(/<!--LEDGER:/);
    assertBalanced(sec);
  });

  it("표 id 가 그룹마다 고유하다", async () => {
    const bytes = await generate([
      row({ acc_sec_cd: 84 }), row({ acc_sec_cd: 85 }), row({ acc_sec_cd: 82 }),
    ]);
    const sec = await readSection(bytes);
    const ids = [...sec.matchAll(/<hp:tbl\b[^>]*\bid="(\d+)"/g)].map((m) => m[1]);
    expect(ids.length).toBe(3);
    expect(new Set(ids).size).toBe(3);
  });

  it("수입 0건이면 빈 표 1개 — 유효한 hwpx", async () => {
    const bytes = await generate([]);
    const sec = await readSection(bytes);
    expect((sec.match(/<hp:tbl\b/g) ?? []).length).toBe(1);
    expect(sec).not.toMatch(/\{\{[^}]+\}\}/);
    assertBalanced(sec);
  });

  it("표준 계정·과목 8조합 — 거래 없는 계정도 빈 표로 모두 생성한다", async () => {
    // 후보자 org 표준 8조합 (계정 82/83/84/85 × 과목 10/11), acc_order 순
    const COMBOS: LedgerAccountItem[] = [
      { accSecCd: 82, itemSecCd: 10 }, { accSecCd: 82, itemSecCd: 11 },
      { accSecCd: 83, itemSecCd: 10 }, { accSecCd: 83, itemSecCd: 11 },
      { accSecCd: 84, itemSecCd: 10 }, { accSecCd: 84, itemSecCd: 11 },
      { accSecCd: 85, itemSecCd: 10 }, { accSecCd: 85, itemSecCd: 11 },
    ];
    // 거래는 84:10 한 조합에만 존재 → 나머지 7조합은 빈 표
    const bytes = await generate(
      [row({ acc_sec_cd: 84, item_sec_cd: 10, acc_amt: 30000, content: "유일거래" })],
      COMBOS,
    );
    const sec = await readSection(bytes);
    // 8개 표 모두 생성
    expect((sec.match(/<hp:tbl\b/g) ?? []).length).toBe(8);
    // 표 id 8개 모두 고유
    const ids = [...sec.matchAll(/<hp:tbl\b[^>]*\bid="(\d+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(8);
    expect(sec).toContain("유일거래");
    expect(sec).not.toMatch(/\{\{[^}]+\}\}/);
    expect(sec).not.toMatch(/<!--LEDGER:/);
    assertBalanced(sec);
  });

  it("mimetype 이 STORED 첫 엔트리로 보존된다", async () => {
    const bytes = await generate([row({})]);
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    expect(bytes[8]).toBe(0); // STORED
    expect(bytes[9]).toBe(0);
    expect(Buffer.from(bytes.slice(30, 38)).toString("utf8")).toBe("mimetype");
    const zip = await JSZip.loadAsync(bytes);
    expect(await zip.file("mimetype")!.async("string")).toBe("application/hwp+zip");
  });
});
