# reimbursement-claim-hwpx Design Document

> **Summary**: 「선거비용 보전청구서」(서식 43)를 acc_book 의 보전 체크된 선거비용 지출로부터 자금원별로 집계해 `form-43-fill.hwpx` 의 청구내역 표 + 본문 텍스트 토큰에 채워 .hwpx 로 생성한다.
>
> **Project**: 정치자금 회계관리 시스템 (political-fund-accounting-management)
> **Version**: 0.8.0.0 → 0.9.0.0(예정)
> **Author**: DrunkenZealnut
> **Date**: 2026-06-10
> **Status**: Draft
> **Planning Doc**: [reimbursement-claim-hwpx.plan.md](../01-plan/features/reimbursement-claim-hwpx.plan.md)

### Pipeline References

| Phase | Document | Status |
|-------|----------|--------|
| Phase 1 (Schema) | acc_book/codevalue/organ 기존 스키마 | ✅ (변경 없음) |
| Phase 4 (API) | 본 문서 §4 | ✅ |

---

## 1. Overview

### 1.1 Design Goals

- 서식 43(선거비용 보전청구서)을 제출서류 화면에서 22-1~22-4 와 동일한 "데이터 채움" UX 로 .hwpx 생성.
- **보전 체크(`acc_print_ok='Y'`)된 선거비용** 지출만 자금원별로 집계해 청구내역 표 채움.
- 자금원 분류·선거비용 판별을 회계보고서(22-1/22-2)와 **동일 SSOT**로 공유해 합계 정합 보장.
- 빌더는 DB/IO 비의존 순수 함수로 단위 테스트 가능.

### 1.2 Design Principles

- **SSOT 공유**: `classifyFundingSource`(funding-source) + `classifyExpenseCategory`(report-summary-builder) 재사용. 새 분류 로직 금지.
- **고정 셀 치환**: 청구내역 표는 고정 행/열 → `generateHwpx` 토큰 치환(행 동적 복제 없음, 22-2 와 동일).
- **옵션 A(사무소 단일 집계)**: acc_book 에 선거연락소 식별 컬럼이 없으므로 전액을 선거사무소 열에 집계, 연락소 열은 빈칸(수기), 합계 열 = 사무소 (22-2 와 동일 정책).
- **무변경 재사용**: `generate.ts`(치환·재패키징), `escape.ts`, `funding-source.ts` 손대지 않음.

### 1.3 Plan 대비 실측 조정 (form-43.hwpx section0 분석 결과)

