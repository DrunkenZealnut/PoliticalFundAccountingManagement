# 설계 — 선거비용 보전청구서(서식 43) 청구내역 표 축 전치 수정

> Plan: `docs/01-plan/features/reimbursement-claim-table-transpose-fix.plan.md`
> 상태: Design · 2026-06-11

## 1. 목표 표 구조 (확정)

사용자 확정 + Excel(`reimbursement-claim-form.ts`) 기준. **행=장소, 열=자금원 4개 + 합계**.

```
colAddr →   0          1          2            3        4         5      6
          ┌─────────┬──────────────────────────────────────────┬──────┬──────┐
rowAddr 0 │ 구 분    │            청  구  액 (span 4×1)          │ 합계 │ 비고 │   ← 합계·비고는 row0 span 1×2
   (hdr)  │ (1×2)   ├──────────┬──────────┬────────┬───────────┤(1×2) │(1×2) │
rowAddr 1 │          │후보자자산 │후원회기부금│ 보조금 │ 보조금외  │      │      │
          ├─────────┼──────────┼──────────┼────────┼───────────┼──────┼──────┤
rowAddr 2 │선거사무소 │{{사무소_  │{{사무소_  │{{사무소_│{{사무소_  │{{사무소│      │
          │          │후보자자산}}│후원회기부금}}│보조금}}│보조금외}}│_합계}}│      │
rowAddr 3 │○○선거연락소│ (빈칸·수기)                                          │
rowAddr 4 │○○선거연락소│ (빈칸·수기)                                          │
rowAddr 5 │○○선거연락소│ (빈칸·수기)                                          │
rowAddr 6 │○○선거연락소│ (빈칸·수기)                                          │
          ├─────────┼──────────┼──────────┼────────┼───────────┼──────┼──────┤
rowAddr 7 │합  계    │{{합계_    │{{합계_    │{{합계_  │{{합계_    │{{합계 │      │
          │          │후보자자산}}│후원회기부금}}│보조금}}│보조금외}}│_합계}}│      │
          └─────────┴──────────┴──────────┴────────┴───────────┴──────┴──────┘
```

- 표 차원: `colCnt=7`, `rowCnt=8` (현재 8×6에서 변경)
- 헤더 병합: row0 `구분`(1×2 세로병합), `청구액`(4×1 가로병합, col1~4), `합계`(1×2), `비고`(1×2)
- 옵션 A 유지: 전액 `선거사무소` 행 집계 → `선거사무소 행 == 합계 행`(연락소 0), 연락소 4행 빈칸 수기

### 토큰 (표 10개)
`사무소_후보자자산`, `사무소_후원회기부금`, `사무소_보조금`, `사무소_보조금외`, `사무소_합계`
`합계_후보자자산`, `합계_후원회기부금`, `합계_보조금`, `합계_보조금외`, `합계_합계`

### 본문 토큰 (현행 유지, 9개)
`선거명`, `선거구명`, `후보자명`, `보전청구총액_한글`, `보전청구총액_숫자`, `수령_금융기관`, `수령_예금주`, `수령_계좌번호`, `선관위명`

## 2. 집계 SSOT 전환

### 폐기
`reimbursement-claim-builder.ts`의 3분류 `buildReimbursementClaimModel`/`ClaimFundingBreakdown`/`claimTableTokens`(정당의지원금 흡수) — 전치·3분류 모두 잘못.

### 신규/재사용
`reimbursement-aggregator.ts`의 `aggregateReimbursementByFundingSource`(4분류 `ClaimAmounts`) **재사용** — Excel `claim-form/aggregate`와 동일 SSOT.

**거동 변화 2건 (의도된 정합):**
1. **선거비용 판별**: 구 빌더는 `classifyExpenseCategory(getName(item))` 내부 판별 → aggregator는 `electionExpenseItemCds`(호출자가 `cv_name==="선거비용"` 계산) 입력. Excel route와 동일.
2. **기타 자금원 처리**: 구 빌더는 기타→정당의지원금 흡수(합계 포함). aggregator는 **`source==="기타"` 제외**(합계 미포함). 공식 양식엔 기타 열이 없으므로 Excel과 동일하게 **드롭**. → 구 HWPX보다 보전청구 총액이 줄 수 있으나, **Excel·공식 기준에 부합**(의도).

