# 보고서(과목별 수입·지출부) 영수증번호 재배분 정합 Design Document

> **Summary**: 「보고서 및 과목별 수입·지출부 출력」(`dashboard/reports`)이 후보자 재배분에 **bespoke `allocateReportRecords`(=`buildLedgerRows` 직접 호출)**를 쓰고 영수증 채번 SSOT를 호출하지 않아, 분할/이동 조각이 **원본 `rcp_no`를 공유**(중복·접두사 stale)한 채 출력된다. 조사 결과 **이 문제는 v0.19([[adjusted-ledger-viewer]])가 이미 해결한 것과 동일**하다 — 당시 "buildLedgerRows 분할 슬라이스가 acc_book_id를 공유해 `fillExportReceiptNumbers`가 충돌"하는 문제를 풀려고 `buildAdjustedAccBook`(이동분 신규 id)을 만들어 **뷰어·export를 마이그레이션**했으나 **reports만 누락**됐다. 따라서 본 작업은 신규 설계가 아니라 **reports의 v0.19 마이그레이션 완료**: `allocateReportRecords`를 폐기하고 `buildAdjustedAccBook` + `fillExportReceiptNumbers`(뷰어·export와 동일 2-함수)로 교체한다. 결과: reports == income-expense-book 뷰어 == export-sqlite(.db) 의 (계정×과목) 분할·영수증번호가 100% 일치.
>
> **Project**: PoliticalFundAccountingManagement
> **Version**: 0.20.x → 0.21.0.0 예정
> **Author**: Claude · **Date**: 2026-06-23 · **Status**: Draft
> **Planning Doc**: [reports-receipt-no-realloc-parity.plan.md](../../01-plan/features/reports-receipt-no-realloc-parity.plan.md)
> **Related**: [[adjusted-ledger-viewer]](v0.19, `buildAdjustedAccBook` 신설·뷰어/export 마이그레이션). 메모 [[reports-receipt-no-missing-fill]] · [[parity-test-must-exercise-divergence-condition]] · [[income-expense-book-funding-realloc]].

---

## 1. 핵심 설계 결정 (조사로 확정)

| 항목 | 조사 결과 (file:line) | 결정 |
|------|----------------------|------|
| 재배분 빌더 SSOT | 뷰어 `income-expense-book/page.tsx:108` 와 export `export-sqlite/route.ts:497`(`allocateCandidateAccBookForExport = buildAdjustedAccBook`) **둘 다 `buildAdjustedAccBook`** 사용. reports `:151` 만 bespoke `allocateReportRecords`(buildLedgerRows 직접) | reports도 **`buildAdjustedAccBook` 채택** → 3자 동일 빌더 |
| 분할 조각 id | `allocateReportRecords:168`이 `...o` spread로 **조각이 원본 acc_book_id 공유** → `fillExportReceiptNumbers:217~224`의 acc_book_id-키 맵 **충돌**(한 id에 여러 조각) | `buildAdjustedAccBook`은 **이동분에 신규 고유 id** 부여(`adjusted-ledger.ts:6,17`) → 충돌 해소 |
| 영수증 채번 | reports는 `fillExportReceiptNumbers` **미호출**(`:676`이 raw `r.rcp_no` 렌더). 뷰어 `:118`·export `:771` 는 호출 | reports도 호출. **뷰어와 동일 호출형**(아래 §4) |
| 정렬키 `acc_sort_num` | 뷰어는 `fillExportSortNumbers` **미사용**(acc_sort_num 부재→0→date→incm→id로 폴백, `:110~111` 주석). export는 .db 컬럼 필요로 사용 | reports는 **Excel**이라 .db 컬럼 불필요 → **뷰어와 동일하게 `fillExportSortNumbers` 미사용**(뷰어와 바이트 단위 일치 보장) |
| 영수증 persist | (가) 계산만 — 원본 `acc_book` write 0 | 유지(DB write 0) |
| 비후보자 | `allocateReportRecords`는 `orgType==='candidate'`일 때만(`:866~867`) | `buildAdjustedAccBook`도 내부에서 비후보자 raw 그대로 반환(`adjusted-ledger.ts:22`) → 분기 단순화 가능 |

