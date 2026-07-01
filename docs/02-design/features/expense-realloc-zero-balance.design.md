# Design — 지출 재분배 재설계: 계정×과목 최종잔액 0 + 지출일 스케줄링

- 기능: `expense-realloc-zero-balance`
- 단계: Design
- 작성일: 2026-07-01
- 유형: 후보자 회계 재배분(reallocation) SSOT 확장 (보고 시점, 원본 불변)
- 대체: `docs/01-plan/features/item-balance-pass3.plan.md`(수입 재태깅 Pass3만 다룸, 미구현). 본 설계가 **확성기 앵커(Pass-L)·지출일 스케줄링(Pass4)**을 더해 전체 재설계로 대체한다.
- 관련 메모: [[income-expense-item-allocation-persist]] · [[income-expense-book-funding-realloc]] · [[official-fund-data-income-classification]] · [[settlement-must-use-realloc-ssot]] · [[export-db-accbook-split-bak-raw]] · [[expense-page-bypasses-accbook-api]]

## Executive Summary

| 관점 | 내용 |
|------|------|
| **Problem** | 보고 시점 재배분(`buildLedgerRows` = Pass0→1→2) 후에도 후보자 (계정×과목) 수입·지출부에서 **최종잔액이 0이 아닌** 경우가 발생. Pass2의 시간순 FIFO 한계로, 지출을 충당할 수입이 그 지출보다 **늦게 들어오거나 다른 과목**으로 태깅돼 있으면 충당 실패 → 한 과목 음수·다른 과목 양수로 분열(실데이터: 후원회기부금 선거비용외 −5,007,485). 또 행별 **누계잔액이 음수**로 찍힘 |
| **Solution** | 검증된 Pass0→1→2 위에 신규 순수 패스 3개 추가 — **Pass-L**(확성기 540,000 → 후보자자산·선거비용 강제 앵커), **Pass3**(남은 (계정×과목) 불균형을 수입 재배정으로 최종 0), **Pass4**(지출일을 뒤로 이동해 행별 누계잔액 ≥ 0, 통째이동·무분할). 원본 acc_book 불변, 보고 시점 메모리만 |
| **Function/UX** | 모든 산출물(수입지출부 뷰어·HWPX 서식7/22-1/22-2/22-4·결산·자료백업 .db·reports Excel)에서 **모든 (계정×과목) 최종잔액 0 + 행별 누계 ≥ 0**. 정상 데이터(자금원 총액 0)에선 완전 균형, 총액≠0(누락지출)이면 0 강제 없이 경고 표면화 |
| **Core Value** | 선관위 제출 서식 정합(음수·비영 잔액 제거) + 원본 불변·합 보존 + 실제 잔여금/데이터 오류는 숨기지 않는 회계 정직성 + 확성기 자산부담 규칙 반영 |

## 1. 배경 / 문제

### 1.1 현상
후보자 수입·지출부는 (계정×과목)별 시트로 출력된다. 보고 시점 재배분(`buildLedgerRows`)을 거쳐도 특정 (계정×과목)의 **최종 누계잔액(= 누계수입 − 누계지출)이 0이 아니거나 음수**로 남는다. 음수 잔액은 "그 과목에서 받은 돈보다 더 썼다"는 뜻이라 회계상 성립하지 않으며, 선관위 제출 서식(HWPX 서식7 회계장부, 22-4 수입·지출부)에 그대로 노출되면 안 된다.

### 1.2 근본 원인 (조사 결과, 코드 확인 완료)
현행 SSOT `lib/accounting/ledger-allocation.ts` `buildLedgerRows`:
- **Pass0** (`adjust-negative-income`): 음수 수입 → 양수 지출 정규화.
- **Pass1** (`fund-realloc`): 자금원 **총액기준** 재배분. 부족 자금원의 부족분만 잉여 자금원으로 이동(지출만, 과목 불변, 시간 역순 통째이동, `protectIds` 지원). 통장 총잔액 ≥ 0이면 모든 자금원 최종잔액 ≥ 0.
- **Pass2** (`item-allocation` `allocateOneSource`): 자금원별 **시간순** 처리. 지출(과목 M) 충당 시 **그 시점에 이미 도착한 수입 슬라이스만** 다른 과목 풀에서 끌어옴(`drawFromPool`). 충당할 수입이 나중에 오면 그 지출은 원과목 유지 → **음수 표면화**.

