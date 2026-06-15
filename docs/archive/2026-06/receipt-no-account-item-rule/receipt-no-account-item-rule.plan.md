# Plan: 영수증번호 일괄생성 — 계정·과목 조합 규칙 (receipt-no-account-item-rule)

> 유형: 기능 개선 (영수증 일련번호 채번 규칙) · 버전 목표: v0.14.1.0
> 작성일: 2026-06-14

## Executive Summary

| 관점 | 내용 |
|------|------|
| **Problem (문제)** | 「영수증일괄생성」이 **단순 통합 순번**(1, 2, 3…)만 부여해, 영수증 일련번호에 계정·과목 구분이 드러나지 않는다. 선관위 양식은 계정/과목을 식별할 수 있는 번호 체계를 쓴다(예: 보전 수입·지출부의 `자(비)-N`). |
| **Solution (해결)** | 영수증번호를 **계정(acc_sec_cd)·과목(item_sec_cd)을 섞은 규칙**으로 생성. 규칙을 순수 함수 SSOT로 만들어 지출(expense)·수입(income)·API(batch_receipt) 3경로가 동일하게 사용. |
| **Function UX Effect (기능·UX 효과)** | 일괄생성 시 각 거래의 영수증번호가 계정·과목별로 구분되어, 수입·지출부·보전 출력의 영수증 일련번호와 정합. |
| **Core Value (핵심 가치)** | 영수증 일련번호의 식별성·추적성 향상 — 제출서류 간 번호 체계 일관. |

## 1. 현재 동작 (코드 확정)

영수증 일괄 채번이 **2경로로 중복 구현**되어 있고 둘 다 단순 순번:
- **지출**: `expense/page.tsx:205 handleBatchReceiptGen` — 클라이언트에서 직접 supabase로 targets(rcp_yn='Y' ∧ rcp_no 없음) 조회 → `rcp_no = String(max+1+i)`, `rcp_no2 = num`.
- **수입**: `income/page.tsx:140 handleBatchReceiptNumbers` → `POST /api/acc-book {action:"batch_receipt", incmSecCd:1}`.
- **API**: `api/acc-book/route.ts:147 batch_receipt` — 동일 순번 로직(`rcp_no=String(num)`, `rcp_no2=num`).

→ `rcp_no`(문자열 표시값) = "1","2",…, `rcp_no2`(정수 정렬/max용) = 순번.

## 2. 변경 방향

### 2.1 규칙 SSOT (신규 순수 함수)
`lib/accounting/receipt-no.ts` (가칭): `(accSecCd, itemSecCd, seq, codeNames?) → rcp_no 문자열`.
- `rcp_no2`(정수)는 정렬/max·중복방지용으로 **순번 유지**, `rcp_no`(표시값)만 새 규칙 적용.

### 2.2 3경로 통일
expense 클라이언트·income·API batch_receipt가 모두 SSOT 함수 사용. targets 조회에 `acc_sec_cd, item_sec_cd` 추가 select 필요.

## 3. 채번 규칙 (확정 — 2026-06-14)
- **포맷**: ✅ 약자 조합 `{계정약자}({과목약자})-{순번}` (예: `자(비)-1`). 보전 수입·지출부/PDF 양식과 동일.
- **순번**: ✅ **계정+과목 조합별 1부터** (자(비)-1·자(비)-2 / 후(비)-1·후(비)-2 …).
- `rcp_no`(표시값)만 새 규칙, `rcp_no2`(정수)는 정렬/중복방지용 — 조합별 순번 또는 전체 보존은 Design에서 정합 처리.

### 3.1 약자 매핑 (Design에서 확정 필요)
PDF/샘플 확인분: 후보자자산→`자`, 보조금외→`외`, 선거비용 과목→`비`.
**미확정**(Design에서 사용자 확인): 후원회기부금(`후`?)·보조금(`보`?)·선거비용외 과목(약자?)·수입 일괄생성 대상 계정/과목 약자. codevalue 코드명 기반 매핑 테이블로 정의 예정.

## 4. 영향 범위 (예상)
- 신규: `lib/accounting/receipt-no.ts` + 테스트
- `app/dashboard/expense/page.tsx` (handleBatchReceiptGen)
- `app/dashboard/income/page.tsx` (handleBatchReceiptNumbers — API 경로면 자동)
- `app/api/acc-book/route.ts` (batch_receipt: select에 계정·과목 추가, 규칙 적용)
- 코드명/약자 필요 시 `useCodeValues`/`codevalue` 또는 funding-source 매핑 재사용

## 5. 검증 기준
- 일괄생성된 rcp_no가 계정·과목 조합 규칙을 따름
- 3경로(지출/수입/API) 동일 규칙
- `rcp_no2` 정렬·중복 방지 유지, 재실행 시 기존 번호 보존(미부여분만)
- 단위 테스트 통과 · lint 0 · build 성공
