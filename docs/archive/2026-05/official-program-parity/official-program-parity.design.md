# official-program-parity Design Document

> **Summary**: 결산·제출문서·DB저장·DB불러오기 4개 워크플로우의 산출물을 선관위 PFund2.exe와 동일하게 보장하는 통합 설계
>
> **Project**: PoliticalFundAccountingManagement
> **Version**: 0.1.0
> **Author**: Claude
> **Date**: 2026-05-14
> **Status**: Draft
> **Planning Doc**: [official-program-parity.plan.md](../../01-plan/features/official-program-parity.plan.md)
> **Reference Program**: 중앙선거관리위원회 정치자금회계관리 v5 (PFund2.exe)

---

## 1. Overview

### 1.1 Design Goals

1. **양방향 호환성**: 우리 웹앱과 PFund2 사이를 데이터 손실 없이 왕복 가능
2. **산출물 동등성**: 결산 수치 0원 차이, `.db` 파일이 PFund2 [자료 복구] 통과, 제출 양식이 공식 PDF와 항목·레이아웃 일치
3. **단일 진실원천 (SSOT)**: 코드 매핑·결산 계산·ORGAN 페어 변환 로직이 한 곳에서만 정의되고 모든 사용처가 이를 호출
4. **회귀 안전성**: round-trip 테스트로 향후 변경이 호환성을 깨지 않음을 자동 검증

### 1.2 Design Principles

- **선관위 스키마를 진실원천으로**: 우리 `pfam` 스키마가 PFund2 SQLite 스키마를 그대로 흡수하며, 추가 컬럼은 export 시점에 안전하게 제거
- **양방향 매핑은 동일 함수에서**: code-mapping이 forward(이름→ID)와 reverse(ID→이름) 모두 한 모듈에서 제공
- **결산 로직 1개 함수**: settlement-calc가 settlement·report·export-sqlite OPINION 동기화·aggregate 모두에서 호출됨
- **데이터 변환은 export/import 경계에서만**: 내부 페이지·API는 항상 우리 스키마를 사용

---

## 2. Architecture

### 2.1 Component Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Web App (Next.js 16)                         │
├─────────────────────────────────────────────────────────────────────┤
│  Presentation                                                        │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐    │
│  │ income/     │ │ submit/     │ │ forms/      │ │ audit/      │    │
│  │ expense/    │ │  page       │ │  page       │ │  page       │    │
│  │ I-E-report  │ │             │ │             │ │             │    │
│  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘ └──────┬──────┘    │
│         │               │               │               │           │
│  Application Layer (NEW)                                            │
│  ┌──────▼───────────────▼───────────────▼───────────────▼──────┐   │
│  │  settlement-calc.ts    organ-pair.ts    submission-forms.ts  │   │
│  │  (마이너스/충당 보정)  (후보자 페어)   (양식 카탈로그)        │   │
│  └──────────────────────┬─────────────────────────────────────┘    │
│                         │                                            │
│  Infrastructure                                                      │
│  ┌──────▼──────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │
│  │ code-       │ │ /api/system/│ │ /api/system/│ │ /api/excel/ │   │
│  │ mapping.ts  │ │ export-     │ │ import-     │ │ report      │   │
│  │ (양방향)    │ │ sqlite      │ │ sqlite      │ │             │   │
│  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘ └──────┬──────┘   │
└─────────┼───────────────┼───────────────┼───────────────┼──────────┘
          │               │               │               │
   ┌──────▼──────┐ ┌──────▼──────────────▼──────┐ ┌──────▼──────┐
   │  Supabase   │ │  sql.js  (WASM SQLite)     │ │  ExcelJS    │
   │  pfam       │ │  + lib/sqlite-seed/        │ │  Renderer   │
   └─────────────┘ └────────────────────────────┘ └─────────────┘
                                  ▲
                                  │ round-trip
                                  ▼
                   ┌────────────────────────────┐
                   │   PFund2.exe (Windows)     │
                   │   SQLite file (.db)        │
                   └────────────────────────────┘
```

### 2.2 Data Flow (4 영역)

#### 결산 (Settlement)
```
[acc_book rows] → settlement-calc.computeBalances()
              → income/expense pages 화면 표시
              → income-expense-report Excel
              → OPINION.in_amt/cm_amt/balance_amt 동기화
              → export-sqlite 시 OPINION 행에 반영