두 가지가 최종잔액 ≠ 0의 원인:
1. **Pass2 시간 한계**: 지출보다 늦게 온 수입은 그 지출을 못 덮음 → (계정×과목) 분열. Pass2 이후 **최종 균형을 맞추는 패스가 없다.**
2. **누계 음수**: 최종잔액이 0이어도, 지출이 충당 수입보다 시간상 앞서면 **중간·최종 행의 누계잔액이 음수**로 찍힘. 이를 해소할 **날짜 조정 수단이 없었다.**

### 1.3 핵심 통찰 (설계의 뼈대)
**날짜 변경과 수입 재배정은 역할이 다르다.**
- **최종잔액 0**(버킷별 수입=지출)은 **날짜만으로는 수학적으로 불가능**하다 — 날짜는 "어느 (계정×과목) 버킷인지"를 바꾸지 않고 행 순서(누계)만 바꾼다. 최종 0은 **수입을 충당 지출의 (계정·과목)으로 배정**해야 성립.
- **날짜 변경**은 그 위에서 **각 행 누계잔액이 음수가 안 되게** 지출일을 뒤로 미는 별도 폴리시.

→ 완성형 = **[수입 (계정·과목) 배정 → 최종 0] + [지출 날짜 스케줄링 → 누계 ≥ 0]**.

## 2. 목표 / 비목표

### 2.1 목표
- 후보자 모든 (계정×과목) 수입·지출부 **최종잔액 0** + **행별 누계잔액 ≥ 0**.
- 확성기(540,000) → 후보자자산·선거비용 강제(앵커).
- 원본 acc_book 불변(보고 시점 메모리만), 자금원별 수입합·지출합·통장 총잔액 불변.
- **지출 과목·금액 최대 보존**(날짜 이동으로 분할 회피), 실제 잔여금·진짜 부족은 은폐하지 않음.
- SSOT 한 곳(`buildLedgerRows`) 수정으로 6개 산출물 자동 일관.

### 2.2 비목표
- 원본 acc_book 수정(영구화) — 안 함.
- **지출 과목** 변경 — 안 함(확성기만 예외). 지출 금액도 Pass1 자금원이동 외 추가 분할 안 함.
- 비후보자(후원회 1/2 인코딩) 처리 — 후보자(82~85)만.
- 총액≠0(진짜 부족/잉여)을 0으로 강제 — 안 함(경고 표면화).
- **수입 날짜** 변경 — 안 함(지출일만 이동).

## 3. 확정 결정 (사용자 승인 2026-07-01)

- **D1 (잔액0 방식)**: **지출 과목만 불변**(확성기 예외). 수입은 (계정·과목) 자유 배정(보고용 충당 라벨) → 모든 (계정×과목) 최종잔액 0. *(수입 과목 고정 시 과목별 총수입≠총지출이면 0이 수학적으로 불가함을 실데이터로 확인 후 확정)*
- **D2 (확성기)**: `incm_sec_cd=2` ∧ `content`에 '확성기' 포함 ∧ `acc_amt===540000` → `acc_sec_cd=84`·`item_sec_cd=86` 강제 + 재배분 이동 제외(앵커). 원 과목이 87이어도 86으로 교정.
- **D3 (날짜·분할)**: 지출일은 **뒤로만** 이동, **선거주기(회계기간 acc-period) 내** 제한, **통째 날짜이동을 분할보다 우선**(분할 최소), 비고에 `원거래일 YYYY-MM-DD` 표기.
- **D4 (총액≠0)**: 자금원 총액 ≠ 0이면 **0 강제 안 함** — 누락지출/데이터미완 신호로 경고 표면화(은폐 금지). 데이터 보완돼 총액 0이 되면 자동 0.

## 4. 설계

### 4.1 파이프라인 (`buildLedgerRows` 확장)

```
Pass0  adjustNegativeIncome      (기존) 음수수입 → 양수지출
Pass-L applyLoudspeakerAnchor    (신규) 확성기 → (84,86) 강제 + protectId 수집
Pass1  reallocateFundSources     (기존) 지출 계정 재배분(과목 불변), opts.protectIds=확성기
Pass2  allocateIncomeToItems     (기존) 수입 과목 시간순 best-effort 배정
Pass3  zeroItemBalances          (신규) 남은 (계정×과목) 불균형 → 수입 재배정으로 최종 0
Pass4  scheduleExpenseDates      (신규) 지출일 뒤로 이동 → 행별 누계잔액 ≥ 0
return Pass4
```

