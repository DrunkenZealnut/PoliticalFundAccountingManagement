# Gap Analysis: export-sqlite-receipt-no-autofill

> **Phase**: Check (PDCA)
> **Date**: 2026-06-15
> **Design**: [export-sqlite-receipt-no-autofill.design.md](../02-design/features/export-sqlite-receipt-no-autofill.design.md)
> **Match Rate**: **100%**
> **Status**: ✅ Pass (≥90%)

---

## 1. 검토 대상

| 구분 | 파일 |
|------|------|
| 신규 헬퍼 | `app/src/lib/accounting/receipt-no.ts` (`fillExportReceiptNumbers`, line 119~164) |
| 테스트 | `app/src/lib/accounting/receipt-no.test.ts` (TC-1~7) |
| 연결 | `app/src/app/api/system/export-sqlite/route.ts` (line 14 import, 735~751 적용) |

---

## 2. 요구사항별 충족 판정

| ID | 요구사항 | 판정 | 근거 |
|----|----------|:----:|------|
| FR-01 | rcp_yn='Y' ∧ RCP_NO 빈 행에 `{계정약자}({과목약자})-{조합순번}` 자동 부여 | ✅ | 필터 `rcp_yn==='Y' && isMissingRcpNo` → `assignReceiptNumbers` → `formatKey` |
| FR-02 | 기존 RCP_NO 보존(미부여분만), 조합별 max+1부터 | ✅ | `assignReceiptNumbers` comboSeq max+1. TC-2 검증 |
| FR-03 | RCP_NO2(정수 전역 순번) 함께 부여 | ✅ | `rcp_no2: a.rcp_no2` 오버레이. TC-3 검증 |
| FR-04 | incm_sec_cd별(수입1/지출2) 스코프 분리 | ✅ | `byIncm` 그룹별 독립 채번. TC-3 검증 |
| FR-05 | codevalue 코드명 약자 매핑(폴백 포함) | ✅ | `cvNameById` → `accountAbbr`/`itemAbbr` 폴백. TC-7 검증 |
| FR-06 | full/master/data1/data2 모든 모드 적용 (master no-op) | ✅ | 양쪽 적용 + master 빈 배열 no-op |
| — | 의사코드 일치(정렬 acc_date→acc_sort_num→acc_book_id, immutable, 미매칭 통과) | ✅ | 3단 정렬·`{...r}` 새 객체. TC-5/TC-6 검증 |
| — | 8.2 TC-1~7 구현 | ✅ | 7/7 존재 |
| — | ACC_BOOK·ACC_BOOK_BAK 둘 다 적용 | ✅ | `finalAccBook` + `finalAccBookBak` 각자 채번 |
| — | 11.1 변경 파일 일치 | ✅ | 3개 코드 파일 일치 |

---

## 3. Overall Scores

| Category | Score | Status |
|----------|:-----:|:------:|
| Design Match (FR + 의사코드 + BAK) | 100% | ✅ |
| Test Coverage (TC-1~7) | 100% (7/7) | ✅ |
| Convention Compliance | 100% | ✅ |
| **Overall Match Rate** | **100%** | ✅ |

검증 실행 결과: 단위 테스트 17개 통과, export-sqlite `normalize.test.ts` 20개 통과(회귀 없음), lint 0, build 성공.

---

## 4. Differences Found

- 🔴 Missing: 없음
- 🟡 Added: 없음
- 🔵 Changed: 헬퍼 함수명 — Plan 잠정명 `applyReceiptNumbersToExport` → Design에서 `fillExportReceiptNumbers`로 확정, 구현은 **Design 확정명과 일치**(정상 진화, Gap 아님).

---

## 5. 보류 항목 (Gap 아님 — ship 시점 처리)

| 항목 | 현재 | 처리 시점 |
|------|------|-----------|
| `app/VERSION` 0.14.3.0 → 0.14.4.0 | 미반영 | ship |
| `CHANGELOG.md` v0.14.4.0 항목 | 미반영 | ship (root CHANGELOG, `app/VERSION` SSOT) |

---

## 6. 잔여 런타임 검증 (코드 외)

설계 8.3 / 11.3의 **윈도우 프로그램 실측**은 사용자 환경에서만 가능:
1. 동일 데이터로 자료백업 재export
2. `sqlite3 <db> "SELECT RCP_NO,RCP_NO2 FROM ACC_BOOK WHERE RCP_YN='Y'"` → 조합별(`자(비외)-1`,`보(비)-1~5`,`보(비외)-1`,`자(비)-1~4`) 정상 확인
3. 윈도우 선관위 프로그램에서 수입지출부 영수증일련번호 표시 확인 → RCP_NO 사용 가설 최종 확정

> 가설 반증 시(채워도 `자(비외)`로 뭉침) = 윈도우가 RCP_NO 무시·funding-source 자체 계산 → 별도 feature로 전환.

---

## 7. 결론

Match Rate **100%** — 설계-구현 완전 일치. `/pdca iterate` 불필요. 다음: 사용자 런타임 검증 → `/pdca report` 또는 `/ship`(v0.14.4.0).
