# 지출항목 수입계정(자금원) 배정 방식 점검 및 개선 Planning Document

> **Summary**: 후보자 회계에서 "지출의 자금원(수입계정)"을 보고 시점에 배정하는 현행 방식(`buildLedgerRows` = Pass0→Pass1→Pass2, SSOT `allocateCandidateLedgerRows`)을 점검하고, 정확성·일관성·내구성을 끌어올린다. 배정 알고리즘 자체는 자금원 단위에서 견고하나, ① SSOT를 우회하는 경로(V2 `data-query.ts`, V3 `export-sqlite`)가 남아 같은 데이터가 화면마다 달라질 수 있고, ② (계정×과목) 셀 음수 비발생이 "통장≥0" 가정에만 의존해 위반 시 조용히 음수로 새며, ③ 보고 시점 계산이라 신규 출력 소비처가 SSOT 호출을 빠뜨리면 표류한다(V2가 그 산 증거). 본 작업은 **새 배정 규칙을 만드는 게 아니라, 이미 옳은 배정 규칙을 모든 경로에 강제하고 가정을 가시화**한다.
>
> **Project**: PoliticalFundAccountingManagement
> **Version**: 0.17.1.0
> **Author**: Claude
> **Date**: 2026-06-20
> **Status**: Draft
> **Related**: SSOT `lib/accounting/income-expense-report-summary.ts`(`allocateCandidateLedgerRows`), `ledger-allocation.ts`(buildLedgerRows), `fund-realloc.ts`(Pass1), `item-allocation.ts`(Pass2), `adjust-negative-income.ts`(Pass0), `funding-source.ts`(`FUNDING_SOURCE_BY_ACC_SEC_CD`). 선행 PDCA: [[fund-source-redistribution]]·[[income-expense-item-allocation]]·[[income-account-balance-guard]](모두 Draft, 영구화 방식은 보고시점 계산으로 롤백됨). 참조: `docs/03-analysis/income-expense-report-ssot.analysis.md`(G4/G7/V2/V3), `docs/05-reference/정치자금_수입지출부_생성_주의사항.md`(§6 알고리즘·§12 미준수 경로). 메모: [[income-expense-book-funding-realloc]]·[[income-expense-item-allocation-persist]]

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 후보자 거래는 단일 통합계좌로 흐르지만 각 거래에 자금원(`acc_sec_cd` 82=보조금·83=보조금외·84=후보자자산·85=후원회기부금)이 붙는다. 선관위 양식은 자금원별·(계정×과목)별 잔액이 ≥0이어야 해서, 수입이 부족한 자금원의 지출을 잉여 자금원으로 **보고 시점에 이동**(과목 불변)한다. 이 배정 규칙은 `buildLedgerRows`에 SSOT로 구현돼 있으나 — (1) `excel-template/data-query.ts`(`/api/excel/report`)는 이 SSOT를 안 쓰고 병렬 분류로 보조금외=0 고정(**V2, 화면 간 수치 불일치**), (2) `export-sqlite`는 자금원 집합 `[82,83,84,85]`를 로컬 재정의(**V3**), (3) (계정×과목) 셀 음수 비발생이 "통장 전체 잔액≥0" **가정에만 의존**해 위반 시 조용히 음수로 샌다. |
| **Solution** | 배정 규칙은 그대로 두고 **모든 경로가 단일 SSOT를 거치도록 강제**하고 **가정을 가시화**한다. ① V2: `data-query.ts`의 수입·지출부 경로를 `allocateCandidateLedgerRows`로 교체하거나 그 호출 UI가 없으면 제거. ② V3: `export-sqlite`의 로컬 `CANDIDATE_ACC_SEC_CDS`를 `FUNDING_SOURCE_BY_ACC_SEC_CD`로 통합. ③ "통장≥0" 가정 위반(자금원 전체 부족=데이터 오류)을 **조용히 음수로 두지 말고 진단으로 표면화**(Pass1 Shortfall을 소비처가 가시 경고로 노출). ④ 신규 소비처가 SSOT를 빠뜨리는 표류를 막는 **회귀 가드**(acc_book→장부 변환 경로가 모두 SSOT를 통과함을 강제하는 테스트/경계). ⑤ 흩어진 선행 Draft 플랜 3종 + 주의사항 §6을 **단일 권위 문서로 통합**. |
| **Function/UX Effect** | 화면(수입·지출보고서 page)·HWPX(22-1/22-2/22-4·서식7)·Excel(`/api/excel/report`)·SQLite export 어디서 뽑아도 **동일한 자금원 배정 결과**가 나온다(현재 V2 경로만 다름). 통장 부족 같은 데이터 오류는 0으로 숨지 않고 사용자에게 명시 경고로 뜬다. 신규 출력물이 추가돼도 배정 규칙을 자동 상속한다. |
| **Core Value** | 정치자금 회계의 **단일 진실원(배정 규칙) 보장** — "이미 옳은 규칙"을 전 경로에 강제하고 숨은 가정을 드러내, 같은 데이터가 화면마다 달라지거나 데이터 오류가 조용히 묻히는 일을 구조적으로 제거. |

