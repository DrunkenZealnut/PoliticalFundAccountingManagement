# Gap Analysis: export-sqlite-customer-fk-orphan

> Check 단계 (gap-detector) · 2026-06-15
> 설계: `docs/02-design/features/export-sqlite-customer-fk-orphan.design.md`
> 검증 대상: `app/src/app/api/system/export-sqlite/route.ts`, `.../normalize.test.ts`

## 전체 Match Rate: **100%** ✅ (7/7 설계 검증 포인트, Gap 0 → Report 진행 가능)

## 검증 포인트별 결과

| # | 설계 검증 포인트 | 결과 | 근거 |
|---|------------------|:----:|------|
| 1 | 순수 헬퍼 `selectReferencedCustomers(customers, ...rowSets)` export — 참조 cust_id 집합 필터 | ✅ | route.ts (Set 누적 후 `ids.has(Number(c.cust_id))`), 부수효과 없음 |
| 2 | `filterByExportOrgId`+`finalAccBook`/`finalAccBookBak` 계산을 CUSTOMER insert 앞으로 이동(재사용, 중복정의 없음) | ✅ | filter 단일정의, final*가 CUSTOMER insert보다 앞, ACC_BOOK insert·myAccBookIds 재사용 |
| 3 | CUSTOMER 선정 교체: full/master=remappedCustomer, data1/data2=selectReferencedCustomers(...) | ✅ | 삼항식이 설계 §3.2.2와 일치 |
| 4 | exportCustIds(→CUSTOMER_ADDR)가 새 exportCustomer 기준 추종 | ✅ | `new Set(exportCustomer.map…)` → ADDR `exportCustIds.has(...)` |
| 5 | 익명(-999) ENSURE 유지, full/master 불변 | ✅ | PFUND2_ENSURE_ANONYMOUS_CUSTOMER_SQL 유지, null분기 전체 반환 |
| 6 | 테스트 T-1~T-5(참조만/NULL·타org/미참조제외/bak합집합/빈거래) | ✅ | normalize.test.ts 5건, fixture가 실측 cust_id(42 타org·182 NULL) 반영 |
| 7 | 스키마·마이그레이션 없음 | ✅ | SQLITE_DDL 무변경, scripts 추가 없음, import-sqlite 무관 |

## Gap
- 🔴 누락: 없음 · 🟡 추가: 없음 · 🔵 편차: 없음

## 잔여 리스크 (Gap 아님 — 설계가 명시적으로 범위 밖 분류)
| # | 리스크 | 평가 |
|---|--------|------|
| R1 | customer 테이블에 아예 없는 cust_id(진짜 결손)는 여전히 고아 | 수용. org11 NULL/타org 거래처는 customer에 존재 → 본 수정으로 전부 포함 |
| R2 | customer.org_id NULL backfill 미수행 | 수용(Plan §3.2). 복수 org 공유 위험으로 별도 audit, export 수정만으로 증상 해소 |
| R3 | 윈도우 PFund2 E2E 최종 복구는 사용자 환경 의존 | 실측(고아 5→0·41→0, full 불변)으로 사실상 검증, 최종 수동확인 가능 |

## 실증 검증 (Acceptance 대조)
| 기준 | 실측 | 판정 |
|------|------|:----:|
| data1 FK 고아 0(수입·지출) | org11 5→0·41→0, org9 1→0 | ✅ |
| 계정별 수입 복구 | 후보자등자산 22,102,579 전액 | ✅ |
| full/master 회귀 없음 | full 고아 0 불변 | ✅ |
| 익명·CUSTOMER_ADDR 무결 | ENSURE 유지, ADDR=exportCustIds | ✅ |
| 테스트·lint·build | vitest 686(+5)·lint0·build성공 | ✅ |

## 결론
설계 7포인트 전부 충실 구현, Gap 0, Acceptance 5항목 충족. `/pdca iterate` 불필요. **Report 진행 가능.** 후속(비차단): R2 customer.org_id 데이터 위생 audit 백로그.
