# 시분초(acc_time) 전면 제거 Design Document

> **Summary**: `app/scripts/019_drop_acc_time.sql` 스펙대로 acc_time을 코드·타입·문서에서 제거한다. 인벤토리 확정: 비-테스트 사용 ~25파일 + 테스트 13파일. **3개 안전 축**으로 설계 — ① `compareAccDateTime`은 `acc_time?` 옵셔널이라 호출부 6곳이 **컴파일 안 깨짐**(같은 날 tie-break를 `incm(수입먼저)→acc_book_id`로 일임), ② 입력 UI의 acc_time은 **저장 payload에 없는 죽은 폼 상태**라 제거해도 저장 무영향, ③ **export-sqlite의 acc_time strip은 DB 컬럼(019 DROP) 적용 전까지 반드시 유지**(먼저 지우면 `SELECT *`로 새는 acc_time이 .db INSERT를 깨뜨림). 따라서 **코드 제거 → 배포 → 019 적용 → strip 정리**의 단계 순서가 핵심.
>
> **Project**: PoliticalFundAccountingManagement
> **Version**: 0.19.1.0 → 0.20.0.0 예정
> **Author**: Claude · **Date**: 2026-06-22 · **Status**: Draft
> **Planning Doc**: [acc-time-removal.plan.md](../../01-plan/features/acc-time-removal.plan.md)

---

## 1. 핵심 설계 결정 (조사로 확정)

| 항목 | 조사 결과 | 결정 |
|------|-----------|------|
| `compareAccDateTime` 시그니처 | `AccDateTimeRow.acc_time?`는 옵셔널. 비-테스트 호출부 6곳 전부 객체째 암묵 전달 → 필드 제거해도 **타입 에러 0** | `AccDateTimeRow`를 `{acc_date}`로 축소, 본문 2차 키(L33-36)·`fillExportSortNumbers`의 `dt()` acc_time(L56) 제거. 같은 날 tie-break는 호출부의 `incm→id`가 담당 |
| 입력 UI acc_time | 「거래 시각」 위젯·라벨은 **이미 제거됨**(grep 0). 폼 상태/타입만 잔존, **저장 payload에 미포함**(저장 무영향) | 폼 상태·인터페이스 필드·`fmtTimeInput` import/호출 제거 |
| `fmtTimeInput`/`toAccTime` | `toAccTime` 호출 0(죽음). `fmtTimeInput`은 expense/income 폼 채움 2곳만 | 둘 다 제거 + `date-utils.test.ts`의 해당 테스트 제거. `fmtAccDate`는 보존 |
| `types/database.ts` | "generated" 표식 없음 = 수기 관리. acc_book.Row L171, acc_book_bak.Row L211 | 직접 편집해 acc_time 제거(Insert/Update는 Row 파생이라 자동 전파) |
| `.order("acc_time")` | HWPX 2라우트(income-ledger L128, accounting-report L151)뿐 | `.order("acc_sort_num",{nullsFirst:true}).order("acc_book_id")`로 대체 + select에서 acc_time 제거. 빌더 인메모리 재정렬이 최종 순서 보장 |
| **export-sqlite strip** | `APP_ONLY_ACC_BOOK_COLUMNS`에 `"acc_time"`(문자열 리터럴). DB 컬럼 살아있는 한 `SELECT *`로 새어 .db INSERT를 깨뜨림 | **019(DROP) 적용 전까지 유지.** strip 제거·normalize 테스트 정리는 019 이후 단계로 분리 |
| `funding-balance-asof` as-of | L52 `row.acc_time <= asOfTime`는 단순 통과 아닌 **시점 잔액 비교 로직** | acc_time 제거 시 날짜 단위 as-of로 단순화(같은 날 전부 포함), 테스트 L45-46 갱신 |

---

## 2. Architecture — 단계 순서 (배포 안전의 핵심)

```
Phase 1 (코드 PR, v0.20.0.0) — 앱에서 acc_time 제거, strip은 유지
  ├ 입력 UI(expense/income/document-register): 폼상태·필드·fmtTimeInput 제거
  ├ lib: acc-book-sort(compareAccDateTime 축소)·fund-realloc·ledger-allocation·
  │      persist-allocation·funding-balance-asof·income-expense-report-summary·adjusted-ledger
  ├ types/database.ts: acc_book·acc_book_bak Row의 acc_time 제거
  ├ 산출물: HWPX 2라우트(select·order 대체)·income-ledger-builder·excel income-expense-book·reports
  ├ date-utils: fmtTimeInput·toAccTime 제거
  ├ 테스트: acc_time 픽스처/단언 갱신(정렬·as-of·strip 제외)
  └ 유지: export-sqlite strip(route.ts:468) + normalize.test (019 전까지 필수)
        │
        ▼ 머지 → Vercel 프로덕션 배포 → 정상 확인
Phase 2 (DB) — 019_drop_acc_time.sql 적용 (Supabase SQL 에디터, IF EXISTS)
        │
        ▼ acc_book/acc_book_bak에서 acc_time 컬럼 DROP
Phase 3 (정리, 선택·후속 PR) — 019 적용 후
  └ export-sqlite strip의 "acc_time" 항목 + normalize.test의 acc_time 단언 제거(이제 no-op)
```

