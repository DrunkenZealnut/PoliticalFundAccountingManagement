# reimbursement-claim-hwpx 완료 보고서

> **Summary**: 「선거비용 보전청구서」(서식 43)를 acc_book 의 보전 체크된 선거비용 지출로부터 자금원별로 집계하여 `form-43-fill.hwpx` 데이터를 채워 .hwpx 로 생성하는 기능의 PDCA 1세션 완료.
>
> **Feature**: reimbursement-claim-hwpx (선거비용 보전청구서 서식 43 HWPX 데이터 채움)
> **Version**: 0.8.0.0 → 0.9.0.0(예정)
> **Duration**: 2026-06-10 (1일, Plan→Design→Do→Check 통합 완료)
> **Branch**: feat/reimbursement-claim-hwpx
> **Status**: Complete (Match Rate 98%, Gap 2건 문서표기 불일치로 해소)

---

## Executive Summary

### 1.1 Overview

제출서류 화면에서 선거비용 보전청구서(서식 43) HWPX를 자동 생성하는 기능을 완료하였습니다. 기존 회계보고서(22-1~22-4)와 동일한 "데이터 채움" UX로 제공되며, 보전 체크된 선거비용을 자금원 3분류(후보자자산/후원회기부금/정당의지원금)별로 집계하여 서식 43 청구액 표에 자동 채웁니다.

### 1.2 Key Metrics

| 항목 | 수치 |
|------|------|
| 설계 일치도(Match Rate) | 98% |
| 테스트 통과 | 582 passed |
| Lint 오류 | 0 |
| Build | 성공 |
| Gap 건수 | 2건(모두 문서 표기 불일치, 코드 수정 불필요) |
| 신규 파일 | 7개 |
| 변경 파일 | 4개 |

### 1.3 Value Delivered

| Perspective | Content |
|-------------|---------|
| **Problem** | 선거비용 보전청구서 작성 시 회계책임자가 보전 대상 선거비용을 자금원별로 손집계하고, 후보자명·관할선관위·수령계좌 등을 일일이 입력해야 하므로 누락·계산오류 리스크가 높았습니다. |
| **Solution** | 기존 `reimbursement-aggregator` 보전필터 규칙과 `funding-source`/`classifyExpenseCategory` SSOT를 재사용하여 신규 `reimbursement-claim-builder`를 구현했습니다. 서식 43의 자금원 3분류 표를 8개 셀 토큰으로 정의하고, 수령계좌 등 텍스트 항목은 organ prefill + 수동입력 하이브리드로 처리합니다. |
| **Function/UX Effect** | 제출서류 화면에서 서식 43을 22-1~22-4와 동일한 한 번의 클릭으로 다운로드 가능하게 되었습니다. 보전 체크된 선거비용 합계가 회계보고서 합계와 자동으로 정합되므로 검산 리스크가 제거됩니다. |
| **Core Value** | 선관위 제출용 HWPX 자동 생성 범위를 회계보고서 영역에서 보전·청구 서식으로 확장했습니다. 보전청구의 마지막 관문(자금원 분류·검산·수기입력)을 자동화함으로써 보전금 누락·반려 리스크를 제거하고 회계업무 효율성을 향상시킵니다. |

---

## PDCA Cycle Summary

### Plan

**Plan Document**: `docs/01-plan/features/reimbursement-claim-hwpx.plan.md`

- **목표**: 제출서류 화면에서 보전청구서 자동 생성 UX 추가, 자금원 3분류 집계 + 텍스트 토큰 채움
- **예상 범위**: 신규 빌더 + 한글금액 유틸 + API 라우트 + UI 하이브리드 통합
- **예상 기간**: 1일 (설계→구현→테스트 통합)
- **주요 선행 자산**:
  - `reimbursement-aggregator.ts` — 보전체크 필터 SSOT
  - `funding-source.ts` — 자금원 분류 SSOT
  - `election-expense-summary-builder.ts` — 22-2 고정셀 치환 패턴

### Design

**Design Document**: `docs/02-design/features/reimbursement-claim-hwpx.design.md`

