# 수입·지출부 과목 배분 — 공식 동일 데이터 구조 Design Document

> **Plan**: `docs/01-plan/features/income-expense-item-allocation.plan.md`
> **Project**: PoliticalFundAccountingManagement · **Date**: 2026-06-19 · **Status**: Superseded (구현 방향 변경)
> **재사용**: `adjust-negative-income.ts`(Pass0), `fund-realloc.ts`(Pass1), `acc-book-sort.ts`(정렬 SSOT), `funding-balance-asof.ts`(입력 힌트), `stripAppOnlyAccBookColumns`(export strip 선례)

> ⚠️ **구현 변경 (2026-06-20): 영구화 → 보고 시점 분할.**
> 본 문서의 **§3(영구화 표현)·§4.3~4.6(apply_item_allocation 라우트/RPC·마감 트리거·일회성 마이그레이션)은 폐기**되었다.
> 사용자 결정으로 "지출 데이터까지 금액을 분할 저장하지 않는다 — acc_book은 실거래 원본 유지, 분할은 보고자료 생성 시점에만" 으로 전환.
> **실제 구현**: `buildLedgerRows`(§4.1·§4.2, 유효)를 수입·지출부 화면·reports·HWPX·export-sqlite가 **생성 시 in-memory로 호출**(acc_book write 없음). export는 `persist-allocation.ts`(planAllocationPersist/applyPlanInMemory)로 분할 행 세트를 메모리에서만 생성.
> 폐기된 영구화 잔재(`apply-item-allocation` 라우트·`migrate-item-allocation.mjs`·`planRollback`)는 제거, scripts/016·017 컬럼·RPC는 `scripts/018`로 drop. §1·§2·§4.1·§4.2·§5·§6·§7(불변식·워크드 예시·엣지·검증)은 유효.

---

## 1. 설계 목표

후보자 `acc_book`을 공식 `Fund_Data_1.db`와 **동일한 내부 구조**로 만든다: 수입 행이 "충당 대상 과목"으로 태깅(필요 시 분할)되어 **모든 (계정×과목) 잔액 ≥ 0**. 표시용 보정이 아니라 **저장 데이터 자체**를 교정하되, **멱등·가역**(언제든 raw 복원)을 보장한다.

핵심 불변식 4가지(전 경로 공유):
- **I1 합 보존**: 배분 후 자금원별 수입합 = 원본 수입합, 지출합 = 원본 지출합 (분할만, 증발·증식 0).
- **I2 무음수**: 모든 (계정×과목) 시간순 최저잔액 ≥ 0.
- **I3 멱등**: 같은 raw 입력 → 같은 배분 결과. 재실행 시 raw에서 재생성(이중 분할 없음).
- **I4 지출 과목 불변(사용자 결정, 2026-06-19)**: 사용자가 지정한 **지출의 과목(선거비용 86/선거비용외 87)은 절대 변경 금지**. Pass1이 지출을 다른 계정으로 이동해도(`...r` 스프레드로 `item_sec_cd` 보존), Pass2는 **수입만** 재태깅하고 지출은 항상 `effectiveItemSecCd = item_sec_cd`(원과목) 유지. 즉 "선거비용으로 설정한 지출은 무조건 다른 계정의 선거비용으로 잡힌다 — 계정은 달라져도 과목은 불변." (테스트 L7·L8 회귀가드)

---

## 2. 아키텍처 개요

```
                ┌─────────────────── 순수 함수 (테스트 가능) ───────────────────┐
 raw acc_book → │ Pass0 adjustNegativeIncome → Pass1 reallocateFundSources →     │ → LedgerRow[]
 (사용자 입력)   │ Pass2 allocateIncomeToItems        =  buildLedgerRows()        │   (accSecCd·itemSecCd·amt 확정)
                └───────────────────────────────────────────────────────────────┘
                                          │
                  ┌───────────────────────┼───────────────────────┐
                  ▼                        ▼                       ▼
          (A) 영구화 write          (B) 표시 폴백            (C) 입력 힌트
       persistItemAllocation     미영구화 org만 in-memory   previewItemBalance
       → acc_book 갱신/분할        (income-expense-book 등)   (income/page)
       (마감·수동·마이그레이션)
```

