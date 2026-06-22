# 재조정 데이터 뷰어 + 영수증 일괄생성 (adjusted-ledger-viewer) Planning Document

> **Summary**: 원본 acc_book은 불변으로 두고, 보고용 **재조정 데이터**(`buildLedgerRows` = Pass0→Pass1→Pass2, 수입 과목 재분류 포함 = 공식 Fund_Data_1.db 상태)를 **사람이 검토**할 수 있게 화면으로 보여주고, 그 재조정 행에 **영수증일련번호를 일괄 채번해 표시**한다. 조사 결과 **재조정 장부 뷰어는 이미 존재**한다(`dashboard/income-expense-book` = 수입·지출부, buildLedgerRows 결과를 표·Excel로 표시). 그러나 영수증번호는 **원본 acc_book의 `rcp_no`를 그대로** 보여줄 뿐(`lr.rcp_no`) **재조정 행 기준 채번을 하지 않는다** — 분할/이동된 슬라이스나 미채번 행은 번호가 비거나 어긋난다. 사용자 선택 **(가)**: 영수증번호는 **재조정 시점에 계산만**(원본 불변, 결정적 재계산) — `receipt-no.ts`의 `fillExportReceiptNumbers`(export-sqlite가 쓰는 SSOT)를 화면에 재사용한다.
>
> **Project**: PoliticalFundAccountingManagement
> **Version**: 0.18.x → (feature) 0.19.0.0 예정
> **Author**: Claude · **Date**: 2026-06-22 · **Status**: Draft
> **Related**: 재조정 엔진 = `lib/accounting/ledger-allocation.ts`(buildLedgerRows Pass0→1→2). 영수증 채번 SSOT `lib/accounting/receipt-no.ts`(`assignReceiptNumbers`·`fillExportReceiptNumbers`). 기존 뷰어 `dashboard/income-expense-book/page.tsx`. 권위 문서 `docs/05-reference/자금원배정방식.md`. 메모 [[official-fund-data-income-classification]].

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 윈도우 공식 프로그램은 보고 시 수입·지출을 **재조정**하고 영수증일련번호를 매겨 제출한다(Fund_Data_1.db = 그 결과). 우리는 원본 불변·재조정 자동화까지 됐고 재조정 장부도 화면(income-expense-book)에 있으나, **영수증번호가 원본 rcp_no를 그대로** 표시해 **재조정(분할/이동) 행과 어긋나거나 비어** 제출 검토가 안 된다. |
| **Solution** | 재조정 장부 화면에 **재조정 행 기준 영수증 일괄채번을 계산해 표시**한다. 원본은 안 건드리고(가), `fillExportReceiptNumbers`(export-sqlite와 동일 SSOT)로 결정적으로 산출 → 화면·Excel·HWPX·SQLite가 **같은 번호**. "영수증 일괄생성/재생성" 액션으로 재계산. 분할/이동·과목 부족 경고도 그 화면에서 검토. |
| **Function/UX Effect** | 사용자가 **제출 직전 최종 모습**(재조정된 (자금원×과목) 장부 + 정확한 영수증번호)을 한 화면에서 검토·신뢰. 원본 데이터는 그대로라 통장과의 대조도 유지. 화면에서 본 번호가 실제 산출물(HWPX/Excel/.db)과 100% 일치. |
| **Core Value** | "원본(통장) ↔ 재조정(보고)"을 분리한 채, **재조정 결과를 사람이 검증**할 수 있는 단일 화면 — 공식 프로그램의 수동 재조정 검토를 자동화·가시화. |

---

## 1. Overview

### 1.1 현황 (조사)
- **재조정 엔진**: `buildLedgerRows`(Pass0→1→2) — 수입 과목 재분류 포함, (자금원×과목) 완전 균형. 원본 acc_book 미변경(보고 시점 계산).
- **재조정 뷰어**: `dashboard/income-expense-book` 가 이미 buildLedgerRows 결과를 (자금원×과목) 표 + 13컬럼 Excel로 표시. **영수증일련번호 컬럼 존재**하나 값은 원본 `lr.rcp_no` 그대로(`page.tsx:113,225,348`).
- **영수증 채번 SSOT**: `receipt-no.ts`. `fillExportReceiptNumbers`가 **재조정/내보내기 행에 미채번분 채번**(rcp_yn='Y'·rcp_no 빈 행, incm_sec_cd 스코프, 기존 보존)을 이미 수행 — export-sqlite가 사용. 화면에 그대로 재사용 가능.

### 1.2 (가) 결정 — 영수증번호는 계산만
원본 acc_book의 `rcp_no`는 **안 건드린다**. 재조정 화면/산출물의 영수증번호는 **매번 `fillExportReceiptNumbers`로 결정적 계산**(기존 원본 rcp_no는 시드로 보존, 분할/이동·미채번분만 채움). DB write 0. → 원본 불변 + 화면·HWPX·Excel·.db 번호 일치.

---

## 2. Scope

