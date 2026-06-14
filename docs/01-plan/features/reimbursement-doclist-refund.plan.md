# Plan: 보전 첨부서류목록 환급(음수) 거래 반영 (reimbursement-doclist-refund)

> **버그 분류**: P1 (보전 금액 과대표시) · 데이터 정합성
> **자매 버그**: `reimbursement-claim-mismatch`(v0.13.1.0, PR #71)와 동일 근본 원인(`acc_amt>0` 게이트). 그때 보전청구서·대시보드는 고쳤으나 **첨부서류목록(doclist)은 누락**.
> **버전 목표**: v0.13.2.0
> **작성일**: 2026-06-14

## Executive Summary

| 관점 | 내용 |
|------|------|
| **Problem (문제)** | 「선거비용 보전 첨부서류목록」(HWPX) 메뉴에서 사용자가 최종 확정한 금액이 반영되지 않고 출력된다. 일할계산(claim_amt)은 반영되지만, **환급/취소를 음수 지출 행으로 입력한 거래가 누락**되어 항목 소계·합계가 실제보다 크게 나온다. |
| **Solution (해결)** | `reimbursement-doclist-builder`의 대상 필터 `acc_amt > 0` 게이트를 `acc_amt !== 0`(0원만 제외)으로 변경 → 환급(음수) 거래를 보전청구액에서 차감 반영. 보전청구서(서식43·서식1)·대시보드와 동일 SSOT 정책으로 통일. |
| **Function UX Effect (기능·UX 효과)** | 첨부서류목록의 항목별 보전청구액·합계가 「선거비용 보전」 화면 및 보전청구서와 **정확히 일치**. 환급 거래가 해당 항목(예: 문자메시지 §82의5)에 음수 행으로 표기되어 차감됨. |
| **Core Value (핵심 가치)** | 보전 제출서류 일관성 — 청구서와 첨부서류목록의 금액이 어긋나면 선관위 제출 시 정합성 문제. 과다 표기로 인한 보전 사고 예방. |

---

## 1. 문제 상세

### 1.1 재현
1. 보전 데이터에 환급 거래(음수 `acc_amt`)가 보전 체크(`acc_print_ok='Y'`)된 상태
2. 제출서류 → 「선거비용 보전 첨부서류목록」 HWPX 생성
3. 환급분이 차감되지 않아 항목 소계·전체 합계가 과대 표시 (예: 문자메시지 항목이 충전액 200,000 그대로, 환급 −108,583 미반영)

### 1.2 영향
- 첨부서류목록 합계 ≠ 보전청구서 합계(v0.13.1.0에서 청구서는 19,439,541로 수정됨) → 제출서류 간 불일치
- 실사례: 2026 오준석후보 — 첨부서류목록이 19,548,124(과대)로 출력, 정답 19,439,541

## 2. 근본 원인 (코드 확정)

`app/src/lib/hwpx/reimbursement-doclist-builder.ts:104`
```ts
const targets = rows.filter((r) => (r.acc_amt || 0) > 0 && r.acc_print_ok === "Y");
```
- **`acc_amt > 0` 게이트가 환급(음수) 거래를 통째로 제외** → 차감 누락.
- `claim_amt`(일할계산)는 `:126 claimAmount(r)`로 정상 반영됨 — 문제는 음수 행 누락뿐.
- doclist route(`api/hwpx/reimbursement-doclist/route.ts:91-97`)는 `incm_sec_cd=2`만 필터하고 **acc_amt 조건이 없어 음수 행도 조회**됨 → builder 게이트만 고치면 됨(route 변경 불필요).

> 전수조사 결과 보전 경로에서 `acc_amt>0` 게이트가 남은 곳은 **doclist-builder 단 한 곳**(aggregator는 PR #71에서 수정 완료). 메모리 [[negative-refund-rows-in-aggregation]]가 예견한 "다른 집계의 같은 함정"이 정확히 이 케이스.

## 3. 수정 방향 (확정)

### 3.1 게이트 변경
- `(r.acc_amt || 0) > 0` → `(r.acc_amt || 0) !== 0` (0원 거래만 제외, 음수=환급은 포함해 차감)
- 파일 상단 주석(`:13-14`)의 "acc_amt > 0" 조건 설명도 갱신 + aggregator와 정책 일치 명시.

### 3.2 음수 행 표기
- 환급 행은 해당 보전항목 그룹(`mapReimbItemKey(exp_group1_cd, exp_group2_cd)`)에 음수 금액 행으로 표기, `claimAmount`(음수)로 소계·합계 차감.
- 금액 표시는 기존 `formatAmount`(음수도 표기) 사용.

## 4. 영향 범위 (예상 변경 파일)
- `app/src/lib/hwpx/reimbursement-doclist-builder.ts` — 게이트 1줄 + 주석
- `app/src/lib/hwpx/reimbursement-doclist-builder.test.ts` — 환급 음수 차감 케이스 추가
- (확인) `api/system/export-sqlite/route.ts`의 `claimAmount` 사용은 PFund2 백업(회계, 음수 그대로) — 게이트 무관, 변경 없음
- route 변경 없음

## 5. 검증 기준
- 첨부서류목록 합계 == 보전청구서(서식43) 합계 == 「선거비용 보전」 화면 합계
- 환급(음수) 거래가 해당 항목에 차감 반영, 0원 거래는 제외
- 단위 테스트 통과 · lint 0 · build 성공
- 실데이터(오준석후보) 첨부서류목록 합계 19,439,541 확인
