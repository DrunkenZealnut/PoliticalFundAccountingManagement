/* ------------------------------------------------------------------ */
/*  OWPML 표/행 동적 복제 — 회계장부(서식 7) 전용, 순수 함수            */
/*                                                                    */
/*  form-7-fill.hwpx 의 section0.xml 에는 그룹 1개(계정/과목 헤더 +     */
/*  표 1개: 헤더행 + 데이터행 1개)를 마커 주석으로 감싸 둔다:           */
/*    <!--LEDGER:GROUP_START--> … <!--LEDGER:GROUP_END-->             */
/*      └ 표 안 데이터행: <!--LEDGER:ROW_START--><hp:tr>…</hp:tr><!--LEDGER:ROW_END--> */
/*                                                                    */
/*  이 블록을 그룹 수만큼 복제하고, 각 표의 데이터행을 건수만큼 복제·   */
/*  치환한다. 공식 레이아웃(borderFill·cellSz·secPr)은 템플릿에서        */
/*  그대로 복제되어 보존된다.                                          */
/*                                                                    */
/*  무결성 규칙(design §6.3):                                          */
/*   - 데이터행 복제 시 cellAddr/rowAddr = headerRowAddr + i           */
/*   - 표 rowCnt = headerRowAddr + 데이터행수                          */
/*   - 표 id 는 그룹마다 고유 (baseId + groupIndex) — 동일 id 손상 방지 */
/*  JSZip 비의존(문자열 변환만) → 단위 테스트 가능.                     */
/* ------------------------------------------------------------------ */
import { escapeXml } from "./escape";
import {
  groupHeaderTokens,
  rowTokens,
  type IncomeLedgerModel,
  type LedgerGroup,
} from "./income-ledger-builder";

const GROUP_RE = /<!--LEDGER:GROUP_START-->([\s\S]*?)<!--LEDGER:GROUP_END-->/;
const ROW_RE = /<!--LEDGER:ROW_START-->([\s\S]*?)<!--LEDGER:ROW_END-->/;
/** 그룹(표) 사이 간격 문단. 빈 줄 한 칸. */
const GROUP_SEPARATOR =
  '<hp:p id="0" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="0"/></hp:p>';

/** 토큰값 치환 (모든 출현, XML escape 적용). generate.ts 와 동일 규약. */
function replaceTokens(xml: string, values: Record<string, string>): string {
  let out = xml;
  for (const [key, value] of Object.entries(values)) {
    out = out.split(`{{${key}}}`).join(escapeXml(value ?? ""));
  }
  return out;
}

/** tbl 여는 태그의 속성값을 치환 (해당 블록의 첫 tbl). */
function setTblAttr(block: string, attr: "rowCnt" | "id", value: number | string): string {
  const re = new RegExp(`(<hp:tbl\\b[^>]*\\b${attr}=")[^"]*(")`);
  return block.replace(re, `$1${value}$2`);
}

/** 블록의 첫 tbl id(정수)를 읽는다. 없으면 null. */
function readTblId(block: string): number | null {
  const m = block.match(/<hp:tbl\b[^>]*\bid="(\d+)"/);
  return m ? Number(m[1]) : null;
}

/** 데이터행 템플릿의 헤더 행 위치(=원본 rowAddr). 없으면 0. */
function readRowAddr(rowTemplate: string): number {
  const m = rowTemplate.match(/\browAddr="(\d+)"/);
  return m ? Number(m[1]) : 0;
}

/** 단일 데이터행 tr 템플릿을 i번째 행으로 복제 (rowAddr 갱신 + 토큰 치환). */
function buildDataRow(rowTemplate: string, headerRowAddr: number, index: number, tokens: Record<string, string>): string {
  // 데이터행 내 모든 cellAddr 의 rowAddr 를 headerRowAddr + index 로
  const withAddr = rowTemplate.replace(
    /(<hp:cellAddr\b[^>]*\browAddr=")\d+(")/g,
    `$1${headerRowAddr + index}$2`,
  );
  return replaceTokens(withAddr, tokens);
}

/** 그룹 1개 → 채워진 GROUP 블록 XML. */
function renderGroup(groupBlock: string, group: LedgerGroup, groupIndex: number, baseTblId: number): string {
  const rowMatch = groupBlock.match(ROW_RE);
  if (!rowMatch) throw new Error("그룹 블록에 LEDGER:ROW 마커가 없습니다");
  const rowTemplate = rowMatch[1];
  const headerRowAddr = readRowAddr(rowTemplate);

  const rowsXml = group.rows
    .map((cell, i) => buildDataRow(rowTemplate, headerRowAddr, i, rowTokens(cell)))
    .join("");

  // ROW 마커 영역(데이터행 1개)을 복제된 행들로 치환
  let block = groupBlock.replace(ROW_RE, rowsXml);
  // 표 rowCnt = 헤더행수 + 데이터행수
  block = setTblAttr(block, "rowCnt", headerRowAddr + group.rows.length);
  // 표 id 고유화 (그룹마다)
  block = setTblAttr(block, "id", baseTblId + groupIndex);
  // 계정/과목 헤더 토큰 치환
  block = replaceTokens(block, groupHeaderTokens(group));
  return block;
}

/** 수입 0건: 데이터행 제거(rowCnt=헤더행수), 계정/과목 헤더 공란. */
function renderEmptyGroup(groupBlock: string): string {
  const rowMatch = groupBlock.match(ROW_RE);
  const headerRowAddr = rowMatch ? readRowAddr(rowMatch[1]) : 0;
  let block = groupBlock.replace(ROW_RE, "");
  block = setTblAttr(block, "rowCnt", headerRowAddr);
  block = replaceTokens(block, { 계정명: "", 과목명: "" });
  return block;
}

/**
 * 템플릿 section0.xml 의 GROUP 마커 영역을 모델의 그룹들로 렌더한 XML 반환.
 * 마커 주석과 잔여 토큰은 모두 제거된다.
 */
export function renderIncomeLedgerSection(sectionXml: string, model: IncomeLedgerModel): string {
  const groupMatch = sectionXml.match(GROUP_RE);
  if (!groupMatch) throw new Error("템플릿에 LEDGER:GROUP 마커가 없습니다");
  const groupBlock = groupMatch[1];
  const baseTblId = readTblId(groupBlock) ?? 1000000000;

  const rendered =
    model.groups.length === 0
      ? renderEmptyGroup(groupBlock)
      : model.groups.map((g, i) => renderGroup(groupBlock, g, i, baseTblId)).join(GROUP_SEPARATOR);

  let out = sectionXml.replace(GROUP_RE, rendered);
  // 잔여 마커 주석 제거
  out = out.replace(/<!--LEDGER:[A-Z_]+-->/g, "");
  // 입력되지 않은 잔여 토큰 정리
  out = out.replace(/\{\{[^}]+\}\}/g, "");
  return out;
}
