# 선관위 템플릿 기반 보고서 생성 Design Document

> **Feature**: excel-template-report
> **Plan Reference**: `docs/01-plan/features/excel-template-report.plan.md`
> **Version**: 0.1.0
> **Date**: 2026-03-30
> **Status**: Draft

---

## 1. Template Catalog

`보고문서샘플/` 디렉토리에 있는 실제 선관위 제출 문서 기준으로 설계한다.

### 1.1 보유 템플릿 파일

| # | 파일명 | 포맷 | 유형 | 시트 | 행x열 | 병합셀 | 우선순위 |
|---|--------|------|------|------|-------|--------|---------|
| T1 | `정치자금 수입지출보고서.xls` | BIFF8 | **고정셀** | Sheet1 | 110x8 | 29 | P0 |
| T2 | `감사의견서.xls` | BIFF8 | **고정셀** | Sheet1 | 111x9 | 29 | P0 |
| T3 | `심사의결서.xls` | BIFF8 | **고정셀** | Sheet1 | 114x9 | 43 | P0 |
| T4 | `회계보고서.xls` | BIFF8 | **고정셀** | Sheet1 | 118x8 | 20 | P0 |
| T5 | `기부금-선거비용.xlsx` | OOXML | **동적행** | Sheet1 | Nx15 | 20 | P1 |
| T6 | `기부금-선거비용외.xlsx` | OOXML | **동적행** | Sheet1 | Nx15 | 20 | P1 |
| T7 | `보조금-선거비용.xlsx` | OOXML | **동적행** | Sheet1 | Nx15 | 20 | P1 |
| T8 | `보조금-선거비용외.xlsx` | OOXML | **동적행** | Sheet1 | Nx15 | 20 | P1 |
| T9 | `후보자산-선거비용.xlsx` | OOXML | **동적행** | Sheet1 | Nx15 | 20 | P1 |
| T10 | `후보자산-선거비용외.xlsx` | OOXML | **동적행** | Sheet1 | Nx15 | 20 | P1 |

### 1.2 템플릿 유형 분류

**Type A: 고정셀 보고서** (T1~T4)
- 레이아웃이 고정됨 (행/열 수 불변)
- 특정 셀 좌표에 숫자/텍스트를 주입
- 예: 수입지출보고서 C8 셀에 자산 수입 총액

**Type B: 동적행 수입지출부** (T5~T10)
- 헤더 구조 고정 (Row 1~8), 데이터 행은 가변
- acc_book 레코드 수에 따라 Row 9부터 동적 삽입
- 모든 6개 파일이 동일한 15열 구조 공유

---

## 2. Cell Mapping Specifications

### 2.1 T1: 정치자금 수입지출보고서 (고정셀)

실제 파일 분석 결과:

```
Row 1: A1 = "정치자금 수입·지출보고서" (제목)
Row 2: A2 = "문서번호 : "
Row 3: A3 = "선거명"      C3 = {선거명}     F3 = "선거구명"  G3 = {선거구명}
Row 4: A4 = "성명..."     C4 = {후보자/정당 명칭}
Row 5: A5 = "정치자금 수입·지출액"
Row 6: A6 = "구분"        C6 = "수입"  D6 = "지출"  G6 = "잔액"  H6 = "비고"
Row 7:                    D7 = "선거비용"  E7 = "선거비용외"  F7 = "소계"
Row 8: A8 = "자산"        C8 = {자산수입}  D8 = {자산지출선거}  E8 = {자산지출비선거}  F8 = {자산지출소계}  G8 = {자산잔액}
Row 9: A9 = "후원회기부금"  C9 = {기부금수입}  D9 = {기부금지출선거}  ...
Row 10: A10= "정당지원금" B10= "보조금"  C10= {보조금수입}  D10= {보조금지출선거}  ...
Row 11:                   B11= "보조금외"  C11= {보조금외수입}  ...
Row 12: A12= "합계"       C12= {합계수입}  D12= {합계지출선거}  ...
Row 14: A14= {날짜}
Row 15: A15= {회계책임자 서명}
Row 16: A16= {후보자 서명}
Row 18: A18= {선관위 귀중}
```

**셀 매핑 정의:**

