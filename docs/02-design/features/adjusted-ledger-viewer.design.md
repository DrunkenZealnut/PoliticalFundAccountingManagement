# 재조정 데이터 뷰어 + 영수증 일괄생성 Design Document

> **Summary**: `income-expense-book`(수입·지출부)을 **강화**해 "보고용 재조정 데이터 + 정확한 영수증번호 + 분할/이동 표시"를 검토할 수 있게 한다. 핵심: 뷰어가 **export-sqlite와 동일한 재조정 산출**을 쓰도록 공통 SSOT를 추출한다 — 현재 뷰어는 `buildLedgerRows`(분할 슬라이스가 acc_book_id 공유 → 채번 충돌·React key 중복)를 직접 쓰지만, export는 `planAllocationPersist`+`applyPlanInMemory`(이동분 신규 id) + `fillExportReceiptNumbers`로 깔끔하다. 그 materialization을 `lib/accounting`으로 추출(`buildAdjustedAccBook`)해 **뷰어·export가 공유** → 화면 영수증번호 == .db == HWPX. 영수증은 (가) **계산만**(원본 acc_book write 0).
>
> **Project**: PoliticalFundAccountingManagement
> **Version**: 0.18.x → 0.19.0.0 예정
> **Author**: Claude · **Date**: 2026-06-22 · **Status**: Draft
> **Planning Doc**: [adjusted-ledger-viewer.plan.md](../../01-plan/features/adjusted-ledger-viewer.plan.md)

---

## 1. 핵심 설계 결정 (조사로 확정)

| 항목 | 조사 결과 | 결정 |
|------|-----------|------|
| 호스트 | `income-expense-book`이 이미 재조정 장부 뷰어(buildLedgerRows + 16컬럼 표 + Excel) | **강화**(신규 페이지 X) + "재조정본" 배지 |
| 영수증 채번 SSOT | `fillExportReceiptNumbers(rows, codeNames)` — **acc_book_id 키**로 채번, 미부여만 채움·기존 보존·incm별 스코프 | 재사용. 단 **행마다 고유 acc_book_id 필요** |
| buildLedgerRows 분할 | split-keep/split-moved가 **acc_book_id 공유**(splitGroupId) → fillExport 충돌·React `key` 중복(현재 잠재 버그) | 뷰어는 **export materialization** 사용으로 회피 |
| export materialization | `allocateCandidateAccBookForExport`(route 내부, 비공개) = `planAllocationPersist`+`applyPlanInMemory` → **이동분 신규 id** | `lib/accounting`로 추출해 뷰어·export 공유(SSOT) |
| (가) 영수증 | export는 채번 계산만(원본 미변경) | 뷰어도 계산만, `api/acc-book` write 미사용 |

---

## 2. Architecture

```
income-expense-book/page.tsx (강화) ─┐
api/system/export-sqlite/route.ts ──┤  둘 다 동일 SSOT 사용 → 산출 동일
                                     ▼
lib/accounting/adjusted-ledger.ts (신설, 순수)
   buildAdjustedAccBook(rawRows, orgSecCd)
     · 후보자(82~85): planAllocationPersist→applyPlanInMemory (이동분 신규 id, 분할/이동 표기)
     · 비후보자: raw 그대로
   → 재조정 행[] (고유 id, alloc_src_id/raw_* 추적)
        │
        ▼ fillExportReceiptNumbers(행[], codeNames)   ← 영수증 계산(가, write 0)
        ▼
   재조정 행 + rcp_no(+rcp_no2) + origin(원본/이동/분할)
        ├─▶ 뷰어: 16컬럼 표 + 「구분」 컬럼 + 비고(재배분 84→82) + Excel
        └─▶ export-sqlite: .db insert (기존과 동일 결과)
```

> `allocateCandidateAccBookForExport`(현 route 내부)를 `adjusted-ledger.ts`로 옮기고 route는 import해 쓴다(동작 불변 회귀 보장). 뷰어는 같은 함수를 호출 → **화면 == .db** 보장.

---

## 3. Data Model

