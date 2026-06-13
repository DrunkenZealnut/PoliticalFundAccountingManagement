import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import JSZip from "jszip";
import { HWPX_FORM_DEFS } from "./form-fields";
import { LEDGER_GROUP_TOKENS, LEDGER_ROW_TOKENS } from "./income-ledger-builder";
import { buildReportSummaryModel, summaryTokens } from "./report-summary-builder";
import {
  buildElectionExpenseSummaryModel,
  electionExpenseSummaryTokens,
} from "./election-expense-summary-builder";

async function templateTokens(template: string): Promise<Set<string>> {
  const bytes = new Uint8Array(readFileSync(join(process.cwd(), "public/hwpx-templates", template)));
  const zip = await JSZip.loadAsync(bytes);
  const secFile = zip.file("Contents/section0.xml");
  if (!secFile) throw new Error(`템플릿 ${template}에 Contents/section0.xml이 없습니다`);
  const sec = await secFile.async("string");
  const found = sec.match(/\{\{([^}]+)\}\}/g) ?? [];
  return new Set(found.map((t) => t.slice(2, -2)));
}

describe("HWPX_FORM_DEFS ↔ 템플릿 토큰 정합성", () => {
  // dataFill 서식(회계장부)은 표 내부에서 반복 토큰을 동적 처리하므로
  // def.fields ↔ 템플릿 토큰 1:1 정합성 검사 대상에서 제외한다.
  for (const def of HWPX_FORM_DEFS.filter((d) => !d.dataFill)) {
    it(`${def.id} (${def.label}): 정의 토큰 = 템플릿 토큰`, async () => {
      const inTemplate = await templateTokens(def.template);
      const inDef = new Set(def.fields.map((f) => f.token));

      const missingInDef = [...inTemplate].filter((t) => !inDef.has(t));
      const missingInTemplate = [...inDef].filter((t) => !inTemplate.has(t));

      expect(missingInDef, `정의에 없는 템플릿 토큰: ${missingInDef.join(", ")}`).toEqual([]);
      expect(missingInTemplate, `템플릿에 없는 정의 토큰: ${missingInTemplate.join(", ")}`).toEqual([]);
    });
  }

  it("토큰 중복 정의가 없다", () => {
    for (const def of HWPX_FORM_DEFS) {
      const tokens = def.fields.map((f) => f.token);
      expect(new Set(tokens).size).toBe(tokens.length);
    }
  });
});

