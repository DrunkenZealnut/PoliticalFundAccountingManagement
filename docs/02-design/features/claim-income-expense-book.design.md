# Design: 보전청구 첨부용 정치자금 수입·지출부(선거비용) (claim-income-expense-book)

> Plan: `docs/01-plan/features/claim-income-expense-book.plan.md`
> 확정: 계정별 시트 1파일 · 지출만 기재 · 클라이언트 ExcelJS 생성
> 버전 목표: v0.14.0.0

## 1. 아키텍처

순수 모델 빌더 + ExcelJS 렌더 **2계층 분리** (테스트 용이성 + 기존 패턴 일치):

```
ClaimFormTab (조회: 보전체크 선거비용 거래)
   │  IebInputRow[]
   ▼
buildIncomeExpenseBookModel(rows, ctx)   ← 순수: 필터·자금원 그룹·누계·잔액·내역포맷
   │  IebModel { accounts[], grandTotal, otherCount, otherAmt }
   ▼
renderIncomeExpenseBook(model, meta)      ← ExcelJS: 자금원별 시트 14컬럼 양식
   │  ExcelJS.Workbook
   ▼
handleDownload → writeBuffer → blob (.xlsx)
```

- 파일: `lib/excel-template/income-expense-book.ts` (모델 + 렌더). ExcelJS `cell()`/테두리 헬퍼는 `reimbursement-claim-form.ts` 패턴 따름(공유 가능 시 추출).
- SSOT 재사용: `claimAmount`(claim-amount), `classifyFundingSource`(funding-source), 선거비용 과목 판별(cv_name==="선거비용").

## 2. 데이터 타입

```ts
export interface IebInputRow {
  acc_book_id: number;
  acc_date: string;            // YYYYMMDD
  content: string | null;
  acc_amt: number;
  claim_amt?: number | null;
  acc_print_ok: string | null;
  acc_sec_cd: number;          // 자금원
  item_sec_cd: number;         // 과목(선거비용 판별)
  exp_group1_cd: string | null;
  exp_group2_cd: string | null;
  exp_group3_cd: string | null;
  rcp_no: string | null;
  bigo: string | null;
  customer: { name: string|null; reg_num: string|null; addr: string|null; job: string|null; tel: string|null } | null;
  cust_id?: number;
}

export interface IebCtx {
  electionExpenseItemCds: number[];           // cv_name==="선거비용" cv_id (aggregator와 동일)
  accSecCdNames: Record<number, string>;      // acc_sec_cd → 계정명(getName)
}

export interface IebCellRow {
  date: string; content: string;
  expenseNow: number; expenseCum: number; balance: number;
  name: string; regNum: string; addr: string; job: string; tel: string;
  rcpNo: string; bigo: string;
}
export interface IebAccount {
  accSecCd: number; accName: string;          // 시트/헤더 표시명
  source: FundingSource;                       // 정합 키
  rows: IebCellRow[]; expenseTotal: number;
}
export interface IebModel {
  accounts: IebAccount[];                       // 자금원 순서: 후보자자산→후원회기부금→보조금→보조금외
  grandTotal: number;                           // == aggregator.합계
  otherCount: number; otherAmt: number;         // 자금원 미분류(경고용, 합계 제외)
}
```

## 3. 데이터 처리 로직 (`buildIncomeExpenseBookModel`)

1. **필터** (aggregator·doclist와 동일 모집단):
   `incm_sec_cd=2`(조회 보장) ∧ `acc_amt !== 0` ∧ `item_sec_cd ∈ electionExpenseItemCds` ∧ `acc_print_ok='Y'`.
2. **자금원 분류**: `classifyFundingSource(acc_sec_cd, accSecCdNames[acc_sec_cd])`. "기타" → 합계 제외 + `otherCount/otherAmt` 누적(경고).
3. **그룹핑**: 자금원(source) 4분류별. 시트 표시명 `accName` = `accSecCdNames[acc_sec_cd]`(예: "보조금외지원금"). 동일 source에 acc_sec_cd가 여럿이면 source 기준 1시트로 합치되 헤더명은 대표 코드명.
4. **정렬**: 그룹 내 `acc_date` 오름차순(동일자 `acc_book_id`).
5. **금액**: `expenseNow = claimAmount(r)`(claim_amt ?? acc_amt, 음수=환급 차감). `expenseCum` 누적, `balance = -expenseCum`(수입 0).
6. **내역 포맷**: `[exp_group1_cd, exp_group2_cd, exp_group3_cd, content]` 중 비어있지 않은 값 `-` join (샘플 "인쇄물-선거공보-인쇄비-공식공보물"). doclist의 내역 규칙과 일관.
7. **거래처**: 익명 정규화(`isAnonymousCustomer(cust_id, reg_num)` 재사용) → "익명", 아니면 `customer.*`.
8. **합계**: `expenseTotal`(계정별) = Σ expenseNow; `grandTotal` = Σ accounts.expenseTotal == **aggregator.byFundingSource.합계**.

## 4. 시트 레이아웃 스펙 (샘플 14컬럼 재현)

자금원별 1시트. 컬럼 A~N(1~14).

