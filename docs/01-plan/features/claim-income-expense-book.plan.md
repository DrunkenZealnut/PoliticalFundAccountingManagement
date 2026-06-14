# Plan: 보전청구 첨부용 정치자금 수입·지출부(선거비용) 생성 (claim-income-expense-book)

> **유형**: 신규 기능 (보전 제출서류 Excel 생성)
> **버전 목표**: v0.14.0.0 (feature MINOR)
> **작성일**: 2026-06-14
> **샘플 양식**: `data/정치자금수입지출부보전비용_보조금외지원금.xlsx`

## Executive Summary

| 관점 | 내용 |
|------|------|
| **Problem (문제)** | 보전청구서 제출 시 첨부해야 하는 「정치자금 수입·지출부(선거비용)」를 수기로 작성해야 한다. 특히 지출액을 **실제 최종청구액**(일할계산·환급 반영)으로 맞춰 계정별/총 합계가 보전관리 산출액과 일치시키는 작업이 번거롭고 오류가 잦다. |
| **Solution (해결)** | 보전청구서 탭에서 버튼 한 번으로, **보전 체크된 선거비용 지출을 수입계정(자금원)별로** 샘플 양식(14컬럼)의 수입·지출부 xlsx로 생성. 지출액은 `claimAmount`(claim_amt ?? acc_amt, 환급 음수 차감) SSOT로 산출. |
| **Function UX Effect (기능·UX 효과)** | 계정별 시트의 지출 합계·전체 합계가 보전관리(aggregator)·보전청구서·첨부서류목록과 **동일 금액**(19,439,541)으로 자동 일치. 거래처·영수증번호·누계·잔액까지 양식대로 채워짐. |
| **Core Value (핵심 가치)** | 보전 제출서류 자동화 완성 — 청구서·첨부서류목록·수입지출부가 모두 같은 SSOT로 금액 정합. 수기 작성 제거 + 합계 불일치 사고 예방. |

---

## 1. 요구사항

1. 위치: 보전비용관리 → **보전청구서 탭**에 "수입·지출부(선거비용) 다운로드" 추가.
2. 샘플 양식 재현: `정치자금수입지출부보전비용_보조금외지원금.xlsx`.
3. **수입계정(자금원)별**로 분리 생성.
4. **지출액 = 실제 최종청구액**(`claimAmount`: claim_amt 있으면 그것, 없으면 acc_amt; 환급 음수 차감).
5. 계정별 합계·총 합계 == 보전비용관리 산출액(보전 탭 "청구 기준" 합계 = aggregator).

## 2. 샘플 양식 구조 (분석 완료)

14컬럼, 시트당 1개 자금원 계정:
```
r2  제목: "정 치 자 금  수 입 ·지 출 부(보전 비용)"           (A2:N2 병합)
r4  "[계정(과 목)명: 보조금외지원금 (선거비용) ]"            (A4:K4 병합)
r5~r8 헤더(4행 병합):
  A 년월일 | B 내역 | C·D 수입액(금회·누계) | E·F 지출액(금회·누계) |
  G 잔액 | H~L 수입을 제공한 자 또는 지출을 받은자
    (H 성명/법인단체명 · I 생년월일/사업자등록번호 · J 주소/사무소소재지 · K 직업(업종) · L 전화번호) |
  M 영수증 일련번호 | N 비고
r9~ 데이터 행
```
**샘플 데이터행 매핑** (`r9`):
| 컬럼 | 값 | 소스 |
|------|-----|------|
| A 년월일 | 2026-05-26 | `acc_date` |
| B 내역 | 인쇄물-선거공보-인쇄비-공식공보물 | `exp_group1_cd`-`2`-`3` + `content` |
| C 수입 금회 | (빈칸) | 보전은 지출만 |
| D 수입 누계 | 0 | — |
| E 지출 금회 | 3,000,000 | **`claimAmount(r)`** |
| F 지출 누계 | 3,000,000 | 시트 내 누적 |
| G 잔액 | -3,000,000 | 수입누계 − 지출누계 |
| H 성명 | 양지기획 | `customer.name`(익명 처리) |
| I 사업자번호 | 201-17-77717 | `customer.reg_num` |
| J 주소 | 서울시 중구… | `customer.addr` |
| K 직업 | 인쇄물,출판업 | `customer.job` |
| L 전화 | 02-… | `customer.tel` |
| M 영수증 | 외(비)-1 계좌입금 | `rcp_no` |
| N 비고 | | `bigo` |

