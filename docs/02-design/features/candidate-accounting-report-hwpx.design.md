# candidate-accounting-report-hwpx Design Document

> **Summary**: (예비)후보자 회계보고서 3종 — **22-1 수입·지출보고서(구분별 집계 총괄표)**, **22-3 재산명세서(estate 구분별 명세·소계·합계)**, **22-4 수입·지출부(계정·과목별 상세, form-7 패턴 재사용)** — 을 acc_book·customer·estate 데이터로 채워 공식 레이아웃 그대로의 HWPX로 생성·다운로드한다. (22-2 제외)
>
> **Project**: 정치자금 회계관리 시스템 (political-fund-accounting)
> **Version**: 0.5.0.0
> **Author**: DrunkenZealnut
> **Date**: 2026-06-08
> **Status**: Draft
> **Planning Doc**: [candidate-accounting-report-hwpx.plan.md](../../01-plan/features/candidate-accounting-report-hwpx.plan.md)

---

## 1. Overview

### 1.1 Design Goals

- 공식 form-22-1·22-3·22-4 레이아웃을 **보존**하면서 데이터로 표/셀을 채운다.
- 직전 완료 모듈(`income-ledger-builder`, `owpml-table`, dataFill 메커니즘)을 **최대 재사용**, 특히 22-4는 form-7과 동일 패턴.
- 집계·그룹·매핑 로직을 **순수 함수**로 분리해 단위 테스트한다.
- 기존 `generateHwpx`(토큰 1:1 치환)·`income-ledger`(서식 7) 경로를 **건드리지 않는다**(회귀 방지).

### 1.2 Design Principles

- **SSOT 재사용**: 자금원 분류 `classifyFundingSource()`(funding-source.ts), 재산 구분 `ESTATE_TYPES`(estate 페이지 → 공용 모듈로 추출), 코드명 `getName()`(codevalue). 하드코딩 금지(아카이브 교훈: acc_sec_cd 가정 오류 사전 차단).
- **기존 아키텍처 비침습**: 토큰 치환 코어·서식 7 동작 불변. 신규 빌더/라우트/템플릿으로 분리.
- **레이아웃 보존 우선**: 표 구조(borderFill·cellSz·secPr)는 템플릿 복제, 텍스트만 주입.

### 1.3 서식 역분석 결과 (설계 근거, 템플릿 실측)

| 서식 | 구조 | 채움 방식 | 재사용 |
|------|------|----------|--------|
| **22-1** 수입·지출보고서 | 헤더(선거명·선거구명·후보자) + **고정 총괄표**(행=자산/후원회기부금/정당지원금[보조금·보조금외]/합계, 열=수입·지출[선거비용·선거비용외·소계]·잔액·비고) + 서명란 | **고정 셀 토큰 치환** (행 복제 없음) | classifyFundingSource + 과목 선거비용 구분 |
| **22-3** 재산명세서 | 구분(토지·건물·주식/유가증권·비품·현금및예금·그밖의재산)별 **명세 행 + 소계** + 총합계, 열=종류·수량·내용·가액·비고 | **행 복제형** (구분 그룹마다 행 N + 소계 1) | ESTATE_TYPES + 신규 그룹/소계 빌더 |
| **22-4** 수입·지출부 | `<hp:tbl colCnt="14" rowCnt>` 계정명/과목명 + 년월일·내역·수입액(금회·누계)·지출액(금회·누계)·잔액·수입지출처(성명·생년월일·주소·직업·전화)·영수증·**비고** | **행 복제형** (form-7과 동일 + 비고 1열) | income-ledger-builder + owpml-table 거의 그대로 |

**핵심:** 22-4 colCnt=14 = form-7(13) + **비고 컬럼 1개**. 그 외 컬럼·데이터·잔액 공식 동일 → 기존 모듈에 비고 토큰만 추가.

---

## 2. Architecture

### 2.1 Component Diagram