| 행 | 내용 | 병합 |
|----|------|------|
| r2 | `정치자금 수입·지출부(보전 비용)` 중앙 | A2:N2 |
| r4 | `[계정(과목)명: {accName} (선거비용) ]` | A4:K4 |
| r5~r8 | 헤더(4행) | 아래 병합 |
| r9~ | 데이터 행(거래별) | — |
| 말미 | 합 계 행(지출 누계=expenseTotal) | A:D 병합 "합 계" |

**헤더 병합(샘플 그대로)**: A5:A8(년월일) B5:B8(내역) C5:D5+C6:C8+D6:D8(수입액 금회/누계) E5:F5+E6:E8+F6:F8(지출액 금회/누계) G5:G8(잔액) H5:L5(수입을 제공한 자 또는 지출을 받은자)+H6:H8/I6:I8/J6:J8/K6:K8/L6:L8(성명·생년월일/사업자번호·주소·직업·전화) M5:M8(영수증 일련번호) N5:N8(비고).

**데이터행 매핑**: A=date(YYYY-MM-DD) · B=content · C=공백 · D=0 · **E=expenseNow** · F=expenseCum · G=balance · H=name · I=regNum · J=addr · K=job · L=tel · M=rcpNo · N=bigo.

**스타일**: 얇은 테두리 전 셀, 헤더 bold+중앙, 금액 우측정렬 `#,##0`, 제목 14pt bold. 컬럼 너비: 주소(J) 넓게, 금액열 중간. (세부 px는 구현 시 reimbursement-claim-form.ts 기준.)

## 5. ClaimFormTab 통합

- 기존 `fetchClaimAggregate`(합계)는 유지. **거래별 상세 조회 추가**: `ReimbursementTab`의 select 재사용
  (`acc_book ... exp_group1/2/3_cd, rcp_no, bigo, customer:cust_id(name,reg_num,addr,job,tel), claim_amt`, `org_id` + `incm_sec_cd=2`).
- 코드값에서 `electionExpenseItemCds`(cv_name==="선거비용") + `accSecCdNames` 구성(useCodeValues 또는 aggregate API 확장).
- 버튼: "수입·지출부(선거비용) 다운로드 📥". 클릭 → 조회 → buildModel → render → blob.
- 다운로드 파일명: `정치자금수입지출부_선거비용_{후보자명}_{YYYYMMDD}.xlsx`.
- 미분류(otherCount>0) 시 경고 토스트/문구(보전 탭과 동일 정책).

## 6. 정합성 보장 (SSOT)

| 출력 | 금액 기준 | 일치 대상 |
|------|-----------|-----------|
| 보전 탭 "청구 기준" | aggregator | — |
| 보전청구서(서식43/1) | aggregator | = |
| 첨부서류목록 | doclist(claimAmount) | = |
| **수입·지출부(신규)** | buildIeb(claimAmount) | **= 19,439,541** |

교차검증 테스트: `grandTotal === aggregator(동일 rows).byFundingSource.합계`, `account.expenseTotal === byFundingSource[source]`.

## 7. 테스트 설계 (`income-expense-book.test.ts`)

| ID | 케이스 | 기대 |
|----|--------|------|
| T-1 | 자금원별 그룹·시트 분리 | accounts가 source별, 정렬 |
| T-2 | 지출=claimAmount(일할 반영) | expenseNow=claim_amt |
| T-3 | 환급(음수) 차감 | 음수 행 포함, expenseTotal 차감 |
| T-4 | 0원 제외 / 미체크 제외 / 선거비용외 제외 | 모집단 정확 |
| T-5 | 누계·잔액 | expenseCum 누적, balance=-cum |
| T-6 | 내역 포맷 | "g1-g2-g3-content", 빈값 스킵 |
| T-7 | 익명 거래처 | "익명" |
| T-8 | **교차검증**: grandTotal == aggregator.합계 | 동일 rows로 일치 |
| T-9 | 기타 자금원 | otherCount/Amt 분리, 합계 제외 |

## 8. 영향 범위
- 신규: `lib/excel-template/income-expense-book.ts` + `.test.ts`
- `app/dashboard/reimbursement/page.tsx`(ClaimFormTab): 거래 조회 + 버튼 + 다운로드
- (선택) aggregate API에 `accSecCdNames`/electionExpenseItemCds 노출 또는 useCodeValues 활용
- 재사용: `claim-amount`, `funding-source`, `income-ledger-builder`(formatAmount/formatLedgerDate/isAnonymousCustomer)

## 9. 구현 순서
1. 순수 모델 빌더 + 단위 테스트(T-1~T-9, 교차검증 포함)
2. ExcelJS 렌더(시트 레이아웃) — 샘플 양식 대조
3. ClaimFormTab 조회·버튼·다운로드
4. 전체 테스트·lint·build
5. 실데이터(오준석후보) 생성 → 계정별/총합 19,439,541 + 양식 육안 확인

## 10. 검증 기준
- 계정별 시트 지출 합계 == aggregator.byFundingSource[자금원]
- 총합 == 19,439,541 (보전관리·청구서·첨부서류목록 일치)
- 환급 음수 차감, 0원/미체크/선거비용외 제외
- 샘플 양식 레이아웃 일치(병합·헤더·데이터 매핑)
- 단위 테스트 통과 · lint 0 · build 성공
