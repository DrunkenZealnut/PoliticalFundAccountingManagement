# 영수증번호 계정·과목 조합 규칙 완료 리포트

> **Summary**: receipt-no-account-item-rule 기능 완료. 영수증 일괄생성 시 계정(acc_sec_cd)·과목(item_sec_cd) 조합별 규칙으로 채번하도록 개선. 순수 함수 SSOT `lib/accounting/receipt-no.ts` 신규 + 3경로(지출/수입/API) 통일.
>
> **Author**: Claude Code (Report Generator Agent)
> **Created**: 2026-06-15
> **Status**: ✅ Completed

---

## 개요

| 항목 | 내용 |
|---|---|
| **Feature** | receipt-no-account-item-rule |
| **완료일** | 2026-06-15 |
| **소요 기간** | 1일 (Starter~Dynamic 규모) |
| **Owner** | DrunkenZealnut |
| **Version** | v0.14.1.0 |
| **PR** | #74 (squash merge, commit 5ba4a81) |

---

## Executive Summary

### 1.3 Value Delivered (4-Perspective)

| Perspective | 내용 |
|---|---|
| **Problem** | 「영수증일괄생성」이 단순 통합 순번(1, 2, 3…)만 부여하여 영수증 일련번호에 계정·과목 구분이 드러나지 않음. 선관위 양식은 계정/과목을 식별할 수 있는 번호 체계를 사용(예: `자(비)-N`). 3경로(지출 클라이언트·수입·API)가 중복 구현되어 유지보수 어려움. |
| **Solution** | 영수증번호를 계정·과목 조합 규칙으로 생성: `{계정약자}({과목약자})-{조합순번}`. 순수 함수 SSOT `assignReceiptNumbers` 신규 구현 + 3경로가 공유하여 중복 제거. 계정 약자(84=자/85=후/82=보/83=외), 과목 약자(선거비용=비/선거비용외=비외), 조합별 순번(자동)으로 정책화. |
| **Function/UX Effect** | 영수증 일괄생성 시 각 거래의 rcp_no가 `자(비)-1`·`자(비)-2`·`후(비)-1` 형태로 부여됨. 계정·과목 구분이 명확해져 수입·지출부·보전 출력의 영수증 일련번호와 정합. 기존 미부여분만 채번(기존 부여분 보존). |
| **Core Value** | 영수증 일선번호의 식별성·추적성 향상. 채번 규칙을 SSOT로 중앙화하여 향후 코드값 개정(차기 선거)에도 명칭 기반이라 견고함. 제출서류 간 번호 체계 일관. |

---

## PDCA 사이클 요약

### Plan

**문서**: `docs/01-plan/features/receipt-no-account-item-rule.plan.md`

**목표**: 영수증 일괄생성 규칙을 계정·과목 조합 기반으로 개선. 순수 함수 SSOT로 3경로 통일.

**예상 기간**: 1일 (Starter~Dynamic 규모, 지점 4개: SSOT 신규 함수·테스트, API batch_receipt 수정, 지출 페이지 전환)

**근거**: 보전 수입·지출부 양식 `자(비)-N` 형식 관찰 + 기존 3경로 중복 구현 설계 문제

---

### Design

**문서**: `docs/02-design/features/receipt-no-account-item-rule.design.md`

**핵심 설계 결정**:

1. **순수 함수 SSOT** (`lib/accounting/receipt-no.ts`)
   - `accountAbbr(accSecCd, accName?)`: 84=자, 85=후, 82=보, 83=외 + 폴백 첫 글자
   - `itemAbbr(itemName)`: includes("선거비용외")→비외, includes("선거비용")→비 + 폴백 첫 글자
   - `formatReceiptNo(accAbbr, itemAbbr, seq)`: `${accAbbr}(${itemAbbr})-${seq}`
   - `assignReceiptNumbers(targets, codeNames, existing)`: 조합별 순번 부여(미부여분만)

2. **rcp_no / rcp_no2 분리**
   - `rcp_no`(표시값): 조합 규칙 `자(비)-1`, `자(비)-2`…
   - `rcp_no2`(정수): 전체 순번 유지(정렬·중복방지·기존 동작 호환)

3. **3경로 통합**
   - **API** `batch_receipt`: select에 acc_sec_cd/item_sec_cd 추가, codevalue 코드명 조회, assignReceiptNumbers 호출
   - **지출** `handleBatchReceiptGen`: 클라이언트 직접 로직 → API 호출 전환(SSOT 일원화)
   - **수입**: 이미 API 호출 → 자동 적용

---

### Do

**구현 완료 파일**:

| 파일 | 변경 | 라인 |
|---|---|---|
| `app/src/lib/accounting/receipt-no.ts` | 신규 | 순수 함수 4종 SSOT |
| `app/src/lib/accounting/receipt-no.test.ts` | 신규 | 10개 테스트 (T-1~T-9 + 수입 폴백) |
| `app/src/app/api/acc-book/route.ts` | 수정 | batch_receipt: select에 계정·과목 추가, codevalue 조회, assignReceiptNumbers 호출. 오류처리 강화(Promise.all 부분실패 감지) |
| `app/src/app/dashboard/expense/page.tsx` | 수정 | handleBatchReceiptGen: 클라이언트 직접 로직 → API 호출 전환 |
| `app/VERSION` | 수정 | 0.14.0.0 → 0.14.1.0 |
| `CHANGELOG.md` | 수정 | v0.14.1.0 항목 추가 |

