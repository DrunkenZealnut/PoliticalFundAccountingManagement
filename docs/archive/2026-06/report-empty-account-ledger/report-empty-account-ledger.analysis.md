# Gap 분석 (Check) — report-empty-account-ledger

> **Date**: 2026-06-17 · **Phase**: Check · **Agent**: bkit:gap-detector
> **Design**: [02-design](../02-design/features/report-empty-account-ledger.design.md) · **Plan**: [01-plan](../01-plan/features/report-empty-account-ledger.plan.md)

## Match Rate: 100% — 차단 Gap 0 · Report 가능

| Category | Score |
|----------|:-----:|
| Design Match (점검 1~5) | 100% |
| FR 충족 (FR-01~07) | 100% |
| 회귀 안전 | OK |
| **Overall** | **100%** |

## 점검 결과 (설계 ↔ 구현)

| # | 관점 | 판정 | 근거 |
|---|------|:----:|------|
| 1 | buildReportCombos (§3.2 병합·체크필터·정렬) | ✅ | `report-combos.ts:32-65` 사양 1:1 |
| 2 | 표준조합 enumeration (§3.3, incm1·2×getAccounts×getItems·dedup·orgSecCd 가드) | ✅ | `reports/page.tsx:909-922` |
| 3 | combos 시드 교체 (§4, 시트 루프·표지 유지) | ✅ | `page.tsx:923-927`, 루프 `:933-968` 보존 |
| 4 | buildLedgerSheet 빈 행 (§5, 손기입 1행·합계 0·동일 스타일) | ✅ | `page.tsx:668-673` |
| 5 | 테스트 C1~C7 | ✅ | `report-combos.test.ts:23-66` (7/7 통과) |

## FR 충족
FR-01(표준 전부 시트)·FR-02(빈 양식 손기입 행)·FR-03(체크 존중)·FR-04(실거래 무회귀)·FR-05(정렬)·FR-06(acc_rel SSOT, 하드코딩 0)·FR-07(org_sec_cd 자동) — **전부 충족**.

## 설계 §9 미해결 → 구현으로 확정
- 빈 행 표기 = **공란**(모든 셀 null) ✅
- 빈 계정도 **계정/과목 표지 생성**(기본 ON) ✅
- 헬퍼 경로 = `lib/excel-template/report-combos.ts` ✅

## 회귀 안전 (낮음)
- 표지·재산명세서·합계·영수증 첨부/생략 로직 무변경. `selectedAccounts/Income/Expense` 기본 전체 선택 의미 보존. `comboMap`(실거래) 유지·`realCombos`로 전달(C3 비표준 누락 없음).

## 단위테스트 불가 영역 (설계 §6 주석대로)
- `buildLedgerSheet` 빈 행 ExcelJS 렌더는 정적 검증(분기·스타일·합계 0 정확). **실데이터 QA 권장**: 거래 0 계정 빈 시트 존재·헤더·손기입 1행·실거래 시트 무회귀.

## 검증 신호
- 전체 테스트 **736 통과**(신규 7)·lint 0·변경 파일 tsc 0.

## 결론
Match Rate 100%, 차단 Gap 0 → **Report 진행 가능**. 권장: Design Status Draft→Approved, 실데이터 QA(거래 0 계정 빈 시트).