| 항목 | Plan 가정 | 실측 확정 | 영향 |
|------|-----------|-----------|------|
| 표 축 | 자금원=열(4분류) | **자금원=행(3분류), 장소=열** (22-2 와 전치) | 신규 빌더 필요 |
| 자금원 분류 | 후보자자산/후원회기부금/보조금/보조금외 | 후보자자산/후원회기부금/**정당의지원금**(보조금+보조금외 통합) | 빌더에서 보조금+보조금외 합산 |
| 집계 로직 | `reimbursement-aggregator` 재사용 | **신규 `reimbursement-claim-builder`** (입력형태·분류 상이) — aggregator 의 보전필터 규칙만 참조, SSOT(funding-source/classifyExpenseCategory)는 공유 | §2.3 |
| 한글 금액 | (미언급) | "5. 보전청구 총액 : 금**이천오백만원**(￦25,000,000)" → **한글 금액 유틸 신규** | `korean-amount.ts` |
| 텍스트 입력 | organ/auth prefill | 선거구명·수령계좌·선관위명은 organ 에 없음 → **수동 입력 필드 + organ prefill 하이브리드** | §5 |

---

## 2. Architecture

### 2.1 Component Diagram

```
[제출서류 화면]                        [서버 API]                         [DB / 템플릿]
SubmissionFormsPage
  └ FormInputPanel (서식43:           POST /api/hwpx/                  acc_book(acc_print_ok)
     dataFill="reimbursement"   ──▶    reimbursement-claim       ──▶   codevalue, organ
     + 수동입력 fields)                  │                              form-43-fill.hwpx
        {orgId,formId,values}           │ 인증·멤버십 가드(income-ledger 동일)
                                        │ 조회 → buildReimbursementClaimModel(rows,getName)
                                        │ + organ/values prefill + korean-amount
                                        │ → generateHwpx(template, tokens)
        ◀── .hwpx (attachment) ─────────┘
```

### 2.2 Data Flow

```
acc_book 행(수입·지출 혼재)
  └ filter: incm_sec_cd=2 ∧ acc_print_ok='Y' ∧ classifyExpenseCategory(과목명)="선거비용" ∧ acc_amt>0
      └ classifyFundingSource(acc_sec_cd, 계정명)
          후보자자산 → office.후보자자산
          후원회기부금 → office.후원회기부금
          보조금 | 보조금외 | 기타 → office.정당의지원금   (보조금외 열 부재 → 정당의지원금에 흡수, 합계 보존)
      └ finalize: 합계 = 후보자자산+후원회기부금+정당의지원금
  → ClaimModel { office, total(=office) }  (옵션 A)
  → claimTableTokens(8) + claimTotalTokens(숫자/한글) + textTokens(organ+values) → generateHwpx
```

### 2.3 Dependencies

| Component | Depends On | Purpose |
|-----------|-----------|---------|
| reimbursement-claim-builder | funding-source, report-summary-builder(classifyExpenseCategory), income-ledger-builder(formatAmount) | 자금원 분류·선거비용 판별·금액 포맷 SSOT |
| reimbursement-claim-builder | korean-amount(신규) | 보전청구 총액 한글 표기 |
| route | generate(generateHwpx), supabase, builder | 조회·치환·응답 |
| FormInputPanel | form-fields(dataFill), route | UI 분기·다운로드 |

> **reimbursement-aggregator 재사용 범위**: Excel 경로 전용 함수로 입력 형태(`electionExpenseItemCds`)·분류(4분류, 기타 제외)가 서식 43(3분류, 기타 흡수)과 달라 직접 호출하지 않는다. 보전 체크 필터 규칙(`incm=2 ∧ acc_print_ok='Y' ∧ 선거비용 ∧ amt>0`)을 신규 빌더에 동일 적용해 일관성 유지(테스트로 합계 일치 검증).

---

## 3. Data Model

### 3.1 빌더 타입 (`lib/hwpx/reimbursement-claim-builder.ts`)

```typescript
/** 서식 43 자금원 3분류 + 합계 (정당의지원금 = 보조금 + 보조금외 + 기타 흡수). */
export interface ClaimFundingBreakdown {
  후보자자산: number;
  후원회기부금: number;
  정당의지원금: number;
  합계: number; // = 후보자자산 + 후원회기부금 + 정당의지원금
}

export interface ReimbursementClaimModel {
  office: ClaimFundingBreakdown; // 선거사무소 (옵션 A: 전액)
  total: ClaimFundingBreakdown;  // 합계 = office (옵션 A; 연락소 0)
}

export interface ReimbursementClaimInputRow {
  incm_sec_cd: number;   // 2=지출
  acc_sec_cd: number;    // 자금원 코드
  item_sec_cd: number;   // 과목 코드(선거비용 판별)
  acc_amt: number;
  acc_print_ok: string | null; // 'Y'=보전 체크
}

type GetName = (cvId: number) => string;

export function buildReimbursementClaimModel(
  rows: ReimbursementClaimInputRow[], getName: GetName,
): ReimbursementClaimModel;