```

#### 제출문서 생성 (Submission Forms)
```
[orgId] → submission-forms.getRequiredForms(orgSecCd)
       → forms/page 카탈로그 렌더
       → 각 양식별 페이지(audit, reimbursement 등)에서 인쇄
       → submit/page 통계 미리보기 → 묶음 다운로드 (zip)
```

#### DB 저장 (Export)
```
[orgId] → export-sqlite GET
       → fetchAll(pfam.*) → settlement-calc → buildOrganExport (페어)
       → remapOrgId → DDL 생성(Fund_Master 호환)
       → seed: acc_rel2.json + CODESETTEMP/CODEVALUETEMP 빈테이블
       → SUM_REPT/ACCBOOKSEND/ALARM/OPINION 동기화
       → .db 파일 응답
```

#### DB 불러오기 (Import)
```
[.db 업로드] → import-sqlite POST
            → sql.js 파싱 → 테이블별 row 추출 → 충돌 정책 확인
            → reverse code-mapping (필요 시) → organ-pair 역변환
            → INSERT/UPSERT into pfam.*
            → 결산 재계산 (settlement-calc) → OPINION 동기화
            → import 요약 반환
```

### 2.3 Dependencies

| Component | Depends On | Purpose |
|-----------|-----------|---------|
| settlement-calc | code-mapping (간접), acc_book 스키마 | 결산 보정 단일 함수 |
| organ-pair | codevalue (SUPPORTER_SEC_CDS), Supabase organ | 후보자/후원회 페어 변환 |
| submission-forms | organ 정보(orgSecCd), code-mapping | 양식 카탈로그 결정 |
| export-sqlite | 위 3개 전부 + sqlite-seed | 단일 통합 게이트웨이 |
| import-sqlite | 위 3개 전부 (역방향) | 단일 통합 게이트웨이 |

---

## 3. Data Model

### 3.1 신규/보강 모듈 인터페이스

#### `lib/accounting/settlement-calc.ts` (신규)

```typescript
export interface AccBookRow {
  acc_book_id: number;
  org_id: number;
  incm_sec_cd: 1 | 2;
  acc_sec_cd: number;
  item_sec_cd: number;
  exp_sec_cd: number;
  acc_date: string;       // YYYYMMDD
  acc_amt: number;
  // ... (other columns ignored by settlement-calc)
}

export interface SettlementResult {
  incomeTotal: number;        // 마이너스 수입 분리 후
  expenseTotal: number;       // 마이너스 수입 흡수 후
  balance: number;            // incomeTotal - expenseTotal
  byAccount: AccountBreakdown[];  // 계정과목 단위
  byFundSource: FundSourceBreakdown[];  // 보조금/후원회기부금/자산 등 출처별
  corrections: Correction[];  // 어떤 행을 어떻게 보정했는지 audit log
}

export interface AccountBreakdown {
  acc_sec_cd: number;
  acc_name: string;
  income: number;
  electionExpense: number;
  nonElectionExpense: number;
}

export interface FundSourceBreakdown {
  source: "보조금" | "후원회기부금" | "자산" | "당비" | "기탁금" | "그외";
  reimbursable: number;     // 보전 인정분
  nonReimbursable: number;  // 보전 비인정분 (자산으로 충당)
  total: number;
}

export interface Correction {
  acc_book_id: number;
  rule: "negative_income_to_expense" | "subsidy_overflow_to_asset";
  before: { incm_sec_cd: number; acc_amt: number };
  after: { incm_sec_cd: number; acc_amt: number };
  reason: string;
}

