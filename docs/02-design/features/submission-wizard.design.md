# Design — 제출 산출물 마법사 (submission-wizard)

- 기능: `submission-wizard`
- 단계: Design
- 작성일: 2026-07-06
- 선행: [Plan](../../01-plan/features/submission-wizard.plan.md)
- 확정된 OQ(사용자): **OQ-1 산출=모두(HWPX+Excel), OQ-2 org=모두, OQ-3 zip, OQ-4 옛 주기 생성=불가, OQ-5 진입점=대시보드 배너**
- 관련 메모: [[settlement-must-use-realloc-ssot]] · [[official-fund-data-income-classification]] · [[election-item-classification-ssot]] · [[year-separation-p2-ui-lock]]

## 0. 설계 원칙 (불변)
1. **생성 로직 신규 0** — 마법사는 오케스트레이션·검증·안내. 수치는 전부 기존 SSOT가 낸 값을 읽는다(미리보기==생성 구조적 일치).
2. **정직한 "모두"** — 후보자 회계보고서 서식(22-1~4·서식7)은 데이터 자동 채움(`dataFill`), **후원회/정당의 회계보고서 서식(23-x·서식8·20)은 빈 양식**(자동 채움 없음). 마법사는 org별로 "데이터 채움 vs 빈 양식"을 명확히 구분해 안내한다. **보전 트랙은 후보자 전용**(선거비용 보전은 후보자만 청구).
3. **은폐 금지** — 최소 무결성(거래0·기간미설정·보전0)만 차단, 재배분·결산·주기 외 거래는 경고+진행 허용(program-wide-review 방침 일관).

## 1. 아키텍처

```
dashboard/submission-wizard/page.tsx        ← 마법사 셸(스텝 상태·진행바·뒤로/다음)
  ├─ components/wizard/TrackSelectStep.tsx   (FR-1) 트랙 2카드 + org 안내
  ├─ components/wizard/ReadinessStep.tsx     (FR-2) 신호등
  ├─ components/wizard/PreviewStep.tsx       (FR-3) 재산출 요약
  └─ components/wizard/GenerateStep.tsx      (FR-4) zip 일괄 생성

lib/accounting/submission-readiness.ts (신규·순수·테스트대상)
  buildReportReadiness(input) → ReadinessResult
  buildReimburseReadiness(input) → ReadinessResult
  * 내부: countOutOfPeriodRows·orgValidRange(acc-period.ts) · buildSettlementSummary(settlement-summary.ts)
          · aggregateReimbursementByFundingSource(reimbursement-aggregator.ts) 조합만. 신규 계산 없음.
  * 재배분 미정리는 buildSettlementSummary(rows).shortfalls 를 그대로 읽는다 — detectCandidateShortfalls 의
    소재는 income-expense-report-summary.ts 이고 settlement-summary 는 re-export 하지 않으므로
    별도 직접 호출 금지(이중 계산 방지).

lib/excel-template/build-report-workbook.ts (신규·순수, reports/page.tsx handleBatchExcel 에서 추출)
  buildReportWorkbook(records, customerMap, orgCtx) → ExcelJS Buffer   ← reports 페이지도 이 함수로 전환

lib/submission/wizard-forms.ts (신규·순수)
  reportFormsFor(orgType) → HwpxFormDef[]      (회계장부+회계보고서 category, orgScope 필터)
  reimburseFormsFor(orgType) → HwpxFormDef[]   (보전·청구 category; candidate만 비어있지 않음)

lib/submission/generate-form.ts (신규·FormInputPanel에서 추출)
  generateFormBlob(def, {orgId, values?}) → { filename, blob }   ← dataFill 라우트/generate 호출
  * FormInputPanel 의 postAndDownload/buildFieldValues/safeFileName 을 이 순수-ish 헬퍼로 이동,
    FormInputPanel 은 이 헬퍼 + downloadBlob 조합으로 재작성(동작 불변).
```

### 1.1 데이터 흐름 (보고서 트랙, 후보자)
```
acc_book(기간) ──fetch──▶ records
   │
   ├─▶ buildReportReadiness(records, estate, period, ctx)
   │       ├ 거래0?            → ❌ block
   │       ├ 기간 미설정?       → ❌ block
   │       ├ buildSettlementSummary(records).shortfalls → 있으면 ⚠️ (재배분 미정리)
   │       ├ buildSettlementSummary(records).balance vs estate(47 현금및예금) → 불일치 ⚠️
   │       ├ countOutOfPeriodRows(records, period) → >0 ⚠️ (주기 외)
   │       └ estate 0건?        → ⚠️ (재산명세 미입력)
   │
   ├─▶ PreviewStep: buildSettlementSummary(records) 자금원별 수입/지출·선거비용/외·balance 표시
   │
   └─▶ GenerateStep: reportFormsFor(orgType) 각 서식
           candidate: 서식7·22-1·22-2·22-3·22-4(데이터 채움) + 서식20(빈 양식, orgScope=all)
           +공통: reports 배치 Excel(수입·지출부, buildReportLedgerRecords)  ← 모든 org 데이터 채움
           supporter: 빈 양식 서식(서식8·20·23-1~11) + Excel(데이터); party/lawmaker 는 candidate 스코프(formsForOrgType 기존 규칙)
        → 각 blob 을 JSZip 에 추가 → 단일 zip 다운로드
```