- **(A) 영구화**: 후보자 org에서 buildLedgerRows 결과를 `acc_book`에 기록(slice0 갱신 + 이동분 신규행). 원본은 app-only 추적 컬럼으로 복원 가능. → 이후 표시·export·HWPX·결산은 acc_book을 **그대로** 사용(추가 보정 불필요).
- **(B) 표시 폴백**: 아직 영구화 안 된 org는 종전처럼 in-memory buildLedgerRows로 표시(롤백 안전·점진 전환). 영구화되면 자동으로 raw 경로와 결과 동일.
- **(C) 입력 힌트**: 수입 입력 시 (계정×과목) 균형 상태를 안내(비차단). 최종 정합은 (A)가 책임.

**알고리즘 단일화**: (A)(B)(C) 모두 동일 `ledger-allocation.ts`를 호출 — 영구화/표시 이원화 금지.

---

## 3. 데이터 모델 (영구화 표현)

### 3.1 분할 표현 — slice0 in-place + 이동분 신규행

한 raw 거래가 (자금원·과목) 분할되면:
- **slice0 = 원 `acc_book_id`를 UPDATE**(in-place): `acc_sec_cd`/`item_sec_cd`/`acc_amt`를 첫 슬라이스 값으로. → `evidence_file` FK·영수증·외부참조가 **원 행에 그대로 보존**.
- **이동분 = 신규 INSERT** 행: 같은 메타(cust_id·content·date·time), 새 (acc_sec_cd·item_sec_cd·amt), `alloc_src_id = 원 acc_book_id`.

> 공식 `Fund_Data_1.db`도 과목별 별도 행 구조이므로 분할행은 공식과 호환. 미분할·미이동 행(대다수)은 **무변경**.

### 3.2 신규 컬럼 (acc_book — app-only, 전부 nullable, export 시 strip)

`scripts/016_item_allocation_columns.sql` (수동 적용):

| 컬럼 | 타입 | 의미 |
|---|---|---|
| `alloc_src_id` | INTEGER NULL | 이동분(신규행)의 출처 raw `acc_book_id`. raw/미분할 행은 NULL |
| `alloc_seq` | SMALLINT NULL | 분할 슬라이스 순번(0=slice0, 1..=이동분) |
| `raw_acc_sec_cd` | INTEGER NULL | slice0가 UPDATE되기 전 원 자금원(미변경 행 NULL) |
| `raw_item_sec_cd` | INTEGER NULL | slice0 원 과목(미변경 행 NULL) |
| `raw_acc_amt` | NUMERIC(15,0) NULL | slice0 원 금액(미변경 행 NULL) |
| `alloc_gen` | CHAR(8) NULL | 마지막 배분 실행 일자(YYYYMMDD, 감사용) |

- **복원 키**: `raw_acc_amt IS NOT NULL`(=UPDATE된 slice0) 또는 `alloc_src_id IS NOT NULL`(=이동분 신규행)인 행만 배분이 건드린 것.
- **export 정합**: `stripAppOnlyAccBookColumns`에 6개 컬럼 추가 제거(acc_time/claim_amt 선례). 공식 .db엔 순수 ACC_BOOK 행만(slice0+이동분=정상 행).

### 3.3 멱등 재생성 절차 (regenerateAllocation)