describe("dataFill 서식(회계장부) 템플릿 정합성", () => {
  const dataFillDefs = HWPX_FORM_DEFS.filter((d) => d.dataFill);

  it("회계장부·회계보고서 dataFill 서식은 fields 가 비어 있다(반복 토큰은 표 내부 처리)", () => {
    // reimbursement(서식 43)는 표 자동 채움 + 일부 텍스트 수동 입력 하이브리드 → fields 허용
    for (const def of dataFillDefs.filter((d) => d.dataFill !== "reimbursement")) {
      expect(def.fields, `${def.id}`).toEqual([]);
    }
  });

  for (const def of dataFillDefs.filter((d) => d.dataFill === "reimbursement")) {
    it(`${def.id}: 청구내역 표 토큰 + 본문 토큰이 템플릿에 존재하고 fields 토큰도 일치`, async () => {
      const inTemplate = await templateTokens(def.template);
      const required = [
        // 청구내역 표(장소 행 × 자금원 4분류+합계 열 = 사무소 5 + 합계 5 = 10)
        "사무소_후보자자산", "사무소_후원회기부금", "사무소_보조금", "사무소_보조금외", "사무소_합계",
        "합계_후보자자산", "합계_후원회기부금", "합계_보조금", "합계_보조금외", "합계_합계",
        // 본문 텍스트
        "선거명", "선거구명", "후보자명", "보전청구총액_한글", "보전청구총액_숫자",
        "수령_금융기관", "수령_예금주", "수령_계좌번호", "선관위명",
      ];
      const missing = required.filter((t) => !inTemplate.has(t));
      expect(missing, `템플릿 누락 토큰: ${missing.join(", ")}`).toEqual([]);
      // 수동 입력 fields 토큰은 모두 템플릿에 존재해야 한다
      for (const f of def.fields) {
        expect(inTemplate.has(f.token), `fields 토큰이 템플릿에 없음: ${f.token}`).toBe(true);
      }
    });
  }

  for (const def of dataFillDefs.filter((d) => d.dataFill === "income-ledger")) {
    it(`${def.id}: 템플릿에 회계장부 반복 토큰 + GROUP/ROW 마커가 존재`, async () => {
      const inTemplate = await templateTokens(def.template);
      // 비고(remark)는 서식 22-4 수입·지출부 전용 컬럼 — 서식 7(13컬럼)에는 없음
      const required = [
        ...Object.values(LEDGER_GROUP_TOKENS),
        ...Object.values(LEDGER_ROW_TOKENS),
      ].filter((t) => t !== LEDGER_ROW_TOKENS.remark);
      const missing = required.filter((t) => !inTemplate.has(t));
      expect(missing, `템플릿 누락 토큰: ${missing.join(", ")}`).toEqual([]);

      const bytes = new Uint8Array(readFileSync(join(process.cwd(), "public/hwpx-templates", def.template)));
      const zip = await JSZip.loadAsync(bytes);
      const sec = await zip.file("Contents/section0.xml")!.async("string");
      expect(sec).toMatch(/<!--LEDGER:GROUP_START-->/);
      expect(sec).toMatch(/<!--LEDGER:GROUP_END-->/);
      expect(sec).toMatch(/<!--LEDGER:ROW_START-->/);
      expect(sec).toMatch(/<!--LEDGER:ROW_END-->/);
    });
  }

  // 22-4 수입·지출부 = 서식 7 동일 토큰 + 비고(remark) + LEDGER 마커
  it("22-4: 수입·지출부 반복 토큰(비고 포함) + GROUP/ROW 마커", async () => {
    const inTemplate = await templateTokens("form-22-4-fill.hwpx");
    const required = [...Object.values(LEDGER_GROUP_TOKENS), ...Object.values(LEDGER_ROW_TOKENS)];
    expect(required.filter((t) => !inTemplate.has(t)), "22-4 누락 토큰").toEqual([]);
    const bytes = new Uint8Array(readFileSync(join(process.cwd(), "public/hwpx-templates/form-22-4-fill.hwpx")));
    const sec = await (await JSZip.loadAsync(bytes)).file("Contents/section0.xml")!.async("string");
    expect(sec).toMatch(/<!--LEDGER:GROUP_START-->/);
    expect(sec).toMatch(/<!--LEDGER:ROW_START-->/);
  });

  // 22-1 총괄표 = 고정 셀 치환. 템플릿 토큰 ↔ summaryTokens 키 1:1 (마커 없음)
  it("22-1: 총괄표 셀 토큰이 summaryTokens 키와 1:1", async () => {
    const inTemplate = await templateTokens("form-22-1-fill.hwpx");
    const keys = Object.keys(summaryTokens(buildReportSummaryModel([], () => "")));
    expect(keys.filter((t) => !inTemplate.has(t)), "템플릿에 없는 빌더 토큰").toEqual([]);
    expect([...inTemplate].filter((t) => !keys.includes(t)), "빌더에 없는 템플릿 토큰").toEqual([]);
  });

  // 22-2 선거비용 집계표 = 고정 셀 치환. 템플릿 토큰 ↔ electionExpenseSummaryTokens 키 1:1
  it("22-2: 집계표 셀 토큰이 electionExpenseSummaryTokens 키와 1:1", async () => {
    const inTemplate = await templateTokens("form-22-2-fill.hwpx");
    const keys = Object.keys(
      electionExpenseSummaryTokens(buildElectionExpenseSummaryModel([], () => "")),
    );
    expect(keys.filter((t) => !inTemplate.has(t)), "템플릿에 없는 빌더 토큰").toEqual([]);
    expect([...inTemplate].filter((t) => !keys.includes(t)), "빌더에 없는 템플릿 토큰").toEqual([]);
  });

  // 22-3 재산명세서 = 명세행 토큰 + 소계/합계 + ESTATE 마커
  it("22-3: 재산명세서 토큰 + GROUP/ROW 마커", async () => {
    const inTemplate = await templateTokens("form-22-3-fill.hwpx");
    const required = ["구분", "종류", "수량", "내용", "가액", "비고", "소계", "합계"];
    expect(required.filter((t) => !inTemplate.has(t)), "22-3 누락 토큰").toEqual([]);
    const bytes = new Uint8Array(readFileSync(join(process.cwd(), "public/hwpx-templates/form-22-3-fill.hwpx")));
    const sec = await (await JSZip.loadAsync(bytes)).file("Contents/section0.xml")!.async("string");
    expect(sec).toMatch(/<!--ESTATE:GROUP_START-->/);
    expect(sec).toMatch(/<!--ESTATE:ROW_START-->/);
  });
});

// _token-manifest.json 은 코드에서 소비되지 않는 문서용 참조이므로 drift 방지를 위해
// HWPX_FORM_DEFS 와의 정합성을 빌드타임에 가드한다.
describe("_token-manifest.json ↔ HWPX_FORM_DEFS 정합성", () => {
  const manifest = JSON.parse(
    readFileSync(join(process.cwd(), "public/hwpx-templates/_token-manifest.json"), "utf8")
  ) as Record<string, { file: string; tokens: string[] }>;

  it("manifest 항목 = 서식 정의 (양방향)", () => {
    expect(new Set(Object.keys(manifest))).toEqual(new Set(HWPX_FORM_DEFS.map((d) => d.id)));
  });

  it("모든 서식의 manifest file 이 정의 template 과 일치", () => {
    for (const def of HWPX_FORM_DEFS) {
      expect(manifest[def.id]?.file, `${def.id}`).toBe(def.template);
    }
  });

  // 토큰 정합성은 일반(비 dataFill) 서식만 — dataFill 은 반복 토큰 문서화
  for (const def of HWPX_FORM_DEFS.filter((d) => !d.dataFill)) {
    it(`${def.id}: manifest 토큰이 정의와 일치`, () => {
      const entry = manifest[def.id];
      expect(entry, `manifest에 ${def.id} 없음`).toBeDefined();
      const manifestTokens = new Set(
        entry.tokens.map((t) => {
          if (!t.startsWith("{{") || !t.endsWith("}}")) {
            throw new Error(`매니페스트 ${def.id}의 토큰 형식 오류: ${t}`);
          }
          return t.slice(2, -2);
        })
      );
      const defTokens = new Set(def.fields.map((f) => f.token));
      expect(manifestTokens).toEqual(defTokens);
    });
  }
});
