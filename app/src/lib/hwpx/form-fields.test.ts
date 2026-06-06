import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import JSZip from "jszip";
import { HWPX_FORM_DEFS } from "./form-fields";

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
  for (const def of HWPX_FORM_DEFS) {
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

// _token-manifest.json 은 코드에서 소비되지 않는 문서용 참조이므로 drift 방지를 위해
// HWPX_FORM_DEFS 와의 정합성을 빌드타임에 가드한다.
describe("_token-manifest.json ↔ HWPX_FORM_DEFS 정합성", () => {
  const manifest = JSON.parse(
    readFileSync(join(process.cwd(), "public/hwpx-templates/_token-manifest.json"), "utf8")
  ) as Record<string, { file: string; tokens: string[] }>;

  it("manifest 항목 = 서식 정의 (양방향)", () => {
    expect(new Set(Object.keys(manifest))).toEqual(new Set(HWPX_FORM_DEFS.map((d) => d.id)));
  });

  for (const def of HWPX_FORM_DEFS) {
    it(`${def.id}: manifest file/토큰이 정의와 일치`, () => {
      const entry = manifest[def.id];
      expect(entry, `manifest에 ${def.id} 없음`).toBeDefined();
      expect(entry.file).toBe(def.template);
      const manifestTokens = new Set(entry.tokens.map((t) => t.slice(2, -2)));
      const defTokens = new Set(def.fields.map((f) => f.token));
      expect(manifestTokens).toEqual(defTokens);
    });
  }
});