- **데이터 로드(ReadinessStep·PreviewStep)**: records=`/api/acc-book`(기간), estate=supabase 브라우저 클라 직접 쿼리(org_id 필터, `estate_sec_cd=47` 합계 = `estateAmount` SSOT — estate 전용 API 라우트 없음, estate 페이지와 동일 경로), organ 회계기간=organ 조회.
- **데이터 로드(GenerateStep Excel)**: `/api/acc-book`·`/api/customers`·organ 회계기간 fetch → customerMap 조립 → `buildReportLedgerRecords` → `build-report-workbook`(순수 빌더) — reports `handleBatchExcel` 과 동일 경로 공유(중복 제거).

### 1.2 데이터 흐름 (보전 트랙, 후보자 전용)
```
acc_book(incm=2, acc_print_ok='Y' 선거비용) ──▶
   ├─▶ buildReimburseReadiness
   │       ├ 보전 체크 0건?       → ❌ block (→ reimbursement 페이지 이동)
   │       ├ aggregateReimbursementByFundingSource.기타건수>0 → ⚠️ (자금원 미분류)
   │       └ 청구액 합계 0?        → ⚠️
   ├─▶ PreviewStep: 자금원 4분류(후보자자산·후원회기부금·보조금·보조금외) 보전 청구 합계·건수
   └─▶ GenerateStep: 서식43(보전청구서, 수동필드=선거명·수령계좌 마법사 폼) + 보전목록(첨부서류)
        → JSZip → zip 다운로드
        ※ 서식43은 fields(선거명·선거구명·후보자명·수령계좌 등) 수동입력 필요 → 생성 스텝 상단 폼으로 수집
```

## 2. 컴포넌트 상세

### 2.1 마법사 셸 `submission-wizard/page.tsx`
- 상태: `track: 'report'|'reimburse'|null`, `step: 0..3`, `payload`(서식43 수동필드·서식 선택 체크).
- 진행바(4스텝)·뒤로/다음. `useAuth`(orgType·orgId). `useOrgCycleLock`으로 **옛 주기면 생성 차단(OQ-4=no)** — 배너로 "옛 선거주기는 조회 전용, 제출물 생성 불가" 안내(잠금 해제해도 생성 스텝 비활성).
- 스텝: 0 TrackSelect → 1 Readiness → 2 Preview → 3 Generate.
- 각 스텝 상단 도움말은 기존 `PageGuide`, 필드 단위는 `HelpTooltip` 재사용(FR-6).

### 2.2 ReadinessStep (신호등)
- `ReadinessResult = { checks: Check[]; canProceed: boolean }`, `Check = { id; label; level: 'ok'|'warn'|'block'; detail?; fixHref? }`.
- 렌더: 각 체크를 ✅(green)/⚠️(amber)/❌(red) 아이콘+라벨+상세. `fixHref` 있으면 "고치러 가기"(settlement·reimbursement·income 등 라우트). `canProceed=false`(❌ 존재)면 다음 버튼 비활성.
- **판정 로직은 전부 `submission-readiness.ts`(순수)** — 컴포넌트는 표시만.

### 2.3 PreviewStep
- 보고서: `buildSettlementSummary(records)` 결과 표(자금원×수입/지출/잔액) + 선거비용/선거비용외 합 + 결산 잔액=재산 여부. 후원회는 org-metrics 요약(수입/지출 총액) + "회계보고서 서식은 빈 양식" 고지.
- 보전: `aggregateReimbursementByFundingSource` 4분류 표 + 총 청구액·건수 + 기타(미분류) 경고.
- 하단 문구: "이 숫자 그대로 서식이 만들어집니다(동일 계산 기준)."

### 2.4 GenerateStep (zip)
- 서식 체크리스트(기본 전체 체크, 개별 해제 가능).
- 보전 트랙: 서식43 수동필드 입력 폼(선거명·선거구명·후보자명·수령 금융기관/예금주/계좌번호·선관위명) — 기존 `fields()` 정의 재사용, 필수 검증.
- "만들기" → 각 선택 서식마다 `generateFormBlob` 호출(HWPX) + 보고서 트랙이면 reports Excel blob 생성 → **JSZip 에 add → 단일 zip(`정치자금수입지출보고서_{org}_{날짜}.zip` / `선거비용보전신청서_{org}_{날짜}.zip`) 다운로드**.
- 진행 표시(생성 중 N/총). 실패 서식은 zip에서 제외하고 경고 목록 표시(부분 성공 허용, 은폐 금지).

