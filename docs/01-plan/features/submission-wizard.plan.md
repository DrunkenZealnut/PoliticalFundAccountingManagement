# Plan — 제출 산출물 마법사 (submission-wizard)

- 기능: `submission-wizard`
- 단계: Plan
- 작성일: 2026-07-06
- 유형: 초보자용 가이드 마법사 (기존 생성 SSOT 오케스트레이션 + 사전검증 + 미리보기)
- 관련 메모: [[settlement-must-use-realloc-ssot]] · [[official-fund-data-income-classification]] · [[election-item-classification-ssot]] · [[income-receipt-no-omitted]] · [[year-separation-p2-ui-lock]]

## Executive Summary

| 관점 | 내용 |
|------|------|
| **Problem** | 입력한 수입·지출로 **정치자금 수입·지출보고서**(회계보고서 22-1/22-2/22-4 + 회계장부 서식7)와 **선거비용 보전신청서**(서식43 + 보전 첨부서류목록)를 만들려면 지금은 submission-forms·reimbursement·reports 등 **여러 페이지를 오가며 서식을 하나씩 골라 생성**해야 한다. 초보 회계책임자는 "무엇을 먼저, 무엇이 빠졌는지, 숫자가 맞는지"를 알기 어렵고, 재배분·결산 정합이 안 맞은 채 제출물을 뽑을 위험이 있다 |
| **Solution** | 흩어진 생성 기능을 **단계형 마법사 2트랙**(① 수입·지출보고서 ② 선거비용 보전신청서)으로 감싼다. 각 트랙은 `준비상태 점검 → 데이터 재산출(미리보기) → 산출물 일괄 생성` 3~4스텝으로, **기존 생성 SSOT(재배분 `buildLedgerRows`·결산 `buildSettlementSummary`·보전 aggregator·HWPX 라우트)를 그대로 재사용**하고 마법사는 오케스트레이션·검증·안내만 담당한다 |
| **Function/UX** | 초보자가 큰 버튼 2개(보고서/보전) 중 하나를 눌러 시작 → 마법사가 **필수 입력 누락·재배분 미정리·결산 잔액≠재산·주기 외 거래·보전 미체크**를 신호등(✅/⚠️/❌)으로 보여주고, 문제 위치로 바로 이동하는 링크 제공 → 통과 항목은 미리보기 → **관련 서식을 한 번에 다운로드**. 전문가는 기존 개별 페이지를 계속 사용 |
| **Core Value** | "여러 화면을 헤매지 않고, 제출 전에 숫자가 맞는지 확인하고, 필요한 서류를 한 번에" — 초보자의 제출 실패·오류 제출을 줄이고, 재배분/결산 SSOT 정합을 제출 직전에 강제 표면화(은폐 금지)해 신뢰도를 높인다 |

## 1. 배경 / 문제

### 1.1 현재 상태 (재사용할 자산)
입력·산출 인프라는 이미 대부분 존재한다. 마법사는 **새 생성 로직을 만들지 않는다.**

| 산출물 | 기존 생성 경로 | 데이터 SSOT |
|--------|----------------|-------------|
| 회계장부(서식7) | `submission-forms` → `api/hwpx/income-ledger` | `buildLedgerRows`(재배분) + `fillExportReceiptNumbers` |
| 수입·지출보고서(22-1) | `submission-forms` → `api/hwpx/accounting-report` | `allocateCandidateLedgerRows` + `report-summary-builder` |
| 선거비용 집계표(22-2) | 〃 | 〃 (22-1과 SSOT 공유) |
| 재산명세서(22-3) | 〃 | `estate-builder` |
| 수입·지출부(22-4) | 〃 | `income-ledger-builder` |
| 보전청구서(서식43) | `submission-forms` → `api/hwpx/reimbursement-claim` | `reimbursement-aggregator`(보전 체크·claim_amt) |
| 보전 첨부서류목록 | 〃 → `api/hwpx/reimbursement-doclist` | `doclist-builder` |
| 배치 Excel(수입·지출부) | `reports` 페이지 | `buildReportLedgerRecords` |

사전 검증 신호도 이미 순수 함수로 존재: 재배분 부족(`detectCandidateShortfalls`), 결산 잔액=재산(settlement 페이지), 주기 외 거래(`countOutOfPeriodRows`, FR-07), 보전 집계(`reimbursement-aggregator`).