```text
┌──────────────────────────┐    ┌─────────────────────────────────────┐    ┌──────────────┐
│ submission-forms page     │    │ POST /api/hwpx/accounting-report     │    │ Supabase     │
│  FormCatalog(22-1/3/4 선택)│──▶│  { orgId, formId }                   │──▶│ pfam.acc_book│
│  FormInputPanel(dataFill) │    │   form 분기:                          │    │ pfam.customer│
└──────────────────────────┘    │   22-1 → buildReportSummaryModel     │    │ pfam.estate  │
            │ download .hwpx     │   22-3 → buildEstateModel            │    │ pfam.codevalue│
            ◀────────────────────│   22-4 → buildIncomeLedgerModel(재사용)│   └──────────────┘
                                 │   → 템플릿 렌더 → 재패키징            │
                                 └─────────────────────────────────────┘
   (22-4 는 기존 /api/hwpx/income-ledger 의 조회·렌더 로직을 공용 헬퍼로 공유)
```

### 2.2 API 구조 결정

- **단일 라우트** `POST /api/hwpx/accounting-report { orgId, formId }` 로 22-1/22-3/22-4 분기 (income-ledger route 의 인증·조회·재패키징 헬퍼 공유).
- 기존 `/api/hwpx/income-ledger`(서식 7)는 **유지**. 22-4 와 조회·렌더가 동일하므로 공통 로직을 `lib/hwpx/` 헬퍼로 추출해 양쪽이 import (income-ledger route 는 호출부만 헬퍼로 교체, 동작 불변).

### 2.3 Dependencies

| Component | Depends On | Purpose |
|-----------|-----------|---------|
| `/api/hwpx/accounting-report` | builder 3종, owpml-table, generate(repackageSection) | 조회·빌드·렌더 오케스트레이션 |
| `report-summary-builder` (신규) | funding-source, expense 과목 구분 | 22-1 구분별 집계 |
| `estate-builder` (신규) | estate-types(추출), escape | 22-3 재산 그룹/소계/합계 |
| `income-ledger-builder` (재사용) | — | 22-4 = 서식 7 동일 모델 |
| `owpml-table` (확장) | escape, builder들 | 표/행 복제·치환 (22-4 비고 토큰 추가, 22-3 마커 일반화) |
| `FormInputPanel` (확장) | form-fields(dataFill) | dataFill 분기 + formId 전송 |

---

## 3. Data Model

### 3.1 조회 (서버, org 스코프 강제)

```typescript
// 22-1 / 22-4 공통: acc_book(수입+지출) + customer 상세 (income-ledger route 와 동일 select)
//   select: acc_date, incm_sec_cd, acc_sec_cd, item_sec_cd, content, acc_amt, rcp_no, cust_id,
//           customer:cust_id(name, reg_num, addr, addr_detail, job, tel)
// 22-3: estate (estate_sec_cd, kind, qty, content, amt, remark, estate_order)
//   .eq("org_id", orgId).order("estate_sec_cd").order("estate_order")
// 공통: codevalue(cv_id, cv_name) → getName 맵, organ(선거명·후보자명 등 헤더 메타)
```

### 3.2 22-1 뷰모델 (report-summary-builder, 순수)

```typescript
type Category = "선거비용" | "선거비용외";
interface SummaryRow {     // 구분 1행 = funding source
  source: FundingSource;          // 후보자자산/후원회기부금/보조금/보조금외
  income: number;                 // 수입 합계
  expElection: number;            // 지출 선거비용
  expNonElection: number;         // 지출 선거비용외
  expSubtotal: number;            // = expElection + expNonElection
  balance: number;                // = income - expSubtotal
}
interface ReportSummaryModel {
  rows: SummaryRow[];             // 자산·후원회기부금·보조금·보조금외 (고정 순서)
  total: SummaryRow;              // 합계행
}
```

