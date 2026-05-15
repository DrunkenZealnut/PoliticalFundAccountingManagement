# 선관위 공식프로그램 동일성 보장 (official-program-parity) Planning Document

> **Summary**: 결산 · 제출문서 생성 · DB 저장 · DB 불러오기의 **과정과 산출물**을 선관위 윈도우 프로그램(PFund2.exe)과 1:1 동일하게 보장
>
> **Project**: PoliticalFundAccountingManagement
> **Author**: Claude
> **Date**: 2026-05-14
> **Status**: Draft
> **Reference Program**: `중앙선거관리위원회_정치자금회계관리5 / PFund2.exe (v5)`

---

## Executive Summary

| 항목 | 내용 |
|---|---|
| Feature | official-program-parity |
| 시작일 | 2026-05-14 |
| 예상 기간 | 5~7일 (Dynamic 규모, 4개 서브영역 통합) |
| 영향 범위 | 결산/감사/제출 페이지 5종 + 양식 출력 + `/api/system/export-sqlite` + `/api/system/import-sqlite` + Supabase 스키마/시드 |

### Value Delivered (4-Perspective)

| Perspective | 내용 |
|---|---|
| **Problem** | 우리 웹앱이 만든 결산 수치·제출 양식·`.db` 백업 파일이 선관위 윈도우 프로그램의 결과와 1:1 일치하지 않음. (1) 결산 합계가 마이너스 수입·자금출처 충당 미적용으로 500,000원 이상 차이, (2) 제출 양식 일부가 미구현 또는 서식과 다름, (3) `export-sqlite` 출력 .db는 스키마·누락 테이블·코드 ID로 인해 선관위 프로그램의 "자료 복구"가 거부, (4) 선관위 .db를 우리 시스템으로 `import-sqlite` 했을 때 코드 매핑이 손실되는 사례 확인. 사용자가 양측을 모두 사용해야 하는 현실에서 데이터 왕복 신뢰성이 없음. |
| **Solution** | 4개 서브영역(결산/제출/저장/불러오기) 각각에 대해 (a) 선관위 원본을 기준 데이터로 삼아 산출물 비트 단위 비교 픽스처를 구축, (b) 누락 로직(마이너스 수입 처리·충당 재배분·ACC_REL2 시드·페어 ORGAN 등) 보강, (c) 코드 매핑(`lib/accounting/code-mapping`)을 모든 입력·출력 경로에서 단일 진실원천(SSOT)으로 사용, (d) 양방향 회귀 테스트 추가. |
| **Function/UX Effect** | 사용자가 (1) 웹앱에서 결산 → 선관위 보고서 수치와 0원 차이, (2) 양식 출력 → 선관위 공식 PDF/HWP와 동일 레이아웃·항목, (3) `.db` 다운로드 → 윈도우 PFund2에서 다이얼로그 없이 정상 복구, (4) 윈도우 PFund2의 `.db` 업로드 → 우리 웹앱에서 코드/잔액 손실 없이 동일하게 보임. 사용자가 더 이상 두 시스템 간 결과를 수기로 대조할 필요가 없음. |
| **Core Value** | "**선관위 제출용 회계 시스템이 클라우드에서도 동일하게 동작한다**"는 신뢰. 윈도우 PC가 없거나 윈도우 PFund2가 다운된 상황에서도 우리 웹앱만으로 결산-제출-백업 전 과정이 완결됨. |

---

## 1. Overview

### 1.1 Purpose

웹앱(우리 프로젝트)과 선관위 윈도우 프로그램(PFund2.exe v5)은 동일한 데이터 모델(20개 SQLite 테이블, CODESET 0~19, ACC_REL 652개)을 공유하지만, 처리 로직·산출물 포맷·코드 매핑 강도에서 미세한 차이가 누적되어 현재 양 시스템의 결과가 호환되지 않는 사례가 다수 발견됨.

본 플랜은 이미 진행 중인 두 부분 작업(`db-export-fix`, `settlement-report-correction`)을 **포괄하는 상위 호환성 보증 작업**으로, 결산·제출·저장·불러오기 4개 워크플로우를 모두 다룬다.

### 1.2 Background

선관위 분석 결과 (`/Users/zealnutkim/Downloads/중앙선거관리위원회_정치자금회계관리5` 및 `data/오준석후보(자체분)_복구용_260514.db` 기준):