```typescript
export const T1_MAPPING: FixedCellMapping = {
  id: 'income-expense-report',
  templateFile: '정치자금 수입지출보고서.xls',
  type: 'fixed',
  orgTypes: [50, 51, 52, 53, 54, 90, 91, 92, 106, 107, 108, 109, 587, 588, 589],
  sheet: 'Sheet1',
  cells: {
    // 헤더 정보
    C3:  { field: 'electionName',    type: 'text' },
    G3:  { field: 'districtName',    type: 'text' },
    C4:  { field: 'entityName',      type: 'text' },
    // 자산 행 (Row 8)
    C8:  { field: 'asset.income',         type: 'number' },
    D8:  { field: 'asset.expElection',    type: 'number' },
    E8:  { field: 'asset.expNonElection', type: 'number' },
    F8:  { field: 'asset.expSubtotal',    type: 'number' },
    G8:  { field: 'asset.balance',        type: 'number' },
    // 후원회기부금 행 (Row 9)
    C9:  { field: 'donation.income',         type: 'number' },
    D9:  { field: 'donation.expElection',    type: 'number' },
    E9:  { field: 'donation.expNonElection', type: 'number' },
    F9:  { field: 'donation.expSubtotal',    type: 'number' },
    G9:  { field: 'donation.balance',        type: 'number' },
    // 보조금 행 (Row 10)
    C10: { field: 'subsidy.income',         type: 'number' },
    D10: { field: 'subsidy.expElection',    type: 'number' },
    E10: { field: 'subsidy.expNonElection', type: 'number' },
    F10: { field: 'subsidy.expSubtotal',    type: 'number' },
    G10: { field: 'subsidy.balance',        type: 'number' },
    // 보조금외 행 (Row 11)
    C11: { field: 'subsidyOther.income',         type: 'number' },
    D11: { field: 'subsidyOther.expElection',    type: 'number' },
    E11: { field: 'subsidyOther.expNonElection', type: 'number' },
    F11: { field: 'subsidyOther.expSubtotal',    type: 'number' },
    G11: { field: 'subsidyOther.balance',        type: 'number' },
    // 합계 행 (Row 12)
    C12: { field: 'total.income',         type: 'number' },
    D12: { field: 'total.expElection',    type: 'number' },
    E12: { field: 'total.expNonElection', type: 'number' },
    F12: { field: 'total.expSubtotal',    type: 'number' },
    G12: { field: 'total.balance',        type: 'number' },
    // 서명 영역
    A14: { field: 'reportDate',        type: 'text' },
    A15: { field: 'accountantLine',    type: 'text' },
    A16: { field: 'candidateLine',     type: 'text' },
    A18: { field: 'committeeLine',     type: 'text' },
  },
};
```

### 2.2 T2: 감사의견서 (고정셀)

```
Row 2:  A2  = "감 사 의 견 서" (제목)
Row 4:  B4  = {감사 대상 기간 설명 텍스트}
Row 5:  B5  = {감사 기간 종료일 ~ 회계처리 내역 감사의견...}
Row 9:  B9  = "  가. 감사기간 :" + {감사기간}
Row 14: B14 = "2. 감사의견 :" + {감사의견 텍스트}
Row 15: B15 = "3. 특기사항 :" + {특기사항}
Row 16: B16 = {날짜}
Row 17: D17 = "감  사  자"
Row 19: D19 = "(주  소)" + {주소}
Row 20: D20 = "(성  명)" + {성명}
```

**셀 매핑 정의:**

```typescript
export const T2_MAPPING: FixedCellMapping = {
  id: 'audit-opinion',
  templateFile: '감사의견서.xls',
  type: 'fixed',
  orgTypes: [50, 51, 52, 53, 54, 90, 91, 92, 106, 107, 108, 109, 587, 588, 589],
  sheet: 'Sheet1',
  cells: {
    B4:  { field: 'auditDescription',  type: 'text' },
    B5:  { field: 'auditPeriodEnd',    type: 'text' },
    B9:  { field: 'auditPeriodLine',   type: 'text' },
    B14: { field: 'opinionText',       type: 'text' },
    B15: { field: 'specialNotes',      type: 'text' },
    B16: { field: 'reportDate',        type: 'text' },
    D19: { field: 'auditorAddress',    type: 'text' },
    D20: { field: 'auditorName',       type: 'text' },
  },
};
```

### 2.3 T3: 심사의결서 (고정셀)

```
Row 2:  A2  = "재산 및 수입·지출상황 등의 심사·의결서" (제목)
Row 9:  E9  = {수입지출기간}
Row 10: D10 = {재산액}           ← number
Row 12: D12 = {수입총액}         ← number
Row 13: D13 = {지출총액}         ← number
Row 14: D14 = {잔액}             ← number
Row 16: B16 = {의결 날짜}
Row 17: D17 = {위원회 명칭}
Row 19: D19~I19 = {위원1 직위/성명}
Row 20: D20~I20 = {위원2 직위/성명}
Row 21: D21~I21 = {위원3 직위/성명}
```

**셀 매핑 정의:**