**집계 규칙:**
- 구분: `classifyFundingSource(acc_sec_cd, getName(acc_sec_cd))` → 4분류(`기타`는 합계에만 포함, 표엔 미표시 또는 자산에 흡수 — §7 확정).
- 수입: `incm_sec_cd===1` 행의 `acc_amt` 를 구분별 합산.
- 지출: `incm_sec_cd===2` 행을 구분별 + **과목(item_sec_cd) 코드명으로 선거비용/선거비용외** 분류 합산. (income-ledger 근거: 과목 86=선거비용, 87=선거비용외정치자금. 코드명에 "선거비용외" 포함 → 선거비용외, "선거비용" 포함 → 선거비용. `detectItemCategory` 는 지출유형 대분류용이라 여기선 **과목명 기반** 판별 헬퍼 사용.)
- 잔액 = 수입 − 지출소계. 합계행 = 각 열 총합.

### 3.3 22-3 뷰모델 (estate-builder, 순수)

```typescript
interface EstateRow { kind: string; qty: string; content: string; amt: string; remark: string; }
interface EstateGroup {
  secCd: number; label: string;   // ESTATE_TYPES (43 토지 … 48 그밖의재산)
  rows: EstateRow[];              // 빈 구분이면 "해당없음" 1행
  subtotal: string;              // 구분 소계(가액 합)
}
interface EstateModel { groups: EstateGroup[]; total: string; }  // total=전체 가액 합
```

- 정렬: `estate_sec_cd ASC, estate_order ASC`(조회 순서 유지). 그룹 순서는 ESTATE_TYPES 정의 순.
- 빈 구분: 양식 고정 6구분(토지~그밖의재산, `FIXED_ESTATE_SECS`=43~48)은 데이터 0건이어도 "해당없음" 1행·소계 0으로 **항상 표기**. 차입금(49) 등 비고정 구분은 데이터가 있을 때만 6구분 뒤에 추가(estate-types: 43~49).
- 금액: `toLocaleString` 콤마.

### 3.4 22-4 뷰모델 (income-ledger-builder 재사용)

- `buildIncomeLedgerModel(rows, getName)` 그대로 사용 → `IncomeLedgerModel`.
- **비고 컬럼**: `LedgerCellRow` 에 `remark: string`(기본 "") 추가, `LEDGER_ROW_TOKENS.remark="비고"`, `rowTokens()` 에 비고 키 추가. 서식 7 템플릿(form-7-fill)에는 비고 토큰이 없어도 잔여 토큰 제거 로직(`{{…}}` cleanup)이 처리하므로 **서식 7 회귀 없음**. 22-4 템플릿에만 `{{비고}}` 셀 존재.

### 3.5 공용 모듈 추출

- `ESTATE_TYPES` (현재 estate/page.tsx 인라인) → `lib/accounting/estate-types.ts` 로 추출, 페이지·빌더 공유(그밖의재산 코드 포함 여부 확인).
- 과목 선거비용 구분 헬퍼 → `report-summary-builder.ts` 내 `classifyExpenseCategory(itemName)`.

---

## 4. API Specification

### 4.1 Endpoint

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | /api/hwpx/accounting-report | 회계보고서(22-1/22-3/22-4) HWPX 생성·다운로드 | service-role + SSR 멤버십 가드 |

### 4.2 `POST /api/hwpx/accounting-report`

**Request:** `{ "orgId": 9, "formId": "22-1" | "22-3" | "22-4" }`

**Response (200):** `application/hwp+zip` (attachment; filename = 서식 라벨)

**Error:**
- `400 INVALID_REQUEST` — orgId/formId 누락·미지원 formId
- `401 UNAUTHORIZED` / `403 FORBIDDEN` — 미로그인 / user_organ 멤버십 없음 (income-ledger route 가드 동일)
- `404 NO_DATA` — (선택) 0건 시 빈 양식 반환 우선
- `500 TEMPLATE_MISSING` / `QUERY_FAILED` / `GENERATE_FAILED`

