import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import JSZip from "jszip";
import { renderDoclistSection } from "./owpml-table";
import { repackageSection } from "./generate";
import {
  buildDoclistModel,
  type DoclistInputRow,
  type EvidenceSummary,
} from "./reimbursement-doclist-builder";

/** tc 1개 합성. */
function tc(col: number, inner: string): string {
  return (
    `<hp:tc borderFillIDRef="13"><hp:cellAddr colAddr="${col}" rowAddr="1"/>` +
    `<hp:cellSpan colSpan="1" rowSpan="1"/><hp:subList><hp:p id="0"><hp:run>` +
    `<hp:t>${inner}</hp:t></hp:run></hp:p></hp:subList></hp:tc>`
  );
}

/** 합성 템플릿: 단일 표(헤더 + DOCLIST:GROUP[명세행 + 소계행] + 합계행). */
const TEMPLATE = `<hp:sec>
<hp:tbl id="700" zOrder="1" numberingType="TABLE" rowCnt="4" colCnt="6" borderFillIDRef="11">
<hp:tr>${tc(0, "보전항목")}${tc(1, "지출일자")}${tc(2, "거래업체")}${tc(3, "지출내용")}${tc(4, "보전청구액")}${tc(5, "첨부증빙")}</hp:tr>
<!--DOCLIST:GROUP_START--><!--DOCLIST:ROW_START--><hp:tr>${tc(0, "{{보전항목}}")}${tc(1, "{{지출일자}}")}${tc(2, "{{거래업체}}")}${tc(3, "{{지출내용}}")}${tc(4, "{{보전청구액}}")}${tc(5, "{{첨부증빙}}")}</hp:tr><!--DOCLIST:ROW_END--><hp:tr>${tc(1, "소계")}${tc(4, "{{소계_금액}}")}</hp:tr><!--DOCLIST:GROUP_END-->
<hp:tr>${tc(0, "합계")}${tc(4, "{{합계_금액}}")}</hp:tr>
</hp:tbl>
</hp:sec>`;

function row(p: Partial<DoclistInputRow>): DoclistInputRow {
  return {
    acc_book_id: 1, acc_date: "20260410", content: "내용", acc_amt: 100000,
    acc_print_ok: "Y", cust_id: 10,
    exp_group1_cd: "선거사무소", exp_group2_cd: "간판",
    customer: { name: "양지기획", reg_num: "201-77-77717" },
    ...p,
  };
}
const NO_EV = new Map<number, EvidenceSummary>();

describe("renderDoclistSection (builder→render 통합)", () => {
  it("보전 항목별 그룹 + 명세행 복제 + 소계/합계", () => {
    const model = buildDoclistModel(
      [
        row({ acc_book_id: 1, exp_group1_cd: "선거사무소", exp_group2_cd: "간판", acc_date: "20260406", acc_amt: 313885, content: "간판설치" }),
        row({ acc_book_id: 2, exp_group1_cd: "선거사무소", exp_group2_cd: "현수막", acc_date: "20260407", acc_amt: 100000, content: "현수막" }),
        row({ acc_book_id: 3, exp_group1_cd: "소품", exp_group2_cd: "어깨띠", acc_date: "20260408", acc_amt: 50000, content: "어깨띠" }),
      ],
      NO_EV,
    );
    const out = renderDoclistSection(TEMPLATE, model);
    // 항목명·법조항
    expect(out).toContain("선거사무소 등 간판·현판·현수막 (법 제61조)");
    expect(out).toContain("어깨띠 등 소품 (법 제68조)");
    // 명세 내용
    expect(out).toContain("간판설치");
    expect(out).toContain("현수막");
    expect(out).toContain("어깨띠");
    // 소계(간판그룹 413,885)·합계(463,885)
    expect(out).toContain("413,885");
    expect(out).toContain("463,885");
    // 마커·잔여 토큰 0
    expect(out).not.toMatch(/<!--DOCLIST:/);
    expect(out).not.toMatch(/\{\{[^}]+\}\}/);
  });

  it("c0(보전항목) rowSpan = 명세수 + 소계1, rowCnt 재계산", () => {
    const model = buildDoclistModel(
      [
        row({ acc_book_id: 1, exp_group1_cd: "선거사무소", exp_group2_cd: "간판", acc_amt: 1 }),
        row({ acc_book_id: 2, exp_group1_cd: "선거사무소", exp_group2_cd: "현판", acc_amt: 2 }),
        row({ acc_book_id: 3, exp_group1_cd: "소품", exp_group2_cd: "어깨띠", acc_amt: 3 }),
      ],
      NO_EV,
    );
    const out = renderDoclistSection(TEMPLATE, model);
    // 간판그룹 명세2 → rowSpan 3, 소품그룹 명세1 → rowSpan 2
    expect(out).toContain('rowSpan="3"');
    expect(out).toContain('rowSpan="2"');
    // 헤더1 + (명세2+소계1) + (명세1+소계1) + 합계1 = 7
    expect(out).toMatch(/rowCnt="7"/);
  });

  it("그룹 2번째+ 명세행은 c0(보전항목) 셀이 제거된다", () => {
    const model = buildDoclistModel(
      [
        row({ acc_book_id: 1, exp_group2_cd: "간판", content: "A", acc_amt: 1 }),
        row({ acc_book_id: 2, exp_group2_cd: "현판", content: "B", acc_amt: 2 }),
      ],
      NO_EV,
    );
    const out = renderDoclistSection(TEMPLATE, model);
    // 보전항목 토큰값은 그룹당 1회만(첫 명세행) 출현
    const occur = out.split("선거사무소 등 간판·현판·현수막 (법 제61조)").length - 1;
    expect(occur).toBe(1);
  });

  it("XML 특수문자 escape", () => {
    const model = buildDoclistModel(
      [row({ content: "A&B<C>", customer: { name: "K&R", reg_num: "201-77-77717" } })],
      NO_EV,
    );
    const out = renderDoclistSection(TEMPLATE, model);
    expect(out).toContain("A&amp;B&lt;C&gt;");
    expect(out).toContain("K&amp;R");
  });

  it("보전 체크 지출 0건 → '해당 없음' 단일 행", () => {
    const model = buildDoclistModel([], NO_EV);
    const out = renderDoclistSection(TEMPLATE, model);
    expect(out).toContain("해당 없음");
    expect(out).not.toMatch(/\{\{[^}]+\}\}/);
    expect(out).not.toMatch(/<!--DOCLIST:/);
  });

  it("DOCLIST 마커 없으면 에러", () => {
    expect(() => renderDoclistSection("<hp:sec></hp:sec>", buildDoclistModel([row({})], NO_EV))).toThrow();
  });
});