```typescript
export const T3_MAPPING: FixedCellMapping = {
  id: 'review-resolution',
  templateFile: '심사의결서.xls',
  type: 'fixed',
  orgTypes: [50, 51, 52, 53, 54, 90, 91, 92, 106, 107, 108, 109, 587, 588, 589],
  sheet: 'Sheet1',
  cells: {
    E9:  { field: 'period',           type: 'text' },
    D10: { field: 'totalAsset',       type: 'number' },
    D12: { field: 'totalIncome',      type: 'number' },
    D13: { field: 'totalExpense',     type: 'number' },
    D14: { field: 'totalBalance',     type: 'number' },
    B16: { field: 'resolutionDate',   type: 'text' },
    D17: { field: 'committeeName',    type: 'text' },
    // 위원 서명 (최대 5명)
    G19: { field: 'member1Name',      type: 'text' },
    G20: { field: 'member2Name',      type: 'text' },
    G21: { field: 'member3Name',      type: 'text' },
  },
};
```

### 2.4 T4: 회계보고서 (고정셀)

```
Row 2:  A2  = {정당/후원회명}
Row 5:  C5  = "회계 {년도} - " + {문서번호}
Row 6:  C6  = {시행일자}
Row 7:  C7  = {수신 위원장}
Row 8:  C8  = {제목}
Row 33: A33 = {대표자 서명란}
```

**셀 매핑 정의:**

```typescript
export const T4_MAPPING: FixedCellMapping = {
  id: 'accounting-report',
  templateFile: '회계보고서.xls',
  type: 'fixed',
  orgTypes: [50, 51, 52, 53, 54, 90, 91, 92, 106, 107, 108, 109, 587, 588, 589],
  sheet: 'Sheet1',
  cells: {
    A2:  { field: 'orgName',         type: 'text' },
    C5:  { field: 'docNumber',       type: 'text' },
    C6:  { field: 'issueDate',       type: 'text' },
    C7:  { field: 'recipientName',   type: 'text' },
    C8:  { field: 'title',           type: 'text' },
    A33: { field: 'representLine',   type: 'text' },
  },
};
```

### 2.5 T5~T10: 수입지출부 (동적행) - 공통 구조

6개 파일 모두 동일한 열 구조. 계정명과 데이터만 다름.

```
Row 2: A2 = "정 치 자 금  수 입 ·지 출 부" (제목, 고정)
Row 4: A4 = "[계정(과 목)명: {계정명} ({비용구분}) ]"
Row 5-6: 헤더 (2행 병합, 고정)
Row 7-8: 빈 행 (구분선)
Row 9+: 동적 데이터 행
```

**열 매핑 (Row 9부터 반복):**

| 열 | 필드 | 타입 | DB 소스 |
|---|-------|------|---------|
| A | 년월일 | date | `acc_book.acc_date` (Excel serial → YYYY/MM/DD) |
| B | 내역 | text | `acc_book.acc_name` (거래 설명) |
| C | 수입액-금회 | number | `acc_book.income_amt` (당건 수입) |
| D | 수입액-누계 | number | 계산: running sum of income |
| E | 지출액-금회 | number | `acc_book.expense_amt` (당건 지출) |
| F | 지출액-누계 | number | 계산: running sum of expense |
| G | 잔액 | number | 계산: D - F (누적 수입 - 누적 지출) |
| H | 성명/법인명 | text | `customer.cust_name` |
| I | 생년월일/사업자번호 | text | `customer.reg_num` |
| J | 주소/소재지 | text | `customer.addr` |
| K | 직업(업종) | text | `customer.job` |
| L | 전화번호 | text | `customer.tel` |
| M | 영수증일련번호 | text | `acc_book.receipt_no` |
| N | 비고 | text | `acc_book.remark` |
| O | 전송 | text | (빈칸) |

**동적행 매핑 정의:**

```typescript
export const LEDGER_MAPPING: DynamicRowMapping = {
  type: 'dynamic',
  sheet: 'Sheet1',
  header: {
    A4: { field: 'accountLabel', type: 'text' },  // "[계정(과 목)명: xxx ]"
  },
  dataStartRow: 9,  // 0-indexed: row 8
  columns: {
    A: { field: 'accDate',      type: 'date' },
    B: { field: 'description',  type: 'text' },
    C: { field: 'incomeAmt',    type: 'number' },
    D: { field: 'incomeCum',    type: 'number' },
    E: { field: 'expenseAmt',   type: 'number' },
    F: { field: 'expenseCum',   type: 'number' },
    G: { field: 'balance',      type: 'number' },
    H: { field: 'custName',     type: 'text' },
    I: { field: 'regNum',       type: 'text' },
    J: { field: 'addr',         type: 'text' },
    K: { field: 'job',          type: 'text' },
    L: { field: 'tel',          type: 'text' },
    M: { field: 'receiptNo',    type: 'text' },
    N: { field: 'remark',       type: 'text' },
  },
};
```