## 3. 데이터 소스·정합성 (핵심)

- 모집단: `org_id` + `incm_sec_cd=2` + 선거비용 과목 + `acc_print_ok='Y'` + `acc_amt !== 0` (환급 음수 포함) — **aggregator/doclist와 동일 SSOT**.
- 지출 금액: `claimAmount(r)` (일할계산·환급 반영). [[negative-refund-rows-in-aggregation]]·`election-item-classification-ssot` 준수.
- 계정 그룹핑: `acc_sec_cd` 코드명(getName) = 자금원 4분류(82 보조금/83 보조금외지원금/84 후보자자산/85 후원회기부금)와 1:1. → **계정별 합계 == aggregator.byFundingSource[자금원]**, 총합 == aggregator.합계(19,439,541).
- 자금원 "기타"(4분류 미해당) 거래: aggregator가 합계서 제외하므로 수입지출부도 제외(정합 유지) + 경고 노출(누락 인지). 오준석후보는 기타 0건.

## 4. 설계 방향

### 4.1 신규 빌더 (순수 함수)
`lib/excel-template/income-expense-book.ts` (가칭):
- 입력: 보전 체크 선거비용 거래(거래별 상세) → 자금원(acc_sec_cd)별 그룹 → 각 그룹을 14컬럼 시트로.
- 누계/잔액 계산(순수), 거래처/영수증/내역 매핑.
- 기존 `reimbursement-claim-form.ts`의 ExcelJS `cell()`/`mergeCells`/테두리 헬퍼 재사용.

### 4.2 데이터 조회
- ClaimFormTab은 현재 aggregate API(합계만) 사용 → **거래별 상세 조회 추가 필요**.
- `ReimbursementTab`의 select(`acc_book ... exp_group1/2/3_cd, customer:cust_id(name,reg_num,addr,job,tel), rcp_no, claim_amt`)와 동일 쿼리 재사용.

### 4.3 생성·다운로드
- 기존 보전청구서 Excel(`generateReimbursementClaimForm` → handleDownload)과 동일하게 **클라이언트 ExcelJS 생성 → blob 다운로드**.

## 5. 결정 사항 (확정 완료 — 2026-06-14)
1. **출력 형태**: ✅ 계정별 시트 1개 파일 (자금원별 시트, 한 .xlsx)
2. **생성 위치**: ✅ 클라이언트 생성 (기존 보전청구서 Excel과 동일, ExcelJS → blob 다운로드)
3. **수입 행**: ✅ 지출만 기재 (샘플 동일 — 수입 금회 빈칸/누계 0, 잔액 = −지출누계)

## 6. 영향 범위 (예상)
- 신규: `lib/excel-template/income-expense-book.ts` + 테스트
- `app/dashboard/reimbursement/page.tsx` (ClaimFormTab): 버튼 + 거래 조회 + 다운로드 핸들러
- (선택) 새 API route
- SSOT 재사용: `claim-amount`, `funding-source`, 선거비용 과목 판별

## 7. 검증 기준
- 계정별 시트 지출 합계 == aggregator.byFundingSource[자금원]
- 전체 합계 == 19,439,541 (보전관리·보전청구서·첨부서류목록과 일치)
- 환급(음수) 거래가 해당 계정 시트에 음수 행으로 차감 표기
- 샘플 양식 레이아웃(병합·헤더) 일치
- 단위 테스트 통과 · lint 0 · build 성공