영구화는 **항상 raw에서 재생성** (트랜잭션):
1. **이동분 삭제**: `DELETE WHERE org_id=? AND alloc_src_id IS NOT NULL`.
2. **slice0 복원**: `raw_acc_amt IS NOT NULL` 행을 `acc_sec_cd=raw_acc_sec_cd, item_sec_cd=raw_item_sec_cd, acc_amt=raw_acc_amt` 로 되돌리고 `raw_*`/`alloc_gen` clear. → 이제 acc_book = 순수 raw.
3. **재배분**: org의 후보자 행 조회 → `buildLedgerRows`.
4. **write**: slice0 UPDATE(원행 재사용, raw_* 백업 기록) + 이동분 INSERT(`alloc_src_id`/`alloc_seq` 세팅), `alloc_gen=오늘`.

> 마감 후 거래 추가/수정 → 재실행하면 1~4로 결정적 재생성(I3). 환급/정정도 raw로 흡수.
> **롤백**: 1·2단계만 실행(= "배분 해제")하면 v0.14.8.0 raw 상태로 완전 복귀.

### 3.4 영수증·첨부 정책 (FR-11)

- `evidence_file`: 원 `acc_book_id`(slice0) 유지로 링크 보존. 이동분엔 링크 없음(증빙은 단일 문서).
- `rcp_no`/`rcp_no2`: 이동분은 **slice0와 동일 값 상속**(같은 물리 영수증). 채번 SSOT(`receipt-no.ts`)는 `splitGroupId` 단위로 1건 취급 — 이동분에 신규 번호 미부여(중복 방지). 재배분 전 채번된 행은 보존.

---

## 4. 컴포넌트 / 인터페이스 설계

### 4.1 `lib/accounting/item-allocation.ts` (신규, Pass2 — 순수)

Pass1 출력(`ReallocOutRow`: `sheetAccSecCd`·`effectiveAmt`·`splitGroupId` 보유)을 입력받아, **자금원별로 그룹핑 후 각 그룹 내에서 수입을 과목에 배분**.

```ts
export interface ItemAllocOutRow extends ReallocOutRow {
  effectiveItemSecCd: number;   // Pass2 배분 과목 (수입은 분할로 원래≠배분 가능, 지출은 원과목 유지)
  itemOrigin: "as-is" | "item-keep" | "item-moved";
  // effectiveAmt 는 과목 분할 후 최종 금액으로 갱신
}

/** 한 자금원 집합(또는 전체)을 받아 과목 배분. 자금원별 그룹핑은 내부 처리. */
export function allocateIncomeToItems(rows: ReallocOutRow[]): ItemAllocOutRow[];
```

**알고리즘** (각 `sheetAccSecCd` 그룹 내, `compareAccDateTime || incm_sec_cd || acc_book_id` 정렬):
1. 과목별 가용 수입 풀 `pool: Map<itemSecCd, IncomeSlice[]>` 유지(시간순 큐).
2. **수입 행**: 원 과목 풀에 적립(슬라이스로 enqueue). 출력엔 일단 보류(지출 충당 시점에 과목 확정).
3. **지출 행(과목 M, amt>0)**: 과목 M 풀에서 시간순 차감.
   - M 풀 부족 시 → 잉여 있는 **다른 과목 풀**에서 부족분만큼 수입 슬라이스를 끌어와 **과목 M으로 재태깅**(수입 슬라이스 분할 → `item-moved`).
   - 지출 행 자체는 **원 과목 유지**(`itemOrigin: as-is`).
4. **환급/0 지출**(amt≤0): 해당 과목 잔액 복원(풀에 되돌림), 재배분 안 함(`negative-refund-rows`).
5. **잉여 수입**(어느 지출도 충당 안 함): **원 과목 유지**(`item-keep`) — 결정사항.

**출력**: 수입 슬라이스는 충당된 과목별로 행 생성(분할 시 N행, `splitGroupId`=원 acc_book_id 유지). 지출은 1:1.

> Pass1과 대칭: fund-realloc="지출을 자금원 간 이동" / item-allocation="수입을 과목 간 이동". `splitGroupId`는 Pass1·Pass2 분할을 동일 원 acc_book_id로 묶음.