### 1.2 문제
- **분산**: 하나의 "보고" 목적을 위해 3~4개 페이지(submission-forms·reimbursement·settlement·reports)를 오가야 한다.
- **순서·완결성 불명**: 초보자는 어떤 서식이 한 세트인지, 무엇이 선행돼야 하는지(예: 보전은 먼저 "보전 체크"가 필요) 모른다.
- **정합 미확인 제출 위험**: 재배분 미정리 잔액·결산 불일치·주기 외 거래가 있어도 서식이 그냥 생성된다(경고는 개별 페이지에만 흩어져 있음).
- **입력 마법사만 초보자용**: `wizard-mappings`(회계자료등록)는 입력을 쉽게 해주지만, **출력(제출) 쪽엔 초보자 가이드가 없다.**

### 1.3 왜 지금인가
방금 완료한 program-wide-review로 재배분·결산·보전·주기검증 SSOT와 FR-07 경고가 정비됐다. 마법사가 이 신호들을 **한 곳에 모아 제출 직전 관문**으로 세우기 좋은 시점이다.

## 2. 목표 / 비목표

### 2.1 목표 (Goals)
1. **2트랙 마법사 UI** 신설(`dashboard/submission-wizard`): ① 정치자금 수입·지출보고서 ② 선거비용 보전신청서.
2. 각 트랙에 **준비상태 점검(신호등)** 스텝 — 필수 입력·재배분·결산·주기·보전 체크를 종합해 ✅/⚠️/❌로 표시하고 문제 위치로 이동 링크 제공.
3. **미리보기** 스텝 — 재산출된 핵심 수치(자금원별 수입/지출, 결산 잔액, 보전 청구 합계)를 화면에 요약.
4. **일괄 생성** 스텝 — 트랙에 속한 서식을 한 번에 다운로드(기존 HWPX/Excel 라우트 순차 호출).
5. **기존 생성 SSOT 100% 재사용** — 마법사는 오케스트레이션·검증·안내 레이어. 수치 산출 로직 신규 0.
6. 후보자(candidate) 우선. 초보자 친화 문구·아이콘·진행바.

### 2.2 비목표 (Non-goals)
- 재배분·결산·보전 **계산 로직 변경** — 하지 않음(SSOT 그대로).
- 기존 submission-forms·reimbursement·reports 페이지 **제거** — 전문가용으로 유지(마법사는 병행).
- 선관위 전자제출(파일 업로드 자동화) — 범위 밖(생성·다운로드까지).
- 후원회/정당/의원 전용 보고서 마법사 — 1차는 후보자 보고서·보전. 후원회는 후속(OQ-2).
- 입력(회계자료등록) 마법사 개편 — 별개(`wizard-mappings`).

## 3. 기능 요구사항 (FR)

- **FR-1 (진입·트랙 선택)**: `dashboard/submission-wizard` 진입 시 큰 카드 2개(수입·지출보고서 / 선거비용 보전신청서). 각 카드에 "무엇을 만드는지·언제 쓰는지" 1줄 설명. 후보자 org가 아니면 안내(후보자 전용 1차).
- **FR-2 (준비상태 점검, 신호등)**: 선택 트랙별 사전검증을 종합 표시.
  - **공통**: 회계기간 설정 여부, 주기 외 거래(`countOutOfPeriodRows`), 거래 0건 여부.
  - **보고서 트랙**: 재배분 미정리 잔액(`detectCandidateShortfalls`), 결산 잔액=재산(현금및예금) 일치, 재산명세 입력 여부.
  - **보전 트랙**: 보전 체크(acc_print_ok='Y') 건수>0, 청구액(claim_amt) 정합, 자금원 4분류 집계 유효.
  - 각 항목 ✅통과/⚠️경고(진행 가능)/❌차단(진행 불가)로 3단계. ❌는 문제 위치(예: settlement·reimbursement 페이지)로 이동 링크. 차단은 **데이터 무결성 최소치**(예: 거래 0건, 회계기간 미설정)만, 나머지는 경고(은폐 금지·강제 차단 지양).