### 2.5 대시보드 배너 (OQ-5)
- `dashboard/page.tsx`에 배너 컴포넌트 추가: "제출 서류를 만들 준비가 되셨나요? 마법사로 한 번에" + [수입·지출보고서 만들기]/[선거비용 보전신청서 만들기] 버튼(보전은 candidate만). 후보자 아닌 org는 보고서 버튼만. 옛 주기 org는 비활성+안내.
- 진입점은 배너만(QuickActions·사이드바 미변경 — 단, 라우트 존재 시 QuickActions.test href 정합 영향 없음 확인).

## 3. `submission-readiness.ts` 계약 (순수)

```ts
export interface ReadinessCheck {
  id: string; label: string;
  level: "ok" | "warn" | "block";
  detail?: string;          // "결산 잔액 12,300 ≠ 재산 10,000 (차이 2,300)"
  fixHref?: string;         // "/dashboard/settlement"
}
export interface ReadinessResult { checks: ReadinessCheck[]; canProceed: boolean; }

export interface ReportReadinessInput {
  rows: ReportSummaryRawRow[];
  estateCashAmount: number;   // estate_sec_cd=47 합계(estateAmount SSOT)
  estateCount: number;
  period: OrgPeriod;
  isCandidate: boolean;
}
export function buildReportReadiness(i: ReportReadinessInput): ReadinessResult;

export interface ReimburseReadinessInput {
  rows: (AccBookRow & { acc_date?: string | null })[];  // reimbursement-aggregator 입력 + 주기검증용 acc_date
  electionExpenseItemCds: number[];
  accSecCdNames?: Record<number, string>;
  period: OrgPeriod;               // 공통 체크(기간·주기 외)를 보전 트랙에도 적용
}
export function buildReimburseReadiness(i: ReimburseReadinessInput): ReadinessResult;
```

- 공통 체크 3종(거래 존재·회계기간·주기 외)은 **두 트랙 모두** 생성한다(`commonChecks` 공유).
- 보전 트랙에서 보전 체크 0건(block)이면 `claim-total` 체크는 생성하지 않는다(원인을 block 이 이미 설명 — 노이즈 방지).

판정표:

| 체크 | 트랙 | level 규칙 |
|------|------|-----------|
| 거래 존재 | 공통 | rows 0건 → block |
| 회계기간 설정 | 공통 | `orgValidRange(period)` null → block |
| 주기 외 거래 | 공통 | `countOutOfPeriodRows(rows, period).count > 0` → warn(건수·예시) |
| 재배분 미정리 | 보고서(후보자) | `buildSettlementSummary(rows).shortfalls.length > 0` → warn |
| 결산 잔액=재산 | 보고서(후보자) | `buildSettlementSummary(rows).balance !== estateCashAmount` → warn |
| 재산명세 입력 | 보고서(후보자) | `estateCount === 0` → warn |
| 보전 체크 존재 | 보전 | acc_print_ok='Y' 선거비용 0건 → block(fixHref=reimbursement) |
| 자금원 미분류 | 보전 | `aggregate.otherFundingCount > 0` → warn |
| 청구액 존재 | 보전 | `byFundingSource.합계 === 0` → warn |

- **비후보자(후원회·정당) 분기**: `buildReportReadiness`는 `isCandidate=false`면 재배분·결산·재산 체크를 생성하지 않고 **공통 체크만** 반환한다(재산명세는 후보자 전용 22-3 대응 — 후원회는 23-2 빈 양식이라 estate 체크 스킵).

## 4. 파일 변경 목록

| 구분 | 파일 |
|------|------|
| 신규 | `dashboard/submission-wizard/page.tsx` |
| 신규 | `components/wizard/{TrackSelectStep,ReadinessStep,PreviewStep,GenerateStep}.tsx` + `wizard-types.ts`(운반 타입) |
| 신규 | `components/dashboard/SubmissionWizardBanner.tsx` |
| 소폭 | `lib/page-guides.ts` — `submissionWizard` PageGuide 항목 추가(FR-6) |
| 소폭 | `package.json` — `jszip ^3.10.1` 직접 선언(§7 전이 의존성 명시화) |
| 신규 순수 | `lib/accounting/submission-readiness.ts` (+ `.test.ts`) |
| 신규 순수 | `lib/submission/wizard-forms.ts` · `lib/submission/generate-form.ts` |
| 리팩터 | `components/submission-forms/FormInputPanel.tsx` (생성 로직 → generate-form.ts 재사용, 동작 불변) |
| 소폭 | `dashboard/page.tsx` (배너 추가) |
| 회귀 확인 | reports Excel 생성부(`reports/page.tsx handleBatchExcel`)를 GenerateStep에서 재사용하려면 공용 함수 추출 필요 → `lib/excel-template/build-report-workbook.ts`로 추출(현재 페이지 인라인) |