### 4.2 `lib/accounting/ledger-allocation.ts` (신규, 조합 — 순수)

```ts
export interface LedgerRow {
  acc_book_id: number;          // 원 거래 id (slice0=원본, 이동분=원본과 동일 그룹)
  incm_sec_cd: number;
  acc_date: string; acc_time: string | null;
  cust_id: number; content: string | null;
  rcp_no: string | null; rcp_no2: number | null; bigo: string | null;
  // 원래값(영구화 raw_* 기록·복원용)
  origAccSecCd: number; origItemSecCd: number; origAmt: number;
  // 배분 결과
  accSecCd: number;             // Pass1 sheetAccSecCd
  itemSecCd: number;            // Pass2 effectiveItemSecCd
  amt: number;                  // 최종 분할 금액
  // 추적
  splitGroupId?: number; splitSeq: number;
  origin: "as-is" | "fund-moved" | "item-moved" | "fund+item-moved";
  note?: string;
}

/** 후보자 org의 raw 행 → 배분 확정 LedgerRow[]. (A)(B)(C) 공용. */
export function buildLedgerRows(rows: RawAccRow[]): LedgerRow[] {
  const p0 = adjustNegativeIncome(rows);        // Pass0
  const p1 = reallocateFundSources(p0).rows;    // Pass1
  const p2 = allocateIncomeToItems(p1);         // Pass2
  return p2.map(toLedgerRow);
}
```

### 4.3 영구화 경로 — `POST /api/acc-book { action: "apply_item_allocation" }` (신규 action)

요청: `{ action:"apply_item_allocation", orgId, dryRun?:boolean }`
응답: `{ ok, generation, counts:{ raw, slice0Updated, movedInserted, sourcesSplit }, balance:{ byAccountItem:[{accSecCd,itemSecCd,income,expense,balance}], cashBalance }, invariants:{ sumPreserved, noNegative, maxShortfall } }`

처리(서버, service-role, **트랜잭션/RPC 권장**):
1. org 후보자 가드(`orgType==="candidate"`) — 아니면 400.
2. `regenerateAllocation` 1·2단계(복원) → raw 확보.
3. raw 조회 → `buildLedgerRows`.
4. 불변식 검사(I1·I2). shortfall>0 또는 합 불일치면 **abort**(write 안 함)하고 진단 반환.
5. `dryRun`이면 counts·balance·invariants만 반환(write 없음).
6. write: slice0 UPDATE(raw_* 기록), 이동분 INSERT. `alloc_gen` 세팅.

> DDL은 불가하나 데이터 write는 service-role REST로 가능. 다중 행 원자성을 위해 `scripts/017_apply_item_allocation.sql` RPC(서버 트랜잭션) 신설 권장 — `delete_org_data`/`finalize_settlement` 선례.

### 4.4 마감 트리거 — `settlement/page.tsx` + `finalize_settlement`

- 결산 마감 직전 후보자 org면 `apply_item_allocation` (dryRun=false) 호출 → 균형 확정 후 마감.
- 마감 전 **미리보기**: dryRun=true 결과의 (계정×과목) 균형표·배분 건수 표시.
- 명시 액션: 결산 화면 "과목배분 확정" 버튼(마감과 독립 실행 가능).
- `finalize_settlement` RPC 자체는 변경 최소화 — 영구화는 그 **앞단**에서 별도 호출(결산 잠금과 분리, 재실행 가능).

### 4.5 일회성 마이그레이션 — `scripts/migrate-item-allocation.mjs` (또는 관리 페이지 액션)

- 입력: orgId(들). dry-run 기본.
- 절차: org별 `apply_item_allocation` 호출(내부적으로 §3.3). **acc_book_bak 전체 백업 선행**(기존 backup action 재사용) → 안전망.
- 검증 출력: 2026 오준석(org11)·2022(org9) 균형·합보존·shortfall 0.
- 롤백: regenerate 1·2단계만 호출하는 `--rollback`.

