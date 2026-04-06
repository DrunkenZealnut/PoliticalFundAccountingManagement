import path from "path";
import fs from "fs";
import ExcelJS from "exceljs";

/**
 * 템플릿 디렉토리 경로
 * Vercel 배포 시 process.cwd()는 app/ 디렉토리
 */
function getTemplatesDir(): string {
  // 1차: app/templates/excel/ (Vercel 배포용)
  const appDir = path.join(process.cwd(), "templates", "excel");
  if (fs.existsSync(appDir)) return appDir;

  // 2차: 프로젝트 루트/보고문서샘플/ (로컬 개발용)
  const sampleDir = path.join(process.cwd(), "..", "보고문서샘플");
  if (fs.existsSync(sampleDir)) return sampleDir;

  throw new Error(
    "Template directory not found. Expected: templates/excel/ or ../보고문서샘플/",
  );
}

/**
 * XLS/XLSX 템플릿 파일을 ExcelJS Workbook으로 로드
 *
 * .xlsx → ExcelJS 직접 로드 (서식 100% 보존)
 * .xls  → xlsx(SheetJS)로 읽은 뒤 .xlsx 버퍼로 변환 → ExcelJS 로드
 */
export async function loadTemplate(
  templateFile: string,
): Promise<ExcelJS.Workbook> {
  const templatesDir = getTemplatesDir();
  const filePath = path.join(templatesDir, templateFile);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Template file not found: ${filePath}`);
  }

  const ext = path.extname(filePath).toLowerCase();
  const workbook = new ExcelJS.Workbook();

  if (ext === ".xlsx") {
    await workbook.xlsx.readFile(filePath);
    return workbook;
  }

  if (ext === ".xls") {
    // .xls (BIFF8) → xlsx(SheetJS) → buffer → ExcelJS
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const XLSX = require("xlsx");
    const xlsWorkbook = XLSX.readFile(filePath);
    const xlsxBuffer = XLSX.write(xlsWorkbook, {
      type: "buffer",
      bookType: "xlsx",
    });
    await workbook.xlsx.load(xlsxBuffer);
    return workbook;
  }

  throw new Error(`Unsupported file format: ${ext}`);
}
