# 영수증번호 채번 규칙 개정 설계 (receipt-no-format)

> Plan: `docs/01-plan/features/receipt-no-format.plan.md`
> SSOT: `app/src/lib/accounting/receipt-no.ts` (단일 파일 변경 + 테스트)

## Executive Summary

| 항목 | 내용 |
|---|---|
| Feature | receipt-no-format |
| 설계일 | 2026-06-16 |
| 변경 파일 | **`lib/accounting/receipt-no.ts`(핵심)** + `receipt-no.test.ts`. 소비처(`api/acc-book`, `api/system/export-sqlite`) **무변경**. |
| 핵심 설계 결정 | 채번 분기를 **`acc_sec_cd` 하나로** 판정 → 소비처 시그니처 불변, 변경이 SSOT 1파일에 격리됨 |

---

## 1. 코드 구조 확정 (실데이터 검증)

실제 선관위 `.db`(`data/오준석후원회_보관자료0613.db`, `data/Fund_Data_2.db`) `CODEVALUE`·`ACC_BOOK` 조사 결과:

| cv_id | cs_id | 코드명 | 역할 | 비고 |
|---|---|---|---|---|
| 1 | 1 | 수입 | **후원회 수입 계정**(acc_sec_cd) | |
| 2 | 1 | 지출 | **후원회 지출 계정**(acc_sec_cd) | |
| 82 | 10 | 보조금 | 후보 자금원 계정 | → 보 |
| 83 | 10 | 보조금외지원금 | 후보 자금원 계정 | → 외 |
| 84 | 10 | 후보자등자산 | 후보 자금원 계정 | → 자 |
| 85 | 10 | 후원회기부금 | 후보 자금원 계정 | → 후 |
| 86 | 11 | 선거비용 | 후보 과목(item) | → (비) |
| 87 | 11 | 선거비용외정치자금 | 후보 과목(item) | → 괄호 제거 |
| 94 | 12 | 기명후원금 | 후원회 수입 과목 | 현행 유지 |
| 95 | 12 | 익명후원금 | 후원회 수입 과목 | 현행 유지 |
| 96 | 12 | 그밖의수입 | 후원회 수입 과목 | 현행 유지 |
| 97 | 12 | 기부금 | **후원회 지출 과목** | → 기 |
| 98 | 12 | 후원금모금경비 | **후원회 지출 과목** | → **모**(첫글자 아님) |
| 99 | 12 | 인건비_기본경비 | **후원회 지출 과목** | → 인 |
| 100 | 12 | 사무소설치운영비_기본경비 | **후원회 지출 과목** | → 사 |
| 101 | 12 | 그밖의경비 | **후원회 지출 과목** | → 그 |

**실측 ACC_BOOK 분포(후원회 보관자료)**: 수입 `acc=1, item∈{94,95}`, 지출 `acc=2, item∈{97,100}`. → **후원회는 `acc_sec_cd`가 1(수입)/2(지출)로 수입·지출을 직접 인코딩**. 후보는 `acc_sec_cd∈{82,83,84,85}`.

> **핵심 함의**: 수입/지출 구분에 `incm_sec_cd`가 **불필요**하다. `acc_sec_cd`만으로 (후보 자금원 / 후원회 수입 / 후원회 지출)이 모두 구별된다. `assignReceiptNumbers`의 `ReceiptTarget`은 이미 `acc_sec_cd`·`item_sec_cd`를 받으므로 **타입·소비처 변경이 없다.**

## 2. 채번 규칙 (목표)

### 스킴 A — 후보 자금원 계정 (`acc_sec_cd ∈ {82,83,84,85}`)
| 과목 | 키(prefix) | 결과 예 |
|---|---|---|
| 선거비용(86) | `{계정약자}(비)` | `자(비)-1` (현행 유지) |
| 선거비용외(87) | `{계정약자}` | `자-1` (**변경**: `(비외)` 제거) |

계정약자: 84→자·85→후·82→보·83→외 (`ACC_ABBR` 유지).

### 스킴 B — 후원회 지출 계정 (`acc_sec_cd === 2`)
| 과목(item) | 키 | 결과 예 |
|---|---|---|
| 기부금(97) | `기` | `기-1` |
| 후원금모금경비(98) | `모` | `모-1` |
| 인건비_기본경비(99) | `인` | `인-1` |
| 사무소설치운영비_기본경비(100) | `사` | `사-1` |
| 그밖의경비(101) | `그` | `그-1` |