- **핵심 설계 결정**:
  1. 자금원 3분류 집계 (정당의지원금 = 보조금+보조금외 통합) — 22-2와 축이 전치
  2. 옵션 A (사무소 전액, 연락소 빈칸) — `acc_book` 연락소 식별 컬럼 부재 대응
  3. 신규 빌더 (`reimbursement-claim-builder`) — `reimbursement-aggregator`는 Excel 경로 전용, 입력 형태·분류 기준 상이
  4. 한글 금액 유틸 신규 (`korean-amount.ts`) — "이천오백만원" 포맷
  5. 하이브리드 입력 UI — `dataFill` + 수동필드 동시 노출 (기존 회귀 없음)
- **타입 정의**:
  - `ClaimFundingBreakdown`: 후보자자산/후원회기부금/정당의지원금/합계
  - `ReimbursementClaimModel`: office + total (옵션 A로 일치)
  - 8개 셀 토큰: `{{후보자자산_사무소}}` 등, 표 4행×{사무소, 합계}
- **API**: `POST /api/hwpx/reimbursement-claim` (orgId + values)
- **보안**: org 멤버십 가드, escapeXml, no-store 캐시 정책

### Do

**구현 범위 및 산출물**:

#### 신규 파일

1. **`lib/accounting/korean-amount.ts`** (+ test)
   - `amountToKoreanWords(amount: number): string`
   - 25000000 → "이천오백만", 0 → "영", 만/억/조/경 단위 처리
   - 순수 함수, 외부 IO 의존 없음

2. **`lib/hwpx/reimbursement-claim-builder.ts`** (+ test, + integration.test)
   - `buildReimbursementClaimModel(rows, getName): ReimbursementClaimModel`
   - 4중 필터: `incm_sec_cd=2 ∧ acc_print_ok='Y' ∧ classifyExpenseCategory='선거비용' ∧ amt>0`
   - 자금원 분류 후 후보자자산/후원회기부금/정당의지원금(=보조금+보조금외) 합산
   - `claimTableTokens(model): Record<string, string>` — 8개 셀 토큰 생성
   - `claimTotalTokens(model): {숫자, 한글}` — 합계액 숫자+한글

3. **`app/api/hwpx/reimbursement-claim/route.ts`** (신규 API)
   - 요청: `{ orgId, values: {선거구명, 수령_금융기관, ...} }`
   - 처리: 인증 + 멤버십 가드 → 조회(acc_book, codevalue, organ) → 빌더 → 치환 → .hwpx 응답
   - 응답: 200 `application/hwp+zip`, Content-Disposition attachment

4. **`scripts/make-form-43-fill.py`** (신규)
   - `form-43.hwpx` section0의 청구내역 표 + 본문 텍스트 토큰화
   - 표 2행(사무소/합계 행별로 후보자자산/후원회기부금/정당의지원금/합계 열) → 8개 셀 토큰
   - 본문 9개 토큰: 선거명, 후보자명, 보전청구총액(숫자/한글), 수령/선관위명 등
   - 검증 assert: 토큰 개수 17, 예시값 잔존0, XML 태그 균형

5. **`public/hwpx-templates/form-43-fill.hwpx`** (신규 산출물)
   - `make-form-43-fill.py` 출력 산물
   - 표 8토큰 + 본문 9토큰, ZIP STORED mimetype

#### 변경 파일

1. **`lib/hwpx/form-fields.ts`**
   - `dataFill` 유니온: `"income-ledger" | "accounting-report" | "reimbursement"`
   - 서식 43 정의:
     ```typescript
     { id: "43", label: "선거비용 보전청구서", category: "보전·청구",
       template: "form-43-fill.hwpx", dataFill: "reimbursement",
       fields: [선거명(const), 선거구명(manual, required), 후보자명(organ, required), 
               수령_금융기관/예금주/계좌번호(manual), 선관위명(manual, required)] }
     ```

2. **`lib/hwpx/form-fields.test.ts`**
   - dataFill 예외 처리: "reimbursement" 추가 (필드 있음 허용, 표·본문 토큰 정합성 검증)

3. **`components/submission-forms/FormInputPanel.tsx`**
   - `DATA_FILL_ENDPOINT.reimbursement = "/api/hwpx/reimbursement-claim"`
   - `DATA_FILL_TEXT.reimbursement` 설명·버튼 텍스트 추가
   - 하이브리드 조건: `def.dataFill && def.fields.length > 0` → 입력폼 + 버튼 동시 노출
   - payload에 `values` 포함 (기존 income-ledger/accounting-report는 빈폼 → 회귀 없음)

4. **`next.config.ts`**
   - `outputFileTracingIncludes` 에 `/api/hwpx/reimbursement-claim` → `./public/hwpx-templates/**` 추가

