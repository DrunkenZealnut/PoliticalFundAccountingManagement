# Completion Report: export-sqlite-receipt-no-autofill

> **Project**: 정치자금 회계관리 시스템
> **Feature**: export-sqlite-receipt-no-autofill
> **Version**: 0.14.3.0 → 목표 v0.14.4.0
> **Date**: 2026-06-15
> **PDCA**: Plan ✅ → Design ✅ → Do ✅ → Check ✅ (100%) → Report ✅
> **Status**: 구현·검증 완료 (런타임 사용자 검증 대기)

---

## Executive Summary

| 관점 | 내용 |
|------|------|
| **Problem** | 자료백업 `.db`를 윈도우 선관위 프로그램에서 열면 수입지출부 영수증일련번호가 11건 전부 `자(비외)-1~11 / 계좌입금`으로 뭉쳤다(실제는 자금원·과목 4조합). |
| **Solution** | export insert 직전, `RCP_NO`가 빈 `rcp_yn='Y'` 행에 채번 SSOT(`assignReceiptNumbers`)를 자동 적용하는 순수 헬퍼 `fillExportReceiptNumbers`를 추가. |
| **Function UX Effect** | 「영수증 일괄생성」 미실행/미부여 import 데이터라도 백업·수입지출부가 자금원·과목별 정확한 일련번호를 표시. 수기 부여분 보존. |
| **Core Value** | 선관위 제출 수입지출부 정합성 — 영수증번호 오표기로 인한 자금원 귀속 오류·반려 위험 제거. |

### 1.3 Value Delivered (실측 지표)

| 관점 | 지표 | 결과 |
|------|------|------|
| **Problem 해결** | 영수증 11건 자금원 귀속 정확도 | 단일 버킷(자(비외)×11) → 4조합 정확 분산(자(비외)×1·보(비)×5·보(비외)×1·자(비)×4) |
| **Solution 품질** | 단위 테스트 | 17개 통과(신규 TC-1~7 + 기존 10) |
| **Solution 품질** | 회귀 | export-sqlite `normalize.test.ts` 20개 통과 / lint 0 / build 성공 |
| **설계 정합** | Match Rate | **100%** (FR-01~06 + 의사코드 + BAK 양쪽 + TC 전부 ✅) |
| **범위 효율** | 변경 파일 | 코드 3개(헬퍼·테스트·route), DB 마이그레이션 0, API 시그니처 변경 0 |

---

## 2. Plan 요약

- **증상**: 윈도우 프로그램 수입지출부 영수증일련번호가 11건 모두 `자(비외)-1~11`.
- **DB 실측**(`Fund_Data_1(송파).db`): `RCP_YN='Y'` 지출 11건이 4조합인데 `RCP_NO`/`RCP_NO2`가 전부 빈 값.
- **근본 원인**: 영수증번호는 `acc_book.rcp_no`에 영구 저장(앱 화면 직접 표시). export 파이프라인은 `rcp_no`를 누락하지 않음(코드 추적 검증). 빈 `RCP_NO`로 export 시 윈도우 프로그램이 단일 버킷으로 폴백 생성.
- **결정**(사용자): 앱은 혼합 정상 표시 / 수정방향 = **export 시 자동 채번**.

## 3. Design 요약

- 신규 순수 헬퍼 `fillExportReceiptNumbers(rows, codeNames)` — `incm_sec_cd`별 스코프, 정렬 `acc_date→acc_sort_num→acc_book_id`, **미부여분만**, immutable.
- 연결: `export-sqlite/route.ts`의 `finalAccBook`/`finalAccBookBak` 변환 체인 끝에 적용 + `codevalue`로 `cvNameById` 빌드.
- 기존 SSOT `assignReceiptNumbers` 재사용(무변경) — 앱 화면·보전 수입지출부와 규칙 일원화.

## 4. Implementation 요약

| 파일 | 변경 |
|------|------|
| `app/src/lib/accounting/receipt-no.ts` | `fillExportReceiptNumbers` + `isMissingRcpNo` 추가(순수) |
| `app/src/app/api/system/export-sqlite/route.ts` | import + `cvNameById` + `finalAccBook`/`finalAccBookBak` 채번 적용 |
| `app/src/lib/accounting/receipt-no.test.ts` | TC-1~7 추가 |

핵심 동작: `rcp_yn='Y'` ∧ `rcp_no` 빈 행만 대상 → 조합별 순번 부여 → `acc_book_id`로 `rcp_no`/`rcp_no2` 오버레이 → 미매칭 행·기존 부여분은 원본 그대로. `master` 모드는 빈 배열 자동 no-op.

## 5. Check(Gap) 요약

- Match Rate **100%** — Missing/Added Gap 없음.
- 유일 차이: 함수명(Plan 잠정 `applyReceiptNumbersToExport` → Design 확정 `fillExportReceiptNumbers`), 구현은 Design 확정명과 일치 → Gap 아님.
- 보류(ship): `app/VERSION` 0.14.3.0→0.14.4.0, `CHANGELOG.md` 항목.

## 6. 잔여 / 후속

1. **런타임 검증(사용자)**: 재export → `sqlite3 <db> "SELECT RCP_NO,RCP_NO2 FROM ACC_BOOK WHERE RCP_YN='Y'"` 조합별 확인 → 윈도우 프로그램 표시 확인.
   - 가설 반증 시(채워도 뭉침) → 윈도우가 RCP_NO 무시·funding-source 자체 계산 → 별도 feature 전환.
2. **Ship**: VERSION/CHANGELOG bump 후 `/ship` (v0.14.4.0).

## 7. 학습 / 비고

- `insertRows`가 `Object.keys(rows[0])`로 컬럼을 잡지만 Supabase는 모든 컬럼을 반환하므로 `rcp_no` 누락은 export 버그가 아니라 **데이터 상태(빈 rcp_no)** 문제였다.
- 윈도우 PFund2의 영수증일련번호 표기 = `{자금원약자}({과목약자})-{순번}\n{결제방법명}` — 우리 SSOT(`receipt-no.ts`)와 동형. 빈 값일 때만 폴백.

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-06-15 | 완료 보고서 — Match Rate 100%, 런타임 검증 대기 | Claude Code |
