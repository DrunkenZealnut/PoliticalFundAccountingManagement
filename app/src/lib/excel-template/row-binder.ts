import type { Worksheet, Style } from "exceljs";
import type { DynamicRowMapping, LedgerRow } from "./types";

/**
 * 열 문자를 숫자로 변환: A=1, B=2, ... Z=26, AA=27...
 */
function colLetterToNumber(letter: string): number {
  let num = 0;
  for (let i = 0; i < letter.length; i++) {
    num = num * 26 + (letter.charCodeAt(i) - 64);
  }
  return num;
}

/**
 * 동적행 매핑에 따라 워크시트에 데이터 행 삽입
 * - 헤더 영역 고정셀 바인딩
 * - dataStartRow부터 레코드별 행 추가
 * - 첫 데이터 행(templateRow)의 서식을 복사하여 적용
 */
export function bindDynamicRows(
  ws: Worksheet,
  mapping: DynamicRowMapping,
  data: { header: Record<string, unknown>; rows: LedgerRow[] },
): void {
  // 1. 헤더 고정셀 바인딩
  for (const [cellAddr, entry] of Object.entries(mapping.header)) {
    const value = data.header[entry.field];
    if (value !== undefined && value !== null) {
      ws.getCell(cellAddr).value = String(value);
    }
  }

  if (data.rows.length === 0) return;

  // 2. 첫 데이터 행의 서식을 참조용으로 캡처
  const templateRow = ws.getRow(mapping.dataStartRow);
  const columnStyles: Record<string, Partial<Style>> = {};
  for (const colLetter of Object.keys(mapping.columns)) {
    const colNum = colLetterToNumber(colLetter);
    const cell = templateRow.getCell(colNum);
    if (cell.style) {
      columnStyles[colLetter] = JSON.parse(JSON.stringify(cell.style));
    }
  }

  // 3. 데이터 행 삽입
  for (let i = 0; i < data.rows.length; i++) {
    const rowNum = mapping.dataStartRow + i;
    const record = data.rows[i];
    const wsRow = ws.getRow(rowNum);

    for (const [colLetter, entry] of Object.entries(mapping.columns)) {
      const colNum = colLetterToNumber(colLetter);
      const cell = wsRow.getCell(colNum);

      // 서식 복사
      const style = columnStyles[colLetter];
      if (style) {
        cell.style = JSON.parse(JSON.stringify(style));
      }

      // 값 설정
      const value = record[entry.field as keyof LedgerRow];

      if (value === undefined || value === null || value === "") {
        cell.value = null;
        continue;
      }

      if (entry.type === "number") {
        const num = Number(value);
        cell.value = num === 0 ? null : num;
      } else if (entry.type === "date") {
        // acc_date: "20260530" → "2026/05/30"
        const s = String(value);
        if (s.length === 8) {
          cell.value = `${s.slice(0, 4)}/${s.slice(4, 6)}/${s.slice(6, 8)}`;
        } else {
          cell.value = s;
        }
      } else {
        cell.value = String(value);
      }
    }
  }
}