5. **`_token-manifest.json`** (참조)
   - 서식 43 토큰 17개 등록: 표 8(`{{후보자자산_사무소}}` 등) + 본문 9

**구현 주요 특징**:

- **SSOT 공유**: `classifyFundingSource`, `classifyExpenseCategory`, `formatAmount` 재사용 → 22-1/22-2와 합계 정합 보장
- **순수 함수**: 빌더·한글금액 유틸은 DB/IO 의존 없음, 테스트 용이
- **하이브리드 UI**: 기존 회귀 없음, 서식 43만 선택적 수동입력 필드 노출
- **교차검증**: builder.test TC-6로 `정당의지원금 == 보조금+보조금외` 자동 검증

### Check

**Analysis Document**: `docs/03-analysis/reimbursement-claim-hwpx.analysis.md`

- **Match Rate**: 98% (≥90% 통과)
- **종합 점수**:
  - Design 일치: 99%
  - 아키텍처 준수: 100%
  - 컨벤션 준수: 100%

#### 검증 결과

| 항목 | Design 요구 | 구현 | 상태 |
|------|:----------:|:----:|:----:|
| FR-01 자금원 3분류 | `ClaimFundingBreakdown` 타입 | 구현 완료 | ✅ |
| FR-02 필터 규칙 | `incm=2 ∧ acc_print_ok='Y' ∧ 선거비용 ∧ amt>0` | 4중 필터 정확 일치 | ✅ |
| FR-03 텍스트 토큰 prefill | organ + values 하이브리드 | prefill + 수동입력 구현 | ✅ |
| FR-04 UI 노출 | FormInputPanel 분기 | `DATA_FILL_ENDPOINT` 추가 | ✅ |
| FR-05 보안 가드 | org 멤버십 + escapeXml | route 가드 + generateHwpx 내부 처리 | ✅ |
| FR-06 교차검증 | 22-2/aggregator 합계 일치 | builder.test TC-6 자동 검증 | ✅ |

#### 발견 Gap (2건, 모두 문서표기)

| Gap | Design | 구현 | 조치 |
|-----|--------|------|------|
| 함수명 | §2.2 의사코드 `totalAmountTokens` | 실제 export `claimTotalTokens` | ✅ design 정정 |
| fields 메타 | §5.3 "(source: manual)" 전체 표기 | `선거명`=const(자동), `후보자명`=organ(자동) + required | ✅ design 정정 |

모두 구현이 정답이며, design 문서 갱신으로 해소되었습니다.

#### 테스트

- **단위 테스트** (Vitest):
  - `korean-amount.test.ts`: 6 cases (만/억/조/경, 0→"영")
  - `reimbursement-claim-builder.test.ts`: 6 cases (필터, 자금원 분류, 옵션A, 교차검증)
  - `form-fields.test.ts`: dataFill="reimbursement" 예외 분기
- **통합 테스트**:
  - `reimbursement-claim-integration.test.ts`: 생성 .hwpx 잔여 토큰 0, ZIP mimetype, 한글 금액 정상
- **전체**: 582 passed, lint 0 errors, build 성공

---

## Results

### Completed Items

- ✅ 신규 빌더 `reimbursement-claim-builder.ts` + 단위/통합 테스트 (3 tests)
- ✅ 한글 금액 유틸 `korean-amount.ts` + 테스트 (6 cases)
- ✅ API 라우트 `POST /api/hwpx/reimbursement-claim` (인증, 멤버십 가드, org 조회, 변환)
- ✅ 템플릿 제작 스크립트 `make-form-43-fill.py` → `form-43-fill.hwpx` (8셀 + 9텍스트 토큰)
- ✅ form-fields 수정: dataFill 유니온 + 서식 43 정의 + 하이브리드 fields
- ✅ FormInputPanel 통합: `DATA_FILL_ENDPOINT`/`DATA_FILL_TEXT` + 수동입력 분기
- ✅ next.config 트레이싱: `outputFileTracingIncludes` 업데이트
- ✅ 설계 갱신: 함수명·필드 메타 정정 (gap-detector 권장사항 적용)
- ✅ 종합 테스트: 582 passed, lint 0, build 성공

### Incomplete/Deferred Items

