/**
 * HWPX 생성 코어 (순수 함수, 외부 의존 = JSZip only).
 *
 * 사전 제작 템플릿(.hwpx)의 `Contents/section0.xml` 안 `{{토큰}}` 문자열을
 * 입력값으로 치환한 뒤 재패키징한다. 구조(문단·표·secPr)는 건드리지 않으므로
 * 공식 레이아웃·쪽수가 보존된다.
 *
 * HWPX 규약: `mimetype` 은 ZIP 첫 엔트리이며 무압축(STORED)이어야 한다.
 * JSZip generateAsync 의 전역 compression 이 모든 파일에 적용되는 것을 피하기 위해
 * 새 zip 으로 재구성하면서 mimetype 만 STORE, 나머지는 DEFLATE 로 추가한다.
 */
import JSZip from "jszip";
import { escapeXml } from "./escape";

const SECTION_PATH = "Contents/section0.xml";
const MIMETYPE = "application/hwp+zip";

export interface GenerateResult {
  bytes: Uint8Array;
  /** 치환되지 못하고 남아 제거된 토큰들(디버깅/검증용) */
  unresolved: string[];
}

/**
 * 템플릿 .hwpx 의 section0.xml 을 새 내용으로 교체해 재패키징한다.
 * mimetype 은 ZIP 첫 엔트리·STORED, 나머지는 DEFLATE (HWPX 규약).
 * 회계장부처럼 토큰 치환을 넘어 section 을 직접 조립하는 경로에서 재사용.
 */
export async function repackageSection(
  template: ArrayBuffer | Uint8Array,
  newSection: string
): Promise<Uint8Array> {
  const src = await JSZip.loadAsync(template);
  if (!src.file(SECTION_PATH)) throw new Error(`템플릿에 ${SECTION_PATH} 가 없습니다`);

  const out = new JSZip();
  const mimeFile = src.file("mimetype");
  const mime = mimeFile ? await mimeFile.async("string") : MIMETYPE;
  out.file("mimetype", mime, { compression: "STORE" });

  for (const path of Object.keys(src.files)) {
    if (path === "mimetype") continue;
    const entry = src.files[path];
    if (entry.dir) continue;
    if (path === SECTION_PATH) {
      out.file(path, newSection, { compression: "DEFLATE" });
    } else {
      const bytes = await entry.async("uint8array");
      out.file(path, bytes, { compression: "DEFLATE" });
    }
  }
  return out.generateAsync({ type: "uint8array" });
}

/**
 * @param template 템플릿 .hwpx 의 raw bytes
 * @param values   토큰명(중괄호 제외) → 값. 예: { "회계책임자명": "홍길동" }
 */
export async function generateHwpx(
  template: ArrayBuffer | Uint8Array,
  values: Record<string, string>
): Promise<GenerateResult> {
  const src = await JSZip.loadAsync(template);

  const secFile = src.file(SECTION_PATH);
  if (!secFile) throw new Error(`템플릿에 ${SECTION_PATH} 가 없습니다`);

  let sec = await secFile.async("string");
  for (const [key, value] of Object.entries(values)) {
    // split/join: 정규식 특수문자 이슈 없이 모든 출현 치환
    sec = sec.split(`{{${key}}}`).join(escapeXml(value ?? ""));
  }
  // 입력되지 않은 잔여 토큰은 빈 문자열로 정리
  const unresolved = Array.from(new Set(sec.match(/\{\{[^}]+\}\}/g) ?? []));
  sec = sec.replace(/\{\{[^}]+\}\}/g, "");

  const bytes = await repackageSection(template, sec);
  return { bytes, unresolved };
}