- **FR-3 (데이터 재산출 미리보기)**: 통과 시 기존 SSOT로 재산출한 핵심 수치를 요약 표시 — 보고서 트랙: 자금원별 수입/지출·선거비용/외·결산 잔액; 보전 트랙: 자금원 4분류 보전 청구 합계·건수. "이 숫자로 서식이 만들어집니다" 안내.
- **FR-4 (일괄 생성·다운로드)**: 트랙 서식 세트를 순차 생성.
  - 보고서: 서식7(회계장부) · 22-1 · 22-2 · 22-3 · 22-4. (사용자가 체크로 일부 선택 가능, 기본 전체)
  - 보전: 서식43(보전청구서) · 보전 첨부서류목록. (서식43은 선거명·수령계좌 등 수동 입력 필요 → 마법사 폼에서 받음)
  - 각 파일은 기존 라우트(`api/hwpx/*`) 호출로 생성, 개별 다운로드 또는 zip(OQ-3).
- **FR-5 (재사용·정합)**: 마법사의 미리보기 수치와 생성 서식의 수치가 **동일 SSOT**라 구조적으로 일치. 신규 계산·집계 함수 도입 금지(기존 순수 함수 import만).
- **FR-6 (초보자 UX)**: 단계 진행바, 뒤로/다음, 각 스텝 도움말(HelpTooltip/PageGuide 재사용), 신호등·아이콘. 옛 선거주기 org는 읽기전용 안내([[year-separation-p2-ui-lock]] 잠금 존중).
- **FR-7 (인가·안전)**: 생성 라우트는 이미 `requireOrgMembership` 가드(program-wide-review). 마법사는 현재 org만 대상. 주기 외 거래 경고는 FR-07 SSOT 재사용.

## 4. 설계 스케치 (Design 단계에서 확정)

```
dashboard/submission-wizard/page.tsx  (마법사 셸: 트랙 선택 → 스텝 라우팅)
  ├─ TrackSelect            (FR-1)
  ├─ ReadinessStep          (FR-2)  ← lib/accounting/submission-readiness.ts (신규 순수 집계)
  ├─ PreviewStep            (FR-3)  ← 기존 SSOT(settlement-summary·reimbursement-aggregator) 재사용
  └─ GenerateStep           (FR-4)  ← 기존 api/hwpx/* 순차 호출 (income-ledger·accounting-report·reimbursement-*)

lib/accounting/submission-readiness.ts (신규, 순수)
  - buildReportReadiness(rows, estate, period, ctx) → { checks: {id,label,level,detail,fixHref}[], canProceed }
  - buildReimburseReadiness(rows, ctx) → { checks[], canProceed }
  * 내부는 기존 순수 함수(detectCandidateShortfalls·countOutOfPeriodRows·buildSettlementSummary·reimbursement-aggregator) 조합만.
```

- **핵심 원칙**: 마법사 = 조합/표시. `submission-readiness.ts`는 **판정 조합(신호등)**만 하고 수치는 기존 SSOT가 낸 값을 읽는다.
- **생성**: GenerateStep은 submission-forms의 `FormInputPanel` 생성 로직(postAndDownload)을 헬퍼로 추출/재사용해 서식별 순차 다운로드.

## 5. 영향 받는 산출물 / 파일

| 구분 | 파일 | 변경 |
|------|------|------|
| 신규 페이지 | `dashboard/submission-wizard/page.tsx` (+ 스텝 컴포넌트) | 마법사 셸·스텝 |
| 신규 순수 로직 | `lib/accounting/submission-readiness.ts` (+ test) | 신호등 판정 조합 |
| 재사용(무변경) | `api/hwpx/{income-ledger,accounting-report,reimbursement-claim,reimbursement-doclist}` | 그대로 호출 |
| 재사용(무변경) | `settlement-summary`·`reimbursement-aggregator`·`detectCandidateShortfalls`·`countOutOfPeriodRows` | import |
| 소폭 리팩터 | `components/submission-forms/FormInputPanel.tsx` | 생성·다운로드 로직을 공용 헬퍼로 추출(마법사 GenerateStep 공유) |
| 네비 | `components/dashboard/QuickActions.tsx`·사이드바 | 후보자 org에 "제출 마법사" 진입점 추가(href 정합 — QuickActions.test 회귀 주의) |