/** 청구내역 표 셀 토큰(8개): {{후보자자산_사무소}} {{후보자자산_합계}} … {{합계_합계}} */
export function claimTableTokens(model: ReimbursementClaimModel): Record<string, string>;
```

### 3.2 한글 금액 유틸 (`lib/utils/korean-amount.ts` **재사용**)

> **정리(/simplify) 반영**: 신규 작성 대신 기존 `toKoreanAmount` 를 재사용한다 — 선거비용 보전청구서 Excel(`lib/excel-template/reimbursement-claim-form.ts`)이 이미 같은 함수로 "금○○○원"을 표기하므로 Excel↔HWPX 표기가 일치한다. (0·비정상 금액 → 빈 한글 표기 → "금 원")

```typescript
export function toKoreanAmount(amount: number): string; // 25000000 → "이천오백만"
```
- 본문 토큰: `금{{보전청구총액_한글}}원(￦{{보전청구총액_숫자}})` 형태로 치환 (숫자=`formatAmount`).

### 3.3 청구내역 표 셀 주소 (form-43.hwpx 표0 실측)

| rowAddr\colAddr | 0 구분 | 1 선거사무소 | 2~5 연락소×4 | 6 합계 | 7 비고 |
|---|---|---|---|---|---|
| 2 | 후보자 자산 | `{{후보자자산_사무소}}` | (빈칸·수기) | `{{후보자자산_합계}}` | |
| 3 | 후원회기부금 | `{{후원회기부금_사무소}}` | (빈칸) | `{{후원회기부금_합계}}` | |
| 4 | 정당의지원금 | `{{정당의지원금_사무소}}` | (빈칸) | `{{정당의지원금_합계}}` | |
| 5 | 합계 | `{{합계_사무소}}` | (빈칸) | `{{합계_합계}}` | |

- 토큰화 셀 = 4행 × {colAddr 1, 6} = **8개**. 연락소 열(2~5)은 예시값 제거 후 빈칸(옵션 A).

### 3.4 DB 스키마

변경 없음. `acc_book` 조회 컬럼에 `acc_print_ok` 추가(기존 컬럼). estate/codevalue/organ 무변경.

---

## 4. API Specification

### 4.1 Endpoint

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/api/hwpx/reimbursement-claim` | 서식 43 보전청구서 데이터 채움 .hwpx | Required (org 멤버십) |

### 4.2 `POST /api/hwpx/reimbursement-claim`

**Request:**
```json
{
  "orgId": 9,
  "values": {
    "선거구명": "○○시 ○○구",
    "수령_금융기관": "○○은행",
    "수령_예금주": "홍길동",
    "수령_계좌번호": "123-34-56789",
    "선관위명": "○○구"
  }
}
```
- `values` 는 수동 입력 텍스트 토큰(선택). 미제공 키는 빈칸 처리(`stripUnresolvedTokens`).

**처리 흐름** (accounting-report route 패턴 차용):
1. body 검증(orgId 정수>0) → 인증(`getUser`) → `user_organ` 멤버십 가드.
2. 템플릿 로드: `public/hwpx-templates/form-43-fill.hwpx` (`readFile`, fetch 금지).
3. 조회:
   - `acc_book`: `incm_sec_cd, acc_sec_cd, item_sec_cd, acc_amt, acc_print_ok` (org_id=orgId).
   - `codevalue`: `cv_id, cv_name` → `getName`.
   - `organ`: `org_name, rep_name, acct_name` (prefill 소스).
4. `buildReimbursementClaimModel(rows, getName)` → `claimTableTokens` (8) + `보전청구총액_한글/숫자`.
5. 텍스트 토큰 병합: organ prefill(`선거명`=고정 "제9회 전국동시지방선거", `후보자명`=rep_name||orgName) + `values`(선거구명/수령*/선관위명).
6. `generateHwpx(template, tokens)` → 200 `application/hwp+zip` (Content-Disposition attachment, 파일명 `선거비용보전청구서.hwpx`).

**Response:** 200 .hwpx | 4xx/5xx `{ error: { code, message } }`

### 4.3 텍스트 토큰 레지스트리

| 토큰 | 소스 | 비고 |
|------|------|------|
| `선거명` | 고정 "제9회 전국동시지방선거" | |
| `선거구명` | values(수동) | organ 없음 |
| `후보자명` | organ.rep_name ?? orgName | 본문 "3. 후보자명" |
| `보전청구총액_한글` / `보전청구총액_숫자` | 집계 합계 | korean-amount + formatAmount |
| `수령_금융기관` / `수령_예금주` / `수령_계좌번호` | values(수동) | organ 없음 |
| `선관위명` | values(수동) | "○○○선거관리위원회 귀중" |
| (표0 8셀) | 집계 | §3.3 |

> **표1(청구인 서명란) 미토큰화**: 후보자/선거사무장/회계책임자 `○○○ (인)` 은 공식 보일러플레이트로 유지(README 정책). 후보자명은 본문 "3. 후보자명"에서 확인되므로 서명란 수기로 충분 — 본 범위 제외.