### 4.6 입력 힌트 — `income/page.tsx` (후보자, 비차단)

- 수입 입력 시 선택 (acc_sec_cd, item_sec_cd) 조합의 현재 균형을 안내. `funding-balance-asof` 패턴 확장(`previewItemBalance`): 해당 자금원의 과목별 (수입−지출) as-of 표시 + "이 수입을 과목 X로 두면 균형, Y는 이미 충당됨" 힌트.
- 비차단(잉여·정정 불가피). "최종 균형은 결산 마감 시 자동 정리" 문구.

### 4.7 export / 표시 정합

- `export-sqlite/route.ts`: `stripAppOnlyAccBookColumns`에 §3.2 6개 컬럼 추가. FK-orphan(`selectReferencedCustomers`)·영수증 채번 무회귀 회귀테스트.
- `income-expense-book`·`reports`·`income-ledger-builder`: 영구화 org는 acc_book 직접(현행 쿼리 유지). 미영구화 org는 `buildLedgerRows` in-memory 폴백 분기(후보자만).

---

## 5. 워크드 예시 — org11 계정85 (후원회기부금)

raw 수입(전부 과목86): 1,000,000·3,830,000·2,250,000·600,000·850,000·500,000·400,000 = **9,430,000**.
지출: 과목86 = 4,290,015, 과목87 = **5,007,485**(수입 0).

Pass2(자금원85 내부, 시간순):
- 과목87 지출 5,007,485 발생 시 87 풀이 비어 → 86 풀에서 5,007,485를 끌어와 87로 재태깅(수입 슬라이스 분할).
- 결과: **85×87 수입 5,007,485 = 지출 5,007,485 → 잔액 0**. **85×86 수입 4,422,485 = 지출 4,290,015 → 잔액 +132,500**(잉여, 원과목 유지).
- 합 보존: 86+87 수입 = 9,430,000 = 원본. cashBalance 132,500 = 실통장. ✔

전 자금원 적용 시: 84의 ±31,040도 해소, 총잔액 132,500이 한 (계정×과목)에 잉여로 안착.

---

## 6. 엣지 케이스 / 가드

| 케이스 | 처리 |
|---|---|
| 음수 수입("계좌입금오류반환") | Pass0가 양수 지출 전환(org9 −500,000) |
| 환급(음수 지출) | 해당 과목 잔액 복원, 재배분 안 함(`acc_amt!==0`) |
| 자금원 전체 부족(shortfall, 데이터 오류) | Pass1 음수 잔류로 표면화 → 영구화 **abort**(은폐 금지) |
| 잔액 미입력 (계정×과목) | 빈 양식 유지(standardCombos) |
| 0원 거래 | 제외 |
| 비후보자 org | buildLedgerRows 미적용(종전 동작·스냅샷 동일) |
| 마감 후 거래 추가 | 재실행으로 결정적 재생성, "재배분 필요" 안내 |
| 분할행 영수증/첨부 | slice0에 보존, 이동분 상속·미채번(§3.4) |
| Fund_Data_1처럼 이미 균형 | 배분이 항등 — 분할 0, raw_* 미기록 |

---

## 7. 테스트 계획

### 7.1 순수 함수 단위 (`item-allocation.test.ts`)
- 단일 자금원: 한 과목 부족 → 다른 과목서 끌어와 0, 잉여 원과목 유지.
- 시간순: 늦은 수입이 이른 지출 못 덮는 순서 검증.
- 분할: 한 수입이 86/87로 쪼개짐(splitGroupId 동일·합 보존).
- 환급: 음수 지출 후 과목 잔액 복원.
- 지출 원과목 불변: 지출은 itemOrigin=as-is.