/* 실제 form-doclist-fill.hwpx 템플릿 → 렌더 → 재패키징 → 재오픈 무결성 검증
 * (한글 실오픈 검증의 자동화 대체). */
const REAL_TEMPLATE = join(process.cwd(), "public/hwpx-templates/form-doclist-fill.hwpx");
const SECTION = "Contents/section0.xml";

async function generate(rows: DoclistInputRow[], ev = NO_EV): Promise<Uint8Array> {
  const template = new Uint8Array(readFileSync(REAL_TEMPLATE));
  const zip = await JSZip.loadAsync(template);
  const section = await zip.file(SECTION)!.async("string");
  const model = buildDoclistModel(rows, ev);
  return repackageSection(template, renderDoclistSection(section, model));
}
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

describe("doclist 통합 (실제 form-doclist-fill.hwpx)", () => {
  it("보전 항목별 그룹·명세·소계·합계를 채우고 잔여 토큰/마커가 없다", async () => {
    const bytes = await generate([
      row({ acc_book_id: 1, exp_group1_cd: "선거사무소", exp_group2_cd: "간판", acc_date: "20260406", acc_amt: 313885, content: "간판 설치", customer: { name: "양지기획", reg_num: "201-77-77717" } }),
      row({ acc_book_id: 2, exp_group1_cd: "소품", exp_group2_cd: "어깨띠", acc_date: "20260408", acc_amt: 50000, content: "어깨띠 제작", customer: { name: "소품사", reg_num: "111-11-11111" } }),
    ], new Map([[1, { images: 2, docs: 1, firstName: "sign.jpg" }]]));
    const sec = await readSection(bytes);
    expect((sec.match(/<hp:tbl\b/g) ?? []).length).toBe(1); // 단일 표
    expect(sec).toContain("선거사무소 등 간판·현판·현수막 (법 제61조)");
    expect(sec).toContain("어깨띠 등 소품 (법 제68조)");
    expect(sec).toContain("간판 설치");
    expect(sec).toContain("313,885");
    expect(sec).toContain("363,885"); // 합계
    expect(sec).toContain("사진 2매 / 문서 1건 (sign.jpg)");
    expect(sec).toContain("선거비용 보전 첨부서류 목록"); // 제목
    expect(sec).not.toMatch(/\{\{[^}]+\}\}/);
    expect(sec).not.toMatch(/<!--DOCLIST:/);
    expect(sec).not.toContain("재 산 명 세 서"); // 재산명세서 잔재 0
    assertBalanced(sec);
  });

  it("보전 체크 지출 0건 → 빈 표(해당 없음) 유효 hwpx", async () => {
    const bytes = await generate([]);
    const sec = await readSection(bytes);
    expect((sec.match(/<hp:tbl\b/g) ?? []).length).toBe(1);
    expect(sec).toContain("해당 없음");
    expect(sec).not.toMatch(/\{\{[^}]+\}\}/);
    assertBalanced(sec);
  });

  it("mimetype 이 STORED 첫 엔트리로 보존된다", async () => {
    const bytes = await generate([row({})]);
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    expect(bytes[8]).toBe(0); // STORED
    expect(Buffer.from(bytes.slice(30, 38)).toString("utf8")).toBe("mimetype");
    const zip = await JSZip.loadAsync(bytes);
    expect(await zip.file("mimetype")!.async("string")).toBe("application/hwp+zip");
  });
});