약자 규칙(코드명 기반, 코드ID 변동 내구): `name.includes("모금") ? "모" : firstChar(name)`. (97/99/100/101은 모두 첫 글자 = 기/인/사/그, 98만 "모금" 포함 → 모.)

### 스킴 C — 후원회 수입(`acc_sec_cd === 1`) · 기타 (현행 유지)
현행 폴백 `{accountAbbr}({itemAbbr})` 그대로. 예: 수입 기명후원금 → `수(기)-1`(현행과 동일). **변경 없음**(사용자 확정).

## 3. 함수 설계 (`receipt-no.ts`)

소비처가 `accountAbbr`/`itemAbbr`/`formatReceiptNo`를 import하지 않음(grep 확인: 내부+테스트 전용). → 자유 리팩터 가능.

### 3.1 신규 상수/헬퍼
```ts
/** 후보 자금원 계정 — 스킴 A 판정(SSOT 재사용 가능: FUNDING_SOURCE_BY_ACC_SEC_CD 키). */
const CANDIDATE_FUND_ACC = new Set([82, 83, 84, 85]);

/** 후원회 지출 과목 약자 — 후원금모금경비만 '모'(첫글자 '후' 아님), 그 외 첫 글자. */
export function supporterExpenseAbbr(itemName: string | undefined | null): string {
  const n = (itemName ?? "").trim();
  if (!n) return "";
  if (n.includes("모금")) return "모";
  return n[0];
}
```

### 3.2 `formatKey` 3-스킴 분기 (핵심)
```ts
function formatKey(t: ReceiptTarget, codeNames: ReceiptCodeNames): string {
  const accName = codeNames.acc[t.acc_sec_cd];
  const itemName = codeNames.item[t.item_sec_cd];

  // 스킴 A: 후보 자금원 계정
  if (CANDIDATE_FUND_ACC.has(t.acc_sec_cd)) {
    const a = accountAbbr(t.acc_sec_cd, accName);   // 자/후/보/외
    const it = (itemName ?? "");
    if (it.includes("선거비용외")) return a;          // 선거비용외 → 괄호 제거 (자-)
    if (it.includes("선거비용")) return `${a}(비)`;   // 선거비용 → 자(비)-
    return `${a}(${itemAbbr(itemName)})`;            // 방어 폴백(후보 기타 과목)
  }

  // 스킴 B: 후원회 지출 계정 (acc_sec_cd=2 '지출')
  if (t.acc_sec_cd === 2) {
    return supporterExpenseAbbr(itemName);          // 기/모/인/사/그
  }

  // 스킴 C: 후원회 수입(1) · 기타 → 현행 폴백 유지
  return `${accountAbbr(t.acc_sec_cd, accName)}(${itemAbbr(itemName)})`;
}
```

### 3.3 영향 없는 함수
- `accountAbbr` — 유지.
- `itemAbbr` — 유지(스킴 A 선거비용 "비" + 스킴 C 폴백에서 사용). "비외" 반환은 스킴 A에서 더 이상 키 생성에 쓰이지 않으나(선거비용외는 그 전에 `return a`) 제거하지 않음(공개 export·테스트 호환, 무해).
- `formatReceiptNo` — 유지(현재 채번 파이프라인 미사용·테스트 전용 공개 헬퍼). 변경 불필요.
- `assignReceiptNumbers` / `fillExportReceiptNumbers` — `formatKey` 내부만 바뀌므로 **시그니처·본문 무변경**. 조합별 순번·rcp_no2·incm 스코프 로직 그대로.

## 4. 소비처 영향

| 소비처 | 변경 | 근거 |
|---|---|---|
| `api/acc-book` batch_receipt | **무변경** | 이미 `acc_sec_cd, item_sec_cd` select·전달. `formatKey`가 알아서 분기. |
| `api/system/export-sqlite` `fillExportReceiptNumbers` | **무변경** | 행에 `acc_sec_cd/item_sec_cd/incm_sec_cd` 존재. incm 그룹화 로직 유지(스코프별 순번). |
| `dashboard/expense/page.tsx:207` 안내 다이얼로그 | 선택(무변경 가능) | 예시 문구 `자(비)-1`는 여전히 유효. |
| `lib/excel-template/income-expense-book.ts` `formatRcpNo` | **영향 없음(확인 완료)** | 이 리포트는 **선거비용 전용**(지출 `electionSet.has(item_sec_cd)` ∧ `acc_print_ok='Y'`, 수입 자금원별). 선거비용 키 포맷 `자(비)-`는 **불변**. 선거비용외·후원회 지출은 이 리포트에 등장하지 않음. → 하드코딩 `(비)`는 범위 내 정확. |