Pass2를 유지하는 이유: Pass2의 시간 인지 배정이 수입↔지출을 **시간상 가깝게** 매칭 → Pass4의 날짜 이동량을 최소화한다. Pass3는 Pass2가 못 맞춘 나머지만 시간무관하게 마무리한다.

### 4.2 Pass-L `applyLoudspeakerAnchor` (신규, 순수)
- 입력: Pass0 출력 행.
- 규칙: `incm_sec_cd===2 && (content ?? "").includes("확성기") && acc_amt===540000` 인 행 → `acc_sec_cd=84`, `item_sec_cd=86`으로 덮어씀. 그 `acc_book_id`를 `protectIds:Set<number>`에 수집.
- 출력: `{ rows, protectIds }`. `buildLedgerRows`가 `reallocateFundSources(rows, { protectIds })`로 넘김(옵션 기존 지원 확인됨 — `ReallocOptions.protectIds`).
- 효과: 확성기는 Pass1에서 84 밖으로 안 나감. 원 과목 87→86 교정은 지출과목 불변(I4)의 **명시적 예외**(D2).
- 상수: 식별 조건은 `lib/accounting/loudspeaker.ts`(신규)에 `LOUDSPEAKER_AMOUNT=540000`, `LOUDSPEAKER_KEYWORD="확성기"`로 분리(테스트·조정 용이).

### 4.3 Pass3 `zeroItemBalances` (신규, 순수)
- 입력: Pass2 출력(`ItemAllocOutRow[]`, 자금원·과목 확정 + 수입 슬라이스).
- 자금원(`sheetAccSecCd`)별 그룹. 각 그룹:
  1. 과목별 순잔액 `net(M) = Σ수입 effectiveAmt(M) − Σ지출 effectiveAmt(M)` 계산(환급=음수 지출은 지출합을 낮춤).
  2. `groupTotal = Σ net(M)`. **`groupTotal ≠ 0`이면 skip + 경고**(D4) — `shortfall-surface`/`detectCandidateShortfalls` 체계로 표면화(잉여도 경고 대상 확장).
  3. `groupTotal === 0`이면: 음수 과목 M(부족 D=−net)·양수 과목 N(잉여 net) 목록화. **과목코드 오름차순**으로 M을 순회하며, 양수 과목 N(오름차순)의 **수입 슬라이스**에서 D만큼을 과목 M으로 재배정(`effectiveItemSecCd` N→M). 슬라이스 일부만 필요하면 기존 `item-allocation` 관례로 분할(spread 복제 + 신규 id + note).
  4. 결과: 모든 net(M)=0.
- 불변식: 지출 과목·금액 불변(수입 슬라이스만 재태깅), 자금원 수입합·지출합·통장 총잔액 불변.

### 4.4 Pass4 `scheduleExpenseDates` (신규, 순수) — 핵심
각 (계정×과목) 시트에서 지출일을 뒤로 밀어 누계 음수를 제거한다. Pass3로 시트 총액=0(수입합=지출합)이 보장되므로 **통째이동만으로 무분할 해결** 가능.

**알고리즘 (시트 = (sheetAccSecCd, effectiveItemSecCd)별 독립):**
1. 시트 행을 수입/양수지출/기타(환급·0)로 분류. 환급·0 지출은 원 날짜 유지(누계를 낮추지 않음).
2. 수입 이벤트를 날짜순 누적 → `cumIncome(date)` 프리픽스합.
3. 양수 지출을 `compareAccDateTime`(동시각 수입먼저 → acc_book_id) 순으로 처리, `scheduledExpenseTotal` 누적:
   - 각 지출(금액 a, 원 날짜 d): `threshold = scheduledExpenseTotal + a`.
   - `d* = cumIncome(date) ≥ threshold 인 최소 수입이벤트 날짜`.
   - `scheduledDate = max(d, d*)` (**뒤로만**).
   - `acc_date = scheduledDate`; `scheduledDate ≠ d`면 `원거래일 YYYY-MM-DD` 비고 기록. `scheduledExpenseTotal += a`.
4. 결과: 모든 행에서 누계잔액 ≥ 0.

**정당성**: 시트 총 수입=총 지출이므로 마지막 지출도 마지막 수입일에 정확히 덮인다 → `d* ≤ 마지막 수입일 ≤ 기간말` → **항상 기간 내**. `d`·`d*` 모두 비감소라 `scheduledDate` 비감소(순서 보존, 재정렬 없음). 통째이동이라 **분할 0**.