### 신규 토큰 빌더 (reimbursement-claim-builder.ts 재작성)
```ts
// 입력: aggregator의 ClaimAmounts (사무소=합계, 옵션 A)
export function claimTableTokens(a: ClaimAmounts): Record<string,string> {
  const cols = ["후보자자산","후원회기부금","보조금","보조금외","합계"] as const;
  const out: Record<string,string> = {};
  for (const c of cols) {
    out[`사무소_${c}`] = formatAmount(a[c]);
    out[`합계_${c}`]   = formatAmount(a[c]); // 옵션 A: 동일
  }
  return out;
}
export function claimTotalTokens(a: ClaimAmounts): Record<string,string> {
  return { 보전청구총액_한글: toKoreanAmount(a.합계), 보전청구총액_숫자: formatAmount(a.합계) };
}
```
- 선거비용 판별·보전 필터는 aggregator가 담당 → 빌더는 토큰 매핑만(순수). `classifyExpenseCategory` 의존 제거.

## 3. 라우트 (`api/hwpx/reimbursement-claim/route.ts`)

변경 최소화 — 인증/멤버십/응답 골격 유지. 데이터 조립부만:
```ts
// codevalue → electionExpenseItemCds(cv_name==="선거비용") + accSecCdNames  (Excel route와 동일 로직)
// acc_book(incm=2) 조회 → aggregateReimbursementByFundingSource(...) → byFundingSource(ClaimAmounts)
const a = result.byFundingSource;
const tokens = { ...claimTableTokens(a), ...claimTotalTokens(a), ...textTokens };
const { bytes } = await generateHwpx(template, tokens);
```
- `TEMPLATE = "form-43-fill.hwpx"` 유지(재생성된 동명 파일)
- 본문 텍스트 토큰 화이트리스트/길이제한/organ fallback 현행 유지

## 4. 템플릿 재생성 (`make-form-43-fill.py` 전면 재작성) — **최대 난관**

현 `form-43.hwpx` 표는 8×6 전치 구조라 토큰 치환으로 축을 못 바꾼다. **표 OWPML을 새 7×8 구조로 재구성**해야 한다.

### 전략 결정 (do 단계 시작 시 확정 필요)

| 전략 | 방법 | 장점 | 단점/리스크 |
|---|---|---|---|
| **A. 프로그램 재구성** (권장 기본) | 현 표에서 셀 스타일 템플릿(헤더셀/라벨셀/금액셀) 추출 → 7×8 표 OWPML 조립(cellAddr·cellSz·cellSpan·linesegarray 재계산) | 자기완결·재현가능·CI 검증 | OWPML 수작업, **한글 렌더 육안검증 불가**(구조 asserts만), 열폭 cellSz 시행착오 |
| **B. 올바른 베이스 .hwpx 확보** | 사용자가 한글에서 축 교정한 form-43 베이스 제공 → 단순 토큰화 | 렌더 정확성 보장 | 사용자 작업 의존, 외부 파일 신뢰 |

**기본안 A** 채택하되, do 단계에서 표 조립 PoC를 먼저 만들어 한글에서 1회 육안확인. 실패 시 B로 폴백. (이 결정은 `/pdca do` 첫 작업에서 AskUserQuestion으로 확정)

### 전략 A 상세
1. **셀 스타일 추출**: 현 표에서 (a) 헤더셀(`borderFillIDRef`, `paraPrIDRef`, `charPrIDRef` 굵게/중앙), (b) 라벨셀(좌측), (c) 금액셀(우측정렬) XML 골격을 1개씩 확보.
2. **열폭(cellSz width)**: 구분(넓게) + 후보자자산/후원회기부금/보조금/보조금외(균등) + 합계 + 비고. 현 표 총폭 보존하도록 배분. `linesegarray`의 `horzsize`도 열폭에 맞춤(텍스트셀 토큰화 시 `</hp:run>` 이중닫힘 주의 — [[hwpx-form-generator]]).
3. **셀 조립**: rowAddr 0~7 × colAddr 0~6. 헤더 병합 `cellSpan`(구분 1×2, 청구액 4×1, 합계 1×2, 비고 1×2). 데이터 행에 토큰 삽입, 연락소 4행 빈칸.
4. **표 속성**: `<hp:tbl rowCnt="8" colCnt="7" ...>`로 갱신.
5. **서명란 표(2번째 hp:tbl) 미변경**.
6. **본문 텍스트 토큰화**: 현행 `TEXT_REPLACEMENTS` 유지(선거명/선거구명/후보자명/보전청구총액/수령계좌/선관위명). 단 헤더 라벨이 청구액=장소→자금원으로 바뀌므로 예시값 잔존 검증 목록 갱신.