- **데이터 모델**: 우리 `pfam` 스키마와 선관위 SQLite 스키마가 15개 테이블에서 1:1 매핑됨. 신규 추가 3종(`user_organ`, `evidence_file`, `backup_history`)은 선관위에 없는 웹 전용 보조 테이블.
- **코드 충돌**: `ACC_INS_TYPE`은 선관위 스키마상 `CHAR(2)`인데 실제 코드값(118, 583 등)이 3자리. 우리는 `008_widen_acc_ins_type`으로 `VARCHAR(5)` 확장 완료.
- **누락된 시드 데이터**: `ACC_REL2(482행)`, `CODESETTEMP`, `CODEVALUETEMP`, `CUSTOMERTEMP` 등을 우리 export가 생성하지 않음.
- **결산 로직 차이**: 마이너스 수입(반환처리)을 우리는 수입에서 차감, 선관위는 지출로 전환. 보조금 보전 비인정분의 자산 충당 미구현.

### 1.3 Related Documents

| 문서 | 관련성 |
|---|---|
| `docs/01-plan/features/db-export-fix.plan.md` | DB 저장 산출물 정합성 (이 플랜의 서브셋) |
| `docs/01-plan/features/settlement-report-correction.plan.md` | 결산 계산 로직 보정 (이 플랜의 서브셋) |
| `docs/01-plan/features/reimbursement-claim-form.plan.md` | 제출 양식 1종 (선거비용보전청구서, 완료) |
| `docs/02-design/features/db-export-fix.design.md` | export-sqlite 상세 설계 |
| `data/Fund_Master.db` | 선관위 기준 마스터 DB (시드 원본) |
| `data/오준석후보(자체분)_복구용_260514.db` | 회귀 검증용 실데이터 36건 |
| `CLAUDE.md` | DB 스키마 주의사항 (acc_ins_type, YYYYMMDD) |

---

## 2. Scope (4개 서브영역)

본 플랜은 다음 4개 워크플로우를 모두 다루며 각각이 선관위 산출물과 비트/픽셀 단위로 동일해질 때까지 진행한다.

### 2.1 결산 (Settlement Calculation Parity)

**대상 페이지**:
- `app/src/app/dashboard/settlement/page.tsx` (결산작업)
- `app/src/app/dashboard/income-expense-report/page.tsx` (수입지출보고서)
- `app/src/app/dashboard/aggregate/page.tsx` (집계)
- `app/src/app/dashboard/party-summary/page.tsx`, `supporter-summary/page.tsx` (요약)

**필수 로직**:
1. **마이너스 수입 보정**: `incm_sec_cd=1 AND acc_amt < 0` 레코드를 지출로 전환하여 수입 합계 / 지출 합계에 분리 반영 (settlement-report-correction.plan.md §1.2 원인 1)
2. **자금출처별 충당 재배분**: 보조금 보전 비인정분을 자산 지출로 이동, 후원회기부금 잔액 자산 이전 (settlement-report-correction.plan.md §1.2 원인 2)
3. **잔액 계산식 통일**: `opinion.balance_amt = in_amt - cm_amt + estate_amt` 한 곳에서 결정, RPC `calculate_balance`도 동일 규칙 사용

**산출물**: 결산 화면 수치, 수입지출보고서 수치, OPINION 테이블 저장값

### 2.2 제출문서 생성 (Submission Form Parity)

**대상 페이지**:
- `app/src/app/dashboard/forms/page.tsx` (1142 lines, 양식 모음)
- `app/src/app/dashboard/submit/page.tsx` (제출 페이지, 309 lines)
- `app/src/app/dashboard/reimbursement/page.tsx` (선거비용보전청구서 ✅ 완료)
- `app/src/app/api/excel/report/route.ts` (다중 시트 보고서)

