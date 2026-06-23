# Gap 분석 — receipt-no-income-expense-dedup (Check)

> 분석일: 2026-06-23 · 기준(spec): `docs/01-plan/features/receipt-no-income-expense-dedup.plan.md` §3·§4·§5·§6
> 구현: `app/src/lib/accounting/receipt-no.ts` · 진행: Plan → Do(설계 doc 생략) → **Check**

## Match Rate: **100%**

| 분류 | 점수 | 상태 |
|---|:---:|:---:|
| 변경 방향 일치 (§3) | 100% | ✅ |
| 수용 기준 (§5, 6항목) | 100% | ✅ |
| 비범위 준수 (§6) | 100% | ✅ |
| 테스트 커버리지 | 100% | ✅ |
| **종합** | **100%** | ✅ |

## 특별 점검 결과

| # | 점검 항목 | 판정 | 근거 |
|---|---|:---:|---|
| 1 | incm 분리 → 통합 단일 스코프 | ✅ | `receipt-no.ts:185-217` `byIncm` 그룹핑 제거, 단일 `existing`/`comboSeq`. TC-3이 통합 rcp_no2 `[1,2,3]` 검증 |
| 2 | 접두사 = 현재 `formatKey` 기준 보존/채번 | ✅ | `:193` `rcpNoPrefix(cur) === formatKey(toReceiptTarget(r))` 보존, 불일치+rcp_yn=Y → 재채번(`:197`) |
| 3 | strip 후에도 이동조각 식별(접두사 비교) | ✅ | `route.ts:772` strip(alloc_src_id 제거) **후** `:768` 채번 → 추적컬럼 없이 접두사 비교가 유일 식별수단. TC-10 검증 |
| 4 | §5 수용 기준 6항목 | ✅ | 아래 표. "수기번호 불변"은 **이동 안 한** 번호 한정(D-1=A 귀결) |
| 5 | 비범위(Pass1/2·batch_receipt·DB write) | ✅ | `fillExportReceiptNumbers`는 소비만, 순수 함수, 시그니처 불변 |

## 수용 기준 충족 상세 (§5)

| 기준 | 결과 | 근거 |
|---|:---:|---|
| 중복 0건 | ✅ 20→0 | 실데이터 org11 + TC-3/9/10 |
| stale 접두사 0건 | ✅ 5→0 | `:193` 보존판정 + TC-10 |
| 이동 안 한 수기번호 불변 | ✅ | 접두사 정합분 `existing` 보존(`:194`) |
| rcp_no2 고유·정렬 | ✅ | `assignReceiptNumbers:106-112` globalMax 이어서 |
| 화면 == .db | ✅ | `adjusted-ledger-parity.test.ts` 두 경로 완전 일치 |
| 테스트·lint·build | ✅ | 794 pass · lint 0 · build OK |

## 핵심 판정 — "수기번호 불변" vs 이동조각 3건 재채번

재배분으로 **계정이 완전히 바뀐 지출 3건**(인형탈 `후(비)-16`→`자(비)-28`, 선본조끼 `후(비)-17`→`자(비)-29`, 전기요금 `자(비)-2`→`후(비)-27`)의 재채번은 **갭이 아니라 Plan §4 D-1=(A) 채택의 의도된 귀결**이다.

- §5 "불변"은 §3.1-1이 정의한 **"이동 안 한 수기번호"** 로 한정.
- 이동조각은 §3.1-2 **채번 대상** + §5 "stale 0" 충족을 위해 **반드시** 현재 계정 접두사로 재채번.
- 두 기준(불변 vs stale 0)의 stale 조각 충돌을 D-1=A가 명시적으로 해소.

## Gap 목록

**🔴 Missing / 🟡 Added / 🔵 Changed: 없음.** Plan §3.2 영향 범위와 구현 1:1 일치.

권고적 관찰(severity Low, 갭 아님):
1. ~~`plan.md §5-3` "불변" 문구가 무조건적으로 읽힐 여지~~ → **반영 완료**(§5-3에 D-1=A 단서 추가).
2. 실데이터(org11 73→85행, 20→0) 자동 회귀 부재 — parity/TC 축소 픽스처가 로직을 가드하므로 저위험. 향후 필요 시 익명화 고정 픽스처 회귀 추가 고려.

## 결론

Match Rate 100% — `/pdca report` 또는 `/ship` 진행 가능. 추가 iterate 불필요.
