# 자금원 음수잔액 해소 재배분 Design Document

> **Plan**: [negative-balance-reallocation.plan.md](../../01-plan/features/negative-balance-reallocation.plan.md)
> **Project**: PoliticalFundAccountingManagement
> **Date**: 2026-06-16
> **Status**: Draft
> **확정 정책**: report-only(DB·앱 무변경, 1회용 스크립트) / 재배분 84↔85만 / 진짜 부족 시 음수 유지+경고

---

## 1. 개요

오준석 후보(2026) acc_book에서 후원회기부금(85)의 시간순 잔액이 음수가 되는 것을, 입금일·잔액 기반 시간순 그리디 재배분(85 초과분→84, 필요 시 금액 분할)으로 해소하고 **계정별 정치자금 수입지출부 .xlsx**를 산출한다.

구성: **순수 함수 모듈** `lib/accounting/fund-realloc.ts`(재배분 로직, 테스트 대상) + **1회용 스크립트** `scripts/realloc-negative-balance.mjs`(read-only 조회 + 엑셀 I/O). acc_book·앱 코드 무변경.

---

## 2. 데이터 모델 (입출력 타입)

### 2.1 입력 행 (조회 결과에서 필요한 필드)

```ts
// fund-realloc.ts
export interface ReallocRow {
  acc_book_id: number;
  incm_sec_cd: number;      // 1=수입, 2=지출
  acc_sec_cd: number;       // 82|83|84|85 (자금원)
  item_sec_cd: number;      // 과목(86 선거비용 / 87 선거비용외 등) — 보존
  acc_date: string;         // YYYYMMDD
  acc_time: string | null;  // HHmm (정렬 2차키)
  acc_amt: number;          // 환급은 음수
  content: string | null;
  rcp_no: string | null;
  rcp_no2: number | null;
  bigo: string | null;
  cust_id: number;
  customer: ReallocCustomer | null; // {name, reg_num, addr, job, tel}
}
```

### 2.2 출력 행 (재배분 후, 시트 배치용)

```ts
export interface ReallocOutRow extends ReallocRow {
  sheetAccSecCd: number;    // 이 행이 표시될 자금원 시트(재배분 후)
  effectiveAmt: number;     // 이 행의 (분할 후) 금액
  origin: "as-is" | "moved" | "split-keep" | "split-moved";
  splitGroupId?: number;    // 분할된 원거래 묶음(=원 acc_book_id)
  note?: string;            // 비고에 덧붙일 재배분 주석
}
```

### 2.3 결과 구조

```ts
export interface Redistribution {
  acc_book_id: number;      // 원 지출
  acc_date: string;
  fromAccSecCd: 85;
  toAccSecCd: 84;
  movedAmt: number;         // 84로 이동한 금액
  split: boolean;           // 일부만 이동(분할)인지
  keptAmt: number;          // 85에 남은 금액
}

export interface Shortfall {
  acc_book_id: number;
  acc_date: string;
  accSecCd: number;         // 부족이 발생한 자금원(85 또는 84)
  shortAmt: number;         // 그 시점 메우지 못한 금액(→ 잔액 음수폭)
  availAt: { a84: number; a85: number }; // 그 시점 가용
}

export interface ReallocResult {
  rows: ReallocOutRow[];               // 전체(시트별 분류는 sheetAccSecCd로)
  redistributions: Redistribution[];
  shortfalls: Shortfall[];
  totals: {                            // 검증용 — 재배분 전후 불변이어야
    incomeBySource: Record<number, number>;
    expenseBySource: Record<number, number>; // 재배분 전(원본 기준)
  };
}
```

---

## 3. 알고리즘 (`reallocateFundSources`)

### 3.1 시그니처

```ts
export function reallocateFundSources(
  rows: ReallocRow[],
  opts?: { sources?: [number, number] }, // 기본 [85, 84] = (from, to)
): ReallocResult;
```

### 3.2 절차