**선관위 표준 양식 목록** (PFund2 제공):
| # | 양식 | 우리 구현 | 비고 |
|---|---|:---:|---|
| 1 | 정치자금 수입·지출부 (13컬럼) | ✅ | reports/page.tsx |
| 2 | 수입부 (11컬럼) | ✅ | excel/export |
| 3 | 지출부 (11컬럼) | ✅ | excel/export |
| 4 | 선거비용 보전청구서 (서식 1) | ✅ | 최근 머지 |
| 5 | 정치자금 회계보고서 | ❓ 확인 필요 | OPINION 기반 |
| 6 | 감사의견서 | ❓ 확인 필요 | OPINION 기반 (audit page) |
| 7 | 운영위원회 의결서 | ❓ 확인 필요 | resolution page |
| 8 | 재산현황 | ❓ 확인 필요 | estate page |
| 9 | 후원자 명세서 | ❓ 확인 필요 | donors / support-detail |
| 10 | 영수증·증빙 표지 | ❓ 확인 필요 | receipt page |

**작업**: 각 양식별 선관위 PFund2 출력 PDF/HWP와 픽셀/레이아웃 비교 후 격차 좁힘. 미구현 양식은 우선순위 결정 후 개별 PDCA로 분기 가능.

### 2.3 데이터베이스 저장 (Export Parity)

**대상**: `app/src/app/api/system/export-sqlite/route.ts` (650 lines)

**db-export-fix 플랜에서 정의된 작업 + 추가**:
1. SQLite DDL을 Fund_Master와 비트 단위 동일하게 재작성 (NOT NULL, FK, VARCHAR(N))
2. 누락 테이블 5종 추가: `ACC_REL2(482행)`, `CODESETTEMP`, `CODEVALUETEMP`, `CUSTOMERTEMP`, `TEST`, `info`(스키마 변경)
3. ORGAN 출력을 후보자 + 후원회 페어 2행으로 보장
4. ORG_ID 변환: Supabase `org_id` → 선관위 표준 `ORG_ID (1, 2)` 매핑
5. **추가 (이번 플랜)**:
   - `SUM_REPT` 자동 계산·삽입 (선관위는 종합보고서 캐시를 저장)
   - `ACCBOOKSEND` 전송이력 (선관위 신고 시 사용)
   - `ALARM` 알림 상태 보존
   - `OPINION.BALANCE_AMT` 등 결산값을 export 시점에 재계산하여 삽입

**산출물**: 윈도우 PFund2에서 `[자료 복구]` 클릭 시 다이얼로그 없이 정상 인식되는 `.db` 파일

### 2.4 데이터베이스 불러오기 (Import Parity)

**대상**: `app/src/app/api/system/import-sqlite/route.ts` (512 lines)

**현재 동작 분석 필요 항목**:
1. 선관위 PFund2 `.db`를 업로드 → 우리 `pfam` 스키마에 정확히 매핑되는가?
2. CUSTOMER FK 매칭 (CUST_ID가 다른 사용자 데이터와 충돌하면?)
3. ORG_ID 역변환 (선관위 1,2 → 우리 `organ` 테이블의 새 org_id)
4. 회계기간(`ACC_FROM`, `ACC_TO`) 보존 — 우리는 사용자 세션 별로 다른 회계기간을 가질 수 있음
5. 충돌 처리 정책: 동일 ORG_ID + ACC_BOOK_ID가 이미 있으면 덮어쓰기? 건너뛰기? 사용자 선택?
6. ACC_REL2 같이 우리에 없는 테이블 데이터는 무시? 혹은 별도 보관?
7. **회귀 테스트**: `data/오준석후보(자체분)_복구용_260514.db` 36건을 import → 동일한 export 결과를 다시 생성할 때 원본과 동일 (round-trip)

**산출물**: PFund2 → 우리 시스템 → PFund2 round-trip이 데이터 손실 없이 가능

---

## 3. 단일 진실원천 (SSOT) 컴포넌트

각 영역이 공유하는 코드 매핑 로직을 한 모듈로 모아 양방향 호환성을 보장한다.

| 모듈 | 역할 | 사용처 |
|---|---|---|
| `app/src/lib/accounting/code-mapping.ts` (이미 신규 추가됨) | (orgSecCd, incmSecCd, account, subject) ↔ (acc_sec_cd, item_sec_cd, exp_sec_cd) 양방향 | batch-import, expense, income, document-register, wizard, export-sqlite, import-sqlite |
| `app/src/lib/accounting/settlement-calc.ts` (신규) | 마이너스 수입 보정 + 충당 재배분 + 잔액 계산 단일 함수 | settlement, income-expense-report, aggregate, export-sqlite(OPINION), report-generator |
| `app/src/lib/accounting/organ-pair.ts` (신규) | 후보자 ↔ 후원회 페어 변환 (Supabase org_id ↔ 선관위 ORG_ID 1,2) | export-sqlite, import-sqlite |
| `app/src/lib/sqlite-seed/` (이미 일부 존재) | ACC_REL2, CODESET, CODEVALUE 표준 시드 | export-sqlite |