**예 (85×선거비용외, 총액 0):**
| 원 | 날짜 | 구분 | 금액 | 원 누계 |
|---|---|---|--:|--:|
| 지출 5,007,485 | 05-01 | 지출 | −5,007,485 | **−5,007,485 ❌** |
| 수입 5,007,485 | 06-20 | 수입 | +5,007,485 | 0 |

Pass4 후: `06-20 수입 +5,007,485`(누계 +5,007,485) → `06-20 지출 −5,007,485`(누계 **0 ✓**), 지출 비고 `원거래일 2026-05-01`.

**총액≠0(D4) 시**: Pass3가 skip한 자금원은 시트 총액≠0이라 Pass4가 완전 0을 못 만듦 → best-effort(가능한 만큼만 뒤로 이동) + 부족 경고 유지. 은폐 금지.

### 4.5 불변식 / 원본 보존
- **I1** 합 보존: 자금원별 수입합·지출합, 통장 총잔액 불변(모든 신규 패스는 라벨/날짜/분할만 변경).
- **I2** (계정×과목) 무음수: Pass3+Pass4 후 정상 데이터는 최종 0·누계 ≥ 0.
- **I4** 지출 과목·금액 불변: **확성기(Pass-L)만 예외**. Pass3는 수입만, Pass4는 날짜만.
- **후보자 한정**: `buildAdjustedAccBook`/`buildLedgerRows`가 이미 자금원 82~85 존재 시만 재배분(비후보자 무변경).

### 4.6 날짜 전파 (구현 유의)
- 현행 `persist-allocation.ts`(`planAllocationPersist`)는 slice0/이동분 생성 시 `...rawRow` spread로 메타를 넘기며 `incm/acc/item/amt`만 덮고 **`acc_date`는 미전파**(원본 날짜 유지). Pass4의 이동 날짜를 .db·뷰어에 반영하려면 **`acc_date`(및 원거래일 비고)를 LedgerRow → updates/inserts로 전파**해야 한다.
- `LedgerRow`에 이동 날짜(`acc_date`)와 `note`(원거래일)를 이미 실을 수 있음. `planAllocationPersist`에서 `primary.acc_date`/`s.acc_date`로 덮고, 비고 병합 로직 추가.

### 4.7 export 비대칭 (유지 — [[export-db-accbook-split-bak-raw]])
- `ACC_BOOK`(재조정·분할) = **이동된 날짜**로 export.
- `ACC_BOOK_BAK`(원본 변경이력) = **원 날짜** 그대로(분할 미적용).
- → 감사추적(원 거래일)이 BAK에 자동 보존. `export-split-contract.test.ts` 계약 유지.

## 5. 영향 산출물 (전부 회귀 테스트)

`buildLedgerRows` 경유 소비처(grep 확인):
1. 수입·지출부 뷰어 — `dashboard/income-expense-book/page.tsx` (`buildAdjustedAccBook`)
2. HWPX 서식7 / 22-4 — `api/hwpx/income-ledger` (`buildLedgerRows` 직접)
3. 회계보고서 22-1/22-2 — `income-expense-report-summary.ts` → `accounting-report` (`allocateCandidateLedgerRows`)
4. 결산 — `settlement-summary.ts` (`buildSettlementSummary`)
5. 자료백업 .db — `api/system/export-sqlite` (`buildAdjustedAccBook` → `persist-allocation`)
6. reports Excel — `reports/page.tsx` (`buildAdjustedAccBook`), expense 페이지 per-source 카드 (`FundingAllocationPanel`)

## 6. 엣지 케이스
- 확성기 다건/540,000 동일금액 오탐 → 키워드 AND 금액 동시 조건으로 좁힘(D2). 향후 오탐 시 거래 직접지정(대안)으로 확장 여지.
- 확성기를 84로 강제해 84가 부족 자금원이 되면 → Pass1이 84의 **다른(비보호) 지출**을 잉여로 이동(확성기는 protect).
- 환급(음수 지출, [[negative-refund-rows-in-aggregation]]): Pass3 순잔액은 `acc_amt` 부호 반영, Pass4는 이동 대상에서 제외(원 날짜 유지).
- 총액≠0 자금원: Pass3 skip → Pass4 best-effort + 경고(D4).
- 수입이 한 건도 없는 (계정×과목) 시트(지출만): Pass3가 총액0 자금원 내에서 타 과목 수입을 끌어와 채움. 자금원 총액≠0이면 경고.
- Pass4가 여러 지출을 같은 수입일로 몰 때: 동시각 정렬 tie-break(수입먼저→acc_book_id)로 결정적, 누계 ≥ 0 유지.
- 다대다(음수 과목·양수 과목 복수): 과목코드 오름차순 결정적 매칭.

