/**
 * 통합 테스트: 재산명세서 22-3 실제 템플릿 → estate 모델 렌더 → 재패키징 →
 * 무결성 검증. 단일 표 내 구분별 명세행 복제 + c0(구분명) rowSpan + 소계 +
 * 합계 + 표 rowAddr 재계산이 깨지지 않음을 확인한다.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import JSZip from "jszip";
import { repackageSection } from "./generate";
import { renderEstateSection } from "./owpml-table";
import { buildEstateModel, type EstateInputRow } from "./estate-builder";

const TEMPLATE = join(process.cwd(), "public/hwpx-templates/form-22-3-fill.hwpx");
const SECTION = "Contents/section0.xml";

async function gen(rows: EstateInputRow[]): Promise<Uint8Array> {
  const template = new Uint8Array(readFileSync(TEMPLATE));
  const zip = await JSZip.loadAsync(template);
  const section = await zip.file(SECTION)!.async("string");
  const model = buildEstateModel(rows);
  return repackageSection(template, renderEstateSection(section, model));
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

function erow(p: Partial<EstateInputRow>): EstateInputRow {
  return { estate_sec_cd: 46, kind: "복사기", qty: 1, content: "", amt: 1000000, remark: "", ...p };
}

/** 표의 rowCnt 속성과 실제 tr 수가 일치하는지. */
function tblRowCntMatchesTrCount(sec: string): boolean {
  const rc = sec.match(/<hp:tbl\b[^>]*\browCnt="(\d+)"/);
  const trCount = (sec.match(/<hp:tr\b/g) ?? []).length;
  return !!rc && Number(rc[1]) === trCount;
}

describe("재산명세서 22-3 통합 (form-22-3-fill.hwpx)", () => {
  it("구분별 명세행 + 소계 + 합계를 채우고 잔여 토큰/마커가 없다", async () => {
    const bytes = await gen([
      erow({ estate_sec_cd: 46, kind: "복사기", qty: 1, amt: 500000, content: "사무실" }),
      erow({ estate_sec_cd: 46, kind: "노트북", qty: 2, amt: 1500000, content: "업무용" }),
      erow({ estate_sec_cd: 47, kind: "예금", amt: 3000000, content: "농협123" }),
    ]);
    const sec = await readSection(bytes);
    expect(sec).toContain("복사기");
    expect(sec).toContain("노트북");
    expect(sec).toContain("예금");
    expect(sec).toContain("2,000,000"); // 비품 소계(50만+150만)
    expect(sec).toContain("3,000,000"); // 현금및예금 소계
    expect(sec).toContain("5,000,000"); // 총합계
    expect(sec).not.toMatch(/\{\{[^}]+\}\}/);
    expect(sec).not.toMatch(/<!--ESTATE:/);
    assertBalanced(sec);
  });

  it("한 구분에 재산 N개면 명세행 N개로 복제된다", async () => {
    const bytes = await gen([
      erow({ estate_sec_cd: 46, kind: "복사기" }),
      erow({ estate_sec_cd: 46, kind: "노트북" }),
      erow({ estate_sec_cd: 46, kind: "프린터" }),
    ]);
    const sec = await readSection(bytes);
    expect(sec).toContain("복사기");
    expect(sec).toContain("노트북");
    expect(sec).toContain("프린터");
    // 표 rowCnt = 헤더1 + 명세3 + 소계1 + 합계1 = 6
    expect(tblRowCntMatchesTrCount(sec)).toBe(true);
    assertBalanced(sec);
  });

  it("rowCnt 가 실제 tr 수와 일치한다(rowAddr 재계산)", async () => {
    const bytes = await gen([erow({ estate_sec_cd: 46 }), erow({ estate_sec_cd: 47 })]);
    const sec = await readSection(bytes);
    // 헤더1 + (명세1+소계1)×2 + 합계1 = 6
    expect(tblRowCntMatchesTrCount(sec)).toBe(true);
    assertBalanced(sec);
  });

  it("빈 데이터 → 고정 6구분 '해당없음' + 합계행, 유효한 hwpx", async () => {
    const bytes = await gen([]);
    const sec = await readSection(bytes);
    expect(sec).toContain("해당없음"); // 0건 구분도 양식대로 표기
    expect(sec).not.toMatch(/\{\{[^}]+\}\}/);
    expect(sec).not.toMatch(/<!--ESTATE:/);
    expect(tblRowCntMatchesTrCount(sec)).toBe(true);
    assertBalanced(sec);
  });

  it("mimetype 이 STORED 첫 엔트리로 보존된다", async () => {
    const bytes = await gen([erow({})]);
    expect(bytes[0]).toBe(0x50);
    expect(bytes[8]).toBe(0);
    expect(Buffer.from(bytes.slice(30, 38)).toString("utf8")).toBe("mimetype");
  });
});