### 2.1 In Scope
- [ ] **재조정 행 기준 영수증번호 표시** — income-expense-book(및 재조정 산출 경로)에서 영수증일련번호를 `fillExportReceiptNumbers`로 계산해 표시(원본 rcp_no 시드 보존 + 분할/이동·미채번 채번). 가(계산만).
- [ ] **「영수증 일괄생성/재생성」 액션** — 화면에서 재조정+채번을 재계산해 갱신(멱등·DB write 0). 결과가 곧 제출 산출물의 번호.
- [ ] **재조정 검토 보강** — 각 행의 분할/이동 구분(origin: 원본/이동/분할) 표시 + (자금원×과목) 음수/부족 경고(`detectCandidateShortfalls` 재사용)로 검토성↑.
- [ ] **정합 보장** — 화면 영수증번호 == HWPX 22-4/서식7 == Excel == SQLite export 의 번호(동일 SSOT) 회귀 테스트.

### 2.2 Out of Scope
- **원본 acc_book에 영수증번호 persist** — (가) 선택으로 제외(원본 불변). 필요 시 별도 결정(나안).
- **재조정 엔진 변경** — Pass0→1→2 유지(수입 재분류 포함).
- **비후보자(후원회/정당) 재조정** — 후보자(82~85) 한정.
- **원본 데이터 수정 기능** — 뷰어는 읽기 전용.

### 2.3 결정 필요 (Design)
1. **호스트**: 기존 `income-expense-book` 강화 vs **신규 전용 "재조정 검토" 페이지**. (권장: 기존 강화 — 중복 회피. 단 "재조정본임"을 명확히 라벨)
2. **채번 적용 지점 SSOT화**: 화면/Excel/HWPX/SQLite가 각자 `fillExportReceiptNumbers`를 호출 중인지 점검 → 한 곳(재조정 산출 공통 경로)에서 채번하도록 정리할지.

---

## 3. Requirements

### 3.1 Functional Requirements
| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | 재조정 장부 화면의 영수증일련번호를 `fillExportReceiptNumbers`로 계산해 표시(원본 불변, 시드 보존+미채번/분할 채번) | High | Pending |
| FR-02 | 「영수증 일괄생성/재생성」 액션 — 재조정+채번 재계산·갱신(멱등, DB write 0) | High | Pending |
| FR-03 | 분할/이동(origin) 구분 + 과목 부족 경고를 재조정 화면에 표시(검토성) | Medium | Pending |
| FR-04 | 화면 영수증번호 == HWPX·Excel·SQLite export 번호(동일 SSOT) 정합 회귀 | High | Pending |
| FR-05 | 호스트(기존 강화 vs 신규 페이지) 확정 + "재조정본" 라벨로 원본과 혼동 방지 | Medium | Pending |

### 3.2 Non-Functional
| Category | Criteria | Measurement |
|----------|----------|-------------|
| 원본 불변 | acc_book write 0(채번 계산만) | 코드/네트워크 점검 |
| 산출물 일치 | 화면 번호 = export/HWPX 번호 | 교차 테스트(동일 픽스처) |
| 결정성 | 동일 데이터 → 동일 번호(멱등) | 단위 테스트 |
| 회귀 안전 | 기존 vitest 전부 통과 | vitest |

---

## 4. Success Criteria
- [ ] 재조정 장부 화면에 정확한(제출용) 영수증번호 표시
- [ ] 영수증 일괄생성/재생성 동작, DB write 0
- [ ] 화면 == HWPX/Excel/SQLite 번호 일치
- [ ] 분할/이동·부족 검토 표시
- [ ] 전 vitest·eslint·tsc clean

---

## 5. Risks and Mitigation
| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| 화면 채번과 export 채번이 미세하게 달라짐(정렬·스코프 차이) | High | Med | 둘 다 `fillExportReceiptNumbers`(단일 SSOT)·동일 정렬(acc-book-sort) 사용 + 교차 회귀 |
| "재조정본"을 원본으로 오인(편집 시도) | Med | Med | 읽기전용·명확 라벨/배지("보고용 재조정 데이터") |
| 기존 income-expense-book rcp_no(원본) 표시와 혼동 | Med | High | 호스트 결정 시 채번 로직 일원화(FR-01이 대체) |

---

## 6. Architecture Considerations
신규 엔진 없음. 재조정(`buildLedgerRows`) + 채번(`fillExportReceiptNumbers`) 두 SSOT를 화면 경로에서 조합. (가)라 순수 계산만 — `api/acc-book` write 미사용. 호스트 페이지(income-expense-book 강화 또는 신규)에서 표시.

---

## 7. Next Steps
1. [ ] Design — 호스트(강화/신규) 결정, 채번 적용 지점 SSOT 정리, origin/경고 표시, 화면==export 번호 교차 테스트.
2. [ ] 구현 → `/pdca analyze` → 출하(0.19.0.0).

---

## Version History
| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-06-22 | 초안 — (가) 영수증 계산만. 기존 income-expense-book가 재조정 뷰어임을 확인, 갭=재조정 행 기준 채번. fillExportReceiptNumbers 재사용 | Claude |