---

## 2. Architecture

```
income-expense-book/page.tsx (뷰어) ──┐
api/system/export-sqlite/route.ts ────┤  (v0.19 이미 마이그레이션 완료)
dashboard/reports/page.tsx (★본 작업)─┘  ← 셋 다 동일 2-함수 파이프라인
                                       ▼
   buildAdjustedAccBook(rawRows)                 ← lib/accounting/adjusted-ledger.ts (기존 SSOT)
     · 후보자(82~85): planAllocationPersist→applyPlanInMemory (이동분 신규 고유 id)
     · 비후보자: raw 그대로
        │  재조정 행[] (고유 id, alloc_src_id/raw_acc_sec_cd 추적, 메타 spread 보존)
        ▼
   fillExportReceiptNumbers(행[], codeNames)      ← lib/accounting/receipt-no.ts (기존 SSOT)
     · rcp_yn='Y' ∧ (rcp_no 없음 ∨ 접두사 stale) → 현재 (계정×과목) 접두사로 재채번
     · 통합 income+expense 스코프, 접두사 일치 수기번호 보존, acc_book_id 키로 적용
        ▼
   reportRecords (rcp_no 재홈잉·중복제거 완료)
        ├─▶ buildSummarySheet      (변경 없음 — 집계는 금액 기반)
        ├─▶ comboMap / combos      (변경 없음 — acc_sec_cd×item_sec_cd)
        └─▶ buildLedgerSheet       (변경 없음 — :676 r.rcp_no 가 자동으로 재채번값)
```

**핵심**: reports의 다운스트림(총괄표·콤보·원장시트 렌더)은 **무수정**. 입력 레코드의 `rcp_no`·`acc_book_id`만 SSOT 산출물로 바뀌면 끝.

---

## 3. 왜 동작하는가 (충돌 해소 증명)

- `fillExportReceiptNumbers`(`receipt-no.ts:217~224`)는 `assignmentById: Map<acc_book_id, …>` 로 채번 결과를 적용한다. **행마다 acc_book_id가 고유해야** 정확히 1:1 매핑된다.
- `allocateReportRecords`는 분할 조각이 **동일 id** → 맵 키 충돌(마지막 조각이 덮어씀, 모든 조각이 같은 번호) → **현행 버그**.
- `buildAdjustedAccBook` → `applyPlanInMemory`는 **이동분에 신규 id** 부여 → 조각마다 고유 id → 맵 1:1 → 조각별 올바른 재채번.
- `buildLedgerSheet`의 정렬 tie-break도 `acc_book_id`(`:634`)를 쓰므로, 고유 id가 **정렬 결정성**까지 개선(현행은 공유 id로 조각 간 순서 비결정).

---

## 4. 구현 명세 (reports/page.tsx)

### 4.1 삭제
- `allocateReportRecords` 함수(`:151~170`) 전체 제거. (다른 소비처 없음 — grep 확인)

### 4.2 import 추가
```ts
import { buildAdjustedAccBook } from "@/lib/accounting/adjusted-ledger";
import { fillExportReceiptNumbers, type ReceiptCodeNames } from "@/lib/accounting/receipt-no";
```

### 4.3 generateReports 교체 (`:864~867` 대체)
```ts
// 후보자: 보고 시점 (계정×과목) 재조정 + 영수증 재채번 (원본 acc_book 불변, write 0).
//   뷰어(income-expense-book)·export-sqlite와 동일 SSOT → 화면·Excel·.db 영수증번호 일치.
let reportRecords: AccRecord[] = records;
if (orgType === "candidate") {
  const adjusted = buildAdjustedAccBook(records as unknown as Record<string, unknown>[]);
  const codeNames: ReceiptCodeNames = { acc: {}, item: {} };
  for (const r of adjusted) {
    const a = Number(r.acc_sec_cd), it = Number(r.item_sec_cd);
    codeNames.acc[a] = getName(a);
    codeNames.item[it] = getName(it);
  }
  reportRecords = fillExportReceiptNumbers(adjusted, codeNames) as unknown as AccRecord[];
}
```
- 이후 `buildSummarySheet`(`:891`)·`comboMap`(`:917`)·`buildLedgerSheet`(`:971~`)는 **무수정**으로 `reportRecords` 사용.
- `fillExportSortNumbers`는 **미호출**(§1 결정 — 뷰어와 일치). 채번 정렬은 함수 내부 date→incm→id 폴백.

