# 선관위 템플릿 기반 보고서 생성 Planning Document

> **Summary**: 선관위 공식 XLS 템플릿을 로드하여 지정된 셀에 숫자만 채워넣는 방식으로 보고서를 생성
>
> **Project**: PoliticalFundAccountingManagement
> **Version**: 0.1.0
> **Author**: AI (Claude)
> **Date**: 2026-03-30
> **Status**: Draft

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 현재 ExcelJS로 셀을 처음부터 생성하는 방식은 선관위 공식 서식과 포맷/레이아웃 차이가 발생하며, 45종 서식 중 2종만 구현된 상태 |
| **Solution** | 선관위 공식 XLS 템플릿 파일을 그대로 로드한 뒤, 미리 지정된 데이터 셀에 숫자/텍스트만 채워넣는 템플릿 바인딩 방식으로 전환 |
| **Function/UX Effect** | 선관위 제출 양식과 100% 동일한 포맷의 보고서 다운로드. 사용자는 보고서 종류를 선택하고 "다운로드" 버튼만 누르면 완성 |
| **Core Value** | 포맷 불일치로 인한 제출 반려 위험 제거, 45종 서식 확장의 기반 마련 |

---

## 1. Overview

### 1.1 Purpose

선관위(중앙선거관리위원회)에 제출해야 하는 정치자금 회계보고서를 공식 XLS 서식 파일을 템플릿으로 사용하여 생성한다. 현재 ExcelJS로 처음부터 셀을 구성하는 방식 대신, 공식 서식의 레이아웃/서식/머지를 그대로 유지하면서 데이터 셀에 숫자만 채워넣는다.

### 1.2 Background

**현재 상태:**
- `app/src/app/api/excel/export/route.ts`: ExcelJS로 수입지출부 1종만 처음부터 생성
- 11개 dashboard 페이지에서 각각 독자적으로 Excel 생성 (reports, income-expense-report, donors, receipt, resolution 등)
- `compare-excel.mjs` 비교 결과, 서식/폰트/셀 병합 등에서 공식 양식과 차이 발생

**보유 리소스 (총 25개 공식 템플릿 파일):**

| 경로 | 파일 | 용도 |
|------|------|------|
| `중앙선거관리위원회_.../Excel/` | `정치자금 수입지출보고서.xls` | 수입지출보고서 |
| | `정당의 수입지출총괄표.xls` | 정당 총괄표 |
| | `후원회의 수입지출총괄표.xls` | 후원회 총괄표 |
| | `정당의 재산 및 수입지출총괄표.xls` | 정당 재산+총괄표 |
| | `감사의견서.xls` | 감사의견서 |
| | `심사의결서.xls` | 심사의결서 |
| | `회계보고서.xls` / `회계보고서2.xls` | 회계보고서 |
| | `지출결의서.xls` | 지출결의서 |
| | `NEC리포트양식-정당의 수입지출총괄표.xlsx` | NEC 리포트 양식 |
| | `NEC리포트양식-결산작업.xlsx` | NEC 결산 양식 |
| `중앙선거관리위원회_.../선거본부제출문서/` | 수입자일괄등록, 익명수입자일괄등록, 보조금-선거비용, 후보자산 등 11개 | 선거본부 제출문서 |

**핵심 전환:**
- AS-IS: `new ExcelJS.Workbook()` → 셀 하나씩 생성 → 서식 적용 → 데이터 입력
- TO-BE: `workbook.xlsx.load(templateBuffer)` → 지정 셀에 데이터만 입력 → 저장

### 1.3 Related Documents

- FORM_TEMPLATES.md: 45종 서식 목록 및 구현 상태
- PROGRAM_DESIGN.md: 전체 시스템 설계 (Excel import/export 섹션)
- `app/scripts/compare-excel.mjs`: 레거시 vs 웹앱 Excel 비교 도구

---

## 2. Scope

### 2.1 In Scope

- [ ] 템플릿 로딩 인프라 구축 (XLS/XLSX 파일을 읽어 ExcelJS Workbook으로 변환)
- [ ] 셀 매핑 정의 시스템 (템플릿별 데이터 바인딩 위치 정의)
- [ ] 1차 구현 대상 보고서 (우선순위 상위 6종):
  - [ ] 정치자금 수입지출보고서
  - [ ] 수입지출총괄표 (정당/후원회)
  - [ ] 감사의견서
  - [ ] 심사의결서
  - [ ] 회계보고서
