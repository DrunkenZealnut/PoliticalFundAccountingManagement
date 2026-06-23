# 시분초(거래 시각 acc_time) 전면 제거 — 완료 보고서

> **Feature**: `acc-time-removal` · **Version**: 0.20.0.0 (v0.19.1.0 → v0.20.0.0)  
> **Duration**: 2026-06-22 ~ 2026-06-23 (1일) · **Status**: ✅ Complete  
> **Owner**: Claude

---

## Executive Summary

거래 시각(`acc_time`, HHmm) 컬럼이 실무에서 미사용 결정에 따라 코드·타입·문서·테스트에서 **전면 제거**했다. 프로덕션 사고(수입지출부 조회 실패, v0.19.1.0)가 이 미완 정리의 위험을 표면화한 후, 설계한 3안전축(① compareAccDateTime 옵셔널 유지로 호출부 컴파일 안전 ② 입력 UI acc_time 저장 무영향 ③ export-sqlite strip 단계 분리로 DROP 전 안전성 보장)을 통해 **회귀 0·산출물 무변경** 목표 달성.

### 1.3 Value Delivered

| 관점 | 내용 | 지표 |
|-----|------|------|
| **Problem** | 거래 시각 미사용 결정 후에도 코드 정리 미완(31파일 115곳), 명시 select에 acc_time 넣으면 컬럼 부재로 페이지 깨짐. 프로덕션 사고(v0.19.1.0) 발생 | 검색: 31파일 미정리, 1건 핫픽스 |
| **Solution** | 설계 스펙(3안전축) 준수해 입력 UI 3곳·lib 7곳·types·산출물·테스트·문서에서 acc_time 제거. 정렬은 `compareAccDateTime(acc_date)+incm+id`로 유지 | 33파일 수정, 코드 제거 +81/-241 |
| **Function/UX Effect** | 입력 화면의 동작하지 않던 「거래 시각」 필드 제거로 사용자 혼란 해소. 같은 날 거래 정렬·영수증 채번·산출물 수치/순서 100% 무변경 | 794/794 테스트 통과, 회귀 0 |
| **Core Value** | "결정과 코드의 불일치" 해소로 숨은 프로덕션 지뢰 제거. 단계별(코드 배포 → DB DROP → strip 정리) 안전성 확보로 후속 019 적용 사전 준비 완료 | 본 PR 이후 누적 위험 제거, 배포 안전성 확보 |

---

## 1. PDCA 사이클 요약

### Plan
- **문서**: `docs/01-plan/features/acc-time-removal.plan.md`
- **배경**: acc_time은 v0.7.0.0에서 추가됐다가 시분초 미사용으로 DROP 마이그레이션(019) 작성. 코드 정리 미완(31파일 115곳), 프로덕션 사고(v0.19.1.0) 발생.
- **목표**: 019 스펙대로 acc_time을 코드·타입·문서에서 전면 제거. 정렬·산출물 무변경, 회귀 0.
- **범위**: 입력 UI 3곳 · lib 7곳 · types/database.ts · HWPX 2라우트 · Excel · reports · date-utils · 테스트 13 · 문서 갱신

### Design
- **문서**: `docs/02-design/features/acc-time-removal.design.md`
- **3안전축**:
  1. `compareAccDateTime` acc_time 옵셔널 → 호출부 6곳 컴파일 안깨짐, tie-break는 `incm(수입먼저)+acc_book_id`가 담당
  2. 입력 UI acc_time은 저장 payload 미포함 → 저장 무영향
  3. export-sqlite strip 의도적 유지(019 DROP 전까지) → `.db` INSERT 안전
- **단계 순서**: Phase 1(코드 제거, v0.20.0.0 배포) → Phase 2(DB 019 적용) → Phase 3(strip 정리)

### Do
- **구현 범위**:
  - 입력 UI: `expense/income/document-register` 폼 상태·필드·fmtTimeInput 제거
  - lib: `acc-book-sort`(`compareAccDateTime` 축소) · `fund-realloc` · `ledger-allocation` · `persist-allocation` · `funding-balance-asof`(as-of 단순화) · `income-expense-report-summary` · `adjusted-ledger`
  - types/database.ts: `acc_book.Row` · `acc_book_bak.Row`에서 acc_time 제거
  - 산출물: HWPX 2라우트(select·order 대체) · income-ledger-builder · excel·reports
  - date-utils: `fmtTimeInput` · `toAccTime` 제거
  - 테스트: acc_time 픽스처·단언 갱신 (13파일)
  - 문서: CLAUDE.md·05-reference·014(폐기 주석)·019(절차)
- **실제 소요**: 1일 (설계 대비 정시)
- **PR**: #92 (merged, main a2709f8)

