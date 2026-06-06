import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import JSZip from "jszip";
import { HWPX_FORM_DEFS } from "./form-fields";

async function templateTokens(template: string): Promise<Set<string>> {
  const bytes = new Uint8Array(readFileSync(join(process.cwd(), "public/hwpx-templates", template)));
  const zip = await JSZip.loadAsync(bytes);
  const sec = await zip.file("Contents/section0.xml")!.async("string");
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