export function computeBalances(
  rows: AccBookRow[],
  options?: {
    dateFrom?: string;       // YYYYMMDD 필터
    dateTo?: string;
    applyNegativeIncomeRule?: boolean;  // 기본 true
    applyFundSourceRedistribution?: boolean;  // 기본 true
  },
): SettlementResult;
```

**규칙 1 (마이너스 수입 → 지출 전환)**:
- 조건: `incm_sec_cd === 1 && acc_amt < 0`
- 처리: 해당 row를 가상으로 `incm_sec_cd=2, acc_amt=|amt|`로 치환하여 합산
- 원본 row는 수정하지 않음 (audit 추적)

**규칙 2 (자금출처 충당)**:
- 보조금 보전 비인정분을 자산 지출로 이동
- 후원회기부금 잔액을 자산으로 이전
- (구체적 계산식은 settlement-report-correction.plan.md §1.2 원인 2 참조)

#### `lib/accounting/organ-pair.ts` (신규)

```typescript
export const SUPPORTER_SEC_CDS = new Set([91, 92, 107, 108, 109, 587, 588]);
export const CANDIDATE_SEC_CDS = new Set([54, 90, 106]);

export interface OrganRow {
  org_id: number;
  org_sec_cd: number;
  org_name: string;
  // ... all ORGAN columns
}

/**
 * Supabase organ → 선관위 export용 ORGAN 행(들) + ORG_ID 매핑.
 * 후원회면 자동으로 후보자 페어 행 생성 (ORG_ID=1 후보자, ORG_ID=2 후원회).
 * 후보자/정당이면 단일 행 (ORG_ID=1).
 */
export function buildOrganExport(supabaseOrgan: OrganRow): {
  organRows: ExportOrganRow[];
  orgIdMap: Map<number, number>;
};

/**
 * 역방향: 선관위 .db 파일의 ORGAN 행(들) → Supabase organ 1개로 통합.
 * 후보자 행 + 후원회 행이 있으면 사용자가 선택할 수 있도록 두 후보 반환.
 */
export function parseOrganImport(organRows: ExportOrganRow[]): {
  candidates: OrganImportCandidate[];
  conflictReason?: "no_rows" | "incompatible";
};

export interface OrganImportCandidate {
  source: "candidate" | "supporter" | "single";
  organ: Partial<OrganRow>;
  exportOrgId: number;  // 1 or 2
}
```

#### `lib/accounting/code-mapping.ts` (보강)

기존 forward 매핑(`resolveAccountCodes`)에 역방향 함수 추가:

```typescript
/**
 * 역방향: (acc_sec_cd, item_sec_cd, exp_sec_cd) → 사람이 읽을 수 있는 이름.
 * import 시점에 .db의 코드 ID를 우리 화면 표시용 이름으로 변환.
 */
export function reverseLookupNames(
  codes: AccountCodes,
  codeValues: CodeValueLike[],
): {
  accountName: string;
  subjectName: string;
  expenseName: string | null;
};
```

#### `lib/accounting/submission-forms.ts` (신규)

```typescript
export interface SubmissionForm {
  id: string;
  label: string;
  category: "회계보고" | "회계책임자" | "예금계좌" | "후원회" | "보전청구" | "기타";
  requiredFor: number[];   // orgSecCd 화이트리스트 (빈 배열 = 전체)
  generator:
    | { type: "page"; href: string }
    | { type: "pdf"; endpoint: string }
    | { type: "excel"; endpoint: string };
  parityChecked: boolean;  // PFund2 출력과 비교 검증 완료 여부
}