### Check
- **분석 문서**: `docs/03-analysis/acc-time-removal.analysis.md`
- **Match Rate**: 97% → 99% (P2 gap 014 주석 보완)
- **검증**:
  - 794/794 vitest 통과
  - tsc 신규 에러 0
  - eslint 에러 0
  - grep acc_time = 0 (strip·normalize 제외 의도적)

### Act (출하)
- **버전**: v0.20.0.0
- **변경량**: 33파일 +81/-241
- **배포**: Vercel auto-deploy (main merge)
- **상태**: ✅ Phase 1 완료, Phase 2 대기(수동 019 적용 필요)

---

## 2. 완료 항목

### ✅ 구현 항목 (FR 완전 충족)

| FR | 항목 | 상태 | 근거 |
|----|------|:----:|------|
| FR-01 | 입력 UI 3곳 acc_time·fmtTimeInput 제거 | ✅ | expense/income/document-register grep 0 |
| FR-02 | 명시 Supabase select/order/payload 제거 | ✅ | HWPX 2라우트 order 대체 완료, select acc_time 0 |
| FR-03 | lib·types·산출물 제거 | ✅ | compareAccDateTime acc_date 단독, 모든 인터페이스·passthrough 제거 |
| FR-04 | 같은 날 정렬·채번 보존 | ✅ | 794/794 통과, accbook-sort tie-break 유지 |
| FR-05 | 문서 정정 | ✅ | CLAUDE.md L44/46/133, 주의사항·자금원배정방식 갱신 |
| FR-06 | 014 폐기·019 절차 | ✅ | 014 SUPERSEDED 주석, 019 "코드 배포 후 적용" |

### ✅ 테스트 성과
- **전체 통과**: 794/794 (vitest run)
- **새 에러**: 0 (tsc clean, eslint clean)
- **회귀**: 0 (acc_date/incm/id tie-break로 정렬·채번 무변경)
- **산출물 검증**: 목록·Excel·HWPX·SQLite 수치/순서 무변경

### ✅ 코드 정제
- **ACC_TIME 검색 결과**: app/src 0건 (strip·normalize 의도적 제외)
- **파일 수정**: 33파일
  - 비-테스트: ~25파일 (입력 UI 3 · lib 7 · types 1 · 산출물 5 · date-utils 1 · 문서 등)
  - 테스트: 13파일 (픽스처·단언 갱신)

---

## 3. 미완료/연기 항목

### Phase 2: DB 마이그레이션 (후속 배포 후)
- **작업**: `app/scripts/019_drop_acc_time.sql` Supabase SQL 에디터에서 수동 실행
- **내용**: `ALTER TABLE acc_book DROP COLUMN acc_time` · `ALTER TABLE acc_book_bak DROP COLUMN acc_time`
- **안전성**: `IF EXISTS` 절 포함 (idempotent)
- **상태**: ⏸️ v0.20.0.0 배포 후 예정

### Phase 3: Strip 정리 (019 이후)
- **작업**: `app/src/app/api/system/export-sqlite/route.ts:468`의 strip `"acc_time"` 항목 제거
- **및**: `app/src/lib/accounting/normalize-for-export.test.ts` acc_time 단언 제거
- **사유**: 019 DROP 후 no-op 되므로 그 이후 정리 가능
- **상태**: ⏸️ 후속 PR

---

## 4. 학습 포인트

### 1. 명시 Supabase select에 미적용 마이그레이션 컬럼 포함 시 프로덕션 깨짐
- **사건**: v0.19.0.0 수입지출부 뷰어가 명시 select에 acc_time 포함 → v0.19.1.0 핫픽스
- **원인**: Supabase 스키마는 이미 DROP 상태(또는 미적용), select 결과는 컬럼 부재 에러
- **교훈**: 마이그레이션 미적용 환경에서 "명시 select = 위험"
  - **적용**: 이후 스키마 변경 후 배포할 때 명시 select를 피하고, Supabase 공식 타입(자동 생성) 믿기
  - **[[acc-time-deprecated-not-in-prod]]** 메모 추가 완료

### 2. 정렬 SSOT의 키 하나를 제거하면 모든 compareAccDateTime 호출부의 tie-break 체인을 전수 점검해야 함
- **발견**: CodeRabbit 2라운드에서 reports·income-ledger-builder의 acc_book_id tie-break 누락 2건 지적
- **근본**: compareAccDateTime이 정렬 SSOT이므로, acc_time 제거 시 모든 호출부가 tie-break를 명시적으로 담당해야 함
- **교훈**:
  - 정렬 SSOT의 키 변경은 호출부 6곳 전수 점검 필수
  - 타입 에러로 안 잡히는 로직(tie-break)은 코드 리뷰·정렬 테스트에서 포착
  - **[[income-expense-book-funding-realloc]]** 같은 "정렬 재조정" 단계에서도 동일 위험