1. **정렬**: 전 행을 `compareAccDateTime`(acc-book-sort.ts) → `acc_book_id` tie-break로 시간순 정렬. (84·85 외 자금원도 시트 출력용으로 통과시키되 재배분 대상 아님)
2. **상태**: `avail: Record<number, number>`(자금원별 running 가용액), 초기 0.
3. **각 행 순회**:
   - **수입(incm=1)**: `avail[acc_sec_cd] += acc_amt`. 출력행 그대로(origin="as-is", sheet=acc_sec_cd).
   - **지출(incm=2), acc_amt ≤ 0 (환급/0)**: 재배분 안 함. `avail[acc_sec_cd] -= acc_amt`(음수면 가용 복원). 출력행 그대로.
   - **지출(incm=2), acc_amt > 0, acc_sec_cd = 85 (from)**:
     ```
     use85   = min(A, max(0, avail[85]))
     deficit = A - use85
     move    = min(deficit, max(0, avail[84]))     // 84로 이동(분할)
     short   = deficit - move                       // 둘 다 부족 → 85 음수 유지
     avail[85] -= (use85 + short)                    // short는 85에 남아 음수 진행
     avail[84] -= move
     출력:
       if move==0 && short==0:   [85: A]                      origin="as-is"
       else 분할:
         if use85+short > 0:     [85: use85+short]            origin="split-keep" (short>0면 음수 유발)
         if move > 0:            [84: move]                   origin="split-moved", note="재배분: 원거래 #id 85→84"
       redistributions += {move, keptAmt: use85+short, split: (move>0 && (use85+short)>0)}
       if short>0: shortfalls += {85, shortAmt: short, ...}
     ```
   - **지출(incm=2), acc_amt > 0, acc_sec_cd = 84 (to)**: `avail[84] -= A`(85→84 이동분과 같은 풀에서 차감). 84가 음수가 되면 `shortfalls += {84, shortAmt: -avail[84] 증가분, ...}`. 출력행 그대로.
   - **그 외 자금원(82·83) 지출**: 재배분 없이 통과(`avail` 추적은 하되 음수면 정보성 경고).
4. **총액 보존 검증**: 출력행의 자금원별 effectiveAmt 합(지출) = 원본 자금원별 지출 합 ± (85→84 이동분). 84+85 합계는 불변. (NFR-02)

### 3.3 핵심 불변식·주의

- **단방향(85→84)**: 84는 음수가 안 되도록 이동 한도(`avail[84]`)를 지킨다. 84가 자기 지출로 음수가 되면 그건 진짜 부족(85로 되돌리지 않음).
- **분할은 표시상 2행**: DB 행 추가 없음(report-only). `splitGroupId=원 acc_book_id`로 묶고 합이 원금액과 일치(DoD).
- **환급 음수**는 재배분 대상에서 제외하고 원 자금원 가용을 복원(`acc_amt !== 0`, 메모 negative-refund-rows-in-aggregation).
- **결정성**: 동일 입력 → 동일 출력(정렬 + 그리디, tie-break acc_book_id).
- **영수증번호**: 분할 행은 같은 rcp_no를 공유(표시), 비고에 "분할" 명기. DB 채번 불변.

---

## 4. 엑셀 산출 (계정별 시트)

### 4.1 시트 구성

- 존재하는 자금원별 1시트: 시트명 = 자금원명(보조금/보조금외/후보자자산/후원회기부금). 순서 = `SOURCE_ORDER`(자산→후원회기부금→보조금→보조금외) 또는 acc_sec_cd 오름차순(설계 시 택1, income-expense-book.ts는 자산 먼저).
- 마지막 **「재배분 리포트」 시트**: redistributions(이동 지출·금액·분할)·shortfalls(진짜 부족 시점·금액) 표 + 재배분 전후 총액 보존 검증표.

### 4.2 시트 내 레이아웃 (income-expense-book/page.tsx 15컬럼 양식 재사용)

| 컬럼 | 내용 |
|---|---|
| 1 | 번호 |
| 2 | 년월일 (YYYY/MM/DD) |
| 3 | 내역 (분할/재배분 시 주석 덧붙임) |
| 4·5 | 수입액 금회·누계 |
| 6·7 | 지출액 금회·누계 |
| 8 | 잔액 (수입누계−지출누계, **그 자금원 기준**) |
| 9~13 | 거래처 성명·생년월일(사업자번호)·주소·직업·전화 |
| 14 | 영수증 일련번호 (분할 시 공유 표시) |
| 15 | 비고 (재배분 주석: "원거래 #id 85→84" 등) |