## 7. 테스트 계획
- **신규** `loudspeaker.test.ts`: 키워드+금액 매칭, (84,86) 강제·protectId, 원과목 87→86, 오탐 비매칭(키워드만/금액만).
- **신규** `item-balance-zero.test.ts`(Pass3): 총액0 → 모든 과목 0(오준석 85 케이스: 86 +5,139,985 / 87 −5,007,485 → 둘 다 0), 총액≠0 → skip+경고, 다대다 결정성, 합 보존.
- **신규** `schedule-expense-dates.test.ts`(Pass4): 지출<수입 시각역전 → 날짜이동 후 누계 ≥ 0·무분할·기간내·원거래일 비고, 통째이동 우선(부분충당 회피), 환급 원날짜 유지, 비감소 순서.
- **통합** `ledger-allocation.test.ts`: Pass0~4 end-to-end 균형(최종0+누계≥0), 기존 L7/L8(지출과목/금액 불변) 유지.
- **parity** `adjusted-ledger-parity.test.ts`: 뷰어==export(.db) 날짜·채번 일치. `export-split-contract.test.ts`(ACC_BOOK 분할 날짜 ↔ BAK 원날짜).
- **회귀**: `settlement-summary`·`income-expense-report-summary`·`item-allocation`·`fund-realloc` 통과. `balance`(수입−지출) 불변 → 결산 잔액검증 무영향.

## 8. 구현 항목 (writing-plans에서 세분)
1. `lib/accounting/loudspeaker.ts`(신규) — 상수 + `applyLoudspeakerAnchor`.
2. `lib/accounting/item-balance-zero.ts`(신규) — `zeroItemBalances`(Pass3).
3. `lib/accounting/schedule-expense-dates.ts`(신규) — `scheduleExpenseDates`(Pass4).
4. `lib/accounting/ledger-allocation.ts` — `buildLedgerRows`에 Pass-L/3/4 배선, `LedgerRow`에 이동날짜/원거래일 note.
5. `lib/accounting/persist-allocation.ts` — `acc_date`·원거래일 비고 전파(4.6).
6. 신규/회귀 테스트(7절).
7. `app/VERSION` feature MINOR bump + `CHANGELOG.md`([[release-version-ssot]]).
8. 실데이터(오준석후보) 수동 QA: 뷰어·HWPX 서식7·.db에서 모든 (계정×과목) 최종0·누계≥0, 총액≠0 자금원 경고 확인.

## 9. 리스크
- **회계/법적 민감성**: 수입 (계정·과목) 재배정·지출일 이동은 선관위 제출 서식에 반영 → 회계 정당성(돈의 대체가능성·공식 PFund2 재조정 관행) 근거 유지. 지출 과목·금액은 불변(확성기 예외만 명시).
- **데이터 미완 은폐**: 총액≠0을 0으로 강제하면 누락지출이 가려짐 → 총액0일 때만 완전 0, 아니면 경고(D4) 고수.
- **SSOT 광범위 전파**: `buildLedgerRows` 한 곳 수정이 6개 산출물에 전파 → parity/회귀 필수.
- **날짜 이동 부작용**: 채번(`receipt-no`)은 (계정×과목) prefix라 날짜 무관(무해). export 정렬(`fillExportSortNumbers`)은 이동 날짜로 재정렬 — 정상. Windows 프로그램은 기간 내 날짜 수용.
- **expense 페이지 직접쓰기**([[expense-page-bypasses-accbook-api]]): 재배분은 **읽기(집계)** 경로라 무관하나, per-source 카드가 `buildAdjustedAccBook` 경유이므로 자동 반영. 원본 입력 가드와 독립.

## 10. 롤아웃
- 보고 시점 순수 함수 추가(스키마 마이그레이션 없음, 원본 불변) → additive·reversible.
- VERSION feature MINOR bump, CHANGELOG.
- 실데이터 수동 QA 후 배포(main 머지 → Vercel 자동).