### 7.2 조합 불변식 (`ledger-allocation.test.ts`)
- **Fund_Data_1 20거래 항등성**: 모든 (계정×과목) 잔액 0 유지, 분할 0.
- **org11(2026)**: 5개 (계정×과목) 잔액 ≥ 0, 85×87→0, 잉여 85×86=132,500, 합보존, cash 132,500.
- **org9(2022)**: 음수 0·shortfall 0·합보존(Pass0 −500,000), 후보자등자산×선거비용외 수입 5,503,770=지출 5,503,770.
- I1·I2·I3(재실행 멱등: buildLedgerRows∘buildLedgerRows = buildLedgerRows).

### 7.3 영구화/멱등 (통합)
- apply → counts·balance 검증 → 재apply 시 동일 결과(이중 분할 0).
- rollback → raw 완전 복귀(원 행 수·금액·과목 일치).
- shortfall 주입 → abort, write 0.

### 7.4 회귀 / 라운드트립
- 비후보자 org 스냅샷 동일.
- export-sqlite: 6개 app-only 컬럼 strip, 0 FK-orphan, 영수증 채번 동일.
- **공식 프로그램 라운드트립**: org11 영구화 → export → 윈도우 프로그램 로드 → `data/송파` 4개 PDF(보조금/후보자산/금후원/금보조금외지원) 수치 대조.

---

## 8. 구현 순서 (Do 단계)

1. `item-allocation.ts` + `ledger-allocation.ts` + 테스트(§7.1·7.2). **Fund_Data_1/org9/org11 픽스처로 그린**.
2. `scripts/016` 컬럼 추가 + `stripAppOnlyAccBookColumns` 확장 + export 회귀테스트.
3. `apply_item_allocation` action(+`scripts/017` RPC) + dryRun/불변식 abort + 멱등 재생성.
4. 일회성 마이그레이션 스크립트(dry-run·rollback) → org11/org9 검증, 라운드트립 대조.
5. 결산 마감 트리거 + 미리보기(계정×과목 균형표).
6. 입력 힌트(`previewItemBalance`) + income 페이지.
7. 표시 폴백 정리(영구화 org는 acc_book 직접) + 문서 갱신.

---

## 9. 확정 사항 (2026-06-19, 사용자 결정 완료)

기반 확정: slice0 in-place UPDATE(원 id 보존·증빙 링크 유지), app-only 추적 컬럼 strip, raw 재생성 멱등, 잉여=원과목, 후보자 전용, 입력 힌트+마감 영구화+일회성 마이그레이션.

3대 아키텍처 결정 — **모두 추천안 확정**:

| # | 결정 | 확정 | 근거 |
|---|---|---|---|
| ① 영구화 원자성 | **RPC 트랜잭션(`scripts/017`)** | 확정 | 삭제→복원→재배분→갱신→삽입을 한 트랜잭션으로 all-or-nothing. 중간 실패 시 반쪽 장부 없음(단일 prod·법정장부). `delete_org_data`·`finalize_settlement` 선례 |
| ② 추적 컬럼 | **개별 6컬럼(`scripts/016`)** | 확정 | `WHERE alloc_src_id IS NOT NULL`·복원 SQL 단순·빠름, export strip이 acc_time/claim_amt 패턴과 일치. 전부 nullable·additive |
| ③ 마감↔영구화 | **앞단 별도 호출 + 마감 게이트** | 확정 | 배분은 재실행·미리보기·롤백 필요(I3 멱등) / 마감은 일회성 잠금 — 책임 분리. 마감 시 "미배분" 경고 게이트로 누락 방지 |

→ Do 단계 진입 가능. 추가 미해결 사항 없음.

---

## Version History

| Version | Date | Author | Changes |
|---|---|---|---|
| 0.1 | 2026-06-19 | Claude | 최초 Design. 3-pass 영구화 모델(slice0 in-place + 이동분 신규행 + app-only 추적컬럼), 멱등 재생성, apply_item_allocation action, 마이그레이션·입력힌트·export strip. org11/org9/Fund_Data_1 워크드 예시·테스트. |
