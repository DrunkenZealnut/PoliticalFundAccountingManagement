# 거래 0 계정도 정치자금 수입·지출부 출력 (일괄출력 엑셀) — 완료 보고서

> **Phase**: Report (Act 완료) · **Date**: 2026-06-17 · **Agent**: bkit:report-generator
> **Plan**: [01-plan](../01-plan/features/report-empty-account-ledger.plan.md) · **Design**: [02-design](../02-design/features/report-empty-account-ledger.design.md) · **Analysis**: [03-analysis](../03-analysis/report-empty-account-ledger.analysis.md)
> **Match Rate**: 100% · **Iteration**: 0회

---

## Executive Summary

### 1.1 프로젝트 개요

| 항목 | 내용 |
|------|------|
| **기능** | 「일괄출력(보고서)」 정치자금 수입·지출부 엑셀에서 거래가 0인 표준 계정×과목 조합도 빈 양식(손기입용)으로 출력 |
| **대상** | `app/dashboard/reports/page.tsx` (일괄출력 엑셀) |
| **소요 기간** | 1일 (2026-06-17, Plan→Design→Do→Check 동일자) |
| **체계** | PDCA: Plan → Design → Do → Check(100% Match) → Act(완료) |
| **프로젝트 버전** | 0.14.7.0 |

### 1.2 결과 요약

| 항목 | 수치 |
|------|------|
| **Match Rate** | **100%** (Design Match 100% · FR-01~07 전부 충족 · 회귀 안전 OK) |
| Iteration | 0회 (1차 구현에서 100% 달성) |
| 신규 파일 | 2 (`report-combos.ts` 65줄 + `report-combos.test.ts` 67줄) |
| 변경 파일 | 1 (`reports/page.tsx` +28/-9줄) |
| 신규 테스트 | 7 (C1~C7, 7/7 통과) |
| 전체 테스트 | 736 통과 |
| lint / tsc | 0 / 0 |

### 1.3 Value Delivered (4관점)

| 관점 | 결과 |
|------|------|
| **Problem** | 일괄출력 정치자금 수입·지출부가 **실거래(comboMap)가 있는 계정×과목 조합만** 시트를 생성 → 거래 0인 표준 계정(예: 후보자 보조금 82)은 **시트 자체가 누락** → 선관위 제출 양식 불완전. |
| **Solution** | 시트 enumeration을 **acc_rel 표준 계정×과목 전체 ∪ 비표준 실거래**(화면 체크 범위 ∩)로 전환. 거래 0 조합은 **손기입용 빈 행 1개**의 빈 양식으로 출력. HWPX 서식7의 검증된 패턴(standardCombos + `emptyLedgerRow`)을 엑셀에 이식. 병합·필터·정렬을 순수 함수 `buildReportCombos`로 분리(C1~C7 100% 통과). |
| **Function/UX Effect** | 일괄출력 한 번으로 **기관유형 표준 계정·과목이 빠짐없이** 수입·지출부에 출력(거래 있으면 내역, 없으면 빈 양식). 화면 체크박스 선택 범위 존중(미선택 계정/과목은 빈 시트도 제외). |
| **Core Value** | 수입·지출부의 **양식 완전성** — "거래 있는 것만"에서 "표준 전체(빈 양식 포함)"로. 선관위 제출 누락 위험 제거. 기존 선례(서식7·재산명세서 빈 카테고리 행)와 일관, 신규 인프라·API 불필요. |

---

## 2. PDCA 사이클 요약

### Plan (2026-06-17)
- **문서**: `docs/01-plan/features/report-empty-account-ledger.plan.md`
- **목표**: 일괄출력 엑셀 수입·지출부를 acc_rel 표준 계정×과목 기준으로 시트 생성, 거래 0 조합도 빈 양식
- **확정 결정(사용자)**: 대상 = 일괄출력 엑셀(reports) / 범위 = acc_rel 표준 계정×과목 전부, 화면 체크 존중
- **FR-01~07**, NFR-01~03 정의

### Design (2026-06-17)
- **문서**: `docs/02-design/features/report-empty-account-ledger.design.md`
- **아키텍처 결정**:
  - **순수 함수 분리** `buildReportCombos(standard, real, sel)` — 병합·체크필터·정렬만 담당(테스트 용이)
  - **표준 enumeration**(page): `for incm in [1,2] → getAccounts(orgSecCd, incm) → getItems(...)` 곱집합, dedup
  - **빈 행 분기**(`buildLedgerSheet`): `sorted.length === 0` → 손기입 빈 행 1개(레이아웃은 실거래 시트와 동일, 값만 공란)