- ⏸️ `app/VERSION` 0.9.0.0 bump — ship 단계 예정 (PDCA report 범위 외)
- ⏸️ `CHANGELOG.md` 업데이트 — ship 단계 예정
- ⏸️ 한글(Hancom) 수동 검수 — 범위 외 (개발 환경에서 수행, 실제 한글에서는 제출 전 필수)
- ⏸️ 비례대표 정당 보전청구서(서식 2 상당) — 별도 feature (서식 미보유)
- ⏸️ 부담비용 지급청구서(서식 44) HWPX 데이터 채움 — 후속 feature

---

## Lessons Learned

### What Went Well

1. **설계의 실측 기반 조정**: plan의 가정(자금원=열 4분류)을 design 단계에서 `form-43.hwpx` 실측 분석(자금원=행 3분류)으로 정정했고, 이를 신규 빌더에 정확히 반영해 구현 오류 제거.

2. **SSOT 재사용의 가치**: `funding-source`·`classifyExpenseCategory` 동일 SSOT 적용으로 회계보고서(22-1/22-2)와 보전청구액 자동 정합 → 교차검증 테스트로 보장. 신규 분류 로직 금지 원칙이 정확성을 높였습니다.

3. **순수 함수 설계**: 빌더·한글금액 유틸을 DB/IO 비의존 순수로 설계해 단위 테스트 작성·유지보수 용이. 입력 주입형으로 fixture 구성 간단.

4. **하이브리드 UI의 무변경 재사용**: `dataFill` + 수동필드 동시 노출 조건(`def.dataFill && def.fields.length > 0`)으로 기존 income-ledger/accounting-report(빈 필드)는 기존 동작 유지 → 회귀 리스크 제거.

5. **옵션 A(사무소 전액) 의사결정**: acc_book 연락소 컬럼 부재의 제약을 전략적으로 수용해 간단한 구현·명확한 의미의 UI 제공. 사용자 입장에서도 오류 여지 감소.

### Areas for Improvement

1. **템플릿 토큰화 자동화**: 현재 `make-form-43-fill.py`는 수동 실행. 향후 빌드 시점에 자동화하거나 CI 검증 추가 시 휴먼 오류 추가 제거 가능.

2. **텍스트 필드 메타의 설계 명시화**: plan/design에서 "const 또는 organ prefill"을 초반 명시하면 설계→구현 간 표기 불일치 감소. 현재는 코드 읽고 역추론 필요.

3. **환경별 테스트**: 현재 코드 레벨 테스트만 (단위/통합). 한글 Hancom에서의 실제 열람·인쇄 테스트는 개발 환경 제약으로 범위 외. 향후 CI/CD에 한글 렌더링 검증 추가 시 더 강화 가능.

4. **에러 메시지 세분화**: route의 에러 응답이 현재 일반적(TEMPLATE_MISSING, QUERY_FAILED). 자금원 분류 실패·빌더 단계 오류 등을 세분화하면 사용자·개발자 디버깅 용이.

### To Apply Next Time

1. **설계 단계에서 실물(템플릿) 먼저 분석**: 신규 HWPX 작업 시 form-43.hwpx처럼 실제 표 구조·축 방향을 초기 파악 후 plan 수립. 가정→현실 간극 최소화.

2. **SSOT 공유 원칙 강화**: 유사 기능(보전청구·부담비용청구·회계보고서) 추가 시 분류 로직을 절대 복제하지 말고, 공통 코드로 통합해 정합성 자동 보증.

3. **교차검증 테스트 필수화**: 관련 기능(22-1 vs 22-2, 22-2 vs 보전청구) 간 합계 일치를 CI/CD 테스트로 강제. 사람이 "맞다고 확인"보다 코드가 "같다고 증명".

4. **UI 설계에서 필드 메타 선정 기준 문서화**: const/organ/manual 각 필드의 선정 이유를 설계 단계에서 의사결정 표로 기록 → 구현자가 명확히 이해.

5. **템플릿 생성 스크립트 검증 assert 강화**: `make-form-*-fill.py` 형태는 재사용 가능하나, 새 서식마다 검증 항목(토큰 개수·예시값·태그 균형) 추가 → 버그 조기 발견.

---

## Next Steps

1. **ship 단계** (별도 PR/커밋):
   - [ ] `app/VERSION` 0.9.0.0 bump
   - [ ] `CHANGELOG.md` 추가: `## [0.9.0.0] - 2026-06-10` (선거비용 보전청구서 HWPX 데이터 채움)
   - [ ] Vercel 머지 → prod 배포

