# Design: 영수증번호 계정·과목 조합 규칙 (receipt-no-account-item-rule)

> Plan: `docs/01-plan/features/receipt-no-account-item-rule.plan.md`
> 확정: 포맷 `{계정약자}({과목약자})-{순번}` · 조합별 순번 · 지출+수입 대상
> 약자: 계정 84자/85후/82보/83외, 과목 선거비용→비/선거비용외→비외
> 버전 목표: v0.14.1.0

## 1. 아키텍처

채번 규칙을 **순수 함수 SSOT**로 만들어 3경로(지출 클라이언트·수입·API batch_receipt)가 공유:

```
lib/accounting/receipt-no.ts (순수)
  ├─ accountAbbr(accSecCd, accName?) → "자|후|보|외|…"
  ├─ itemAbbr(itemName) → "비|비외|…"
  ├─ formatReceiptNo(accAbbr, itemAbbr, seq) → "자(비)-1"
  └─ assignReceiptNumbers(targets, codeNames, existing) → [{acc_book_id, rcp_no, rcp_no2}]
        ↑ 조합별 순번 부여(미부여분만), 기존 조합 max+1부터
   ▲ 재사용
expense/page.tsx(handleBatchReceiptGen) · income/page.tsx · api/acc-book(batch_receipt)
```

## 2. 약자 매핑

### 2.1 계정 약자 (acc_sec_cd)
funding-source SSOT와 정합. 후보자계정(cs_id=10):
| acc_sec_cd | 계정명 | 약자 |
|-----------|--------|------|
| 84 | 후보자(등)자산 | 자 |
| 85 | 후원회기부금 | 후 |
| 82 | 보조금 | 보 |
| 83 | 보조금외(지원금) | 외 |
| 그 외 | (수입 계정·정당 등) | 코드명 첫 글자 폴백 |

```ts
const ACC_ABBR: Record<number, string> = { 84: "자", 85: "후", 82: "보", 83: "외" };
function accountAbbr(accSecCd: number, accName?: string): string {
  return ACC_ABBR[accSecCd] ?? (accName?.trim()?.[0] ?? "");
}
```

### 2.2 과목 약자 (item_sec_cd → 코드명 기반)
| 과목명 | 약자 |
|--------|------|
| 선거비용 | 비 |
| 선거비용외 | 비외 |
| 그 외(수입 과목 등) | 코드명 첫 글자 폴백 |

실제 codevalue 코드명은 86=`선거비용`, 87=`선거비용외정치자금`(≠"선거비용외")이므로 정확일치가 아니라 **includes**로 매칭하고, `선거비용외`를 먼저 검사한다(부분문자열 충돌 회피).

```ts
function itemAbbr(itemName: string | undefined | null): string {
  const n = (itemName ?? "").trim();
  if (n.includes("선거비용외")) return "비외"; // 87 "선거비용외정치자금"
  if (n.includes("선거비용")) return "비";
  return n ? n[0] : "";
}
```

> 폴백(첫 글자)은 수입 과목·미정의 계정 대비 안전장치. 핵심 케이스(지출 선거비용/외, 자금원 4계정)는 명시 매핑.

## 3. 채번 로직 (`assignReceiptNumbers`, 순수)

입력: `targets`(rcp_yn='Y' ∧ rcp_no 없음, 정렬됨 — acc_book_id·acc_sec_cd·item_sec_cd 포함), 코드명 맵, 기존 부여분.
1. 각 target의 `key = "{accAbbr}({itemAbbr})"` 계산.
2. **조합별 순번**: 기존 rcp_no 중 동일 key의 max 순번 파싱(`{key}-(\d+)$`) → 다음 번호부터. 기존 없으면 1부터.
3. `rcp_no = formatReceiptNo(...) = "{key}-{seq}"`.
4. `rcp_no2`(정수): 전체 max+1 순번 유지(정렬/중복 방지·기존 동작 호환). 표시값과 분리.

**미부여분만** 채번(기존 부여분 보존 — 기존 batch_receipt 동작 유지). 전체 재생성은 「영수증일괄제거」(expense, `rcp_no`=빈값·`rcp_no2`=0 리셋) 후 재실행.

```ts
export function assignReceiptNumbers(
  targets: { acc_book_id: number; acc_sec_cd: number; item_sec_cd: number }[],
  codeNames: { acc: Record<number,string>; item: Record<number,string> },
  existing: { rcp_no: string | null; rcp_no2: number | null }[],
): { acc_book_id: number; rcp_no: string; rcp_no2: number }[] {
  // 조합별 기존 max seq + 전체 max rcp_no2 파싱 → 순번 부여
}
```

## 4. 3경로 통합
- **API** `batch_receipt`(route.ts): select에 `acc_sec_cd, item_sec_cd` 추가, codevalue 코드명 조회, `assignReceiptNumbers` 사용. 수입(incmSecCd=1)·지출(2) 공용.
- **지출** `expense/page.tsx handleBatchReceiptGen`: 클라이언트 직접 로직을 **batch_receipt API 호출로 전환**(SSOT 일원화) 또는 동일 함수 import. → API 호출 권장(중복 제거).
- **수입** `income/page.tsx`: 이미 API 호출 → 자동 적용.

## 5. rcp_no2 / 정렬 정합
- `rcp_no2`는 전체 순번(정렬·max·중복방지)로 유지 — `GET ?maxRcpNo`(채번 시작점)·정렬 로직 회귀 없음.
- 표시값 `rcp_no`만 조합 규칙. 보전 수입·지출부의 영수증 일련번호 표기와 일관(`자(비)-N`).

## 6. 테스트 (`receipt-no.test.ts`)
| ID | 케이스 | 기대 |
|----|--------|------|
| T-1 | accountAbbr 84/85/82/83 | 자/후/보/외 |
| T-2 | accountAbbr 미정의 + 코드명 | 첫 글자 폴백 |
| T-3 | itemAbbr 선거비용/선거비용외 | 비/비외 |
| T-4 | itemAbbr 수입 과목 | 첫 글자 폴백 |
| T-5 | formatReceiptNo | "자(비)-1" |
| T-6 | assignReceiptNumbers 조합별 순번 | 자(비)-1·2 / 후(비)-1 |
| T-7 | 기존 조합 max+1 이어서 | 기존 자(비)-3 → 자(비)-4 |
| T-8 | rcp_no2 전체 순번·중복 없음 | 정수 순번 유지 |
| T-9 | 선거비용외 | "자(비외)-1" |

## 7. 영향 범위
- 신규: `lib/accounting/receipt-no.ts` + `.test.ts`
- `app/api/acc-book/route.ts` (batch_receipt: select·codevalue·assignReceiptNumbers)
- `app/dashboard/expense/page.tsx` (handleBatchReceiptGen → API 호출 전환)
- `app/dashboard/income/page.tsx` (자동, 변경 최소)

## 8. 검증 기준
- 일괄생성 rcp_no가 `{계정약자}({과목약자})-{조합순번}` 형식
- 지출·수입 동일 규칙, 기존 부여분 보존(미부여분만)
- rcp_no2 정렬·maxRcpNo 회귀 없음
- 단위 테스트 통과 · lint 0 · build 성공