### 4.4 영향 없는 항목 (검증만)
- 영수증 첨부/생략분 집계(`:642~661`)·합계행: `rcp_yn`/금액 기반 → 번호 무관.
- 비후보자: `buildAdjustedAccBook`이 raw 반환 + 채번 분기 skip → 기존과 동일.

---

## 5. 테스트 설계

기존: `receipt-no.test.ts`·`adjusted-ledger.test.ts`·`export-sqlite/adjusted-ledger-parity.test.ts` 존재. reports 테스트 없음.

### 5.1 신규 — reports 채번 파이프라인 유닛 테스트
§4.3 로직을 **순수 헬퍼로 추출**(예 `buildReportLedgerRecords(records, getName, orgType)`)해 테스트 가능하게 한다.
- **픽스처(필수: 분할/이동 실제 트리거)** — [[parity-test-must-exercise-divergence-condition]]: 한 자금원이 도중 소진돼 지출이 타 자금원으로 **이동·분할**되는 후보자 데이터(본 감사의 `후(비)-10`(3분할)/`외(비)-1`(2분할) 재현).
- **단언**:
  1. 각 (계정×과목) 시트 집합 내 `rcp_no` **중복 0**.
  2. 각 행 `rcp_no` 접두사 == 그 행 `formatKey`의 자금원 접두사(이동조각 재홈잉 확인).
  3. 동일 입력에 대한 산출이 **뷰어 파이프라인**(`buildAdjustedAccBook`+`fillExportReceiptNumbers`)과 **행 단위 동일**.
  4. 합계(수입계·지출계·잔액)·총괄표 수치가 교체 전(allocateReportRecords)과 **불변**(배분 동치성 회귀).

### 5.2 회귀
- 비후보자/단일 자금원 org: reportRecords == records (무변경).

---

## 6. Risks & Mitigations

| Risk | 영향 | Mitigation |
|------|------|-----------|
| `buildLedgerRows`(구) ↔ `planAllocationPersist`(신) 배분 결과 미세 차이 | 총괄표 수치 변동 | 5.1-4 단언으로 동치 확인. 차이 시 `buildAdjustedAccBook`이 정답(export/뷰어 기준) — 구 reports 수치가 틀렸던 것 |
| `buildAdjustedAccBook`이 reports 고유 필드(generation·acc_print_ok·claim_amt) 미보존 | 원장 일부 컬럼 공백 | `adjusted-ledger.ts:24` `...r` spread로 보존됨. 픽스처에 해당 필드 포함해 검증 |
| moved 조각의 cust_id 누락 → 거래처 공백 | 거래처열 빈칸 | 조각은 slice0 메타 상속(spread). custMap join은 `cust_id` 기반(`:647`) → 유지. 테스트로 확인 |
| 채번이 뷰어와 미세 불일치(acc_sort_num) | 화면≠Excel | §1 결정대로 reports도 `fillExportSortNumbers` 미사용(뷰어와 동일 호출) + 5.1-3 단언 |

---

## 7. Rollout
- 단일 PR. 코드 변경 = reports/page.tsx 1파일(함수 1개 삭제 + 분기 1블록 교체 + import) + 테스트 1파일.
- DB 마이그레이션 없음, 환경변수 없음. 원본 데이터 불변.
- 배포 후 본 감사 파일과 동일 데이터로 reports 재출력 → `후(비)-10`/`외(비)-1`/`자(비)-14`/`자(비)-4` 중복이 자금원별 고유번호로 분리되는지 수동 확인.

---

## 8. Next
- `/pdca do reports-receipt-no-realloc-parity` — §4 순서대로 구현(헬퍼 추출 → 교체 → 테스트).
- 구현 후 `/pdca analyze` 로 설계-구현 갭 검증.