> **왜 strip을 Phase 1에 안 지우나**: Supabase에 acc_time 컬럼이 남은 채 strip을 먼저 제거하면, export `fetchTable`의 `SELECT *`가 acc_time을 실어 `insertRows`가 .db ACC_BOOK(컬럼 없음)에 INSERT 시도 → "table ACC_BOOK has no column named acc_time"로 export 전체 abort(CLAUDE.md 알려진 함정). 컬럼 DROP(019) 이후엔 acc_time이 안 새므로 strip이 no-op이 되어 안전하게 제거 가능.

---

## 3. 파일별 변경 명세 (Phase 1)

### 3.1 입력 UI (저장 무영향 — 죽은 폼 상태)
- `expense/page.tsx`: L23 `fmtTimeInput` import 제거 · L38/61 인터페이스 `acc_time` 필드 제거 · L101/282 폼 초기값 `acc_time:""` 제거 · L312 편집 채움 제거.
- `income/page.tsx`: L21 import · L32 필드 · L70/166 초기값 · L190 편집 채움 제거.
- `document-register/page.tsx`: L34 필드 · L120 초기값 제거.

### 3.2 lib
- `acc-book-sort.ts`: `AccDateTimeRow`를 `{ acc_date: string }`로 축소(L14-17), `compareAccDateTime` 본문 2차 키 제거(L33-36 → acc_date 비교만), `fillExportSortNumbers`의 `dt()`에서 acc_time 제거(L56). docstring(L4-10,42-47) 정정.
- `fund-realloc.ts`: `ReallocRow.acc_time` 필드 제거(L31). L88 `compareAccDateTime(a,b)` 호출 불변(객체 구조 변경만).
- `ledger-allocation.ts`: 인터페이스 필드(L24)·passthrough(L73) 제거.
- `persist-allocation.ts`: 인터페이스 필드(L24)·passthrough(L92) 제거.
- `funding-balance-asof.ts`: `AsOfRow.acc_time`(L17)·`DraftExpense.acc_time`(L26) 제거. L52 비교를 날짜 단위 as-of로 단순화(`row.acc_time <= asOfTime` 제거, 같은 날 포함). L82 `asOfTime` 전달 제거.
- `income-expense-report-summary.ts`: 필드(L33)·passthrough(L96) 제거.
- `adjusted-ledger.ts`: passthrough(L30) 제거.

### 3.3 types/database.ts
- L171 `acc_book.Row.acc_time` · L211 `acc_book_bak.Row.acc_time` 제거.

### 3.4 산출물(HWPX/Excel/reports)
- `hwpx/income-ledger/route.ts`: select(L121)에서 acc_time 제거 · `.order("acc_time")`(L128) → `.order("acc_sort_num",{nullsFirst:true}).order("acc_book_id")` · passthrough(L163) 제거.
- `hwpx/accounting-report/route.ts`: select(L144)·order(L151)·인라인 타입(L167) 동일 처리.
- `hwpx/income-ledger-builder.ts`: 인터페이스 필드(L56) 제거. L190 호출 불변.
- `excel-template/income-expense-book.ts`: 인터페이스 필드(L33) 제거. L209 호출 불변.
- `reports/page.tsx`: 인터페이스(L31)·passthrough(L160) 제거. L633 호출 불변.

### 3.5 date-utils
- `fmtTimeInput`(L13-18)·`toAccTime`(L21-25) 제거. `date-utils.test.ts`의 두 함수 테스트 제거, `fmtAccDate` 테스트 보존.

### 3.6 테스트 갱신
- 픽스처에서 `acc_time` 키 제거: fund-realloc·persist-allocation·adjusted-ledger·income-expense-report-summary·item-allocation·ledger-allocation·candidate-gate.
- **동작 단언 갱신**: `acc-book-sort.test.ts`(acc_time 정렬 단언 → acc_date+tie-break로 재작성), `income-ledger-builder.test.ts:155-160`(같은 날 정렬은 incm→id로), `funding-balance-asof.test.ts:45-46`(시각별 → 날짜별 as-of).
- **유지(Phase 1)**: `normalize.test.ts` acc_time strip 단언, `adjusted-ledger-parity.test.ts`(이미 acc_time 미사용 전제).