---

## 4. 구현 순서 (의존성 기반)

```text
[Phase A — SSOT 보강]
  A1. code-mapping.ts: 양방향 매핑 + 테스트 100% (이미 시작됨)
  A2. organ-pair.ts: 후보자/후원회 페어 처리 (신규)
  A3. settlement-calc.ts: 마이너스 수입 + 충당 재배분 (신규)
       ↓
[Phase B — 결산]
  B1. settlement-report-correction 작업 흡수: settlement / income-expense-report 페이지가 settlement-calc 사용
  B2. OPINION 테이블 자동 갱신 (결산 시점에 in_amt/cm_amt/balance_amt 저장)
       ↓
[Phase C — 저장]
  C1. db-export-fix 작업 흡수: export-sqlite DDL/누락테이블/info/ORG_ID 매핑
  C2. SUM_REPT/ACCBOOKSEND/ALARM export 추가
  C3. OPINION 결산값을 export 시점에 동기화
       ↓
[Phase D — 불러오기]
  D1. import-sqlite의 동작 현황 분석 + 손실/충돌 사례 문서화
  D2. 역방향 코드 매핑 + ORG_ID 역변환
  D3. 충돌 정책 UI (overwrite/skip/merge 옵션)
  D4. Round-trip 회귀 테스트 추가
       ↓
[Phase E — 제출문서]
  E1. 양식 인벤토리 점검 (10종 중 미구현 식별)
  E2. 각 양식의 선관위 PFund2 출력과 픽셀/항목 비교
  E3. 갭이 있는 양식은 개별 PDCA로 분기, 일정 합의
```

---

## 5. 영향받는 파일

| 파일 | 변경 종류 |
|---|---|
| `app/src/lib/accounting/code-mapping.ts` | 보강 (이미 존재) |
| `app/src/lib/accounting/code-mapping.test.ts` | 보강 (이미 존재) |
| `app/src/lib/accounting/settlement-calc.ts` | 신규 |
| `app/src/lib/accounting/organ-pair.ts` | 신규 |
| `app/src/lib/sqlite-seed/` | 보강 (ACC_REL2 등) |
| `app/src/app/dashboard/settlement/page.tsx` | settlement-calc 사용 |
| `app/src/app/dashboard/income-expense-report/page.tsx` | settlement-calc 사용 |
| `app/src/app/dashboard/aggregate/page.tsx` | settlement-calc 사용 |
| `app/src/app/dashboard/forms/page.tsx` | 각 양식 검증 + 갭 보완 |
| `app/src/app/dashboard/submit/page.tsx` | 제출 산출물 묶음 검증 |
| `app/src/app/api/system/export-sqlite/route.ts` | 대규모 수정 (db-export-fix + 본 플랜) |
| `app/src/app/api/system/import-sqlite/route.ts` | 대규모 수정 (round-trip 보장) |
| `app/scripts/009_organ_pair_normalization.sql` | 이미 신규 (db-export-fix) |
| `app/scripts/010_acc_rel2_seed.sql` | 신규 |
| `app/scripts/011_opinion_auto_sync.sql` (선택) | 신규 (OPINION 동기화 트리거) |

---

## 6. 검증 방법

### 6.1 픽스처 기반 비교

선관위 PFund2가 만든 산출물을 기준 픽스처로 등록하고 우리 출력과 자동 비교한다.

| 픽스처 | 비교 방법 | 통과 기준 |
|---|---|---|
| `data/오준석후보(자체분)_복구용_260514.db` | sqlite3 `.schema` + 모든 테이블 row dump | 우리 export와 diff 0 |
| 선관위 결산 수치 (수동 입력) | settlement page UI vs 수치 | 차액 0원 |
| 선관위 양식 PDF (10종) | 시각 비교 + 키 데이터 픽셀 OCR | 항목 100% 일치 |
| Round-trip 테스트 | PFund2 .db → import → export → original .db | byte-level diff 0 |

### 6.2 자동 회귀 테스트