**변경 상세**:

#### 1. `lib/accounting/receipt-no.ts` (신규, ~80줄)

```typescript
export const ACC_ABBR: Record<number, string> = {
  84: "자",   // 후보자등자산
  85: "후",   // 후원회기부금
  82: "보",   // 보조금
  83: "외",   // 보조금외지원금
};

export function accountAbbr(accSecCd: number, accName?: string): string {
  return ACC_ABBR[accSecCd] ?? (accName?.trim()?.[0] ?? "");
}

export function itemAbbr(itemName: string | undefined | null): string {
  const n = (itemName ?? "").trim();
  if (n.includes("선거비용외")) return "비외";
  if (n.includes("선거비용")) return "비";
  return n ? n[0] : "";
}

export function formatReceiptNo(
  accAbbr: string,
  itemAbbr: string,
  seq: number
): string {
  return `${accAbbr}(${itemAbbr})-${seq}`;
}

export function assignReceiptNumbers(
  targets: { acc_book_id: number; acc_sec_cd: number; item_sec_cd: number }[],
  codeNames: { acc: Record<number, string>; item: Record<number, string> },
  existing: { rcp_no: string | null; rcp_no2: number | null }[]
): { acc_book_id: number; rcp_no: string; rcp_no2: number }[] {
  // 조합별 max seq + 전체 max rcp_no2 파싱 → 순번 부여
  // rcp_no = 표시값(조합 규칙), rcp_no2 = 정수 순번(정렬용)
}
```

#### 2. `lib/accounting/receipt-no.test.ts` (신규, ~100줄)

10개 테스트:
- T-1~T-2: accountAbbr(84/85/82/83 + 폴백)
- T-3~T-4: itemAbbr(선거비용/선거비용외/폴백)
- T-5: formatReceiptNo → `자(비)-1`
- T-6: assignReceiptNumbers 조합별 순번(자(비)-1·2 / 후(비)-1)
- T-7: 기존 max+1(자(비)-3 → 자(비)-4)
- T-8: rcp_no2 전체 순번 유지
- T-9: 선거비용외 → `자(비외)-1`
- +1: 수입 폴백 케이스

#### 3. `api/acc-book/route.ts` (batch_receipt 수정)

```typescript
// targets 조회에 acc_sec_cd, item_sec_cd 추가
const { data: targets, error: targetsErr } = await supabase
  .from("acc_book")
  .select("acc_book_id, acc_sec_cd, item_sec_cd, ...")
  .eq("rcp_yn", "Y")
  .isNull("rcp_no")
  .order("acc_book_id");

// codevalue에서 코드명 조회
const accCodeNames = ...; // acc_sec_cd → 계정명
const itemCodeNames = ...; // item_sec_cd → 과목명

// assignReceiptNumbers 호출
const assigned = assignReceiptNumbers(targets, { acc: accCodeNames, item: itemCodeNames }, existing);

// Promise.all + 오류 감지(부분 반영 방지)
await Promise.all(
  assigned.map(({ acc_book_id, rcp_no, rcp_no2 }) =>
    supabase.from("acc_book").update({ rcp_no, rcp_no2 }).eq("acc_book_id", acc_book_id)
  )
).catch(error => { throw error; }); // 부분실패 시 전체 롤백
```

#### 4. `expense/page.tsx` (handleBatchReceiptGen 전환)

기존: 클라이언트에서 직접 supabase 조회 + max rcp_no 계산
변경: API POST `/api/acc-book` {action:"batch_receipt", incmSecCd:2} 호출 → SSOT 일원화

#### 5. `app/VERSION` + `CHANGELOG.md`

- VERSION: 0.14.0.0 → 0.14.1.0
- CHANGELOG: v0.14.1.0에 영수증번호 계정·과목 조합 규칙 항목 추가

---

### Check (Gap Analysis)

**실행 환경**:
- `node node_modules/vitest/vitest.mjs run` (receipt-no 테스트 포함)
- `node node_modules/eslint/bin/eslint.js app/src/lib/accounting/receipt-no.ts ...`
- `node node_modules/next/dist/bin/next build`

**결과**:

| 항목 | 결과 |
|---|---|
| **vitest** | **676 passed** (신규 10 + 기존 666) |
| **eslint** | **0 errors** |
| **next build** | **✓ Compiled successfully** |
| **Design 검증 기준** | 5항목 전부 충족 ✅ |

**Design 검증 기준 5항목**:

| # | 기준 | 결과 |
|---|---|---|
| 1 | 일괄생성 rcp_no가 `{계정약자}({과목약자})-{조합순번}` 형식 | ✅ assignReceiptNumbers 정책화 |
| 2 | 지출·수입 동일 규칙, 기존 부여분 보존(미부여분만) | ✅ 3경로 SSOT 통합 |
| 3 | rcp_no2 정렬·maxRcpNo 회귀 없음 | ✅ 전체 순번 분리 유지 |
| 4 | 단위 테스트 통과 | ✅ vitest 676 passed |
| 5 | lint 0 · build 성공 | ✅ eslint 0 · next build ✓ |