---

## 1. Overview

### 1.1 Purpose

"지출항목에 수입계정(자금원)을 배정하는 방식"을 점검하고 개선한다. 후보자(자금원 cs_id 10, `acc_sec_cd` 82~85) 회계에서 보고 시점에 일어나는 일은 3패스다:

- **Pass0** `adjustNegativeIncome` (`adjust-negative-income.ts:21-28`) — 음수 수입(`incm_sec_cd=1 && acc_amt<0`)을 양수 지출(`incm_sec_cd=2`, `abs`)로 정규화. 멱등.
- **Pass1** `reallocateFundSources` (`fund-realloc.ts:81-191`) — **본 작업의 핵심.** 단일 현금풀 캐스케이드: 자금원 `S`의 지출이 `S`의 누적 수입을 초과하면, 부족분을 `overflowPriority`(기본 `[84,83,82]`)의 잉여 자금원으로 이동. 한 지출(`acc_book_id`)이 여러 자금원으로 쪼개지면 `splitGroupId`로 묶고 `split-keep`/`split-moved`로 표기. **과목(`item_sec_cd`)은 절대 불변(I4).**
- **Pass2** `allocateIncomeToItems` (`item-allocation.ts:40-118`) — 자금원별로 독립 실행. 수입을 충당 과목으로 FIFO 재태깅(지출 과목은 불변).