2. **한글 수동 검수** (ship 후, 선택):
   - [ ] Hancom에서 생성 .hwpx 열람
   - [ ] 표 레이아웃·토큰 위치 확인
   - [ ] 한글 금액 포맷("이천오백만원") 검증

3. **후속 feature** (별도 PDCA):
   - [ ] 비례대표 정당 보전청구서(서식 2 상당) — form-43 유사 패턴
   - [ ] 부담비용 지급청구서(서식 44) HWPX 데이터 채움

4. **통합 개선** (장기):
   - [ ] 보전 요건(득표율·설득력) 자동 판정 → 청구 가능 여부 검증 UI
   - [ ] 보전청구·부담비용청구를 워크플로우화(제출→승인→정산)

---

## Appendix

### 직전 유사 Feature와의 비교

| 측면 | election-expense-summary-hwpx (22-2) | reimbursement-claim-hwpx (서식 43) |
|------|:------------------------------------:|:-----------------------------------:|
| 집계 대상 | 모든 선거비용 | 보전 체크(**보전 필터**) 선거비용만 |
| 자금원 분류 | 4분류(후보자자산/후원회/보조금/보조금외) | 3분류(후보자자산/후원회/정당의지원금) |
| 표 구조 | 자금원=열, 사무소/연락소=행 | **자금원=행(전치), 사무소/연락소=열** |
| 셀 토큰 | 고정 15개(5열×3행) | 고정 **8개**(4행×2열) |
| 텍스트 입력 | 고정값(후보자명 등) prefill만 | **수동입력**(선거구명·수령계좌 등) + prefill |
| 한글 표시 | 없음 | **신규**: 보전청구총액 한글("이천오백만원") |
| UI 패턴 | `dataFill="accounting-report"` (분기) | **`dataFill="reimbursement"`**(신규 엔드포인트) |

### Token Manifest 예시 (form-43-fill.hwpx)

```json
{
  "form_43": {
    "표": [
      "{{후보자자산_사무소}}", "{{후원회기부금_사무소}}", "{{정당의지원금_사무소}}", "{{합계_사무소}}",
      "{{후보자자산_합계}}", "{{후원회기부금_합계}}", "{{정당의지원금_합계}}", "{{합계_합계}}"
    ],
    "본문": [
      "{{선거명}}", "{{선거구명}}", "{{후보자명}}",
      "{{보전청구총액_한글}}", "{{보전청구총액_숫자}}",
      "{{수령_금융기관}}", "{{수령_계좌번호}}", "{{수령_예금주}}", "{{선관위명}}"
    ],
    "합계": 17
  }
}
```

### 코드 품질 지표

```
├─ Unit Tests
│  ├─ korean-amount.test.ts: 6 passed (금액 변환·경계)
│  ├─ reimbursement-claim-builder.test.ts: 6 passed (필터·분류·합계)
│  └─ form-fields.test.ts: dataFill 예외 분기 통과
├─ Integration Tests
│  └─ reimbursement-claim-integration.test.ts: 3 passed
├─ Lint: 0 errors (ESLint v9 flat config)
├─ Build: ✅ Next.js 16 build 성공
└─ Total: 582 passed
```

### Architecture Diagram (최종)

```
FormInputPanel.tsx (Presentation)
  └─ DataFill Button (reimbursement + 수동필드)
      └─ POST /api/hwpx/reimbursement-claim (Infrastructure)
          ├─ Auth + Membership Guard
          ├─ Query: acc_book, codevalue, organ
          └─ buildReimbursementClaimModel (Domain)
              ├─ classifyFundingSource (SSOT reuse)
              ├─ classifyExpenseCategory (SSOT reuse)
              └─ amountToKoreanWords (Domain)
          └─ generateHwpx(form-43-fill.hwpx, tokens)
              └─ Response: .hwpx (attachment)
```

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-06-10 | PDCA 완료 (Plan→Design→Do→Check, Match Rate 98%) | DrunkenZealnut |

---

## Sign-off

- **PDCA Phase**: ✅ Complete
- **Match Rate**: 98% (✅ ≥90% passed)
- **Recommendation**: Ready for ship phase (VERSION/CHANGELOG bump) + Vercel merge
- **Scope**: Plan·Design·Do·Check 완료. Act(개선 반복) 불필요 (Gap 2건 모두 설계 문서 갱신으로 해소, 코드 수정 불필요).

