/**
 * 통합 테스트: 선거비용 보전청구서(서식 43) 실제 템플릿 form-43-fill.hwpx →
 * 빌더 집계 + 본문 텍스트 토큰 → generateHwpx → 다시 열어 무결성 검증
 * (한글 실오픈 자동화 대체).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import JSZip from "jszip";
import { generateHwpx } from "./generate";
import {
  buildReimbursementClaimModel,
  claimTableTokens,
  claimTotalTokens,
  type ReimbursementClaimInputRow,
} from "./reimbursement-claim-builder";

const SECTION = "Contents/section0.xml";
const getName = (cv: number) =>
  ({ 82: "보조금인 지원금", 83: "보조금외 지원금", 84: "후보자 자산", 85: "후원회 기부금", 10: "선거비용", 11: "선거비용외 정치자금" }[cv] ?? `코드${cv}`);

/** route.ts 의 본문 텍스트 토큰 화이트리스트(보전청구총액_* 은 빌더가 제공). */
const TEXT_TOKENS = ["선거명", "선거구명", "후보자명", "수령_금융기관", "수령_예금주", "수령_계좌번호", "선관위명"];
function fullText(over: Record<string, string> = {}): Record<string, string> {
  const t: Record<string, string> = {};
  for (const k of TEXT_TOKENS) t[k] = "";
  return { ...t, ...over };
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

function row(p: Partial<ReimbursementClaimInputRow>): ReimbursementClaimInputRow {
  return { incm_sec_cd: 2, acc_sec_cd: 84, item_sec_cd: 10, acc_amt: 1000, acc_print_ok: "Y", ...p };
}

async function gen43(rows: ReimbursementClaimInputRow[], text: Record<string, string> = {}) {
  const template = new Uint8Array(readFileSync(join(process.cwd(), "public/hwpx-templates/form-43-fill.hwpx")));
  const model = buildReimbursementClaimModel(rows, getName);
  const tokens = { ...claimTableTokens(model), ...claimTotalTokens(model), ...fullText(text) };
  return generateHwpx(template, tokens);
}

describe("선거비용 보전청구서 통합 (form-43-fill.hwpx)", () => {
  it("보전 체크 선거비용이 자금원별로 채워지고 본문 텍스트·총액 + 잔여 토큰 0", async () => {
    const { bytes, unresolved } = await gen43(
      [
        row({ acc_sec_cd: 84, acc_amt: 15000000 }), // 후보자자산
        row({ acc_sec_cd: 85, acc_amt: 2500000 }), // 후원회기부금
        row({ acc_sec_cd: 82, acc_amt: 7500000 }), // 보조금 → 정당의지원금
        row({ incm_sec_cd: 1, acc_sec_cd: 84, acc_amt: 90000000 }), // 수입 → 무시
        row({ acc_print_ok: "N", acc_sec_cd: 84, acc_amt: 9999999 }), // 보전 미체크 → 무시
        row({ item_sec_cd: 11, acc_amt: 30000000 }), // 선거비용외 → 무시
      ],
      { 선거구명: "서울 종로구", 후보자명: "홍길동", 수령_금융기관: "국민은행", 수령_예금주: "홍길동", 수령_계좌번호: "123-45-67890", 선관위명: "종로구" },
    );
    expect(unresolved).toEqual([]);
    const sec = await readSection(bytes);
    expect((sec.match(/<hp:tbl\b/g) ?? []).length).toBe(2); // 청구내역 + 서명란
    expect(sec).toContain("15,000,000"); // 후보자자산
    expect(sec).toContain("2,500,000"); // 후원회기부금
    expect(sec).toContain("7,500,000"); // 정당의지원금(보조금)
    expect(sec).toContain("25,000,000"); // 합계
    expect(sec).toContain("금이천오백만원"); // 한글 총액
    expect(sec).toContain("서울 종로구");
    expect(sec).toContain("국민은행");
    expect(sec).toContain("종로구선거관리위원회");
    expect(sec).not.toMatch(/\{\{[^}]+\}\}/);
    assertBalanced(sec);
  });

  it("빈 데이터·빈 입력도 유효한 hwpx (모든 값 0, 잔여 토큰 0)", async () => {
    const { bytes, unresolved } = await gen43([]);
    expect(unresolved).toEqual([]);
    const sec = await readSection(bytes);
    expect((sec.match(/<hp:tbl\b/g) ?? []).length).toBe(2);
    expect(sec).toContain("금원"); // 합계 0 → toKoreanAmount("") → "금 원"(빈 한글)
    expect(sec).not.toMatch(/\{\{[^}]+\}\}/);
    assertBalanced(sec);
  });

  it("mimetype 이 STORED 첫 엔트리로 보존된다", async () => {
    const { bytes } = await gen43([row({})]);
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    expect(bytes[8]).toBe(0); // STORED
    expect(Buffer.from(bytes.slice(30, 38)).toString("utf8")).toBe("mimetype");
  });
});