정렬 SSOT는 `compareAccDateTime → incm_sec_cd(수입 우선) → acc_book_id` (`fund-realloc.ts:86-91`). 결과는 화면 총괄(`buildCandidateReportSummary`)·HWPX 22-1/22-2/22-4·서식7이 **공유**(SSOT `allocateCandidateLedgerRows`, v0.17.1.0 #88에서 일원화 완료).

이 규칙 자체는 옳다(공식 Fund_Data_1.db와 동일 구조). 본 작업의 목표는 **규칙을 바꾸는 것이 아니라, 규칙이 새는 지점을 막고 숨은 전제를 드러내는 것**이다.

### 1.2 Background

선행 PDCA에서 영구화(acc_book에 분할 영구 기록, scripts 016/017) 방식을 설계했으나 **"보고자료 생성 시에만 분할" 방침으로 롤백**(2026-06-20)됐다. 따라서 016/017 RPC는 사장(017:98-103, `authenticated` EXECUTE 회수)됐고, 배정은 전적으로 **보고 시점 계산**이다. 이 전환으로 표류 위험의 성격이 "영구화 vs 계산"에서 **"소비처가 SSOT 호출을 빠뜨림"**으로 바뀌었고, `data-query.ts`(V2)가 정확히 그 사례다.

또한 (계정×과목) 셀 음수 비발생은 Pass2의 목표지만, 실제 보장은 "통장 전체≥0"이라는 데이터 전제(`fund-realloc.ts:6-8`)에 의존한다. 전제가 깨지면 Pass1이 `Shortfall`을 남기고 원본 자금원에 진짜 음수가 잔류한다(`fund-realloc.ts:176-187`) — "실데이터엔 미발생 확인"일 뿐 구조적으로 막힌 게 아니다.

### 1.3 Related Documents

- 알고리즘/불변식: `docs/05-reference/정치자금_수입지출부_생성_주의사항.md` §2(I2 무음수), §6(Pass2)
- SSOT 분석: `docs/03-analysis/income-expense-report-ssot.analysis.md`(G4/G7 해소·V2/V3 잔여)
- 선행 플랜(Draft, 영구화 방식은 superseded): `fund-source-redistribution.plan.md`, `income-expense-item-allocation.plan.md`, `income-account-balance-guard.plan.md`

---

## 2. Scope

### 2.1 In Scope

- [ ] **V2 해소** — `lib/excel-template/data-query.ts`의 수입·지출부/장부 경로가 SSOT(`allocateCandidateLedgerRows`/`buildLedgerRows`)를 통과하도록 교체. 호출 UI(`/api/excel/report` 소비처)가 살아있는지 먼저 확인 후, 살아있으면 교체·죽었으면 데드코드 제거.
- [ ] **V3 해소** — `app/src/app/api/system/export-sqlite/route.ts:497`의 로컬 `CANDIDATE_ACC_SEC_CDS=[82,83,84,85]`를 `FUNDING_SOURCE_BY_ACC_SEC_CD` 기반 판정으로 통합.
- [ ] **가정 가시화** — "통장 전체 부족"(Pass1 `Shortfall`/원본 자금원 잔여 음수)을 소비처가 **조용히 0/음수로 두지 말고** 명시 경고(배너/리포트 주석)로 표면화. 데이터 오류임을 사용자에게 알림(은폐 금지 원칙).
- [ ] **표류 회귀 가드** — `acc_book` 행을 (계정×과목) 장부/집계로 변환하는 **모든 경로가 SSOT를 거침**을 강제하는 테스트(예: 자금원 82~85 포함 입력에 대해 각 라우트가 동일 배정 결과를 내는 교차검증, 또는 SSOT 미경유 경로를 잡는 grep 기반 가드 테스트).
- [ ] **권위 문서 통합** — 흩어진 Draft 플랜 3종의 유효 결정 + 주의사항 §6 알고리즘을 **단일 "자금원 배정 방식" 권위 문서**로 정리(Pass0/1/2 규칙·불변식·전제·소비처 목록). 선행 플랜에 superseded 표기.

### 2.2 Out of Scope

- **비후보자(후원회/정당/국회의원) 자금원·과목 배정** — 이들은 `acc_sec_cd`가 수입/지출 플래그(자금원 아님)라 구조가 다르고 현행 무배정 유지. 별도 대형 PDCA 필요(현 시점 명시적 한계).
- **새 배정 규칙/알고리즘 변경** — Pass1/Pass2 로직 자체는 옳다고 판단, 변경하지 않음(점검 결과 자금원 단위 견고).
- **후원회기부금 +4,010원 미스터리·보조금 종류별 차등** — `fund-source-redistribution.analysis` Out-of-Scope, 추가 PFund2 .db 케이스 필요. 별도 PDCA.
- **영구화(acc_book 분할 기록) 재도입** — 보고 시점 계산 방침 유지(롤백 결정 존중). scripts 016/017은 018로 DROP 권고된 사장 코드.
- **`acc_sort_num` NULL 라운드트립 정렬**(주의사항 §7) — export-sqlite `fillExportSortNumbers` 영역, 본 배정 작업과 분리.

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | `/api/excel/report`(data-query.ts) 수입·지출부 경로를 SSOT 배정으로 교체하거나, 사용처 부재 확인 시 제거 (V2) | High | ✅ Done (제거, 2026-06-21) |
| FR-02 | `export-sqlite`의 로컬 자금원 집합을 `FUNDING_SOURCE_BY_ACC_SEC_CD`로 통합 (V3) | Medium | ✅ Done (로컬 const 제거+SSOT 통합+TC-5, 2026-06-21) |
| FR-03 | 통장 전체 부족(Pass1 Shortfall) 발생 시 소비처가 명시 경고로 표면화 (은폐 금지) | High | ✅ Done (헬퍼+3소비처 표면화, 2026-06-21) |
| FR-04 | 모든 acc_book→장부 변환 경로가 SSOT를 통과함을 강제하는 회귀 가드 테스트 | High | ✅ Done (3경로 동일성 가드, 2026-06-21) |
| FR-05 | 자금원 배정 방식 단일 권위 문서 작성 + 선행 Draft 플랜에 superseded 표기 | Medium | ✅ Done (권위문서 신설+선행 3종 superseded, 2026-06-21) |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| 정합성 | page 총괄 == HWPX 22-1 == Excel 수입·지출부 == SQLite export (동일 데이터 동일 배정) | 교차검증 테스트(자금원 82~85 포함 픽스처) |
| 합 보존 | 배정 전후 자금원별 총수입·총지출 불변 | 단위 테스트(기존 패턴 재사용) |
| 회귀 안전 | 기존 780 vitest 전부 통과 + 신규 가드 테스트 | `node node_modules/vitest/vitest.mjs run` |
| 무은폐 | 데이터 오류(통장 부족)가 0/음수로 묻히지 않고 경고 노출 | Shortfall 픽스처로 경고 표면화 검증 |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] V2(data-query) 경로가 SSOT 경유 또는 제거됨 — `/api/excel/report` 수입·지출부가 page/HWPX와 수치 일치
- [ ] V3(export-sqlite) 로컬 중복 제거 — 단일 자금원 SSOT 사용
- [ ] Shortfall 표면화 경로 구현 + 테스트
- [ ] SSOT 우회 방지 가드 테스트 통과
- [ ] 권위 문서 작성, 선행 플랜 superseded 표기
- [ ] 전 vitest 통과, eslint clean

### 4.2 Quality Criteria