**계정-템플릿 매핑 (acc_sec_cd + item_sec_cd → 파일):**

| acc_sec_cd | item_sec_cd | 파일 | 계정명 |
|------------|-------------|------|--------|
| 수입-후원회기부금 | 선거비용 | T5: `기부금-선거비용.xlsx` | 후원회기부금 (선거비용) |
| 수입-후원회기부금 | 선거비용외 | T6: `기부금-선거비용외.xlsx` | 후원회기부금 (선거비용외 정치자금) |
| 수입-보조금 | 선거비용 | T7: `보조금-선거비용.xlsx` | 보조금 (선거비용) |
| 수입-보조금 | 선거비용외 | T8: `보조금-선거비용외.xlsx` | 보조금 (선거비용외 정치자금) |
| 수입-후보자산 | 선거비용 | T9: `후보자산-선거비용.xlsx` | 후보자등 자산 (선거비용) |
| 수입-후보자산 | 선거비용외 | T10: `후보자산-선거비용외.xlsx` | 후보자등 자산 (선거비용외 정치자금) |

> 실제 acc_sec_cd/item_sec_cd 코드값은 `acc_rel` 테이블 + `codevalue` 테이블에서 조회

---

## 3. Architecture

### 3.1 모듈 구조

```
app/src/lib/excel-template/
├── index.ts                    # 메인 엔트리 (generateReport 함수)
├── types.ts                    # 타입 정의
├── template-loader.ts          # XLS/XLSX 파일 로드
├── cell-binder.ts              # 고정셀 바인딩 엔진
├── row-binder.ts               # 동적행 바인딩 엔진
├── data-query.ts               # Supabase 데이터 조회 함수들
└── mappings/
    ├── index.ts                # 전체 매핑 레지스트리
    ├── income-expense-report.ts # T1
    ├── audit-opinion.ts         # T2
    ├── review-resolution.ts     # T3
    ├── accounting-report.ts     # T4
    └── ledger-common.ts         # T5~T10 공통

app/templates/excel/             # 원본 템플릿 파일 복사본
├── 정치자금 수입지출보고서.xls
├── 감사의견서.xls
├── 심사의결서.xls
├── 회계보고서.xls
├── 기부금-선거비용.xlsx
├── 기부금-선거비용외.xlsx
├── 보조금-선거비용.xlsx
├── 보조금-선거비용외.xlsx
├── 후보자산-선거비용.xlsx
└── 후보자산-선거비용외.xlsx
```

### 3.2 처리 파이프라인

```
[사용자 요청]
    ↓
[API Route: /api/excel/report]
    ↓
[1] reportType + orgId → 매핑 설정 선택
    ↓
[2] template-loader: 템플릿 파일 로드
    ├─ .xlsx → ExcelJS workbook.xlsx.load(buffer)
    └─ .xls  → xlsx(SheetJS) read → ExcelJS 변환
    ↓
[3] data-query: Supabase에서 데이터 조회
    ├─ 고정셀: 집계 쿼리 (SUM, GROUP BY)
    └─ 동적행: 개별 레코드 + customer JOIN
    ↓
[4] cell-binder / row-binder: 데이터 주입
    ├─ 고정셀: mapping.cells[cellAddr] = value
    └─ 동적행: Row 9부터 레코드별 행 추가
    ↓
[5] ExcelJS workbook.xlsx.writeBuffer()
    ↓
[Response: .xlsx binary]
```

### 3.3 핵심 라이브러리 선택

| 라이브러리 | 역할 | 이유 |
|-----------|------|------|
| **ExcelJS** (기존 설치됨) | .xlsx 읽기/쓰기, 서식 보존 | 이미 프로젝트에 설치. .xlsx 포맷 읽기/쓰기 우수 |
| **xlsx (SheetJS)** (기존 설치됨) | .xls (BIFF8) 읽기 전용 | ExcelJS는 .xls 읽기 미지원. SheetJS로 파싱 후 변환 |

> 두 라이브러리 모두 이미 `app/package.json`에 존재하므로 추가 설치 불필요

### 3.4 .xls → ExcelJS 변환 전략

ExcelJS는 `.xls` (BIFF8) 포맷을 읽을 수 없으므로 변환 필요:

