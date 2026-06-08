/**
 * HWPX 생성 코어 (순수 함수, 외부 의존 = JSZip only).
 *
 * 사전 제작 템플릿(.hwpx)의 `Contents/section0.xml` 안 `{{토큰}}` 문자열을
 * 입력값으로 치환하거나(generateHwpx) section 을 직접 조립한 뒤(transformSection)
 * 재패키징한다. 구조(문단·표·secPr)는 건드리지 않으므로 공식 레이아웃·쪽수가
 * 보존된다.
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
 * `{{토큰}}` 을 값으로 치환(모든 출현, XML escape 적용).
 * generateHwpx 와 표 렌더(owpml-table)가 공유하는 단일 치환 규약.
 */
export function replaceTokens(xml: string, values: Record<string, string>): string {
  let out = xml;
  for (const [key, value] of Object.entries(values)) {
    // split/join: 정규식 특수문자 이슈 없이 모든 출현 치환
    out = out.split(`{{${key}}}`).join(escapeXml(value ?? ""));
  }
  return out;
}

/** 입력되지 않은 잔여 `{{토큰}}` 을 제거하고 제거된 목록을 반환. */
export function stripUnresolvedTokens(xml: string): { xml: string; unresolved: string[] } {
  const unresolved = Array.from(new Set(xml.match(/\{\{[^}]+\}\}/g) ?? []));
  return { xml: xml.replace(/\{\{[^}]+\}\}/g, ""), unresolved };
}

/** 이미 로드된 zip 의 section0.xml 을 교체해 재패키징 (mimetype STORED 첫 엔트리). */
async function repackageFromZip(src: JSZip, newSection: string): Promise<Uint8Array> {
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
      out.file(path, await entry.async("uint8array"), { compression: "DEFLATE" });
    }
  }
  return out.generateAsync({ type: "uint8array" });
}

/**
 * 템플릿 .hwpx 의 section0.xml 을 새 내용으로 교체해 재패키징한다.
 * 회계장부처럼 section 을 외부에서 조립한 경로용 (이미 만든 section 문자열 주입).
 */
export async function repackageSection(
  template: ArrayBuffer | Uint8Array,
  newSection: string
): Promise<Uint8Array> {
  const src = await JSZip.loadAsync(template);
  if (!src.file(SECTION_PATH)) throw new Error(`템플릿에 ${SECTION_PATH} 가 없습니다`);
  return repackageFromZip(src, newSection);
}

/**
 * 템플릿 로드 → section0.xml 추출 → `transform` 적용 → 재패키징.
 * 템플릿 ZIP 을 **1회만** 압축 해제하므로 (loadAsync→추출→재패키징) 표 렌더
 * 라우트의 "loadAsync 후 다시 repackageSection 이 loadAsync" 이중 해제를 없앤다.
 */
export async function transformSection(
  template: ArrayBuffer | Uint8Array,
  transform: (sectionXml: string) => string
): Promise<Uint8Array> {
  const src = await JSZip.loadAsync(template);
  const secFile = src.file(SECTION_PATH);
  if (!secFile) throw new Error(`템플릿에 ${SECTION_PATH} 가 없습니다`);
  const section = await secFile.async("string");
  return repackageFromZip(src, transform(section));
}

/**
 * @param template 템플릿 .hwpx 의 raw bytes
 * @param values   토큰명(중괄호 제외) → 값. 예: { "회계책임자명": "홍길동" }
 */
export async function generateHwpx(
  template: ArrayBuffer | Uint8Array,
  values: Record<string, string>
): Promise<GenerateResult> {
  let unresolved: string[] = [];
  const bytes = await transformSection(template, (sec) => {
    const { xml, unresolved: left } = stripUnresolvedTokens(replaceTokens(sec, values));
    unresolved = left;
    return xml;
  });
  return { bytes, unresolved };
}