**보안/검증** (income-ledger route 패턴 준수):
- service-role + SSR `auth.getUser()` + `user_organ` 멤버십 확인(IDOR 방지), `org_id` 필터 강제.
- 익명 customer(-999)·null 안전 처리, no-store 캐시.
- formId 화이트리스트 검증.

---

## 5. UI/UX Design

### 5.1 진입점 (form-fields dataFill 확장)

```typescript
// form-fields.ts — 타입 확장
dataFill?: "income-ledger" | "accounting-report";
// 22-1/22-3/22-4 def 갱신 (template = *-fill.hwpx, dataFill="accounting-report")
{ id: "22-1", …, template: "form-22-1-fill.hwpx", fields: [], dataFill: "accounting-report" },
{ id: "22-3", …, template: "form-22-3-fill.hwpx", fields: [], dataFill: "accounting-report" },
{ id: "22-4", …, template: "form-22-4-fill.hwpx", fields: [], dataFill: "accounting-report" },
```

### 5.2 FormInputPanel 분기

- `DATA_FILL_ENDPOINT` 에 `"accounting-report": "/api/hwpx/accounting-report"` 추가.
- `handleGenerateLedger` → body 에 **`formId: def.id` 추가** 전송(income-ledger 는 formId 무시하므로 호환).
- 안내문구를 서식별로 일반화: "입력된 수입·지출·재산 데이터로 회계보고서를 자동 생성합니다." 버튼 라벨 "데이터로 회계보고서 생성".

### 5.3 User Flow

```text
대시보드 → 선관위 제출서류 → [회계보고서] 22-1/22-3/22-4 선택
  → (자동) 안내 표시 → "데이터로 회계보고서 생성" 클릭
  → .hwpx 다운로드 → 한글에서 확인·인쇄·날인 → 제출
```

---

## 6. 핵심 기술 설계

### 6.1 템플릿 제작 (Do 단계)

| 템플릿 | 마커/토큰 | 비고 |
|--------|----------|------|
| `form-22-1-fill.hwpx` | 고정 셀 토큰: `{{자산_수입}}`,`{{자산_선거비용}}`,`{{자산_선거비용외}}`,`{{자산_지출소계}}`,`{{자산_잔액}}` … 구분×5열 + 합계행 + 헤더(`{{선거명}}`,`{{선거구명}}`,`{{후보자명}}`,`{{선관위명}}`) | 행 복제 없음 → 토큰 치환만 |
| `form-22-3-fill.hwpx` | `<!--ESTATE:GROUP_START-->`/`GROUP_END`, 내부 `<!--ESTATE:ROW_START-->`/`ROW_END` + `{{종류}}`,`{{수량}}`,`{{내용}}`,`{{가액}}`,`{{비고}}`,`{{소계}}`,`{{합계}}` | 구분별 그룹 = ESTATE_TYPES 순서 고정. 그룹 마커는 구분당 1개 or 단일 복제 |
| `form-22-4-fill.hwpx` | `<!--LEDGER:GROUP_START/END-->`,`<!--LEDGER:ROW_START/END-->` + 기존 13토큰 + `{{비고}}` | form-7-fill 와 동일 마커 → `renderIncomeLedgerSection` 재사용 |

### 6.2 22-1 렌더 (고정 셀 치환)

```text
1. buildReportSummaryModel(rows, getName) → {rows[4], total}
2. 토큰맵 = { 자산_수입: fmt(rows.자산.income), …, 합계_잔액: fmt(total.balance), 선거명, 후보자명, … }
3. form-22-1-fill.hwpx section 로드 → replaceTokens(section, 토큰맵) → 잔여 {{…}} 제거 → 재패키징
```
표 구조 변경 없으므로 `generate.ts` 의 토큰 치환 + `repackageSection` 재사용(또는 generateHwpx 경유). **표 행/ID 조작 불필요 → 손상 위험 최소.**