## 6. 엣지 케이스
- 거래 0건 / 회계기간 미설정 → ❌ 차단 + 입력·기관설정 안내.
- 재배분 미정리 잔액(환급>수입 등 구조적) → ⚠️ 경고(진행 가능), 상세 표면화.
- 결산 잔액 ≠ 재산(현금및예금) → ⚠️ 경고 + settlement로 이동 링크.
- 보전 트랙인데 보전 체크 0건 → ❌ 차단 + reimbursement로 이동.
- 주기 외 거래 혼입(FR-07) → ⚠️ 경고 + 예시 표시.
- 후보자 아님(후원회/정당) → 1차 미지원 안내(OQ-2).
- 옛 선거주기 org → 읽기전용(생성은 허용? 잠금은 입력용이므로 생성 허용 여부 OQ-4).
- 서식43 수동 필드 미입력 → 생성 스텝에서 검증(FormInputPanel 기존 required 재사용).

## 7. 테스트 계획
- `submission-readiness.test.ts`: 각 체크의 level 판정(통과/경고/차단) — 거래0=차단, 결산불일치=경고, 보전0=차단, 주기외=경고 등 경계 픽스처.
- 미리보기 수치 == 생성 SSOT 수치 정합(기존 settlement-summary·aggregator 테스트가 SSOT를 이미 고정 — 마법사는 그 값을 읽음을 확인).
- QuickActions.test: 신규 진입점 href가 실제 라우트와 일치(404 회귀 가드).
- 생성 헬퍼 추출 후 FormInputPanel 기존 동작 무회귀(수동 QA + 있으면 컴포넌트 테스트).
- 전체 vitest green + `next build` + eslint 클린.

## 8. 결정(권장) / 미해결(OQ)

### 권장 기본값 (Design에서 확정)
- **D-1 (재사용 우선)**: 생성 로직 신규 0 — 기존 `api/hwpx/*`·SSOT 재사용. 마법사는 오케스트레이션.
- **D-2 (경고 vs 차단)**: 데이터 무결성 최소치(거래0·기간미설정·보전0)만 ❌차단, 나머지(재배분·결산·주기)는 ⚠️경고+진행 허용(은폐 금지·강제 차단 지양, program-wide-review 방침 일관).
- **D-3 (병행)**: 기존 전문가용 페이지 유지, 마법사는 추가 진입점.

### 미해결 (Design/사용자 확정 필요)
- **OQ-1 (산출 형식)**: HWPX 중심(기존)만? reports Excel(배치 수입·지출부)도 보고서 트랙에 포함? 화면 미리보기 상세 수준.
- **OQ-2 (org 범위)**: 1차 후보자만 vs 후원회 수입·지출보고서(22 후원회 서식)도 포함.
- **OQ-3 (다운로드 방식)**: 서식별 개별 다운로드 vs zip 묶음(클라 JSZip). 초보자엔 zip이 편하나 파일명·구조 고려.
- **OQ-4 (옛 주기 생성)**: 옛 선거주기 org에서 제출물 생성 허용? (입력은 잠금이나 과거 보고서 재생성은 필요할 수 있음)
- **OQ-5 (진입점 위치)**: QuickActions·사이드바·대시보드 배너 중 어디에 노출.

## 9. 리스크
- **범위 팽창**: "마법사"가 생성 로직 재구현으로 번지면 SSOT 이중화. → D-1 고수(오케스트레이션만), 신규 계산 함수 금지.
- **초보자 오해**: 신호등 ⚠️를 무시하고 오류 제출. → 경고 문구를 구체적으로(무엇이·어디서), 미리보기로 숫자 재확인.
- **FormInputPanel 추출 회귀**: 생성 로직 공용화 시 기존 제출서류 페이지 깨짐. → 헬퍼 추출은 순수 이동+테스트, prefill race([[year-separation-p2-ui-lock]] 인접 B1 이미 수정) 주의.
- **QuickActions href 불일치 404**: 신규 라우트 추가 시 테스트로 고정.

## 10. 롤아웃
- 신규 페이지·순수 로직 추가(스키마 변경 없음) → additive.
- 후보자 org 실데이터(오준석후보)로 2트랙 수동 QA: 신호등 정확성, 미리보기==생성 수치, 서식 세트 다운로드.
- VERSION feature MINOR bump(app/VERSION), CHANGELOG(루트).
- 초보자 대상이므로 문구·도움말 우선(design-review 후속 고려).
