# 시분초(거래 시각 acc_time) 전면 제거 (acc-time-removal) Planning Document

> **Summary**: 거래 시각(`acc_time`, HHmm)을 더 이상 쓰지 않기로 한 결정에 따라 코드·문서·스키마에서 `acc_time`을 **전면 제거**한다. 제거 대상·방식은 이미 작성된 `app/scripts/019_drop_acc_time.sql`이 권위 스펙으로 정의한다(입력 UI 제거 + 모든 Supabase select/order/payload에서 제거 + 같은 날 정렬은 `compareAccDateTime(acc_date)+incm 우선+acc_sort_num`이 담당). 현재 `acc-time-input`(v0.7.0.0) feature가 추가한 acc_time이 **31개 코드 파일·115곳**에 남아 있고, 019(DROP COLUMN)는 "**코드 제거 배포 후** 적용" 대기 상태다. 최근 프로덕션 사고(수입지출부 조회 실패 `column acc_book.acc_time does not exist`, v0.19.1.0 핫픽스)가 이 미완 정리의 위험을 표면화했다.
>
> **Project**: PoliticalFundAccountingManagement
> **Version**: 0.19.1.0 → (feature) 0.20.0.0 예정
> **Author**: Claude · **Date**: 2026-06-22 · **Status**: Draft
> **Related**: 권위 스펙 `app/scripts/019_drop_acc_time.sql`. 역(逆) feature 아카이브 `docs/archive/2026-06/acc-time-input/`. 정렬 SSOT `lib/accounting/acc-book-sort.ts`(`compareAccDateTime`). 메모 [[acc-time-deprecated-not-in-prod]], [[parity-test-must-exercise-divergence-condition]].

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | acc_time(거래 시각)은 쓰지 않기로 결정됐고 DROP 마이그레이션(019)까지 작성됐으나, **코드 정리가 미완**(31파일·115곳)이라 acc_time 잔재가 휴면 상태로 남아 있다. 입력 UI 3곳은 「거래 시각」을 받지만 **저장되지 않아** 사용자를 오도하고, 명시적 Supabase select에 acc_time을 넣으면 컬럼 부재로 페이지가 깨진다(실제 프로덕션 사고 발생). CLAUDE.md·참조문서도 acc_time을 라이브처럼 잘못 기술한다. |
| **Solution** | 019 스펙대로 acc_time을 전면 제거한다 — 입력 UI 필드(expense/income/document-register), 모든 Supabase select/order/payload, lib(acc-book-sort·fund-realloc·ledger-allocation·persist-allocation·funding-balance-asof·income-expense-report-summary·adjusted-ledger), types/database.ts, HWPX·Excel·reports, 관련 테스트, date-utils의 시각 헬퍼, 문서(CLAUDE.md·05-reference). 코드 배포 후 019(DROP COLUMN)를 적용한다. |
| **Function/UX Effect** | 입력 화면에서 동작하지 않던 「거래 시각」 필드가 사라져 혼란 제거. 같은 날 거래 정렬·영수증 채번은 `acc_date → incm(수입 먼저) → acc_book_id`로 동일하게 유지(잔액 음수 방지·화면==.db 정합 불변). 목록·Excel·HWPX·SQLite 산출물 수치/순서 무변경(회귀 0 목표). |
| **Core Value** | "결정과 코드의 불일치"를 해소해 **숨은 프로덕션 지뢰(명시 select 시 즉시 깨짐)를 제거**하고, 스키마·코드·문서를 단일 진실로 정렬한다. additive 제거라 산출물 호환성은 그대로. |

---

## 1. Overview