### 6.3 22-3 렌더 (행 복제, owpml-table 일반화)

- `owpml-table` 의 GROUP/ROW 복제 로직을 **마커 접두사 파라미터화**(`LEDGER`→`ESTATE`) 또는 estate 전용 `renderEstateSection` 신설.
- 구분별로 명세행 N개 + 소계행 1개. 소계/합계는 별도 셀 토큰. `rowCnt`·`cellAddr rowAddr`·`tbl id` 무결성 규칙은 owpml-table 와 동일(검증된 패턴).
- 0건 구분: "해당없음" 1행 + 소계 0 (form 양식이 모든 구분을 표기하므로 그룹 생략 안 함).

### 6.4 22-4 렌더 (income-ledger 재사용)

- 조회·`buildIncomeLedgerModel`·`renderIncomeLedgerSection` **그대로**. 템플릿만 `form-22-4-fill.hwpx`.
- 비고 토큰 추가분만 owpml-table `rowTokens`/builder 에 반영(서식 7 무영향, §3.4).

### 6.5 ID·구조 무결성 (income-ledger 검증 규칙 승계)

- 데이터행 복제 시 `cellAddr rowAddr = headerRowAddr + i`, 표 `rowCnt` 갱신, `tbl id` 그룹별 고유(baseId+idx).
- 문단 `id=0` 유지(한글 허용). borderFill/cellSz 템플릿 복제로 스타일 보존.
- 생성 후 한글 실오픈 + `section0.xml` well-formed 검증.

---

## 7. Open Questions 해소 (Plan §7)

| # | 질문 | 결정 |
|---|------|------|
| 1 | 22-1 구분 매핑 | `classifyFundingSource` 재사용: 82보조금/83보조금외/84자산/85후원회기부금. 정당지원금 = 보조금+보조금외 묶음 행. `기타`(미분류)는 합계에 포함하되 표 미표시(데이터 확인 후 자산 흡수 여부 재검토). |
| 2 | 22-1 잔액 정의 | 구분별 잔액 = 수입 − 지출소계. 합계행 = 각 열 합. (form 예시 잔액 0 = 수입=지출 케이스) |
| 3 | 22-4 vs 서식 7 | colCnt 차이 = **비고 1열뿐**. income-ledger 모듈 재사용 + 비고 토큰 추가. 별도 *-fill 템플릿. |
| 4 | 22-3 estate 매핑 | `ESTATE_TYPES`(43~47[+48 그밖의재산]) SSOT 추출. 0건 구분 "해당없음"·소계 0. |
| 5 | 공통 메타 미보유 값 | 선거명·선거일·후보자명은 organ/const 소스로 채움. 선관위명·선거구명·문서번호 등 미보유 값은 **공란**(한글에서 수기). Phase 2 에서 수동 보조필드 검토. |
| 6 | 출력 형태 | 서식별 개별 파일(이번 범위). 통합 1파일은 후속. |

---

## 8. Edge Cases & Decisions

| 케이스 | 처리 |
|--------|------|
| 수입·지출 0건 (22-1/22-4) | 22-1 합계 0 양식, 22-4 빈 표 반환 + UI 안내 |
| estate 0건 (22-3) | 모든 구분 "해당없음"·소계 0·합계 0 |
| 미분류 acc_sec_cd(기타) | 22-1 합계에만 반영, 로그 경고(데이터 점검 신호) |
| 과목 선거비용 구분 불명 | 기본 "선거비용외"로 분류(보수적) + 테스트 고정 |
| customer null/익명(-999) | income-ledger 와 동일(성명 "익명", 상세 공란) |
| 대량 행(22-4 수백) | 표 페이지 경계 → repeatHeader 유지, 실측 |

---

## 9. 구현 순서 (Do 단계 체크리스트)