- 각 시트는 그 자금원에 배치된 출력행(sheetAccSecCd 일치)을 시간순으로, 수입/지출 누계·잔액 계산.
- **84·85 시트 잔액(8열)은 음수 없음**이 목표. 진짜 부족(shortfall)으로 음수가 남는 셀은 **빨강 강조 + 비고 경고**.
- 제목/헤더/단위(원)는 기존 양식과 동일.

### 4.3 스크립트 흐름 (`scripts/realloc-negative-balance.mjs`)

```
1) loadEnv(.env.local) → createClient(URL, SERVICE_ROLE_KEY)   // read-only
2) org 확정: organ.org_name ILIKE '%오준석%' AND org_sec_cd=90 → org_id (복수면 사용자 확인)
3) SELECT * , customer:cust_id(...) FROM acc_book WHERE org_id=? (84·85 포함 전 자금원)
4) reallocateFundSources(rows)  // 순수 함수
5) ExcelJS로 계정별 시트 + 재배분 리포트 시트 생성
6) 저장: 오준석_정치자금수입지출부_계정별_YYYYMMDD.xlsx (쓰기 대상은 로컬 파일만, DB 무변경)
7) 콘솔에 baseline(재배분 전 85 음수 시점/폭) + 재배분 후 결과 요약 출력
```

---

## 5. 테스트 케이스 (`fund-realloc.test.ts`)

| # | 시나리오 | 기대 |
|---|---|---|
| T1 | 85 수입 후 85 지출이 가용 내 | 재배분 없음, as-is |
| T2 | 85 지출이 85 가용 초과, 84 충분 | 초과분 84로 이동(분할 2행), 85 잔액 ≥ 0 |
| T3 | 85 지출 전액 초과(85 가용 0), 84 충분 | 전액 84로 이동(분할 아님, keep=0) |
| T4 | 85·84 모두 부족 | 84 가용분만 이동, 나머지 short → 85 음수 유지 + shortfall 기록 |
| T5 | 입금일 제약: 지출일까지 미입금된 85 수입은 가용 아님 | 시간순 누계로 그 시점 가용만 사용 |
| T6 | 환급(85 음수 지출) | 재배분 제외, avail[85] 복원, 85 시트에 음수 지출행 |
| T7 | 동일 날짜·시각 수입/지출 | compareAccDateTime tie-break(수입 먼저는 빌더 책임, 여기선 acc_book_id) 결정적 |
| T8 | 84 자체 지출로 84 음수 | 84 shortfall 기록(85로 되돌리지 않음) |
| T9 | 총액 보존 | 재배분 전후 84+85 총지출·총수입 합 불변 |
| T10 | 분할 합 일치 | split-keep + split-moved = 원 acc_amt |

---

## 6. 영향 파일

| 파일 | 종류 |
|---|---|
| `app/src/lib/accounting/fund-realloc.ts` | 신규(순수 함수) |
| `app/src/lib/accounting/fund-realloc.test.ts` | 신규(단위 테스트) |
| `app/scripts/realloc-negative-balance.mjs` | 신규(1회용 read-only 스크립트 + ExcelJS) |
| (무변경) `acc_book`, 앱 라우트/페이지 | report-only 원칙 |

재사용: `acc-book-sort.ts`(compareAccDateTime), `funding-source.ts`(분류/명칭). ExcelJS는 기존 의존성.

---

## 7. Do 단계 진입 순서

1. **read-only 진단(먼저)**: org_id 확정 → 84·85 시간순 잔액 추이·음수 시점/폭 측정 → 사용자에게 baseline 보고(데이터 확인).
2. `fund-realloc.ts` + 테스트(T1~T10) 작성·통과.
3. `realloc-negative-balance.mjs` 작성 → .xlsx 산출.
4. 검증: 총액 보존·분할 합·환급·음수 해소·진짜 부족 표기 교차확인 후 사용자 확인.

---

## 9. Option B 반영 (2026-06-16 결정 — 은행내역 검증 후)