export function getRequiredForms(orgSecCd: number): SubmissionForm[];
```

### 3.2 데이터베이스 변경 (Supabase pfam)

#### 신규/보강 마이그레이션

| 스크립트 | 목적 | 비고 |
|---|---|---|
| `009_organ_pair_normalization.sql` (이미 존재) | 후원회 단독 organ을 후보자 페어로 정규화 | db-export-fix에서 추가 |
| `010_acc_rel2_seed.sql` (신규) | ACC_REL2 정적 482행 시드. 단, 우리는 사용하지 않으므로 `lib/sqlite-seed/acc_rel2.json`만 활용 | 옵션 (DB에 두지 않고 코드에만 둘 수도 있음) |
| `011_opinion_auto_sync.sql` (신규) | `opinion.in_amt/cm_amt/balance_amt`를 결산 시점에 갱신하는 RPC | settlement-calc 결과를 받아 UPSERT |
| `012_acc_book_indexes.sql` (선택) | round-trip 비교 성능을 위한 추가 인덱스 | 대용량 시 검토 |

#### 데이터 정합성 보정 (one-shot)

- `009_organ_pair_normalization.sql`: 사용자의 기존 `organ` 행이 후원회인데 후보자 페어가 없으면 후보자 행을 보강 (idempotent)

### 3.3 시드 데이터 (`lib/sqlite-seed/`)

| 파일 | 내용 | 출처 |
|---|---|---|
| `acc_rel2.json` (이미 존재) | 482행 (선관위 표준) | `data/Fund_Master.db` 추출 |
| `codeset.json` (신규) | 20행 CS_ID 0~19 | Fund_Master |
| `codevalue.json` (신규) | 약 480행 (CS 0~19의 모든 CV) | Fund_Master |

기존 `codeset`/`codevalue`는 Supabase에 시드돼 있지만, export-sqlite 시 안전망으로 코드 측에도 정적 보관.

---

## 4. API Specification

### 4.1 `GET /api/system/export-sqlite`

**Query**: `?orgId=N&orgName=...&dateFrom=YYYYMMDD&dateTo=YYYYMMDD`

**Response**: `application/x-sqlite3` (바이너리 .db 파일)

**처리 순서**:
1. Supabase에서 `organ`, `customer`, `customer_addr`, `acc_book`, `acc_book_bak`, `accbooksend`, `estate`, `opinion`, `codeset`, `codevalue`, `acc_rel`, `sum_rept`, `col_organ`, `alarm` fetch
2. `organ-pair.buildOrganExport(organ)` → ORGAN 1~2행 + orgIdMap
3. `remapOrgId(acc_book, acc_book_bak, estate, opinion, alarm)` 적용
4. `settlement-calc.computeBalances(acc_book)` → OPINION 결산 필드 동기화
5. sql.js DB 생성, `SQLITE_DDL` 실행 (Fund_Master 호환 스키마)
6. 순서대로 INSERT: CODESET → CODEVALUE → ACC_REL → ACC_REL2(seed) → CUSTOMER → CUSTOMER_ADDR → ORGAN → ACC_BOOK → ACC_BOOK_BAK → ACCBOOKSEND → ESTATE → OPINION → SUM_REPT → COL_ORGAN → ALARM
7. 빈 보조 테이블 생성: CODESETTEMP, CODEVALUETEMP, CUSTOMERTEMP, TEST, info
8. `info` 테이블 스키마 = `(no INTEGER PK, name VARCHAR(10), number VARCHAR(10))` — 데이터는 비움 (Fund_Master와 일치)
9. db.export() → ArrayBuffer → Response

**에러**:
- 400: orgId 누락
- 404: organ 미존재
- 500: sql.js 초기화 실패, DB 쿼리 실패

### 4.2 `POST /api/system/import-sqlite`

**Request**: `multipart/form-data` `file=.db, orgId=N, conflictPolicy=overwrite|skip|merge, dryRun=true|false`

**Response**:
```json
{
  "ok": true,
  "summary": {
    "organ": { "imported": 1, "skipped": 1 },
    "customer": { "imported": 99, "merged": 5, "skipped": 0 },
    "acc_book": { "imported": 36, "skipped": 0, "conflicts": [] },
    "settlement": { "income_total": 3600000, "expense_total": 0, "balance": 3600000 }
  },
  "warnings": ["ACC_REL2 데이터는 무시됨 (외부 시드)"],
  "errors": []
}
```

**처리 순서**:
1. sql.js로 .db 파일 메모리 로드
2. ORGAN 행 추출 → `organ-pair.parseOrganImport()` 호출
3. `conflictPolicy`에 따른 처리:
   - `overwrite`: 동일 org_id 데이터 DELETE 후 INSERT
   - `skip`: 동일 acc_book_id가 있으면 건너뜀
   - `merge`: 동일 acc_book_id면 업데이트, 없으면 INSERT
4. CODESET/CODEVALUE/ACC_REL는 우리 마스터와 비교, 다를 경우 warning만 (덮어쓰기 안 함)
5. ACC_REL2/CODESETTEMP/CODEVALUETEMP/CUSTOMERTEMP/TEST/info는 무시 (선관위 보조 테이블)
6. CUSTOMER FK 매칭: 같은 (cust_sec_cd, name, reg_num) 조합 있으면 재사용, 없으면 신규 INSERT
7. ACC_BOOK INSERT 후 `settlement-calc.computeBalances()` 호출하여 OPINION 갱신
8. dryRun=true면 INSERT/UPDATE 대신 시뮬레이션 결과만 반환

**에러**:
- 400: 파일 형식 오류, 잘못된 SQLite 헤더
- 409: conflictPolicy 미지정 + 충돌 발견 시 (확인 필요)
- 413: 파일 크기 초과 (10MB)
- 500: 트랜잭션 실패

### 4.3 기타 API (영향받는 곳)

| Endpoint | 변경 | 사유 |
|---|---|---|
| `POST /api/acc-book` (action=batch_insert) | code-mapping 사용 강화 | 이미 db-export-fix에서 진행 |
| `POST /api/acc-book` (action=insert/update) | 결산 캐시 무효화 호출 추가 | settlement 자동 갱신 |
| `POST /api/excel/report` | settlement-calc 사용 | 보고서 수치 보정 |
| 신규 `POST /api/system/recompute-settlement` | settlement-calc 강제 재실행 + OPINION 동기화 | 사용자 트리거 |

---

## 5. UI/UX Design

### 5.1 결산/수입지출보고서 페이지 (영향)

현재 `settlement/page.tsx`는 삭제됐으므로, 결산 기능은 다음 페이지에 통합:

- `income-expense-report/page.tsx` — 13컬럼 보고서에 보정 수치 반영
- `aggregate/page.tsx` — 정당 취합 시 동일 보정 적용
- `submit/page.tsx` — 제출 미리보기 단계에서 보정 결과 미리 표시

**UX 추가**:
- 보정이 적용된 경우 alert/tooltip으로 "마이너스 수입 N건이 지출로 전환됨" 표시
- 보정 audit log를 펼쳐볼 수 있는 토글 (Correction[])

### 5.2 제출 페이지 (`submit/page.tsx`)

**현재**: 통계 표시만 + 양식 모음 다운로드

**보강**:
- 양식별 "parityChecked" 뱃지 (✅/⚠️/❌)
- 누락 양식 자동 감지 (orgSecCd별 필수 목록 vs 구현된 양식 목록)
- "PFund2 다운로드용 .db" 버튼 (export-sqlite 호출)
- "PFund2에서 가져오기" 버튼 (import-sqlite 페이지 링크)

### 5.3 양식 카탈로그 (`forms/page.tsx`)

현재 FORM_GROUPS 하드코딩을 `submission-forms.getRequiredForms()` 호출로 교체. orgSecCd에 따라 표시 양식 동적 변경.

### 5.4 신규 페이지: DB Import (`/dashboard/db-import` 또는 submit 내 모달)

```
┌────────────────────────────────────────────┐
│  📂 PFund2 백업 파일 가져오기              │
├────────────────────────────────────────────┤
│  파일 선택: [____________________] [찾기] │
│                                            │
│  충돌 처리 방식:                           │
│   ○ 덮어쓰기 (기존 데이터 삭제 후 가져옴)  │
│   ● 병합 (없는 데이터만 추가)              │
│   ○ 건너뛰기 (충돌 시 무시)                │
│                                            │
│  [미리보기]  [가져오기 실행]              │
├────────────────────────────────────────────┤
│  미리보기 결과:                            │
│  ┌────────────────────────────────────┐   │
│  │ ORGAN: 2행 (후보자+후원회 페어)    │   │
│  │ ACC_BOOK: 36건 (충돌 0건)          │   │
│  │ CUSTOMER: 99건 (5건 병합)          │   │
│  │ 결산: 수입 3,600,000 / 지출 0      │   │
│  └────────────────────────────────────┘   │
└────────────────────────────────────────────┘
```

### 5.5 사용자 플로우

```
[사용자] → 로그인 → 조직 선택
       ↓
   ┌───────────────────────────────────────────┐
   │ A. 신규 입력 플로우                      │
   │   수입/지출 입력 → 결산 확인 → 양식 출력│
   │   → submit 페이지에서 .db 다운로드      │
   ├───────────────────────────────────────────┤
   │ B. PFund2 데이터 가져오기 플로우         │
   │   submit/import 페이지 → .db 업로드      │
   │   → 미리보기 → 충돌 정책 선택 → 가져오기│
   │   → 결산 자동 재계산 → 양식 출력         │
   └───────────────────────────────────────────┘