신규 엔티티 없음. 재조정 행은 export materialization 결과(`AllocTrackedRow` 호환): 고유 `acc_book_id`(이동분은 신규), `alloc_src_id`(이동분 출처=원 id / null=원본·slice0), `raw_acc_sec_cd` 등 추적 컬럼. **origin 판정**(구현: `adjustedOrigins`, 출처별 행 수 기반):
- 한 원천(`alloc_src_id ?? acc_book_id`)이 2행 이상으로 나뉘면 그 슬라이스들 → **분할**
- 단일 행이면서 `alloc_src_id != null || raw_acc_sec_cd != null`(자금원이 바뀜) → **이동**(전액 이동 포함)
- 그 외(미변경) → **원본**

> 구현은 설계 초안의 `raw_acc_amt` 대신 **출처별 행 수**로 분할을 판정한다(전액 이동=이동, 다수 슬라이스=분할 — 더 단순·결정적). 단위 테스트가 이 판정을 고정한다.

```typescript
// lib/accounting/adjusted-ledger.ts (구현 시그니처 — orgSecCd 불필요, 행 acc_sec_cd로 후보자 자동판별)
export type AdjustedOrigin = "원본" | "이동" | "분할";
export function buildAdjustedAccBook(rows: Record<string, unknown>[]): Record<string, unknown>[];
//   후보자(82~85 존재)면 planAllocationPersist→applyPlanInMemory(이동분 신규 id), 아니면 입력 그대로 반환(동일 참조).
//   입력 메타(customer·rcp_no·content 등)는 spread로 보존. rcp_no2/note 등은 후속 SSOT가 채운다.
export function adjustedOrigins(rows: Record<string, unknown>[]): AdjustedOrigin[]; // 원본/이동/분할
export function adjustedNotes(rows: Record<string, unknown>[], accName?: (cv: number) => string): (string | null)[];
//   재배분된 행(이동/분할 슬라이스)에 "재배분 {원}→{현}" 비고. 원본·미변경은 null. accName 미지정 시 코드 숫자.
```

---

## 4. UI/UX Design (호스트 강화, 옵션 A)

### 4.1 상단
- **배지**: 제목 옆 `[보고용 재조정 데이터 · 원본 불변]`(파랑) — 원본 입력화면과 구분.
- **버튼 행**: 기존 `[조회][엑셀]` + 신규 **`[🧾 영수증 일괄생성]`** — 재조정+채번 재계산해 화면 갱신(가: DB write 0).
- **부족 경고**(있을 때): 빨강 배너 `과목 수입 부족 — 보조금(82)·선거비용외(87) X원` (`detectCandidateShortfalls` 재사용).

### 4.2 표 — 「구분」 컬럼 추가 (옵션 A)
기존 16컬럼 양식 유지 + **「구분」 컬럼 1개 추가**(번호 옆):

| 번호 | **구분** | 년월일 | 내역 | 수입(금회/누계) | 지출(금회/누계) | 잔액 | …처… | **영수증** | 비고 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | – | 26-04-29 | 진보당 지원금 | 1,000k / 1,000k | | 1,000k | … | 보-1 | |
| 2 | 🔀이동 | 26-05-15 | 사무실 임차 | | 854k / 854k | … | 자(비)-1 | 84→82 |
| 3 | ✂분할 | 26-05-15 | 현수막 | | 300k / … | … | 자(비)-2 | (원행 잔류) |

- **구분**: 원본(빈칸/–) · `🔀이동` · `✂분할` 배지.
- **영수증**: `fillExportReceiptNumbers` 계산값(미부여·분할/이동 슬라이스도 정확). 제출 산출물과 동일.
- **비고**: 이동/분할 행에 `note`(재배분 84→82) 표기.

### 4.3 Excel
기존 13/16컬럼 Excel 출력도 동일 재조정 행·영수증번호 사용(화면과 일치). 「구분」은 Excel엔 선택(공식 양식 유지 위해 비고에 병합 가능).

---

## 5. Error Handling / 불변
| 상황 | 처리 |
|------|------|
| 원본 불변 | 채번은 계산만 — `api/acc-book` write 호출 0 |
| 화면≠export 위험 | 동일 함수(`buildAdjustedAccBook`+`fillExportReceiptNumbers`) 공유로 구조적 보장 + 교차 테스트 |
| React key 중복(현 분할 버그) | 재조정 materialization이 고유 id 부여로 해소 |
| 과목 수입 부족(음수) | 경고 배너(은폐 금지), 생성은 막지 않음 |