---

## 5. UI/UX Design

### 5.1 통합 지점 (`components/submission-forms/FormInputPanel.tsx`)

```typescript
const DATA_FILL_ENDPOINT = {
  "income-ledger": "/api/hwpx/income-ledger",
  "accounting-report": "/api/hwpx/accounting-report",
  "reimbursement": "/api/hwpx/reimbursement-claim",   // 추가
};
const DATA_FILL_TEXT = {
  // …
  "reimbursement": { desc: "보전 체크된 선거비용을 자금원별로 집계해 보전청구서를 채웁니다.", button: "보전청구서 채워 받기" },
};
```

### 5.2 하이브리드 입력 (dataFill + 수동 필드)

현재 `FormInputPanel` 은 `def.dataFill` 이면 입력 폼을 건너뛰고 버튼만 노출한다. 서식 43 은 수동 텍스트(선거구명/수령계좌/선관위명)가 필요하므로:

- `def.dataFill && def.fields.length > 0` → **입력 폼 + 데이터 채움 버튼 동시 노출**.
- 데이터 채움 액션 payload 에 `values`(폼 입력) 포함: `{ orgId, formId, values }`.
- `income-ledger`·`accounting-report`(fields=[]) 는 기존과 동일(빈 폼 → 버튼만). **회귀 없음**.

### 5.3 form-fields.ts 변경

```typescript
dataFill?: "income-ledger" | "accounting-report" | "reimbursement";  // 유니온 확장
// 서식 43:
{ id: "43", label: "선거비용 보전청구서", category: "보전·청구", template: "form-43-fill.hwpx",
  orgScope: "candidate", dataFill: "reimbursement",
  fields: fields("선거명", "선거구명", "후보자명", "수령_금융기관", "수령_예금주", "수령_계좌번호", "선관위명") }
```
- fields prefill source: `선거명`=const("제9회 전국동시지방선거"·자동), `후보자명`=organ.rep_name(자동),
  `선거구명`·`선관위명`=manual(required), `수령_금융기관/예금주/계좌번호`=manual. 클라이언트 prefill + 사용자 수정 후 `values` 로 전송, route 가 organ/고정값 fallback.
- `form-fields.test.ts` 의 dataFill 예외 처리에 "reimbursement" 추가(빈 fields 규칙 제외 + 표·본문 토큰 정합성 검증).

---

## 6. Error Handling

| Code | 상황 | HTTP |
|------|------|------|
| INVALID_REQUEST | orgId 누락/형식 오류 | 400 |
| UNAUTHORIZED | 미로그인 | 401 |
| FORBIDDEN | org 멤버십 없음 | 403 |
| TEMPLATE_MISSING | form-43-fill.hwpx 로드 실패 | 500 |
| QUERY_FAILED | acc_book/codevalue/organ 조회 실패 | 500 |
| GENERATE_FAILED | 치환/재패키징 오류 | 500 |

응답 형식: `{ "error": { "code", "message", "detail?" } }` (accounting-report 동일).

---

## 7. Security Considerations

- [x] 인증(`getUser`) + `user_organ` 멤버십 가드(IDOR 방지, income-ledger 동일 패턴).
- [x] service-role 키는 서버 라우트에서만 사용(RLS 우회).
- [x] `values` 입력은 `generateHwpx` 내부 `escapeXml` 로 XML escape(주입 방지).
- [x] 응답 `Cache-Control: no-store`.
- [ ] Rate limiting — 기존 라우트와 동일 수준(별도 미도입).

---

## 8. Test Plan

### 8.1 Test Scope

| Type | Target | Tool |
|------|--------|------|
| Unit | `buildReimbursementClaimModel`(필터·자금원·옵션A), `claimTableTokens`, `amountToKoreanWords` | Vitest |
| Integration | `form-43-fill.hwpx` + 빌더 → generateHwpx, **잔여 토큰 0**, ZIP/mimetype 유효 | Vitest |
| Cross-check | 보전 체크 선거비용 합계 == 동일 입력에 대한 reimbursement-aggregator(보조금+보조금외 합산) | Vitest |

