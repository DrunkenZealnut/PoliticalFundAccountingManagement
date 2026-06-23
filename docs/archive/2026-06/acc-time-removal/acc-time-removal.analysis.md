# 시분초(acc_time) 전면 제거 — Gap 분석 (Check)

> **Feature**: `acc-time-removal` · **Date**: 2026-06-22 · **Phase**: Check · **Status**: ✅ PASS (≥90%)
> **Plan**: [acc-time-removal.plan.md](../01-plan/features/acc-time-removal.plan.md) · **Design**: [acc-time-removal.design.md](../02-design/features/acc-time-removal.design.md)

---

## 종합 점수

| 항목 | 점수 | 상태 |
|------|:---:|:---:|
| 설계 일치(FR/결정/OoS) | 99% | ✅ |
| 단계 순서 준수(§2) | 100% | ✅ |
| 문서 정합 | 100% | ✅ |
| **종합 Match Rate** | **99%** | ✅ |

> gap-detector 초기 97% → P2 Gap(014 SQL 폐기 주석) 즉시 보완 → 99%.

구현: 33파일 +81/-241 (vs main). 검증: 전체 **794/794 통과**, 신규 tsc 에러 0(잔존 2건 main 선행), eslint 에러 0.

---

## 1. FR별 매칭

| FR | 항목 | 판정 | 근거 |
|----|------|:----:|------|
| FR-01 | 입력 UI 3곳 acc_time·fmtTimeInput 제거 | ✅ | expense/income/document-register grep 0. 저장 payload 영향 0(죽은 폼 상태) |
| FR-02 | 명시 Supabase select/order/payload 제거 | ✅ | HWPX 2라우트 `.order("acc_time")` → `acc_date→acc_sort_num→acc_book_id`. 명시 select acc_time 0 |
| FR-03 | lib·types·HWPX·Excel·reports 제거 | ✅ | lib/accounting 전체 0(`compareAccDateTime` acc_date 단독, as-of 날짜단위 단순화), types/database.ts 0, 산출물 0 |
| FR-04 | 같은 날 정렬·채번 보존(acc_date→incm→id) | ✅ | acc-book-sort tie-break 유지, 794/794 통과 |
| FR-05 | 문서(CLAUDE.md·05-reference) 정정 | ✅ | CLAUDE.md L44/46/133, 주의사항·자금원배정방식 |
| FR-06 | 014 폐기 표시 + 019 절차 문서화 | ✅ | 014 헤더 SUPERSEDED 주석 추가 + CLAUDE.md L46 + 019 "코드 배포 후 적용" |

## 2. 설계 결정/Out of Scope 준수

| 항목 | 판정 |
|------|:----:|
| §1 `compareAccDateTime` acc_date 단독 + `AccDateTimeRow` acc_time 제거 | ✅ |
| §1 `fmtTimeInput`/`toAccTime` 제거 | ✅ |
| §1 `types/database.ts` 직접 편집 | ✅ |
| §2 **export-sqlite strip "acc_time" 의도적 유지**(019 전 필수) | ✅ 설계 의도 (Gap 아님) |
| §2 normalize.test strip 단언 유지 | ✅ |
| §8 acc_sort_num·acc_date 유지, 아카이브 문서 보존 | ✅ |

## 3. Gap

### P0/P1 — 없음
모든 코드 제거 항목 구현, 정렬·채번·산출물 회귀 0.

### P2 — 해소됨
- **014 SQL 폐기 주석**: 초기 누락(plan §2.1 In Scope) → 본 Check에서 `014_add_acc_time.sql` 헤더에 `⚠️ SUPERSEDED by 019` 주석 추가로 해소.

### 핵심 판정 — strip 유지는 정확한 구현
`route.ts:468` strip의 `"acc_time"` + normalize.test 단언 유지는 **미구현이 아니라 설계 §2 단계 순서**다. DB에 컬럼이 살아있는 한 `SELECT *` leak이 `.db` INSERT를 abort시키므로 strip은 019 DROP 후 Phase 3에서 제거.

---

## 4. 남은 단계 (설계대로)
1. **Phase 2**: 출하(v0.20.0.0) → 배포·정상 확인 → `019_drop_acc_time.sql` Supabase 적용.
2. **Phase 3**(후속): 019 적용 후 strip의 acc_time 항목 + normalize.test 단언 제거(이 시점 no-op).

→ Match Rate 99% (≥90%) → `/pdca report acc-time-removal` 진행 가능.

---

## Version History
| Version | Date | Changes |
|---------|------|---------|
| 0.1 | 2026-06-22 | Check — Match Rate 97%→99%(014 주석 보완), Phase 1 코드 제거 전 항목 충족, strip 단계 유지 정확 |