### 1.1 배경 (조사 결과)
- **acc-time-input**(v0.7.0.0, #61): `acc_time CHAR(4)` 컬럼 + 입력 UI + 정렬 키 + 헬퍼를 추가한 완료 feature(아카이브됨).
- **결정 반전**: 이후 시분초 미사용으로 결정 → `019_drop_acc_time.sql` 작성. 019가 제거 범위·방식을 명시("입력 UI 제거 / 모든 select·order·insert·update·backup 페이로드에서 제거 / 같은 날 정렬은 compareAccDateTime(acc_date)+incm+acc_sort_num / export는 원래 strip / **코드 제거 배포 후** DROP 적용").
- **현 상태**: 코드 정리 미완(31파일·115곳 acc_time 잔존). 프로덕션 acc_book에 acc_time 컬럼 없음([[acc-time-deprecated-not-in-prod]]). `api/acc-book`는 acc_time을 쓰지 않아 저장은 안 깨졌으나, v0.19.0.0이 뷰어 select에 acc_time을 넣어 조회가 깨졌고 v0.19.1.0로 그 한 곳만 핫픽스함.

### 1.2 안전성 전제
- `api/acc-book`에 acc_time 쓰기 없음 → 저장 경로 무영향(이미 검증).
- export(.db)는 `stripAppOnlyAccBookColumns`로 acc_time 제외 → 산출물 무변경.
- 같은 날 정렬 tie-break는 acc_time 없이 `incm_sec_cd`(수입 먼저)+`acc_book_id`로 충분(잔액 음수 방지 SSOT 유지).

---

## 2. Scope

### 2.1 In Scope (019 스펙 기준)
- [ ] **입력 UI 제거**: `expense`·`income`·`document-register` 페이지의 「거래 시각」 입력 필드 + `acc_time` 폼 상태 + `fmtTimeInput` 사용 제거.
- [ ] **Supabase 경로 제거**: 모든 `.select("...acc_time...")`·`.order("acc_time")`·insert/update/backup 페이로드에서 acc_time 제거(blast: 잔여 명시 select 점검).
- [ ] **lib 정리**: `acc-book-sort`(compareAccDateTime의 acc_time 2차 키 처리 결정), `fund-realloc`·`ledger-allocation`·`persist-allocation`·`funding-balance-asof`·`income-expense-report-summary`·`adjusted-ledger`의 acc_time 필드/통과 제거.
- [ ] **types/database.ts**: acc_book·acc_book_bak Row에서 `acc_time` 제거.
- [ ] **산출물 경로**: HWPX(`income-ledger`·`accounting-report` 라우트·`income-ledger-builder`), Excel(`income-expense-book.ts`), `reports/page.tsx`의 acc_time 제거.
- [ ] **헬퍼**: `date-utils`의 `fmtTimeInput`/`toAccTime`(acc_time 전용) 제거(타 사용처 없음 확인 후).
- [ ] **테스트**: acc_time 참조 테스트 갱신(acc-book-sort·fund-realloc·persist-allocation·adjusted-ledger·income-ledger-builder·funding-balance-asof·date-utils 등).
- [ ] **문서**: CLAUDE.md(acc_time 광범위 기술)·`docs/05-reference/자금원배정방식.md`·`정치자금_수입지출부_생성_주의사항.md` 정정.
- [ ] **마이그레이션**: `014` 폐기 주석(superseded by 019), **코드 배포 후 `019` 적용**(DROP COLUMN).

### 2.2 Out of Scope
- `acc_sort_num`(export 정렬번호)·`acc_date` — 유지(acc_time과 별개).
- 잔액/집계 수치 변경 — 없음(정렬 tie-break만 acc_time→incm/id).
- 아카이브 문서(`docs/archive/.../acc-time-input/*`) — 역사 기록이라 보존.

### 2.3 결정 필요 (Design)
1. **`compareAccDateTime` 시그니처**: acc_time 파라미터를 완전히 제거할지(모든 호출부 수정) vs 받되 무시할지. (권장: 제거 — 죽은 인터페이스 남기지 않음. `AccDateTimeRow.acc_time` 삭제.)
2. **배포 순서**: 코드 제거 PR 머지·배포 → 프로덕션 정상 확인 → 019 DROP 적용. (019 주석 지침 준수. 단 프로덕션엔 이미 컬럼 부재 가능성 — 적용은 idempotent `IF EXISTS`라 안전.)
3. **types/database.ts**가 실제 Supabase 스키마 생성본인지(수기 관리인지) 확인 후 제거 방식 결정.

---

## 3. Requirements

### 3.1 Functional Requirements
| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | 입력 UI 3곳에서 「거래 시각」 필드·acc_time 상태·fmtTimeInput 제거 | High | Pending |
| FR-02 | 모든 명시적 Supabase select/order/payload에서 acc_time 제거(잔여 점검) | High | Pending |
| FR-03 | lib·types·HWPX·Excel·reports에서 acc_time 제거(통과 경로 포함) | High | Pending |
| FR-04 | 같은 날 정렬·영수증 채번 동작 보존(acc_date→incm→id) — 회귀 테스트 통과 | High | Pending |
| FR-05 | 문서(CLAUDE.md·05-reference) acc_time 기술 정정 | Medium | Pending |
| FR-06 | 014 폐기 표시 + 019(DROP) 적용 절차 문서화(코드 배포 후) | Medium | Pending |

### 3.2 Non-Functional
| Category | Criteria | Measurement |
|----------|----------|-------------|
| 회귀 안전 | 전 vitest 통과(acc_time 테스트 갱신 포함) | vitest |
| 산출물 불변 | 목록·Excel·HWPX·.db 수치·순서 무변경 | 교차 확인 |
| 빌드/타입 | tsc·eslint·next build clean | CI |
| 배포 안전 | 코드 배포 후 019 적용, idempotent | 절차 |

---

## 4. Success Criteria
- [ ] `grep -rn acc_time app/src`(아카이브 제외) = 0건
- [ ] 입력 3페이지에 「거래 시각」 필드 없음
- [ ] 전 vitest·eslint·tsc·build clean
- [ ] 같은 날 거래 정렬·채번·산출물 회귀 0
- [ ] 019 적용 절차 문서화(코드 배포 후)

---

## 5. Risks and Mitigation
| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| 광범위 제거(31파일)로 정렬/채번 미세 회귀 | High | Med | acc_date→incm→id tie-break 보존, parity/누계 회귀 테스트, 단계적 PR |
| `compareAccDateTime` 시그니처 변경이 다수 호출부 파급 | Med | High | Design에서 호출부 인벤토리 후 일괄 수정, 타입으로 누락 차단 |
| types/database.ts 제거가 다른 acc_book 소비처 타입 깨뜨림 | Med | Med | tsc 전수 + 컬럼 의존 코드 동시 정리 |
| 019를 코드 배포 전 적용 → 명시 select 잔존 시 깨짐 | High | Low | 순서 엄수(코드 배포·정상 확인 후 DROP), 잔여 명시 select 0 검증 |

---

## 6. Architecture Considerations
신규 로직 없음 — **제거 리팩터링**. 정렬 SSOT는 `compareAccDateTime`을 acc_date 단독으로 축소(또는 acc_time 키 제거)하고, 같은 날 tie-break는 호출부의 `incm_sec_cd`(수입 먼저)+`acc_book_id`가 담당(기존과 동일). export `fillExportSortNumbers`는 acc_time 입력이 없어져도 `compareAccDateTime`+incm+id로 동작 불변. 마이그레이션은 019(작성 완료)를 코드 배포 후 적용.

---

## 7. Next Steps
1. [ ] Design — 제거 순서(입력 UI→Supabase→lib/types→산출물→문서→마이그레이션), `compareAccDateTime` 시그니처 결정, 호출부 인벤토리, 회귀 테스트 계획.
2. [ ] 구현(단계적) → `/pdca analyze` → 출하(0.20.0.0) → **배포 후 019 적용**.

---

## Version History
| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-06-22 | 초안 — 019 스펙 기반 acc_time 전면 제거. acc-time-input(v0.7.0.0) 역작업, 코드 정리 미완(31파일·115곳) 완료가 목표. 프로덕션 사고(v0.19.1.0 핫픽스)가 동인 | Claude |