```

---

## 6. Error Handling

### 6.1 에러 코드

| 코드 | 메시지 | 원인 | 처리 |
|---|---|---|---|
| `PARITY-001` | 코드 매핑 실패: 계정/과목 이름이 표준에 없음 | code-mapping 실패 | UI에서 검증 단계에서 차단, 사용자에게 표준명 안내 |
| `PARITY-002` | ORGAN 페어 정합성 오류 | 후원회인데 후보자 정보 누락 | `009_organ_pair_normalization` 실행 안내 |
| `PARITY-003` | 결산 보정 실패: 자금출처 분류 불가 | acc_sec_cd가 미정의 카테고리 | 관리자 알림 + 보정 없이 표시 |
| `PARITY-004` | Import: SQLite 헤더 손상 | 파일 형식 오류 | 사용자에게 정상 PFund2 .db 안내 |
| `PARITY-005` | Import: 충돌 정책 미지정 | conflictPolicy 누락 | 다이얼로그로 선택 유도 |
| `PARITY-006` | Export: sql.js WASM 로드 실패 | 서버 환경 문제 | 관리자 알림 + 사용자에게 재시도 안내 |

### 6.2 에러 응답 형식

```json
{
  "error": {
    "code": "PARITY-001",
    "message": "계정명 '기명후원금'에 대응하는 CV_ID를 찾을 수 없습니다.",
    "details": {
      "accountName": "기명후원금",
      "subjectName": "후원회기부금",
      "orgSecCd": 109,
      "incmSecCd": 1
    }
  }
}
```

---

## 7. Security Considerations

- [x] **Import 파일 검증**: SQLite 헤더 매직바이트(`SQLite format 3\0`) 확인, 파일 크기 10MB 제한
- [x] **격리 파싱**: sql.js로 메모리 내에서만 처리, 디스크 쓰기 없음
- [x] **SQL Injection 차단**: 모든 INSERT는 prepared statement (`stmt.run([vals])`)
- [x] **RLS**: 모든 import/export는 `user_organ`에 매핑된 org_id만 접근
- [x] **민감정보**: ORGAN.PASSWD 필드는 export 시점에 null로 마스킹 (윈도우 PFund2는 클라우드 패스워드를 알 필요 없음)
- [x] **회계기간 격리**: import 시 사용자의 현재 `acc_from/acc_to`와 다른 기간 데이터는 별도 organ row로 분리 검토
- [x] **Rate Limiting**: import-sqlite에 IP 기반 throttle (1분 5회)

---

## 8. Test Plan

### 8.1 Test Scope

| Type | Target | Tool |
|---|---|---|
| Unit | settlement-calc 보정 규칙 4종 | Vitest |
| Unit | organ-pair forward/reverse 변환 | Vitest |
| Unit | code-mapping forward/reverse 양방향 | Vitest (기존 확장) |
| Integration | export-sqlite 출력 ↔ Fund_Master.schema 비교 | Vitest + sqlite3 CLI subprocess |
| Integration | import-sqlite로 실데이터 36건 round-trip | Vitest |
| E2E | UI 시나리오 (입력 → 결산 → 양식 → export → import 재현) | Playwright (기존 인프라 활용) |

### 8.2 핵심 테스트 케이스

#### Unit
- [ ] `computeBalances`: 마이너스 수입 +500,000 / -500,000 → income=500k, expense=500k, balance=0
- [ ] `computeBalances`: 자금출처 재배분 — 보조금 4,415k 중 보전 인정 2,548k만 → 잔액 1,866k 자산으로 이전
- [ ] `buildOrganExport`: 후원회(109) → 2행 + ORG_ID 매핑 11→2
- [ ] `parseOrganImport`: 2행 후보자/후원회 → candidates 2개 반환
- [ ] `resolveAccountCodes`("수입", "기명후원금", 109, 1) → `{acc_sec_cd:1, item_sec_cd:94, exp_sec_cd:0}`
- [ ] `reverseLookupNames`({1,94,0}) → `{"수입","기명후원금",null}`

#### Integration
- [ ] export-sqlite 산출 .db의 sqlite_master vs Fund_Master.db의 sqlite_master diff 0
- [ ] export-sqlite 산출 .db의 ACC_REL row count = 652
- [ ] export-sqlite 산출 .db의 ORGAN row count: 후원회 사용자=2, 후보자/정당 사용자=1
- [ ] round-trip: `오준석후보(자체분)_복구용_260514.db` → import → export → 두 파일의 모든 테이블 row data diff 0

#### E2E
- [ ] Happy path: 일괄등록 36건 → 결산 페이지 보정 후 수치 = PFund2 결산값
- [ ] Happy path: submit 페이지에서 .db 다운로드 → 윈도우 PFund2가 [자료 복구] 시 다이얼로그 없이 정상
- [ ] Error scenario: 잘못된 파일을 import → PARITY-004 에러 + 사용자 친화 메시지
- [ ] Edge case: 후원회만 등록된 사용자가 export → 후보자 페어 자동 보강 후 정상 export

### 8.3 픽스처

| 파일 | 용도 |
|---|---|
| `data/Fund_Master.db` | 스키마 기준 |
| `data/오준석후보(자체분)_복구용_260514.db` | 실데이터 round-trip 기준 |
| `tests/fixtures/expected-schema.sql` | 신규 — Fund_Master schema dump |
| `tests/fixtures/settlement-expected.json` | 신규 — 36건 결산 기대값 |

---

## 9. Clean Architecture

### 9.1 Layer Structure (이 기능 한정)

| Layer | Responsibility | Location |
|---|---|---|
| Presentation | submit/forms/income-expense-report/aggregate/audit pages | `app/src/app/dashboard/*/page.tsx` |
| Application | settlement-calc, organ-pair, submission-forms, code-mapping | `app/src/lib/accounting/*.ts` |
| Domain | 타입 정의 (AccBookRow, SettlementResult, SubmissionForm 등) | 같은 위치, type export |
| Infrastructure | export-sqlite, import-sqlite, sqlite-seed, Supabase RPC | `app/src/app/api/system/*`, `app/src/lib/sqlite-seed/` |

### 9.2 이 기능의 레이어 배치

| Component | Layer | Location |
|---|---|---|
| SettlementCalc | Application | `app/src/lib/accounting/settlement-calc.ts` |
| OrganPair | Application | `app/src/lib/accounting/organ-pair.ts` |
| SubmissionForms | Application | `app/src/lib/accounting/submission-forms.ts` |
| CodeMapping | Application | `app/src/lib/accounting/code-mapping.ts` (기존 보강) |
| sqlite-seed/* | Infrastructure (data) | `app/src/lib/sqlite-seed/` |
| export-sqlite route | Infrastructure | `app/src/app/api/system/export-sqlite/route.ts` |
| import-sqlite route | Infrastructure | `app/src/app/api/system/import-sqlite/route.ts` |
| Pages | Presentation | `app/src/app/dashboard/*/page.tsx` |

### 9.3 의존성 규칙

- Application 모듈은 React/Next.js에 의존하지 않음 (순수 함수 + Vitest로 테스트 가능)
- Infrastructure 라우트만 Supabase client / sql.js를 import
- Presentation 페이지는 Application을 import하되 Infrastructure는 fetch로만 호출

---

## 10. Coding Convention Reference

### 10.1 Naming (이 기능 한정)

| Target | Rule | Example |
|---|---|---|
| Application 모듈 | kebab-case 파일, camelCase 함수 | `settlement-calc.ts` / `computeBalances()` |
| 타입 | PascalCase | `AccBookRow`, `SettlementResult` |
| 에러 코드 | `PARITY-NNN` | `PARITY-001` |
| 마이그레이션 | `NNN_kebab_description.sql` | `010_acc_rel2_seed.sql` |
| 픽스처 | `tests/fixtures/kebab.json` | `settlement-expected.json` |

### 10.2 Import 순서

기존 프로젝트 컨벤션 따름 (`docs/02-design/features/db-export-fix.design.md` 참조).

---

## 11. Implementation Guide

### 11.1 File Structure

```
app/src/
├── lib/
│   ├── accounting/
│   │   ├── code-mapping.ts            (보강: reverseLookupNames)
│   │   ├── code-mapping.test.ts       (보강)
│   │   ├── settlement-calc.ts         (신규)
│   │   ├── settlement-calc.test.ts    (신규)
│   │   ├── organ-pair.ts              (신규 — export-sqlite의 buildOrganExport 추출)
│   │   ├── organ-pair.test.ts         (신규)
│   │   ├── submission-forms.ts        (신규)
│   │   └── submission-forms.test.ts   (신규)
│   └── sqlite-seed/
│       ├── acc_rel2.json              (이미 존재)
│       ├── codeset.json               (신규)
│       └── codevalue.json             (신규)
├── app/
│   ├── api/system/
│   │   ├── export-sqlite/route.ts     (수정 — organ-pair·settlement-calc 사용)
│   │   ├── import-sqlite/route.ts     (대규모 수정 — round-trip 보장)
│   │   └── recompute-settlement/
│   │       └── route.ts               (신규)
│   └── dashboard/
│       ├── submit/page.tsx            (수정 — parity 뱃지·import 진입점)
│       ├── forms/page.tsx             (수정 — submission-forms 사용)
│       ├── income-expense-report/page.tsx  (수정 — settlement-calc 사용)
│       ├── aggregate/page.tsx         (수정)
│       └── db-import/page.tsx         (신규 또는 submit 내 모달)
└── tests/
    ├── fixtures/
    │   ├── expected-schema.sql        (신규)
    │   └── settlement-expected.json   (신규)
    └── integration/
        └── parity.test.ts             (신규)