## 5. 테스트 매트릭스 (`receipt-no.test.ts`)

| ID | 케이스 | 기대 |
|---|---|---|
| 기존 T-9 **수정** | 후보 선거비용외 자산(84,87) | `자-1` (←`자(비외)-1`) |
| 신규 A-1 | 후보 선거비용 84/85/82/83 | `자(비)-1·후(비)-1·보(비)-1·외(비)-1` |
| 신규 A-2 | 후보 선거비용외 84/85/82/83 | `자-1·후-1·보-1·외-1` |
| 신규 A-3 | 후보 선거비용/외 혼합 → 조합별 독립 순번 | `자(비)-1·자(비)-2` ∧ `자-1·자-2` (키 다름) |
| 신규 B-1 | 후원회 지출 97/98/99/100/101 | `기-1·모-1·인-1·사-1·그-1` |
| 신규 B-2 | 후원금모금경비(98) → 모 (첫글자 '후' 회귀가드) | `모-1` |
| 신규 B-3 | `supporterExpenseAbbr` 단위 | 모금 포함→모, 그 외 첫글자 |
| 신규 C-1 | 후원회 수입 94/95 (acc=1) 현행 유지 | `수(기)-1·수(익)-1` |
| 회귀 | T-1·T-2·T-6·T-7·T-8·TC-1~7 | 불변(조합 순번·rcp_no2·incm 스코프·immutability) |

`NAMES` 픽스처 확장: `acc: {…, 1:"수입", 2:"지출"}`, `item: {…, 97:"기부금",98:"후원금모금경비",99:"인건비_기본경비",100:"사무소설치운영비_기본경비",101:"그밖의경비", 94:"기명후원금",95:"익명후원금"}`.

## 6. 엣지 케이스 / 리스크

- **키 충돌**: 후보 선거비용외 `자/후/보/외` vs 후원회 지출 `기/모/인/사/그` — 문자 불중복. 조합 순번은 incm 스코프 내 키별이고 후보/후원회는 서로 다른 org·acc_sec_cd라 자연 분리. full 모드 혼합 export도 키가 달라 순번 독립(테스트 A-3·B-1로 고정).
- **후원금모금경비→모**: 첫글자 폴백('후')과 상이 → 누락 시 회귀. B-2로 가드.
- **acc_sec_cd=2 가정**: 후보는 82~85만 사용(실데이터 확인)하므로 2는 후원회 지출 전용. 미래 코드셋 변경 위험은 낮음(공식 PFund2 스키마 고정값).
- **기존 부여분 보존**: 규칙 변경 후에도 `existing` max+1 이어가기 유지. 과거 `자(비외)-N`가 DB에 있으면 키 `자(비외)`로 잡혀 신규 `자-` 키와 별도 순번 시작 → 혼재 가능(범위 밖: 소급 재채번 안 함, Plan YAGNI). 신규 미부여분만 새 규칙.

## 7. 구현 순서 (Do 체크리스트)

1. `receipt-no.ts`: `CANDIDATE_FUND_ACC` 상수 + `supporterExpenseAbbr` 추가.
2. `formatKey` 3-스킴 분기로 교체. 헤더 주석(SSOT 설명) 갱신(스킴 A/B/C 명시).
3. `receipt-no.test.ts`: T-9 수정 + A/B/C 신규 케이스 + `NAMES` 픽스처 확장.
4. `node node_modules/vitest/vitest.mjs run src/lib/accounting/receipt-no.test.ts` 그린.
5. 전체 테스트·lint·build 회귀 확인.
6. (선택) export-sqlite로 후원회 `.db` 산출 → 지출 `기-1`·후보 선거비용외 `자-1`·FK orphan 0 육안 확인.

## 8. 검증 방법 (Check 예고)

- 단위 테스트 전 케이스 그린(스킴 A/B/C + 회귀).
- `gap-detector`로 설계 대비 구현 일치율 측정(≥90% 목표).
- export 산출물 실 검증: 후원회 지출 `{과목약자}-n`, 후보 선거비용외 `{계정약자}-n`, 선거비용 `{계정약자}(비)-n` 불변.

## 9. 범위 밖 (YAGNI)
- 과거 `rcp_no` 소급 재채번 없음.
- 후원회 수입 규칙 변경 없음(스킴 C 현행).
- `income-expense-book.ts`·`formatReceiptNo` 변경 없음.