```typescript
// template-loader.ts
import XLSX from 'xlsx';
import ExcelJS from 'exceljs';

async function loadTemplate(filePath: string): Promise<ExcelJS.Workbook> {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.xlsx') {
    // ExcelJS 직접 로드 (서식 100% 보존)
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(filePath);
    return wb;
  }

  if (ext === '.xls') {
    // 방안 1: 사전 변환된 .xlsx 사용 (권장)
    // 보고문서샘플의 .xls 파일을 사전에 .xlsx로 변환하여 templates/ 에 저장
    const xlsxPath = filePath.replace('.xls', '.xlsx');
    if (fs.existsSync(xlsxPath)) {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.readFile(xlsxPath);
      return wb;
    }

    // 방안 2: 런타임 변환 (서식 손실 가능)
    const xlsWb = XLSX.readFile(filePath);
    const xlsxBuffer = XLSX.write(xlsWb, { type: 'buffer', bookType: 'xlsx' });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(xlsxBuffer);
    return wb;
  }

  throw new Error(`Unsupported format: ${ext}`);
}
```

**권장: 사전 변환 방식**
- T1~T4의 .xls 파일을 LibreOffice/Excel로 .xlsx 변환 후 `app/templates/excel/`에 저장
- 런타임 변환은 서식/병합 손실 위험 있음
- 사전 변환 시 원본과 동일한지 육안 검수 1회 필요

---

## 4. Type Definitions

```typescript
// lib/excel-template/types.ts

/** 셀 값 타입 */
export type CellValueType = 'number' | 'text' | 'date';

/** 고정셀 매핑: 특정 셀 주소에 값 주입 */
export interface FixedCellEntry {
  field: string;          // 데이터 객체의 키 경로 (e.g., "asset.income")
  type: CellValueType;
}

/** 고정셀 보고서 매핑 설정 */
export interface FixedCellMapping {
  id: string;
  templateFile: string;
  type: 'fixed';
  orgTypes: number[];
  sheet: string;
  cells: Record<string, FixedCellEntry>;  // cellAddress → entry
}

/** 동적행 열 정의 */
export interface DynamicColumnEntry {
  field: string;
  type: CellValueType;
}

/** 동적행 보고서 매핑 설정 */
export interface DynamicRowMapping {
  id: string;
  templateFile: string;
  type: 'dynamic';
  orgTypes: number[];
  sheet: string;
  header: Record<string, FixedCellEntry>;  // 헤더 영역 고정셀
  dataStartRow: number;                     // 데이터 시작 행 (1-based)
  columns: Record<string, DynamicColumnEntry>; // colLetter → entry
}

/** 통합 매핑 타입 */
export type TemplateMappingConfig = FixedCellMapping | DynamicRowMapping;

/** 보고서 유형 enum */
export type ReportType =
  | 'income-expense-report'    // T1: 수입지출보고서
  | 'audit-opinion'            // T2: 감사의견서
  | 'review-resolution'        // T3: 심사의결서
  | 'accounting-report'        // T4: 회계보고서
  | 'ledger';                  // T5~T10: 수입지출부

/** API 요청 파라미터 */
export interface ReportRequest {
  reportType: ReportType;
  orgId: string;
  // 수입지출부 전용
  accSecCd?: string;     // 계정코드
  itemSecCd?: string;    // 항목코드 (선거비용 / 선거비용외)
  // 기간 필터
  dateFrom?: string;
  dateTo?: string;
}

/** 수입지출보고서 데이터 구조 */
export interface IncomeExpenseReportData {
  electionName: string;
  districtName: string;
  entityName: string;
  asset:        AccountRow;
  donation:     AccountRow;
  subsidy:      AccountRow;
  subsidyOther: AccountRow;
  total:        AccountRow;
  reportDate: string;
  accountantLine: string;
  candidateLine: string;
  committeeLine: string;
}

export interface AccountRow {
  income: number;
  expElection: number;
  expNonElection: number;
  expSubtotal: number;
  balance: number;
}

/** 수입지출부 행 데이터 */
export interface LedgerRow {
  accDate: Date;
  description: string;
  incomeAmt: number;
  incomeCum: number;
  expenseAmt: number;
  expenseCum: number;
  balance: number;
  custName: string;
  regNum: string;
  addr: string;
  job: string;
  tel: string;
  receiptNo: string;
  remark: string;
}
```

---

## 5. API Design

### 5.1 새 API 엔드포인트

**`GET /api/excel/report`**

| 파라미터 | 필수 | 설명 | 예시 |
|---------|:----:|------|------|
| `reportType` | Y | 보고서 유형 | `income-expense-report`, `ledger` |
| `orgId` | Y | 조직 ID | `uuid-string` |
| `accSecCd` | N | 계정코드 (ledger용) | `10` |
| `itemSecCd` | N | 항목코드 (ledger용) | `01` |
| `dateFrom` | N | 시작일 | `2026-01-01` |
| `dateTo` | N | 종료일 | `2026-12-31` |