1. `lib/accounting/estate-types.ts` 추출(ESTATE_TYPES) + estate/page.tsx 참조 교체(회귀 테스트)
2. `lib/hwpx/report-summary-builder.ts` + 테스트 — 22-1 구분 집계·과목 선거비용 구분(순수)
3. `lib/hwpx/estate-builder.ts` + 테스트 — 22-3 그룹/소계/합계(순수)
4. `income-ledger-builder.ts` 비고 필드 추가 + `owpml-table` 비고 토큰/마커 일반화 + 테스트(서식 7 회귀 확인)
5. 템플릿 제작: `form-22-1-fill.hwpx`, `form-22-3-fill.hwpx`, `form-22-4-fill.hwpx` + 토큰 정합 테스트
6. `app/api/hwpx/accounting-report/route.ts` — formId 분기·조회·빌드·렌더 (income-ledger route 헬퍼 공유)
7. `form-fields.ts` — 22-1/22-3/22-4 dataFill 메타 + 타입 확장 + dataFill 테스트 예외
8. `FormInputPanel.tsx` — accounting-report 엔드포인트 + formId 전송
9. `next.config` outputFileTracingIncludes — 신규 *-fill 템플릿 3종
10. 실데이터(org 9) 생성 → 한글 실오픈 + 합계 대조(수입·지출내역관리/정산)
11. CLAUDE.md `lib/hwpx/` 설명 갱신

---

## 10. Test Strategy

| 레벨 | 대상 | 검증 |
|------|------|------|
| 단위 | report-summary-builder | 구분 집계·과목 선거비용 구분·잔액·합계·기타 처리 |
| 단위 | estate-builder | 그룹·소계·합계·0건 구분·정렬 |
| 단위 | income-ledger-builder(비고) | 비고 토큰 추가, 서식 7 출력 불변 |
| 단위 | owpml-table | rowCnt/rowAddr/tbl id, ESTATE 마커 일반화, XML well-formed |
| 정합 | *-fill 토큰 | 템플릿 토큰 ↔ 빌더 출력 키 1:1 (빌드타임) |
| 통합 | accounting-report route | formId별 200 + hwp+zip + unresolved 토큰 0 + 미지원 formId 400 |
| 수동 | 실데이터(org 9) | 한글 무손상 + 22-1 합계 = 정산, 22-4 합계 = 수입·지출내역관리, 22-3 = estate |

---

## 11. Risks (Plan 위험 대비 설계 반영)

| Plan Risk | 설계 대응 |
|-----------|-----------|
| OWPML 표 셀/행 손상 | income-ledger 검증된 owpml-table 패턴 재사용, 22-1은 행 복제 없는 셀 치환(위험 최소), 실오픈+well-formed 테스트 |
| 22-1 구분 집계 오류 | classifyFundingSource SSOT + 과목명 기반 구분 + 실데이터 합계 대조, 기타 로그 경고 |
| 22-4 ↔ 서식7 차이 | 차이 = 비고 1열뿐 확인 → builder/table 최소 확장, 서식7 회귀 테스트 |
| 22-3 estate 매핑/0건 | ESTATE_TYPES SSOT, 0건 "해당없음" 규칙, 소계/합계 테스트 |
| 기존 서식 회귀 | generateHwpx·income-ledger route 불변, 신규 라우트/빌더/템플릿 분리, 비고 토큰은 서식7 무영향 |
| 신규 템플릿 build 트레이싱 누락 | next.config outputFileTracingIncludes 갱신 + form-fields.test dataFill 예외 |

---

## 12. Next Step

→ `/pdca do candidate-accounting-report-hwpx` (구현 순서 §9 — estate-types 추출 → 빌더 3종 TDD → 템플릿 제작 → 라우트 → UI 순). 빌더/owpml-table 순수 함수부터 TDD, 22-4(재사용) → 22-3(행복제) → 22-1(셀치환) 순으로 위험도 낮은 것부터.