### 8.2 Test Cases (Key)

- [ ] Happy: 보전체크 선거비용 다건 → 후보자자산/후원회기부금/정당의지원금/합계 정확.
- [ ] 필터: `acc_print_ok != 'Y'`, 선거비용외, 수입행, `amt<=0` 제외.
- [ ] 자금원: 보조금(82)·보조금외(83)·기타(미분류) 모두 정당의지원금에 합산(합계 보존).
- [ ] 옵션 A: total == office, 연락소 셀 빈칸.
- [ ] korean-amount: 25,000,000→"이천오백만", 0→"영", 105,000→"십만오천", 억/조 경계.
- [ ] Integration: 생성 .hwpx 에 `{{` 잔류 0, 한글 오픈(수동 검수).
- [ ] form-fields.test: 서식 43 dataFill 예외 통과.

---

## 9. Clean Architecture

### 9.1 This Feature's Layer Assignment

| Component | Layer | Location |
|-----------|-------|----------|
| FormInputPanel(수정) | Presentation | `src/components/submission-forms/` |
| reimbursement-claim route | Infrastructure(API) | `src/app/api/hwpx/reimbursement-claim/route.ts` |
| reimbursement-claim-builder | Domain(순수) | `src/lib/hwpx/reimbursement-claim-builder.ts` |
| korean-amount | Domain(순수) | `src/lib/accounting/korean-amount.ts` |
| form-fields(수정) | Domain | `src/lib/hwpx/form-fields.ts` |

### 9.2 Dependency Rule

빌더·korean-amount 는 외부 의존 없는 순수 함수(Domain) → route(Infrastructure)가 조립. Presentation(FormInputPanel)은 route 만 호출. 내부→외부 의존 없음.

---

## 10. Coding Convention Reference

- 모듈명: `reimbursement-claim-*` (kebab-case), 토큰 키 한글(`{{후보자자산_사무소}}`) — 기존 22-2 관례 일치.
- 빌더 순수성: DB/fetch 비의존, 입력 주입형(테스트 용이).
- 템플릿 제작: `app/scripts/make-form-43-fill.py` (22-2 스크립트 패턴: cellAddr 기반 토큰화 + 검증 assert).

---

## 11. Implementation Guide

### 11.1 File Structure

```
app/
├── scripts/make-form-43-fill.py                         (신규: 템플릿 토큰화)
├── public/hwpx-templates/form-43-fill.hwpx              (신규 산출물)
├── src/lib/accounting/korean-amount.ts(+ .test.ts)       (신규)
├── src/lib/hwpx/reimbursement-claim-builder.ts(+ .test, + integration.test) (신규)
├── src/lib/hwpx/form-fields.ts                          (수정: dataFill 유니온 + 서식43)
├── src/lib/hwpx/form-fields.test.ts                     (수정: dataFill 예외)
├── src/app/api/hwpx/reimbursement-claim/route.ts        (신규)
├── src/components/submission-forms/FormInputPanel.tsx   (수정: reimbursement 분기 + 하이브리드)
├── next.config.*                                        (수정: outputFileTracingIncludes form-43-fill.hwpx)
├── VERSION (0.9.0.0) / ../CHANGELOG.md                  (수정)
```

### 11.2 Implementation Order

1. [ ] `korean-amount.ts` + 테스트 (독립 유틸 먼저).
2. [ ] `make-form-43-fill.py` 실행 → `form-43-fill.hwpx` 생성, 토큰 8개 + 본문 토큰 검증.
3. [ ] `reimbursement-claim-builder.ts` + 단위/교차검증 테스트(TDD).
4. [ ] `form-fields.ts` dataFill 유니온·서식43 정의 + test 예외.
5. [ ] `route.ts` 신규 API.
6. [ ] `FormInputPanel.tsx` reimbursement 분기 + 하이브리드 입력.
7. [ ] `next.config` 트레이싱 + integration 테스트.
8. [ ] lint·build·전체 테스트 → 한글 수동 검수 → VERSION/CHANGELOG.

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-06-10 | Initial draft (form-43 실측 반영) | DrunkenZealnut |