---

## 6. Test Plan
| Type | Target | Tool |
|------|--------|------|
| Unit | `buildAdjustedAccBook` — 후보자 재조정(고유 id·origin 원본/이동/분할), 비후보자 raw·origin 원본 | Vitest |
| Unit | origin 판정(alloc_src_id/raw_* → 원본/이동/분할) | Vitest |
| Cross-parity(FR-04) | 동일 픽스처 → 뷰어 경로 행+rcp_no == export-sqlite 경로 행+rcp_no | Vitest |
| Unit | 영수증 결정성·기존 보존(가): 두 번 계산 동일, 기존 rcp_no 유지·미부여만 채움 | Vitest |
| Regression | export-sqlite가 추출 함수로 전환 후 기존 export 테스트 전부 통과(동작 불변) | Vitest |

핵심 TC:
- [x] TC-1 후보자 분할 픽스처 → 이동분 신규 id·origin 표기 정확. (`adjusted-ledger.test.ts`)
- [x] TC-2 뷰어 rcp_no == export rcp_no(같은 입력). (`adjusted-ledger-parity.test.ts` — route 실제 순서 normalize→sort→strip→fillReceipt 재현)
- [x] TC-3 채번 멱등 + 기존 rcp_no 보존. (`adjusted-ledger.test.ts`)
- [x] TC-4 비후보자 → raw·origin 원본·채번 스킴 정상. (`adjusted-ledger.test.ts`)
- [x] TC-5 export-sqlite 회귀(추출 후 .db 동일). (`candidate-gate.test.ts` 등 export-sqlite 스위트 26/26)
- [x] adjustedNotes 재배분 비고("재배분 {원}→{현}") 단위 테스트.

---

## 7. Clean Architecture
| Component | Layer | Location |
|-----------|-------|----------|
| `buildAdjustedAccBook`(추출), origin 판정, `fillExportReceiptNumbers`(기존) | Domain(순수) | `lib/accounting/adjusted-ledger.ts`, `receipt-no.ts` |
| 재조정 뷰어 표/배지/버튼/경고 | Presentation | `dashboard/income-expense-book/page.tsx` |
| export-sqlite | Infra | `api/system/export-sqlite/route.ts`(추출 함수 import) |

재조정 엔진(buildLedgerRows Pass0→1→2)·원본 데이터 불변.

---

## 8. Implementation Guide

### 8.1 변경/신설 파일
```
신설:
  src/lib/accounting/adjusted-ledger.ts        (buildAdjustedAccBook + origin, export route에서 추출)
  src/lib/accounting/adjusted-ledger.test.ts   (TC-1~4)
수정:
  src/app/api/system/export-sqlite/route.ts    (allocateCandidateAccBookForExport → buildAdjustedAccBook import, 동작 불변)
  src/app/dashboard/income-expense-book/page.tsx (재조정 materialization + fillExportReceiptNumbers + 구분 컬럼 + 배지/버튼/경고)
```

### 8.2 구현 순서 (TDD)
1. [ ] `adjusted-ledger.ts` 추출(export route 로직 이동) + origin 판정 + 단위 테스트(TC-1/4). export-sqlite를 import로 전환 → 기존 export 테스트 green(TC-5).
2. [ ] 뷰어-export 교차 parity 테스트(TC-2) + 영수증 멱등(TC-3).
3. [ ] income-expense-book: 재조정 행을 `buildAdjustedAccBook`로, 영수증 `fillExportReceiptNumbers`로, React key 고유화.
4. [ ] 「구분」 컬럼 + 비고 note + 「영수증 일괄생성」 버튼 + 재조정본 배지 + 부족 경고.
5. [ ] 전 vitest·eslint·tsc·build → `/pdca analyze`.

---

## 9. Out of Scope
- 원본 acc_book에 영수증 persist(가 제외) · 재조정 엔진 변경 · 비후보자 재조정(raw 유지) · 원본 수정 기능 · 「구분」의 Excel 컬럼화(비고 병합으로 갈음).

---

## Version History
| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-06-22 | 초안 — income-expense-book 강화(A: 구분 컬럼), 영수증 계산만(가), export materialization SSOT 추출(buildAdjustedAccBook)로 화면==export 정합 | Claude |
