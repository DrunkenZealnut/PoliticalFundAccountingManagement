# Design: 자료백업(.db) 거래처 FK 고아 수정 (export-sqlite-customer-fk-orphan)

> Plan: `docs/01-plan/features/export-sqlite-customer-fk-orphan.plan.md`
> 확정: data1/data2 export의 CUSTOMER 선정을 **org_id 필터 → 거래 참조 cust_id 필터**로 변경
> 버전 목표: v0.14.3.0

## 1. 아키텍처

`export-sqlite/route.ts` 한 곳 수정. 순수 헬퍼 1종 추가(기존 `normalizeOfficialExpenseRow`/`stripAppOnlyAccBookColumns`와 동일 패턴 — export, 단위테스트).

```
GET /api/system/export-sqlite (data1|data2 모드)
  fetch customer / acc_book / acc_book_bak
   ├─ finalAccBook    = filterByExportOrgId(remapOrgId(accBook))   .map(normalize).map(strip)   ← 계산을 CUSTOMER insert 앞으로 이동
   ├─ finalAccBookBak = filterByExportOrgId(remapOrgId(accBookBak)).map(normalize).map(strip)
   ├─ exportCustomer  = selectReferencedCustomers(remappedCustomer, finalAccBook, finalAccBookBak)  ← (신규) org_id 필터 대체
   ├─ insertRows CUSTOMER (org_id strip)         + ENSURE_ANONYMOUS(-999)
   ├─ insertRows CUSTOMER_ADDR (exportCustIds)
   └─ insertRows ACC_BOOK / ACC_BOOK_BAK (finalAccBook*)
```

## 2. 근본 원인 재확인 (Plan §2.2 요약)
`route.ts:697-701` 의 data1/data2 CUSTOMER 필터가 `org_id === targetExportOrgId` 라, 거래가 참조하는 **org_id=NULL·타 org 거래처**가 빠져 ACC_BOOK이 `ACC_BOOK_FK3` 고아가 됨 → 윈도우 PFund2가 수입지출부 거래처 join 시 그 행을 드롭 → 계정별 수입/지출 누락. full 모드(필터 없음)는 고아 0.

## 3. 변경 상세

### 3.1 신규 순수 헬퍼 (export)
```ts
/**
 * data1/data2 export용 CUSTOMER 선정 — 거래(ACC_BOOK/ACC_BOOK_BAK)가 실제 참조하는
 * cust_id 집합으로 필터. org_id(공유 NULL·타org)와 무관하게 참조무결성 보장.
 */
export function selectReferencedCustomers(
  customers: Record<string, unknown>[],
  ...rowSets: Record<string, unknown>[][]
): Record<string, unknown>[] {
  const ids = new Set<number>();
  for (const rows of rowSets) for (const r of rows) ids.add(Number(r.cust_id));
  return customers.filter((c) => ids.has(Number(c.cust_id)));
}
```

### 3.2 route.ts 흐름 변경
1. **`finalAccBook`/`finalAccBookBak` 계산을 CUSTOMER insert(697행) 앞으로 이동** (현재 740-745행 로직). normalize/strip은 `cust_id` 불변 → 참조 집합 산출에 안전. 이후 ACC_BOOK insert(746-747)·`myAccBookIds`(750)는 동일 변수 재사용.
2. CUSTOMER 선정 교체:
   ```ts
   const remappedCustomer = remapOrgId(customer, orgIdMap);
   const exportCustomer =
     targetExportOrgId === null
       ? remappedCustomer                                   // full/master: 현행(전체)
       : selectReferencedCustomers(remappedCustomer, finalAccBook, finalAccBookBak); // data1/data2
   const exportCustIds = new Set(exportCustomer.map((c) => Number(c.cust_id)));
   ```
3. 나머지(org_id strip 후 insert, CUSTOMER_ADDR=exportCustIds, ENSURE_ANONYMOUS) 불변.

### 3.3 불변/경계
- **full·master 모드**: `targetExportOrgId === null` → 현행(전체 CUSTOMER) 유지 → 회귀 없음.
- **익명(-999)**: Supabase acc_book엔 -999 미존재(서버에서 실 익명 cust_id로 resolve). export 후 `PFUND2_ENSURE_ANONYMOUS_CUSTOMER_SQL`로 별도 보장 — 변경 없음.
- **참조하나 customer 테이블에 아예 없는 cust_id**(진짜 결손): export 불가 → 여전히 고아. 이는 Supabase 데이터 결손이므로 본 범위 밖(Plan §3.2 audit). org11 NULL/타org 거래처는 customer 테이블에 **존재**하므로 모두 포함됨.
- CUSTOMER 행수 증가(참조분 포함)는 의도된 변화.

## 4. 데이터 흐름 정합 근거 (실측, Plan §2.3)
- org11 data1: 후보자등자산 수입 고아 14,602,392원(cust_id=42) + 지출 고아 41건/21,196,389원 → 수정 후 모두 포함.
- 참조 거래처 org_id 분포 NULL13/9_1/11_15 → `selectReferencedCustomers`가 전부 포함 → 고아 0.

## 5. 테스트 (`normalize.test.ts`에 추가 또는 동일 디렉터리 신규)
| ID | 케이스 | 기대 |
|----|--------|------|
| T-1 | 참조 cust_id만 포함 | acc_book이 참조하는 거래처만 반환 |
| T-2 | org_id 무관(NULL·타org) 참조 포함 | org_id=NULL/9 거래처도 참조되면 포함 |
| T-3 | 미참조 거래처 제외 | 어떤 행도 참조 안 한 거래처 제외 |
| T-4 | acc_book + acc_book_bak 합집합 | 두 집합 참조분 모두 포함 |
| T-5 | 빈 거래 | 빈 배열 반환 |

## 6. 검증 (실증 회귀)
- vitest 단위(T-1~T-5) + 전체 통과, lint 0, build 성공.
- 실데이터 재현: org11/org9 `data1` export 재생성 → `ACC_BOOK` FK 고아 0(수입·지출), 계정별 수입합 == Supabase 합. full/master 출력 불변.

## 7. 영향 범위
- `app/src/app/api/system/export-sqlite/route.ts` (헬퍼 추가 + 흐름 1곳 이동 + CUSTOMER 선정 1곳 교체)
- 스키마/마이그레이션 없음. import-sqlite 무관.

## 8. 검증 기준 (Acceptance, Plan §5 동일)
1. data1 export FK 고아 0. 2. 계정별 수입 누락 복구. 3. full/master 회귀 없음. 4. 익명·CUSTOMER_ADDR 무결. 5. 테스트·lint·build 통과.
