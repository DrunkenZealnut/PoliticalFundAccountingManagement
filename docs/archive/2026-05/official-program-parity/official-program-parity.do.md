# official-program-parity Do Phase Guide

> **Branch**: `feat/official-program-parity` (created 2026-05-14)
> **Design Doc**: [official-program-parity.design.md](../features/official-program-parity.design.md)
> **Plan Doc**: [official-program-parity.plan.md](../../01-plan/features/official-program-parity.plan.md)

---

## 현재 상태 (브랜치 생성 시점)

작업 트리에 이미 진행 중이던 작업이 그대로 이동:

### 수정된 파일 (M)
- `app/src/app/api/acc-book/route.ts` — batch_insert 보강 (db-export-fix 진행분)
- `app/src/app/api/system/export-sqlite/route.ts` — DDL/페어 ORGAN/시드 (db-export-fix 진행분, 650 lines)
- `app/src/app/dashboard/batch-import/page.tsx` — 코드 매핑 적용 (db-export-fix 진행분)

### 신규 파일 (??)
- `app/scripts/009_organ_pair_normalization.sql` — 마이그레이션
- `app/src/lib/accounting/code-mapping.ts` + `.test.ts` — SSOT Phase A의 일부 이미 완료
- `app/src/lib/sqlite-seed/acc_rel2.json` — Phase A의 일부 이미 완료
- `app/src/stores/help-mode.ts` — 별개 작업 (도움말 모드)
- `data/` — 픽스처 (Fund_Master.db, 오준석후보 .db 등) — gitignore 후보 검토
- `docs/01-plan/features/{db-export-fix, reimbursement-claim-form, official-program-parity}.plan.md`
- `docs/02-design/features/{db-export-fix, reimbursement-claim-form, official-program-parity}.design.md`
- `docs/03-analysis/db-export-fix.analysis.md`
- `docs/04-report/` — 비어있음

### 삭제된 파일 (D)
asset-report, backup, codes, donors, estate, income-expense-book, organ, receipt, resolution, settlement, wizard — 별도 리팩토링 결과 (이 PDCA 범위와 무관, 그대로 유지)

---

## Phase A 진행 가이드 (SSOT 모듈 4종 + sqlite-seed)

> 디자인 문서 §11.2 Phase A를 그대로 따른다.

### 우선순위 1: settlement-calc.ts 신규 (가장 가치 큼)

**파일**: `app/src/lib/accounting/settlement-calc.ts` + `.test.ts`

**구현 체크리스트**:
- [ ] `AccBookRow`, `SettlementResult`, `AccountBreakdown`, `FundSourceBreakdown`, `Correction` 타입 정의
- [ ] `computeBalances(rows, options)` 메인 함수
- [ ] 규칙 1: 마이너스 수입 → 지출 전환 (`incm_sec_cd === 1 && acc_amt < 0`)
- [ ] 규칙 2: 자금출처 충당 재배분 (보조금/후원회기부금 잔액을 자산으로)
- [ ] Correction audit log 누적
- [ ] 단위 테스트
  - [ ] 마이너스 수입 +500k/-500k → income=500k, expense=500k, balance=0
  - [ ] 보조금 보전 비인정분 자산 충당
  - [ ] 빈 배열, 단일 row, 다중 org 시나리오

**참조 데이터**: `docs/01-plan/features/settlement-report-correction.plan.md` §1.2 (구체 수치)

### 우선순위 2: organ-pair.ts 모듈화

**파일**: `app/src/lib/accounting/organ-pair.ts` + `.test.ts`

**구현 체크리스트**:
- [ ] `export-sqlite/route.ts:419-527`에서 다음을 추출:
  - `SUPPORTER_SEC_CDS`, `CANDIDATE_SEC_CDS` 상수
  - `buildOrganExport(supabaseOrgan)` 함수
  - `remapOrgId<T>(rows, orgIdMap)` 헬퍼
- [ ] 역방향 `parseOrganImport(organRows)` 신규 작성
- [ ] export-sqlite는 이 모듈을 import해서 사용 (중복 제거)
- [ ] 단위 테스트
  - [ ] 후원회(109) → 2행, ORG_ID 매핑
  - [ ] 후보자(90) → 1행, ORG_ID=1
  - [ ] 정당(50) → 1행, ORG_ID=1
  - [ ] parseOrganImport: 2행 → candidates 2개

### 우선순위 3: code-mapping.ts 보강