---

## 4. Error Handling / 불변
| 상황 | 처리 |
|------|------|
| 저장 회귀 | 입력 UI acc_time은 payload에 없음 → 저장 동작 불변(검증 완료) |
| export 깨짐 | strip을 019 전까지 유지 → .db INSERT 안전 |
| 같은 날 정렬 역전 | tie-break `incm(수입먼저)→acc_book_id` 유지 → 누계 음수 방지·화면==.db 불변 |
| 산출물 수치 변동 | acc_amt 합계 무관(정렬만), 회귀 테스트로 고정 |
| as-of 잔액 미세 변동 | 날짜 단위로 단순화(같은 날 전부 포함) — 의도된 단순화, 테스트 갱신 |

---

## 5. Test Plan
| Type | Target | Tool |
|------|--------|------|
| Regression | 전 vitest 통과(acc_time 픽스처/정렬/as-of 단언 갱신 후) | Vitest |
| Unit | `compareAccDateTime` acc_date-only + 호출부 tie-break(incm→id) 정렬 | Vitest |
| Unit | `funding-balance-asof` 날짜 단위 as-of 잔액 | Vitest |
| Parity | 수입·지출부 화면 == export rcp_no(acc_time 제거 후에도 유지) | Vitest(기존 parity) |
| Regression | HWPX 서식7/22-4·Excel 수입지출부 같은 날 정렬 보존 | Vitest(income-ledger-builder) |
| Static | `grep -rn acc_time app/src`(export-sqlite strip·normalize 제외) = 0 | grep |
| Build | tsc·eslint·next build clean | CI |

핵심 TC:
- [ ] TC-1 같은 날 거래(수입+지출) → 수입 먼저·id 순(acc_time 없이) 정렬 유지.
- [ ] TC-2 입력 UI acc_time 제거 후 저장/편집 정상(payload 불변).
- [ ] TC-3 export-sqlite 회귀(strip 유지 → .db 정상, 0 FK orphan).
- [ ] TC-4 HWPX/Excel 같은 날 순서 보존.
- [ ] TC-5 grep acc_time = 0(strip/normalize 의도적 잔존 제외).

---

## 6. Clean Architecture
| Component | Layer | 처리 |
|-----------|-------|------|
| `compareAccDateTime`/`fillExportSortNumbers` | Domain(정렬 SSOT) | acc_time 키 제거, acc_date+호출부 tie-break |
| 입력 UI·reports | Presentation | 죽은 폼 상태/필드 제거 |
| HWPX/Excel/export 라우트 | Infra | select·order 대체, strip은 019까지 유지 |
| 마이그레이션 | Schema | 019(DROP) Phase 2, 014 폐기 주석 |

---

## 7. Implementation Guide (순서)
1. [ ] `date-utils`·입력 UI 3곳(죽은 잔재, 최저위험)부터 제거.
2. [ ] lib passthrough(ledger-allocation·persist-allocation·adjusted-ledger·income-expense-report-summary)·인터페이스 필드 제거.
3. [ ] `acc-book-sort` `compareAccDateTime` 축소 + `funding-balance-asof` as-of 단순화(핫스팟) + 관련 테스트 갱신.
4. [ ] `types/database.ts` Row acc_time 제거 → tsc로 잔여 의존 전수 탐지.
5. [ ] HWPX 2라우트 select·order 대체 + 산출물 테스트.
6. [ ] `grep acc_time` 0 확인(strip/normalize 제외) → 전 vitest·eslint·tsc·build → `/pdca analyze`.
7. [ ] 출하(0.20.0.0) → 배포·정상 확인 → **019 적용** → (후속) strip 정리.

---

## 8. Out of Scope
- `acc_sort_num`·`acc_date` 유지 · 잔액/집계 수치 변경(없음) · 아카이브 문서(`acc-time-input/*`) 보존 · CLAUDE.md/05-reference 정정은 포함하되 산출물 로직 변경 아님 · Phase 3 strip 정리는 019 적용 후.

---

## Version History
| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-06-22 | 초안 — 파일별 제거 명세 + 3안전축(compareAccDateTime 옵셔널·UI 죽은상태·strip 단계분리) + 코드→배포→019→strip정리 순서 | Claude |