**응답:**
- `200`: Binary .xlsx file (`Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`)
- `400`: 필수 파라미터 누락
- `404`: 조직 미발견 또는 해당 보고서 데이터 없음
- `500`: 템플릿 로드 실패

### 5.2 기존 API 호환

기존 `/api/excel/export`는 유지. 새 `/api/excel/report`를 별도로 추가하여 병행 운영 후 점진적 전환.

### 5.3 API Route 구현 구조

```typescript
// app/src/app/api/excel/report/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { generateReport } from '@/lib/excel-template';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const reportType = searchParams.get('reportType') as ReportType;
  const orgId = searchParams.get('orgId');

  if (!reportType || !orgId) {
    return NextResponse.json({ error: 'reportType and orgId required' }, { status: 400 });
  }

  const buffer = await generateReport({
    reportType,
    orgId,
    accSecCd: searchParams.get('accSecCd') ?? undefined,
    itemSecCd: searchParams.get('itemSecCd') ?? undefined,
    dateFrom: searchParams.get('dateFrom') ?? undefined,
    dateTo: searchParams.get('dateTo') ?? undefined,
  });

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(reportType)}.xlsx"`,
    },
  });
}
```

---

## 6. Data Query Design

### 6.1 수입지출보고서 (T1) 데이터 조회

```sql
-- 계정별 수입/지출 합계 (org_id 기준)
SELECT
  cv_acc.cd_val AS acc_sec_cd,
  cv_item.cd_val AS item_sec_cd,
  SUM(CASE WHEN ab.incm_sec_cd IN ('수입계정코드') THEN ab.amt ELSE 0 END) AS income,
  SUM(CASE WHEN ab.incm_sec_cd IN ('지출계정코드') AND cv_item.cd_val = '선거비용' THEN ab.amt ELSE 0 END) AS exp_election,
  SUM(CASE WHEN ab.incm_sec_cd IN ('지출계정코드') AND cv_item.cd_val = '선거비용외' THEN ab.amt ELSE 0 END) AS exp_non_election
FROM acc_book ab
JOIN codevalue cv_acc ON ab.acc_sec_cd = cv_acc.cd_val
JOIN codevalue cv_item ON ab.item_sec_cd = cv_item.cd_val
WHERE ab.org_id = $1
GROUP BY cv_acc.cd_val, cv_item.cd_val;
```

> 실제 구현 시 `adjustNegativeIncome()` 적용 필요 (음수 수입 → 지출 전환)

### 6.2 수입지출부 (T5~T10) 데이터 조회

```sql
-- 특정 계정의 거래 내역 + 거래처 정보
SELECT
  ab.acc_date,
  ab.acc_name,
  ab.amt,
  ab.incm_sec_cd,
  ab.receipt_no,
  ab.remark,
  c.cust_name,
  c.reg_num,
  c.addr,
  c.job,
  c.tel
FROM acc_book ab
LEFT JOIN customer c ON ab.cust_id = c.id
WHERE ab.org_id = $1
  AND ab.acc_sec_cd = $2
  AND ab.item_sec_cd = $3
ORDER BY ab.acc_date ASC, ab.created_at ASC;
```

> 누적 금액(incomeCum, expenseCum, balance)은 JS에서 계산 (기존 export route와 동일 로직)

### 6.3 감사의견서/심사의결서 (T2, T3) 데이터 조회

```sql
-- 조직 기본 정보
SELECT org_name, org_sec_cd, election_name, district_name
FROM organ WHERE id = $1;

-- 감사의견 (opinion 테이블)
SELECT opinion_text, special_notes, audit_period, auditor_name, auditor_addr
FROM opinion WHERE org_id = $1 ORDER BY created_at DESC LIMIT 1;

-- 수입/지출 총액 (심사의결서용)
SELECT
  SUM(CASE WHEN incm_sec_cd IN (...) THEN amt ELSE 0 END) AS total_income,
  SUM(CASE WHEN incm_sec_cd IN (...) THEN amt ELSE 0 END) AS total_expense
FROM acc_book WHERE org_id = $1;
```

---

## 7. Core Engine Implementation

### 7.1 메인 엔트리 (index.ts)

```typescript
// lib/excel-template/index.ts

import { loadTemplate } from './template-loader';
import { bindFixedCells } from './cell-binder';
import { bindDynamicRows } from './row-binder';
import { queryReportData } from './data-query';
import { getMappingConfig, getLedgerTemplateFile } from './mappings';
import type { ReportRequest } from './types';