- 테스트 케이스 C1~C7 명세

### Do (2026-06-17)
| 파일 | 종류 | 내용 |
|------|------|------|
| `app/src/lib/excel-template/report-combos.ts` | 신규 (65줄) | 순수 `buildReportCombos` — 표준 입력순서 유지 + 비표준 실거래 정렬 append + 체크필터 + dedup |
| `app/src/lib/excel-template/report-combos.test.ts` | 신규 (67줄) | C1~C7 단위 테스트 |
| `app/src/app/dashboard/reports/page.tsx` | 변경 (+28/-9) | 표준 조합 enumeration(909-922) + combos 시드 교체(923-927) + `buildLedgerSheet` 빈 행 분기(669-673) |

### Check (2026-06-17, Match Rate 100%)
- **문서**: `docs/03-analysis/report-empty-account-ledger.analysis.md`
- **점검 결과(설계 ↔ 구현)**: 5개 항목 전부 ✅

| # | 관점 | 판정 | 근거 |
|---|------|:----:|------|
| 1 | buildReportCombos (병합·체크필터·정렬) | ✅ | `report-combos.ts:32-65` 사양 1:1 |
| 2 | 표준조합 enumeration (incm1·2×getAccounts×getItems·dedup·orgSecCd 가드) | ✅ | `reports/page.tsx:909-922` |
| 3 | combos 시드 교체 (시트 루프·표지 유지) | ✅ | `page.tsx:923-927`, 루프 보존 |
| 4 | buildLedgerSheet 빈 행 (손기입 1행·합계 0·동일 스타일) | ✅ | `page.tsx:669-673` |
| 5 | 테스트 C1~C7 | ✅ | `report-combos.test.ts:23-66` (7/7) |

- **FR 충족 7/7**: FR-01(표준 전부 시트)·FR-02(빈 양식 손기입 행)·FR-03(체크 존중)·FR-04(실거래 무회귀)·FR-05(정렬)·FR-06(acc_rel SSOT, 하드코딩 0)·FR-07(org_sec_cd 자동)
- **검증 신호**: 전체 736 통과(신규 7) · lint 0 · 변경 파일 tsc 0

### Act (완료)
- **Iteration 0회** — 1차 구현에서 100% 달성, 자동 개선 불필요
- **설계 §9 미해결 항목 → 구현으로 확정**:
  - 빈 행 표기 = **공란**(모든 셀 null)
  - 빈 계정도 **계정표지/과목표지 생성**(양식 완전성)
  - 헬퍼 경로 = `lib/excel-template/report-combos.ts`

---

## 3. 코드 품질 지표

| 항목 | 수치 |
|------|:----:|
| 신규 라인 | 132줄 (구현 65 + 테스트 67) |
| 테스트 통과 | 7/7 (100%) |
| 전체 테스트 | 736 통과 |
| lint 오류 | 0 |
| TypeScript 오류 | 0 (변경 파일) |
| Design Match | 100% |
| FR 충족 | 100% |
| 하드코딩 | 0 (acc_rel/`getAccounts`/`getItems` SSOT 재사용) |

---

## 4. 잘된 점 & 다음 단계

### 잘된 점
1. **HWPX 서식7 선례 재사용** — 이미 빈 계정을 출력하는 검증된 acc_rel enumeration + `emptyLedgerRow` 패턴을 이식해 위험 최소화
2. **순수 함수 분리**(`buildReportCombos`) — page.tsx 변경 최소(+28/-9), 병합·필터·정렬 로직을 단위 테스트로 격리
3. **acc_rel SSOT 재사용** — 하드코딩 0, 기관유형(후보자/후원회/정당/국회의원)별 표준 조합 자동 반영
4. **체크 필터 존중** — 미선택 계정/과목은 빈 시트도 생성 안 됨(시트 과다 방지)
5. **1일 사이클·Iteration 0회** — 1차 구현에서 Match 100%

### 다음 단계 (권장)
1. **실데이터 QA** (단위 테스트 불가 영역): 거래 0 계정의 빈 시트 존재·헤더·손기입 1행 확인, 실거래 시트 무회귀, 체크 범위·정렬, 기관유형별 표준 조합 수(시트 과다 없는지)
2. **Design Status 전환**: Draft → Approved (실데이터 QA 완료 후)
3. **릴리스**: app/VERSION MINOR bump + CHANGELOG.md 반영 (양식 변화 안내 — 빈 양식 포함이 선관위 제출 요건 부합)

---

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-06-17 | Claude | 완료 보고서 (Match Rate 100%, Iteration 0) |