- [ ] 기존 `/api/excel/export` 라우트 리팩토링 (템플릿 기반으로 전환)
- [ ] 보고서 유형 선택 UI (dashboard 내 통합 보고서 다운로드 페이지)
- [ ] compare-excel.mjs를 활용한 출력 검증

### 2.2 Out of Scope

- 45종 서식 전체 구현 (1차에서는 핵심 6종만)
- 선거본부제출문서 양식 (수입자일괄등록, 보조금 등)은 2차
- 브라우저 내 Excel 미리보기/편집 기능
- PDF 변환 출력
- 템플릿 파일 자체의 수정/커스터마이징 UI

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | XLS/XLSX 템플릿 파일을 서버에서 로드하여 ExcelJS Workbook으로 파싱 | High | Pending |
| FR-02 | 템플릿별 셀 매핑 설정 파일 (JSON/TS)로 데이터 바인딩 위치 정의 | High | Pending |
| FR-03 | DB에서 조회한 회계 데이터를 매핑 설정에 따라 템플릿 셀에 주입 | High | Pending |
| FR-04 | 조직유형(org_sec_cd)에 따라 적절한 템플릿 자동 선택 | High | Pending |
| FR-05 | 다운로드 시 원본 템플릿의 서식/병합/테두리/폰트 100% 보존 | High | Pending |
| FR-06 | 기존 `/api/excel/export` 엔드포인트 하위 호환 유지 | Medium | Pending |
| FR-07 | 보고서 유형 선택 드롭다운 + 다운로드 버튼 UI | Medium | Pending |
| FR-08 | 수입지출보고서: 계정별 소계/합계 자동 계산 및 셀 주입 | High | Pending |
| FR-09 | 총괄표: 음수 수입 → 지출 전환(adjustNegativeIncome) 반영 | High | Pending |
| FR-10 | 감사의견서/심사의결서: 텍스트 필드 + 서명란 데이터 바인딩 | Medium | Pending |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| Performance | 보고서 생성 < 3초 (100건 기준) | API 응답 시간 측정 |
| Fidelity | compare-excel.mjs Cell Value Equivalence PASS | 셀 값 비교 스크립트 |
| Fidelity | 원본 템플릿 대비 서식 보존율 100% | 육안 검수 + 구조 비교 |
| Compatibility | .xls (BIFF8) 및 .xlsx (OOXML) 모두 지원 | 양쪽 포맷 테스트 |
| Maintainability | 새 템플릿 추가 시 매핑 JSON만 작성하면 됨 | 개발자 작업량 측정 |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] 6종 보고서 모두 템플릿 기반으로 생성 가능
- [ ] compare-excel.mjs로 레거시 출력물과 비교 시 Cell Value Equivalence PASS
- [ ] 기존 수입지출부 다운로드 기능 하위 호환
- [ ] 조직유형별 (정당/후원회/후보자/국회의원) 적절한 템플릿 선택
- [ ] dashboard에서 보고서 유형 선택 후 다운로드 동작 확인

### 4.2 Quality Criteria

- [ ] 생성된 Excel 파일을 MS Excel, LibreOffice, 한글오피스에서 정상 렌더링
- [ ] 빈 데이터 케이스: 데이터 없는 셀은 빈칸 유지 (0이나 null 표시 안 함)
- [ ] 숫자 포맷: "#,##0" (천단위 구분) 원본 서식 유지
- [ ] ESLint 에러 0건, TypeScript 타입 안전

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| ExcelJS의 .xls (BIFF8) 읽기 미지원 | High | High | .xls → .xlsx 변환 전처리 또는 xlsx-js-style 라이브러리 병행 사용 |
| 템플릿 셀 병합 구조가 복잡하여 데이터 주입 위치 특정 어려움 | Medium | Medium | 각 템플릿별 셀 좌표를 사전 조사하여 매핑 파일로 문서화 |
| 선관위 양식 변경 시 매핑 재작업 필요 | Low | Low | 매핑을 JSON 설정 파일로 분리하여 코드 수정 없이 대응 |
| 조직유형별 양식 분기가 복잡 | Medium | Medium | acc_rel 테이블의 org_sec_cd 기반 분기 로직 재활용 |
| 대용량 데이터(수천건)의 동적 행 삽입 시 병합 셀 깨짐 | High | Medium | 행 삽입 대신 템플릿에 충분한 빈 행 확보, 또는 데이터 영역만 동적 생성 |