```

### 11.2 Implementation Order

**Phase A — SSOT 모듈 (병렬 가능, 2일)**
1. [ ] `organ-pair.ts` 추출 (현재 export-sqlite 내부 함수를 모듈화) + 테스트
2. [ ] `settlement-calc.ts` 신규 + 테스트 (마이너스 수입 규칙부터)
3. [ ] `code-mapping.ts`에 `reverseLookupNames` 추가 + 테스트
4. [ ] `submission-forms.ts` 신규 + 테스트
5. [ ] `lib/sqlite-seed/codeset.json`, `codevalue.json` 생성

**Phase B — 결산 (1일)**
6. [ ] `income-expense-report/page.tsx`에 settlement-calc 적용
7. [ ] `aggregate/page.tsx`에 settlement-calc 적용
8. [ ] `recompute-settlement` API + OPINION 동기화 RPC
9. [ ] Unit 테스트: settlement 픽스처 vs PFund2 결과 0원 차이

**Phase C — 저장 (1일)**
10. [ ] `export-sqlite/route.ts` 리팩토링: organ-pair / settlement-calc 사용
11. [ ] SUM_REPT / ACCBOOKSEND / ALARM export 활성화
12. [ ] info 테이블 스키마 검증
13. [ ] Integration 테스트: sqlite_master diff 0

**Phase D — 불러오기 (1.5일)**
14. [ ] `import-sqlite/route.ts` 대규모 리팩토링
15. [ ] 충돌 정책 처리 (overwrite/skip/merge)
16. [ ] dryRun 모드
17. [ ] `db-import/page.tsx` 또는 submit 내 모달 UI
18. [ ] Integration 테스트: round-trip diff 0

**Phase E — 제출문서 (1.5일)**
19. [ ] `forms/page.tsx` submission-forms 사용으로 전환
20. [ ] 각 양식 PFund2 출력과 시각 비교 (UAT 체크리스트)
21. [ ] parityChecked 뱃지 노출
22. [ ] 미구현 양식은 별도 PDCA로 분기

---

## 12. 관련 문서 / 사용된 결정

- 본 설계는 다음 두 진행 중 작업의 상위 우산임:
  - `docs/02-design/features/db-export-fix.design.md` — Phase C에 자연스럽게 흡수
  - `docs/01-plan/features/settlement-report-correction.plan.md` — Phase A의 settlement-calc 규칙 정의에 활용
- 외부 참조 자료
  - `data/Fund_Master.db` — 스키마/시드 진실원천
  - `data/오준석후보(자체분)_복구용_260514.db` — round-trip 검증 픽스처
  - 선관위 PFund2.exe 출력 양식 PDF (사용자 환경에서 수집 필요)

---

## Version History

| Version | Date | Changes | Author |
|---|---|---|---|
| 0.1 | 2026-05-14 | Initial draft (Plan v0.1 기반) | Claude |