> reports Excel은 현재 `reports/page.tsx`에 인라인. GenerateStep 재사용을 위해 workbook 빌드를 순수 함수로 추출 — `buildReportWorkbook(records, customerMap, orgCtx) → ExcelJS Buffer`. `handleBatchExcel`은 빌드 전에 `/api/acc-book`·`/api/customers`·organ 회계기간을 fetch해 customerMap 을 조립하므로, GenerateStep 도 **동일 fetch 경로**를 공유한다(§1.1 데이터 로드 참조). 추출은 동작 불변 + 기존 reports 페이지도 이 함수를 쓰게 전환(중복 제거).

## 5. 구현 순서 (Do 단계)
1. `submission-readiness.ts` + 테스트 (순수, 판정표 고정) — TDD.
2. `wizard-forms.ts`(orgScope 필터) + 테스트.
3. `generate-form.ts` 추출 + `FormInputPanel` 재작성(동작 불변 확인).
4. reports Excel workbook 빌더 추출(`build-report-workbook.ts`) + reports 페이지 전환.
5. 마법사 셸 + 4스텝 컴포넌트(GenerateStep은 JSZip 묶음).
6. 대시보드 배너.
7. 실데이터 QA(후보자 2트랙·후원회 보고서) + VERSION/CHANGELOG.

## 6. 테스트 계획
- `submission-readiness.test.ts`: 판정표 각 행 경계(거래0=block·결산불일치=warn·보전0=block·주기외=warn·정상=ok all, canProceed).
- `wizard-forms.test.ts`: orgType별 서식 집합(candidate=서식7+20+22-1~4, 보전=43+보전목록[서식44 제외]; supporter=서식8+20+23-1~11 전부 빈 양식; 비후보자=보전 빈 배열).
- `generate-form.test.ts`: dataFill별 엔드포인트 매핑·파일명·payload(values) 구성(fetch 모킹).
- 미리보기==생성 정합: readiness/preview가 `buildSettlementSummary`·`aggregate` 결과를 그대로 읽음을 단언(기존 SSOT 테스트가 값을 고정).
- QuickActions.test 무영향 확인, 전체 vitest green + build + eslint.

## 7. 엣지·리스크
- **후원회 회계보고서 빈 양식 오해**: 후원회는 자동채움 서식이 없음 → 미리보기·생성 스텝에 "이 서식은 빈 양식(수동 작성)이며 수입·지출부 Excel만 데이터가 채워집니다" 명시.
- **옛 주기 생성 차단(OQ-4)**: `useOrgCycleLock.locked`면 생성 스텝 전체 비활성 + 안내. 준비/미리보기 조회는 허용(읽기).
- **서식43 수동필드**: 미입력 시 생성 불가(기존 required). 마법사 폼에서 수집·검증.
- **zip 브라우저 메모리**: 서식 수(최대 ~7) 소량이라 무리 없음. 대량 acc_book는 각 서식 생성이 서버(HWPX)·클라(Excel)에서 이미 limit(100000) 처리(program-wide-review P-1).
- **jszip 의존성 미선언(검증됨)**: `jszip@3.10.1`은 exceljs의 전이 의존성일 뿐 package.json에 직접 선언돼 있지 않은데 `lib/hwpx/generate.ts`가 이미 직접 import 중(기존 취약점). GenerateStep이 **클라이언트 번들**에서도 JSZip을 쓰게 되므로 Do 단계에서 `"jszip": "^3.10.1"`을 dependencies에 명시 선언할 것(설치 불필요, 선언만 — additive).
- **FormInputPanel 추출 회귀**: 생성 로직 이동은 순수 이동+테스트, prefill(B1 수정본) 영향 없음.
- **SSOT 이중화 리스크**: readiness가 자체 계산하면 미리보기 불일치 → 반드시 기존 순수함수 조합만(신규 계산 금지, 리뷰 가드).

## 8. 롤아웃
- additive(스키마 없음). VERSION MINOR bump, CHANGELOG.
- 후보자(오준석) 실데이터로 보고서·보전 2트랙 zip 생성 QA(미리보기 수치==서식 수치, 신호등 정확). 후원회 org로 빈 양식+Excel 확인.
- 초보자 대상 → 문구·도움말·design-review 후속 고려.