- `app/src/lib/accounting/code-mapping.test.ts` 확장
- `app/src/lib/accounting/settlement-calc.test.ts` 신규
- `app/src/lib/accounting/organ-pair.test.ts` 신규
- 통합 테스트: `tests/integration/parity.test.ts` 신규 — 실제 SQLite 파일 비교

### 6.3 사용자 시나리오 (E2E)

1. PFund2 → `.db` 백업 → 우리 웹앱 import → 결산 페이지 수치 확인
2. 우리 웹앱에서 입력 → 결산 → `.db` export → PFund2에서 복구
3. 양쪽 결산 결과 수기 비교 0원 차이

---

## 7. 리스크 & 가정

| 항목 | 리스크 | 완화 |
|---|---|---|
| 양식 수가 많음 | 10여종 모든 양식을 한 사이클에 다루면 일정 미스 | 양식별 우선순위 분리. 1차에서는 핵심 4종(보전청구서, 회계보고서, 수입지출부, 감사의견서)만 보증, 나머지는 별도 PDCA |
| 선관위 PFund2 라이선스 | ACC_REL2 등 시드 데이터를 그대로 export하는 행위의 저작권 검토 필요 | 선관위 공식 배포 양식이므로 호환성을 위한 동일 시드는 허용 가정. 의심 시 사용자 환경의 Fund_Master.db를 일회성 import 도구로 제공 |
| Round-trip byte-level diff | sql.js와 윈도우 SQLite의 page layout/encoding 미세 차이 | 1차 기준은 "선관위 PFund2가 정상 복구한다"로 완화. byte 일치는 Phase D 후반 검토 |
| OPINION 자동 동기화 | 결산값 자동 갱신이 사용자가 수동 편집한 내용을 덮어쓸 수 있음 | 수동 편집 잠금(`opinion.manual_override` 플래그) 또는 결산 시 confirm 다이얼로그 |
| import-sqlite 보안 | 임의 .db 업로드 → SQL 인젝션 가능성 | sql.js로 격리 파싱 후 정제된 INSERT만 사용 (이미 적용) + 파일 크기 제한 |
| 다중 사용자 충돌 | 같은 org_id에 동시 import/export 발생 시 | RLS 정책으로 막혀있음. UI 측 동시작업 잠금 추가 검토 |

---

## 8. 완료 조건 (Definition of Done)

- [ ] **결산**: settlement / income-expense-report / aggregate 페이지의 수치가 PFund2 결산 결과와 0원 차이 (실데이터 36건 기준)
- [ ] **제출문서**: 핵심 4종 양식(보전청구서, 회계보고서, 수입지출부, 감사의견서)의 항목·레이아웃이 PFund2 출력과 일치 (UAT 통과)
- [ ] **저장**: `export-sqlite` 산출 `.db`가 윈도우 PFund2에서 다이얼로그 없이 [자료 복구] 성공 + 모든 데이터 그대로 표시
- [ ] **불러오기**: PFund2 `.db` → import → export 라운드트립에서 sqlite3 dump 비교 결과 데이터 손실 0
- [ ] **SSOT**: code-mapping / settlement-calc / organ-pair가 모든 관련 페이지·API에서 사용됨 (grep으로 중복 로직 0 확인)
- [ ] **테스트**: code-mapping, settlement-calc, organ-pair 단위 테스트 통과 + parity 통합 테스트 통과
- [ ] **회귀**: 기존 기능(영수증 OCR, 마법사, 챗봇, AI 보조)이 영향 없음
- [ ] **문서**: 본 플랜의 4개 영역에 대한 Design 문서 생성 (`docs/02-design/features/official-program-parity.design.md`)

---

## 9. 후속 단계

1. `/pdca design official-program-parity` — 4개 영역의 상세 설계 (테이블 매핑 표, 함수 시그니처, UI 플로우)
2. 진행 중 서브 플랜(`db-export-fix`, `settlement-report-correction`)을 본 플랜의 하위로 통합 — 별도 분기는 유지하되 본 플랜이 우산 역할
3. 양식 인벤토리(`forms/page.tsx`)를 먼저 점검하여 미구현 양식을 식별 후 개별 PDCA로 분기 결정
4. 회귀 테스트 인프라 구축 후 Phase A → B → C → D → E 순으로 진행