---

## 6. Architecture Considerations

### 6.1 Project Level Selection

| Level | Characteristics | Recommended For | Selected |
|-------|-----------------|-----------------|:--------:|
| **Starter** | Simple structure | Static sites | ☐ |
| **Dynamic** | Feature-based modules, BaaS integration | Web apps with backend | ☑ |
| **Enterprise** | Strict layer separation, DI | High-traffic systems | ☐ |

### 6.2 Key Architectural Decisions

| Decision | Options | Selected | Rationale |
|----------|---------|----------|-----------|
| 템플릿 로딩 방식 | 런타임 파일 읽기 / 빌드타임 번들 | 런타임 파일 읽기 | 템플릿 교체 시 재빌드 불필요 |
| 템플릿 저장 위치 | `public/` / `app/templates/` / 별도 디렉토리 | `app/templates/excel/` | API route에서 fs.readFile 접근, Vercel 배포 시 포함 |
| XLS 파싱 라이브러리 | ExcelJS만 / xlsx(SheetJS) 병행 | ExcelJS + xlsx 병행 | ExcelJS는 .xlsx만 지원, .xls 읽기는 xlsx(SheetJS) 필요 |
| 셀 매핑 정의 방식 | 하드코딩 / JSON 설정 / TypeScript 타입 | TypeScript 타입 + JSON | 타입 안전 + 설정 분리 |
| 데이터 쿼리 | 기존 API route 재사용 / 전용 쿼리 | 전용 쿼리 함수 | 보고서별 집계 로직이 다름 |
| 동적 행 처리 | 행 삽입 / 충분한 빈 행 / 데이터 시트 분리 | 데이터 시트 분리 | 고정 서식 시트 + 동적 데이터 시트 |

### 6.3 구현 구조

```
app/src/
├── lib/
│   └── excel-template/
│       ├── index.ts                  # 공통 템플릿 엔진 (로드 → 바인딩 → 출력)
│       ├── template-loader.ts        # XLS/XLSX 파일 로드 및 파싱
│       ├── cell-binder.ts            # 셀 매핑 정의에 따라 데이터 주입
│       ├── types.ts                  # TemplateMappingConfig 타입 정의
│       └── mappings/                 # 템플릿별 셀 매핑 정의
│           ├── income-expense-report.ts    # 수입지출보고서
│           ├── summary-table.ts            # 수입지출총괄표
│           ├── audit-opinion.ts            # 감사의견서
│           ├── review-resolution.ts        # 심사의결서
│           └── accounting-report.ts        # 회계보고서
├── app/
│   └── api/
│       └── excel/
│           └── export/
│               └── route.ts          # 리팩토링: 템플릿 엔진 호출로 전환
app/
├── templates/
│   └── excel/                        # 선관위 공식 XLS/XLSX 파일 복사본
│       ├── 정치자금_수입지출보고서.xlsx
│       ├── 정당_수입지출총괄표.xlsx
│       ├── 후원회_수입지출총괄표.xlsx
│       ├── 감사의견서.xlsx
│       ├── 심사의결서.xlsx
│       └── 회계보고서.xlsx
```

### 6.4 셀 매핑 설정 예시

```typescript
// lib/excel-template/types.ts
export interface CellMapping {
  cell: string;           // e.g., "B5", "C10"
  field: string;          // DB 필드 또는 계산식 참조 키
  type: 'number' | 'text' | 'date';
  format?: string;        // e.g., "#,##0"
}

export interface SheetMapping {
  sheetName: string;      // 대상 시트명
  cells: CellMapping[];   // 고정 셀 매핑 (소계, 합계 등)
  dynamicRows?: {         // 동적 행 영역 (거래 내역 등)
    startRow: number;
    columns: Record<string, string>;  // colLetter → field
  };
}

export interface TemplateMappingConfig {
  templateFile: string;   // 템플릿 파일명
  orgTypes: number[];     // 적용 가능한 org_sec_cd 목록
  sheets: SheetMapping[];
}
```