### 검증 (make script asserts)
- 표 토큰 10개 + 본문 토큰 9개 전부 존재
- 예시값 잔존 0 (`15,000,000`/`10,000,000`/`25,000,000`/`○○은행`/`123-34-56789`/`이천오백만`)
- `<hp:tbl` 2개 유지(청구내역+서명란)
- XML 태그 균형(hp:tbl/tr/tc/p/run open-self==close)
- **신규**: colCnt=7, rowCnt=8 단언; 헤더 라벨 "후보자자산"·"후원회기부금"·"보조금"·"보조금외"가 **열 헤더**(row1)에 위치

## 5. 테스트

| 파일 | 변경 |
|---|---|
| `reimbursement-claim-builder.test.ts` | 재작성 — 4분류 토큰(사무소_*/합계_* 10개), 기타 자금원 드롭, 옵션 A(사무소==합계) |
| `reimbursement-claim-integration.test.ts` | 갱신 — 새 토큰 계약, 템플릿 토큰 잔존 0 |
| **교차 정합(신규/보강)** | 동일 입력에서 HWPX `claimTableTokens` 합계 == Excel `aggregateReimbursementByFundingSource` 결과 — 동일 aggregator라 자동, 명시적 단언 추가 |
| `make-form-43-fill.py` | 검증부 갱신(위 §4) — 단, py는 CI 테스트 아님(수동 실행 산출물) |

## 6. 영향/비영향

- **무변경(정답 기준)**: `reimbursement-claim-form.ts`(Excel), `claim-form/aggregate` route, `reimbursement-aggregator.ts`, `funding-source.ts`
- **form-fields.ts**: 서식 43 `dataFill="reimbursement"`·`fields`(본문 토큰) 유지 — 표 토큰은 빌더가 주입하므로 레지스트리 무관. 확인만.
- **form-43.hwpx(원본 전치본)**: 재생성 베이스로만 사용(셀 스타일 추출), 산출물은 form-43-fill.hwpx 덮어씀.
- **next.config outputFileTracingIncludes**: form-43-fill.hwpx 이미 포함 — 경로 동일이라 무변경.

## 7. 구현 순서 (do)

1. **(결정)** 템플릿 전략 A/B 확정 (AskUserQuestion)
2. 빌더 재작성 + 단위 테스트 (TDD) — aggregator 재사용, 새 토큰
3. 라우트 조립부 교체 (electionExpenseItemCds 계산 + aggregator)
4. make-form-43-fill.py 재작성 → form-43-fill.hwpx 재생성
5. 통합 테스트 + 교차 정합 테스트
6. 한글에서 생성물 1회 육안확인(수동 QA) — 표 축·4열·합계 정합
7. lint 0 / build / 전체 테스트

## 8. 검증 기준 (Plan Acceptance 재확인)

1. 표 행=장소(선거사무소/연락소/합계), 열=자금원(후보자자산/후원회기부금/보조금/보조금외/합계) ✔ §1
2. 자금원 4열 분리, 정당의지원금 표기 제거 ✔ §2
3. HWPX 합계 == Excel 합계(aggregator SSOT) ✔ §5 교차정합
4. 옵션 A: 사무소 행==합계 행, 연락소 빈칸 ✔ §1,§2
5. 본문 토큰·예시값 잔존 0·well-formed(STORED) ✔ §4 검증
6. 테스트 통과 + lint 0 + build ✔ §7

## 9. 리스크 요약

- **R1 (높음)**: OWPML 표 재구성 — 육안검증 불가 영역. 완화: 구조 asserts + 한글 1회 수동확인 + 전략 B 폴백.
- **R2 (중)**: 기타 자금원 드롭으로 구 HWPX 대비 총액 변동 — 의도된 변경(Excel 정합), 릴리스 노트 명시.
- **R3 (낮음)**: 옵션 A 연락소 미분리 — 현행 정책 유지(acc_book 연락소 컬럼 부재), 수기 빈칸.
