import type { Worksheet } from "exceljs";
import type { FixedCellMapping } from "./types";

/**
 * 중첩 객체에서 dot-notation 경로로 값 추출
 * e.g., getNestedValue({ asset: { income: 100 } }, "asset.income") → 100
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce((acc, key) => {
    if (acc && typeof acc === "object") {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj as unknown);
}

/**
 * 고정셀 매핑에 따라 워크시트의 특정 셀에 데이터 주입
 * 기존 서식(폰트, 테두리, 병합 등)은 보존하고 값만 교체
 */
export function bindFixedCells(
  ws: Worksheet,
  mapping: FixedCellMapping,
  data: Record<string, unknown>,
): void {
  for (const [cellAddr, entry] of Object.entries(mapping.cells)) {
    const value = getNestedValue(data, entry.field);
    if (value === undefined || value === null) continue;

    const cell = ws.getCell(cellAddr);

    if (entry.type === "number") {
      const num = Number(value);
      // 0은 빈칸 유지 (선관위 양식 관례)
      cell.value = num === 0 ? null : num;
    } else {
      cell.value = String(value);
    }
  }
}