**파일**: `app/src/lib/accounting/code-mapping.ts` (기존 보강)

**구현 체크리스트**:
- [ ] `reverseLookupNames(codes, codeValues)` 함수 추가
- [ ] 단위 테스트
  - [ ] `{1,94,0}` → `{"수입","기명후원금",null}` (CS_ID 우선순위 검증)
  - [ ] 미정의 코드 → CodeMappingError

### 우선순위 4: submission-forms.ts 신규

**파일**: `app/src/lib/accounting/submission-forms.ts` + `.test.ts`

**구현 체크리스트**:
- [ ] `SubmissionForm` 타입 정의
- [ ] 양식 카탈로그 정적 배열 (디자인 §5.2 + 현재 `forms/page.tsx`의 FORM_GROUPS 참조)
- [ ] `getRequiredForms(orgSecCd)` 함수
- [ ] parityChecked 필드 — 현재 모두 false로 시작, UAT 후 true 전환
- [ ] 단위 테스트
  - [ ] 후원회 orgSecCd → 후원회 전용 양식 포함
  - [ ] 후보자 orgSecCd → 후원회 양식 제외

### 우선순위 5: sqlite-seed 보강

**파일**:
- `app/src/lib/sqlite-seed/codeset.json` (신규)
- `app/src/lib/sqlite-seed/codevalue.json` (신규)

**작업**:
```bash
# 1) Fund_Master.db에서 추출
cd "/Users/zealnutkim/Documents/DEV/PoliticalFundAccountingManagement"
sqlite3 data/Fund_Master.db <<SQL
.headers on
.mode json
SELECT * FROM CODESET ORDER BY CS_ID;
SQL
# → 결과를 codeset.json으로 저장

sqlite3 data/Fund_Master.db <<SQL
.headers on
.mode json
SELECT * FROM CODEVALUE ORDER BY CV_ID;
SQL
# → 결과를 codevalue.json으로 저장
```

체크리스트:
- [ ] codeset.json 20행
- [ ] codevalue.json 약 480행
- [ ] export-sqlite에서 Supabase fetch 실패 시 fallback으로 사용

---

## Dependency 설치

새로 추가할 의존성은 없음. 기존 의존성 그대로 사용:
- `sql.js` (이미 설치) — SQLite WASM
- `vitest` (이미 설치) — 단위 테스트
- `@supabase/supabase-js` (이미 설치)

확인 명령:
```bash
cd app && npm list sql.js vitest
```

---

## 검증 (Phase A 완료 시점)

각 모듈이 단위 테스트 100% 통과 후 다음을 수행:

```bash
cd app
npm run test                                 # 전체 테스트
npx vitest run src/lib/accounting/           # 회계 모듈만
npm run lint                                 # ESLint
npm run build                                # 빌드 회귀 확인
```

---

## 다음 Phase 진입 조건

- [ ] Phase A 5개 모듈 모두 단위 테스트 통과
- [ ] export-sqlite가 organ-pair 모듈을 사용하도록 리팩토링 완료 (중복 함수 제거)
- [ ] 빌드 + lint 통과

이후 `/pdca status`로 진행도 확인하고 Phase B (결산)로 이동.

---

## 커밋 전략 (제안)

Phase A는 모듈별 atomic 커밋 권장:
```
feat(accounting): add settlement-calc module with negative income correction
feat(accounting): extract organ-pair module from export-sqlite
feat(accounting): add reverseLookupNames to code-mapping
feat(accounting): add submission-forms catalog
feat(seed): add codeset/codevalue static seeds from Fund_Master
```

각 커밋은 lint + test 통과 후에만. 사용자가 명시적으로 커밋 요청할 때까지 자동 커밋 금지.

---

## 리스크 알림

- **삭제된 페이지들** (settlement, estate, donors 등)이 작업트리에 D로 남아있음. 이는 별도 정리 작업의 결과로 추정 — 본 PDCA와 무관하지만, 빌드/링크 깨짐 여부를 빌드 시 함께 확인 필요
- **`data/` 픽스처**: Fund_Master.db / 오준석후보 .db는 픽스처로 유용하지만 저작권/사이즈 검토 필요. `.gitignore` 또는 별도 secrets 처리 결정 필요 (사용자 확인 사항)
- 현재 작업트리 변경량이 큼 — Phase A 시작 전에 사용자에게 "지금 진행하면 어떤 변경이 어느 커밋에 묶일지" 확인 권장