은행 거래내역서(카카오뱅크 단일 통합계좌) 검증 결과: **통장 잔액이 한 번도 음수가 아님**(최저 4/6 0원, 이후 5/31 31,227원), **입금 누락 없음**. 85 음수는 순수 자금원 태깅 아티팩트. 84(후보자자산)는 5월 내내 비어 있었고, 5/22 ~79k는 그때 통장에 있던 진보당(83) 3M이 실질 충당.

→ **재배분 범위를 84↔85 → 단일 현금풀 캐스케이드(83 포함, 향후 82 포함 가능)로 변경.**

### 9.1 알고리즘 (N-source 캐스케이드, 음수 0 보장)

```
정렬: 전 행 compareAccDateTime → acc_book_id
상태: avail[src] (자금원별 running 가용액)
overflow 우선순위 P = [84, 83, 82] (후보자자산 우선 = 후보자 부담, 그다음 정당지원금, 보조금)
각 행:
  수입(incm=1):    avail[src] += amt;  출력행 그대로
  환급(incm=2,amt<=0): avail[src] -= amt (복원);  출력행 그대로(원 자금원)
  지출(incm=2,amt>0) on src S:
    need = amt
    useS = min(need, max(0, avail[S])); avail[S]-=useS; need-=useS;  // 원 자금원 먼저
    for O in P (O!=S, while need>0):
       u = min(need, max(0, avail[O])); if u>0: avail[O]-=u; need-=u; 출력행(O, u, moved/split)
    if need>0: shortfall(S, need)   // 풀 전체가 부족 — 통장≥0면 발생 안 함
    출력행(S, useS) (+ 이동분 O별 행)  // 한 지출이 다중 분할 가능
```

**보장**: 임의 시점 `Σ avail = 통장잔액 ≥ 0`. 지출 `amt` 처리 직전 `Σ avail ≥ amt`(처리 후 통장잔액 = 이전 − amt ≥ 0). 따라서 캐스케이드는 항상 충당 가능 → **어떤 자금원도 음수가 되지 않으며 shortfall=∅** (이번 데이터에서). 단 일반화 위해 shortfall 경로는 유지(데이터 오류·미래 케이스 대비).

### 9.2 시그니처 변경

```ts
export function reallocateFundSources(
  rows: ReallocRow[],
  opts?: { overflowPriority?: number[] }, // 기본 [84, 83, 82]
): ReallocResult;  // ReallocResult.shortfalls 는 보통 빈 배열(풀 충당)
```

`ReallocOutRow.origin`: "as-is" | "split-keep" | "split-moved"(이동), `splitGroupId`=원 acc_book_id. 한 지출이 3개 자금원으로 쪼개질 수 있음.

### 9.3 법적 유의점 (산출물 투명 표기)

캐스케이드가 **진보당 지원금(83)의 designated 지출(공식공보물) 일부(~79k)를 후보자자산(84)으로** 옮긴다. 「재배분 리포트」 시트에 모든 이동(자금원·금액·원거래·사유)을 명시해, 자금원 designation 변경분을 사용자가 검토·승인할 수 있게 한다.

### 9.4 테스트 추가 (T1~T10에 더해)

| # | 시나리오 | 기대 |
|---|---|---|
| T11 | 3-source 캐스케이드(85→83→84) | 5/22 모사: 85 부족→83, 83 자체지출→84, 전 자금원 ≥ 0 |
| T12 | 통장(전 자금원 합) 항상 ≥ 0이면 shortfall=∅ | 모든 행 처리 후 음수 자금원 0 |
| T13 | overflowPriority 순서 반영 | 우선순위대로 충당원 선택 |

---

## 8. 미해결/Design 확인 사항

- 시트 순서(자산 먼저 vs acc_sec_cd 오름차순) — 구현 시 income-expense-book.ts 관례(자산 먼저) 채택 제안.
- 통합(전 자금원 합산) 시트 포함 여부 — 기본 미포함, 요청 시 추가.
- 분할 행 영수증번호 표기 세부(동일 번호 공유 + "분할" vs 접미사) — read-only라 표시 규칙만, DB 불변.
- org_id 자동 매칭 실패/복수 시 사용자 확인 절차(Do 1단계).