```typescript
// lib/excel-template/mappings/income-expense-report.ts
export const incomeExpenseReportMapping: TemplateMappingConfig = {
  templateFile: '정치자금_수입지출보고서.xlsx',
  orgTypes: [50, 51, 52, 53, 54, 90, 91, 92, 106, 107, 108, 109, 587, 588, 589],
  sheets: [{
    sheetName: '수입지출보고서',
    cells: [
      { cell: 'B3', field: 'orgName', type: 'text' },
      { cell: 'D3', field: 'reportPeriod', type: 'text' },
      { cell: 'C8', field: 'totalIncome', type: 'number', format: '#,##0' },
      { cell: 'D8', field: 'totalExpense', type: 'number', format: '#,##0' },
      // ... 계정별 소계/합계 셀 좌표
    ],
  }],
};
```

---

## 7. Convention Prerequisites

### 7.1 Existing Project Conventions

- [x] `CLAUDE.md` has coding conventions section
- [ ] `docs/01-plan/conventions.md` exists
- [x] ESLint configuration (Next.js default)
- [x] TypeScript configuration (`tsconfig.json`)
- [x] `@/*` path alias → `./src/*`

### 7.2 Conventions to Define/Verify

| Category | Current State | To Define | Priority |
|----------|---------------|-----------|:--------:|
| **템플릿 파일 명명** | 한글 원본명 그대로 | 언더스코어 구분 한글명 (e.g., `정치자금_수입지출보고서.xlsx`) | High |
| **매핑 파일 명명** | 없음 | kebab-case 영문 (e.g., `income-expense-report.ts`) | High |
| **에러 처리** | API route에서 직접 | 템플릿 로드 실패/매핑 오류 전용 에러 클래스 | Medium |
| **Import 순서** | 기존 패턴 유지 | lib/excel-template 내부 모듈 순서 | Low |

### 7.3 Environment Variables Needed

| Variable | Purpose | Scope | To Be Created |
|----------|---------|-------|:-------------:|
| (없음) | 추가 환경변수 불필요 | - | - |

> 템플릿 파일은 프로젝트 디렉토리에 포함되므로 별도 환경변수 불필요

---

## 8. Implementation Strategy

### 8.1 Phase 1: 인프라 (템플릿 엔진)

1. `lib/excel-template/` 모듈 생성
2. `template-loader.ts`: XLS/XLSX 로드 함수 (ExcelJS + xlsx 라이브러리)
3. `cell-binder.ts`: 매핑 설정 기반 데이터 주입 함수
4. `types.ts`: TypeScript 타입 정의

### 8.2 Phase 2: 셀 매핑 조사 및 정의

1. 6종 공식 템플릿 파일을 열어 데이터 셀 좌표 조사
2. 각 템플릿별 매핑 파일 작성 (`mappings/*.ts`)
3. 템플릿 파일을 `app/templates/excel/`에 복사

### 8.3 Phase 3: 보고서 생성 로직

1. 보고서별 데이터 쿼리 함수 작성 (Supabase 집계)
2. 쿼리 결과 → 매핑 설정 → 템플릿 바인딩 → 파일 출력
3. 기존 `/api/excel/export` route 리팩토링

### 8.4 Phase 4: UI 통합

1. 보고서 유형 선택 UI 컴포넌트
2. 다운로드 트리거 연동
3. 에러/로딩 상태 처리

### 8.5 Phase 5: 검증

1. `compare-excel.mjs`로 레거시 출력물과 셀 값 비교
2. 조직유형별 테스트 (정당/후원회/후보자/국회의원)
3. 엣지 케이스: 데이터 없음, 대량 데이터, 음수 수입

---

## 9. Next Steps

1. [ ] Design 문서 작성 (`excel-template-report.design.md`)
2. [ ] 6종 템플릿 셀 좌표 사전 조사
3. [ ] ExcelJS .xls 읽기 한계 확인 및 대안 라이브러리 PoC
4. [ ] 구현 시작

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-30 | Initial draft | AI (Claude) |