- [ ] 신규/변경 코드 경로 테스트 커버리지 ≥ 80%
- [ ] Zero lint errors (`node node_modules/eslint/bin/eslint.js`)
- [ ] tsc 변경 파일 에러 0 (기존 무관 테스트파일 에러는 별도)

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| `/api/excel/report` 소비 UI가 실제 사용 중인데 산출물 수치가 바뀜 | High | Medium | 교체 전 호출 경로·사용 여부 확인. 변경 시 회귀 픽스처로 page와 동일성 검증 후 출하 |
| Shortfall 경고가 정상 데이터에서 오탐(거짓 경고) | Medium | Low | Shortfall은 통장 전체 부족(데이터 오류)일 때만 발생 — 실데이터 미발생 확인됨. 경고 조건을 Pass1 Shortfall 레코드 존재로 엄격 한정 |
| data-query 교체가 Excel 13컬럼 양식 깨뜨림 | Medium | Medium | 양식 레이아웃은 유지하고 분류·정렬만 SSOT로 교체. 기존 Excel 테스트 회귀 확인 |
| 가드 테스트가 향후 정당한 신규 경로를 과하게 막음 | Low | Low | 가드는 "자금원 82~85 입력 시 SSOT 결과와 동일"을 검증하는 행위 기반으로 설계(경로 화이트리스트 하드코딩 회피) |

---

## 6. Architecture Considerations

기존 Dynamic 급 코드베이스(Next.js 16 App Router + Supabase) 내 **회계 로직 정합화**이며 신규 아키텍처 결정 없음. 핵심은 단일 SSOT 강제다.

```
배정 SSOT 경계 (목표 상태)
┌──────────────────────────────────────────────────────────┐
│ raw acc_book rows (자금원 82~85 포함)                       │
│        │                                                    │
│        ▼  allocateCandidateLedgerRows  (단일 진입점)         │
│   buildLedgerRows = Pass0 → Pass1 → Pass2                   │
│        │                                                    │
│   ┌────┼─────────┬──────────────┬─────────────┐            │
│   ▼    ▼         ▼              ▼             ▼            │
│ page  HWPX22-1  HWPX22-4/서식7  Excel(report)  SQLite       │
│ 총괄   /22-2                     ← V2 지금 우회   export ←V3  │
└──────────────────────────────────────────────────────────┘
  목표: V2·V3 화살표도 SSOT 경계를 통과 → 모든 소비처 동일 결과
```

### 6.2 Key Architectural Decisions

| Decision | Options | Selected | Rationale |
|----------|---------|----------|-----------|
| 배정 시점 | 영구화(acc_book write) / 보고 시점 계산 | 보고 시점 계산 (유지) | 롤백 결정 존중, 단일 진실원 = `buildLedgerRows` |
| SSOT 강제 방식 | 코드 리뷰 신뢰 / 회귀 가드 테스트 | 회귀 가드 테스트 | 보고 시점 계산은 "소비처 누락"이 표류 원인 — 테스트로 구조적 차단 |
| Shortfall 처리 | 0으로 클램프 / 음수 노출 / 경고 표면화 | 경고 표면화 | 은폐 금지 — 데이터 오류는 사용자가 알아야 교정 가능 |

---

## 7. Convention Prerequisites

### 7.1 Existing Project Conventions

- [x] `CLAUDE.md`에 회계 코드 규칙 다수(자금원 코드·정렬 SSOT·과목 불변 등)
- [x] 기존 테스트 컨벤션(vitest, `*.test.ts`) — `income-expense-report-summary.test.ts` 패턴 재사용
- [x] ESLint v9 flat config / tsconfig 존재
- [ ] 자금원 배정 단일 권위 문서 (FR-05로 신규 작성)

### 7.2 Conventions to Define/Verify

| Category | Current State | To Define | Priority |
|----------|---------------|-----------|:--------:|
| 배정 SSOT 진입점 | `allocateCandidateLedgerRows` 존재하나 일부 경로 우회 | "acc_book→장부 변환은 반드시 SSOT 경유" 규칙 명문화 | High |
| Shortfall 노출 | 코드에 레코드만 존재, UI 미노출 | 경고 표면화 패턴(배너/주석) 정의 | High |

---

## 8. Next Steps

1. [ ] `/api/excel/report` 실제 사용 여부·호출 UI 조사 (V2 교체 vs 제거 결정)
2. [ ] Design 문서 작성 (`expense-funding-allocation-review.design.md`) — V2 교체 상세, Shortfall 경고 위치, 가드 테스트 설계
3. [ ] 구현 → `/pdca analyze` 갭검증 → 출하

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-06-20 | 초안 — 배정 방식 점검 결과 + V2/V3/가정가시화/표류가드/문서통합 개선 범위 | Claude |