export async function generateReport(req: ReportRequest): Promise<Buffer> {
  // 1. 매핑 설정 선택
  const mapping = getMappingConfig(req.reportType, req.accSecCd, req.itemSecCd);

  // 2. 템플릿 로드
  const workbook = await loadTemplate(mapping.templateFile);

  // 3. 데이터 조회
  const data = await queryReportData(req);

  // 4. 데이터 바인딩
  const worksheet = workbook.getWorksheet(mapping.sheet);
  if (!worksheet) throw new Error(`Sheet not found: ${mapping.sheet}`);

  if (mapping.type === 'fixed') {
    bindFixedCells(worksheet, mapping, data);
  } else {
    bindDynamicRows(worksheet, mapping, data);
  }

  // 5. Buffer 출력
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
```

### 7.2 고정셀 바인더 (cell-binder.ts)

```typescript
// lib/excel-template/cell-binder.ts

import type { Worksheet } from 'exceljs';
import type { FixedCellMapping } from './types';

/** 중첩 객체에서 dot-notation 경로로 값 추출 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((acc, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj as unknown);
}

export function bindFixedCells(
  ws: Worksheet,
  mapping: FixedCellMapping,
  data: Record<string, unknown>,
): void {
  for (const [cellAddr, entry] of Object.entries(mapping.cells)) {
    const value = getNestedValue(data, entry.field);
    if (value === undefined || value === null) continue;

    const cell = ws.getCell(cellAddr);
    // 기존 서식 보존, 값만 교체
    if (entry.type === 'number') {
      cell.value = Number(value);
    } else {
      cell.value = String(value);
    }
  }
}
```

### 7.3 동적행 바인더 (row-binder.ts)

```typescript
// lib/excel-template/row-binder.ts

import type { Worksheet } from 'exceljs';
import type { DynamicRowMapping, LedgerRow } from './types';

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

  // 2. 기존 Row 9의 서식을 참조 스타일로 캡쳐
  const templateRow = ws.getRow(mapping.dataStartRow);
  const columnStyles: Record<string, Partial<ExcelJS.Style>> = {};
  for (const [colLetter] of Object.entries(mapping.columns)) {
    const colNum = colLetterToNumber(colLetter);
    const cell = templateRow.getCell(colNum);
    columnStyles[colLetter] = { ...cell.style };
  }

  // 3. 데이터 행 삽입
  for (let i = 0; i < data.rows.length; i++) {
    const rowNum = mapping.dataStartRow + i;
    const row = data.rows[i];
    const wsRow = ws.getRow(rowNum);

    for (const [colLetter, entry] of Object.entries(mapping.columns)) {
      const colNum = colLetterToNumber(colLetter);
      const cell = wsRow.getCell(colNum);
      const value = row[entry.field as keyof LedgerRow];

      // 서식 복사
      cell.style = { ...columnStyles[colLetter] };

      // 값 설정
      if (value === undefined || value === null || value === 0) {
        cell.value = entry.type === 'number' ? null : '';
      } else if (entry.type === 'number') {
        cell.value = Number(value);
      } else if (entry.type === 'date') {
        cell.value = value instanceof Date ? value : new Date(String(value));
        cell.numFmt = 'YYYY/MM/DD';
      } else {
        cell.value = String(value);
      }
    }
  }
}

function colLetterToNumber(letter: string): number {
  let num = 0;
  for (let i = 0; i < letter.length; i++) {
    num = num * 26 + (letter.charCodeAt(i) - 64);
  }
  return num;
}
```

---

## 8. UI Design

### 8.1 보고서 다운로드 페이지

기존 dashboard 내에 통합 보고서 다운로드 UI를 추가한다.

**위치**: `/dashboard/report-download` 또는 기존 `/dashboard/reports` 페이지에 탭 추가

**UI 구성:**

```
┌──────────────────────────────────────────┐
│  선관위 제출 보고서 다운로드              │
├──────────────────────────────────────────┤
│                                          │
│  보고서 유형:  [▼ 드롭다운 선택]         │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │ ○ 정치자금 수입지출보고서           │  │
│  │ ○ 감사의견서                        │  │
│  │ ○ 심사의결서                        │  │
│  │ ○ 회계보고서                        │  │
│  │ ─────────────────────              │  │
│  │ ○ 수입지출부 (계정별)              │  │
│  │   계정: [▼ 후보자산/기부금/보조금]  │  │
│  │   구분: [▼ 선거비용/선거비용외]     │  │
│  └────────────────────────────────────┘  │
│                                          │
│  기간: [2026-01-01] ~ [2026-12-31]       │
│                                          │
│  [📥 다운로드]                            │
│                                          │
└──────────────────────────────────────────┘
```

### 8.2 다운로드 트리거

```typescript
const handleDownload = async () => {
  setLoading(true);
  try {
    const params = new URLSearchParams({
      reportType: selectedType,
      orgId: auth.orgId,
      ...(accSecCd && { accSecCd }),
      ...(itemSecCd && { itemSecCd }),
      ...(dateFrom && { dateFrom }),
      ...(dateTo && { dateTo }),
    });

    const res = await fetch(`/api/excel/report?${params}`);
    if (!res.ok) throw new Error('보고서 생성 실패');

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${REPORT_NAMES[selectedType]}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  } finally {
    setLoading(false);
  }
};
```

---

## 9. Implementation Order

| 순서 | 작업 | 파일 | 의존성 | 예상 |
|:----:|------|------|--------|------|
| 1 | 타입 정의 | `lib/excel-template/types.ts` | 없음 | S |
| 2 | 매핑 정의 (T1~T4 고정셀) | `lib/excel-template/mappings/*.ts` | #1 | M |
| 3 | 매핑 정의 (T5~T10 동적행) | `lib/excel-template/mappings/ledger-common.ts` | #1 | S |
| 4 | 템플릿 파일 복사 + .xls→.xlsx 사전 변환 | `app/templates/excel/` | 없음 | S |
| 5 | template-loader 구현 | `lib/excel-template/template-loader.ts` | #4 | S |
| 6 | cell-binder 구현 | `lib/excel-template/cell-binder.ts` | #1 | S |
| 7 | row-binder 구현 | `lib/excel-template/row-binder.ts` | #1 | M |
| 8 | data-query 구현 | `lib/excel-template/data-query.ts` | #1 | M |
| 9 | index.ts (메인 엔진) | `lib/excel-template/index.ts` | #5~8 | S |
| 10 | API route | `app/api/excel/report/route.ts` | #9 | S |
| 11 | UI 컴포넌트 | dashboard 페이지 | #10 | M |
| 12 | 검증 (compare-excel.mjs) | 스크립트 실행 | #10 | M |

**S** = Small (1~2시간), **M** = Medium (2~4시간)

---

## 10. Edge Cases & Constraints

### 10.1 빈 데이터 처리
- 데이터 없는 셀: **빈칸 유지** (0 또는 null 표시하지 않음)
- 수입지출부에 거래 0건: 헤더만 있고 데이터 행 없는 파일 출력

### 10.2 동적행과 기존 서식 충돌
- 템플릿의 Row 9 이후에 주석/서명란이 있을 수 있음 → 데이터 삽입 전 해당 영역 확인
- 병합 셀 위에 데이터 쓰기 시도 시 ExcelJS가 에러 → 병합 해제 후 쓰기 또는 회피

### 10.3 날짜 포맷
- 템플릿의 날짜가 Excel serial number (e.g., 44694 = 2022-05-23)
- DB의 acc_date는 ISO 문자열 → Excel Date 객체로 변환 필요
- numFmt: `YYYY/MM/DD` 또는 `YYYY.MM.DD` (원본 서식 따름)

### 10.4 음수 수입 처리
- `adjustNegativeIncome()` 적용 후 데이터 조회
- 수입지출보고서(T1)의 합계에 반영

### 10.5 숫자 포맷
- 원본 템플릿 서식 유지: `#,##0` (천단위 구분)
- cell.value에 number 타입으로 주입 시 기존 numFmt 보존됨

---

## 11. Verification Plan

| # | 검증 항목 | 방법 | 기준 |
|---|----------|------|------|
| V1 | 셀 값 정확성 | `compare-excel.mjs` 실행 | Cell Value Equivalence PASS |
| V2 | 서식 보존 | 원본 vs 출력 파일 육안 비교 | 레이아웃/폰트/테두리 동일 |
| V3 | 병합 셀 무결성 | 출력 파일에서 병합 영역 확인 | 원본과 병합 수 동일 |
| V4 | 조직유형별 분기 | 정당/후원회/후보자/국회의원 각각 테스트 | 올바른 템플릿 선택 |
| V5 | 빈 데이터 | 거래 0건 조직으로 다운로드 | 헤더만 출력, 에러 없음 |
| V6 | 대량 데이터 | 500건 이상 거래 | 3초 이내 생성 |
| V7 | 엣지 케이스 | 음수 수입, 특수문자 포함 거래처명 | 정상 출력 |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-30 | Initial design based on 보고문서샘플 분석 | AI (Claude) |