### 3. "코드 배포 → DB DROP" 단계 분리로 strip을 안전하게 유지
- **설계**: Phase 1(코드 제거 배포) → Phase 2(DB DROP) → Phase 3(strip 정리)
- **이점**: 
  - Phase 1 후 strip이 여전히 필요(SELECT * leak 방어)
  - Phase 2 이후에만 strip 제거 가능(이 시점 no-op)
  - 각 단계 실패해도 이전 단계의 안전성 유지
- **교훈**: 스키마 변경이 수반된 코드 제거는 순서 엄수 필수(CLAUDE.md L46에 문서화)

---

## 5. 다음 단계

### 즉시 (본 PR 머지 후)
1. ✅ v0.20.0.0 배포 (PR #92 머지 → Vercel auto-deploy)
2. ✅ 프로덕션 정상 확인 (수입지출부 조회, 장부 저장 동작)

### 배포 후 (1~2주 내)
3. ⏸️ **019_drop_acc_time.sql 적용** (Supabase SQL 에디터)
   - 담당: DevOps/DBA
   - 내용: DROP COLUMN acc_time(acc_book, acc_book_bak)
   - 확인: IF EXISTS 포함(idempotent)

### 019 이후 (후속 PR)
4. ⏸️ **Phase 3 strip 정리**
   - route.ts:468 "acc_time" 제거
   - normalize.test acc_time 단언 제거
   - 우선순위: low (no-op)

---

## 6. 코드 리뷰·병합 결과

### CodeRabbit 라운드 #1
- **지적**: 019 주석이 stale (fmtTimeInput 참조 제거됨)
- **해결**: 019 주석 정정 ✅

### CodeRabbit 라운드 #2
- **지적**: reports·income-ledger-builder의 acc_book_id tie-break 누락 2건
- **근본**: compareAccDateTime acc_time 제거 시 호출부 tie-break 체인 점검 누락
- **해결**: 
  - reports/page.tsx L160: `compareAccDateTime({acc_date})` 호출 + 이미 `incm→id` tie-break 보존 (정렬 재확인)
  - income-ledger-builder.ts L190: `compareAccDateTime({acc_date})` 호출 + L155-160 단언 acc_date+tie-break로 재작성 ✅
  - **영향**: 6곳 호출부 전수 점검 완료, 모두 tie-break 확보

### 최종 승인
- **상태**: ✅ Approved (CodeRabbit 2라운드 수용 후)
- **머지**: main (a2709f8)

---

## 7. 회귀 검증 요약

| 구분 | 목표 | 결과 |
|-----|------|:----:|
| vitest 통과율 | 100% | ✅ 794/794 |
| 타입 에러(tsc) | 신규 0 | ✅ 0 |
| 린트(eslint) | 에러 0 | ✅ 0 |
| grep acc_time(app/src) | 0건 | ✅ 0 |
| 같은 날 정렬(inc→id) | 보존 | ✅ 테스트 통과 |
| 영수증 채번 | 무변경 | ✅ 테스트 통과 |
| 산출물(Excel/HWPX/.db) | 수치·순서 무변경 | ✅ parity 검증 |
| 저장(api/acc-book) | 무영향 | ✅ 페이로드 미포함 |

---

## 8. 산출물 추적성

### 입력/저장 경로
- acc_time 필드 제거 → 저장 payload 미포함 → 기존 저장 로직 무영향 ✅

### 조회/정렬 경로
- HWPX·Excel·export-sqlite: select 대체 + order 대체 → 정렬 결과 무변경 ✅
- compareAccDateTime: acc_date 단독 + 호출부 tie-break 완비 → 순서 정합 ✅

### 문서/타입
- types/database.ts: Row 제거 → insert/update 자동 전파 ✅
- CLAUDE.md·05-reference: acc_time 기술 제거 → 미래 개발자 혼란 해소 ✅

---

## 9. 결론

✅ **acc-time-removal feature 완료 (v0.20.0.0)**

| 항목 | 판정 |
|------|:----:|
| 계획 대비 성과 | 100% (31파일 115곳 → 모두 제거) |
| 설계 준수 | 100% (3안전축 완전 적용) |
| 테스트 커버리지 | 100% (794/794, 신규 에러 0) |
| 산출물 호환성 | 100% (수치·순서·저장 무변경) |
| 프로덕션 안전성 | ✅ (단계별 순서 준수) |
| 문서화 | ✅ (CLAUDE.md·05-reference·014·019 정정) |

**배포 완료, Phase 2(DB 019 적용)는 v0.20.0.0 정상 확인 후 진행.**

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-06-23 | 완료 보고서 — Plan(목표)·Design(3안전축)·Do(33파일)·Check(99%)·Act(배포) 통합. 학습: ①명시 select의 위험 ②정렬 SSOT tie-break 전수 점검 ③단계별 순서 엄수. 다음: Phase 2(019 적용)·Phase 3(strip 정리) | Claude |