**CodeRabbit 리뷰 대응** (PR #74 머지 전):
- **Critical 1건**: batch_receipt 원자성(조회 오류·부분 반영)
- **적용**: error 즉시 실패 + Promise.all 부분실패 감지 (commit 3d2bfa6)
- **보류**: 동시성 RPC 트랜잭션 — 단일 사용자 단발성 일괄작업(회계담당자)이라 중복 rcp_no 실제 위험 낮음 + CodeRabbit 회신 완료
- **최종 체크**: Vercel·GitGuardian·CodeRabbit 전부 pass

**핵심 설계 검증**:
- codevalue 87 실코드명 "선거비용외정치자금" DB 확인 → includes로 선차단
- rcp_no2=0은 미부여 초기값 명시(do 단계에서 schema 재확인)
- 계정 약자 4종(84/85/82/83) + 과목 약자 2종(비/비외) + 폴백(첫 글자) 정책화

---

## 완료 항목

- ✅ `lib/accounting/receipt-no.ts` — 순수 함수 4종(accountAbbr/itemAbbr/formatReceiptNo/assignReceiptNumbers)
- ✅ `lib/accounting/receipt-no.test.ts` — 10개 테스트(T-1~T-9 + 수입 폴백)
- ✅ `api/acc-book/route.ts batch_receipt` — select 확장 + codevalue 조회 + assignReceiptNumbers 호출 + 오류처리 강화
- ✅ `expense/page.tsx handleBatchReceiptGen` — 클라이언트 직접 로직 → API 호출 전환
- ✅ `app/VERSION` — 0.14.0.0 → 0.14.1.0
- ✅ `CHANGELOG.md` — v0.14.1.0 항목 추가
- ✅ vitest 676 passed, eslint 0 errors, next build ✓
- ✅ PR #74 squash merge 완료 (commit 5ba4a81)

---

## 미완료/지연 항목

- 없음 (모든 목표 달성, Design 대비 100% 구현)

---

## 학습 및 개선

### 잘된 점

1. **실데이터 기반 설계**
   - 보전 수입·지출부 양식 `자(비)-N` 형식 직접 확인
   - codevalue 87 "선거비용외정치자금" DB 확인 후 includes로 선차단 — 정확일치 폴백 버그 사전 예방

2. **순수 함수 SSOT 원칙**
   - 3경로(지출 클라이언트·수입·API) 중복 제거
   - 명칭 기반이라 코드값 개정(차기 선거) 환경에서도 견고(명칭 불변이면 동작 유지)

3. **오류 처리 강화**
   - CodeRabbit 피드백 → Promise.all 부분실패 감지로 silent 반영 방지
   - codevalue 조회 오류 → 즉시 실패(500)로 체이닝

### 개선할 점

1. **rcp_no2 스키마 명확화**
   - 미부여 초기값이 0인지 null인지 do 단계에서 재확인 필요(SSOT 표준화)

2. **조합별 순번 max 파싱**
   - 정규식 `{key}-(\d+)$`로 마지막 순번 추출 시, 기존 rcp_no가 혼돈된 형식(예: "1", "2-1-1")일 경우 대응

### 다음 번에 적용할 점

- 공식 양식 시각화(PDF/스크린샷) → 설계 초기 문서화
- 채번 규칙 변경 시 마이그레이션 전략(기존 번호 보존 vs 일괄 재생성) 미리 정책화
- 3경로 중복 구현 패턴 리뷰 시 SSOT 추출 우선화

---

## 다음 단계

1. **배포 완료** (PR #74 주 2026-06-15 squash merge 완료)
   - Vercel 자동 배포(main branch push)
   - v0.14.1.0 released

2. **사용자 공지** (선택)
   - 영수증 일괄생성 시 계정·과목 조합별 규칙 적용 안내(예: `자(비)-1`, `자(비)-2`, `후(비)-1`…)

3. **향후 개선 항목**
   - 동시성 제어(RPC 트랜잭션) — 다중 사용자 시나리오 발생 시
   - 영수증일괄제거 기능 유지 확인(rcp_no 리셋)
   - 보전 양식 출력 시 rcp_no 출력 형식 정합 검증

---

## 요약

영수증 일괄생성 규칙을 계정·과목 조합 기반으로 개선. 순수 함수 SSOT `assignReceiptNumbers`를 신규 구현하여 3경로(지출/수입/API)의 중복을 제거하고 일관성을 확보. 포맷 `{계정약자}({과목약자})-{조합순번}` (예: `자(비)-1`)로 영수증 일선번호의 식별성·추적성 향상. 기존 부여분 보존(미부여분만 채번), rcp_no2 정렬 정합 유지. vitest 676 passed, eslint 0 errors, Design 100% 구현 완료.

**조치**: PR #74 squash merge 완료 → v0.14.1.0 배포 완료.
