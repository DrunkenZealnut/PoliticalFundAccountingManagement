# 설계: 수입지출처(customer) 조직별 격리

- 상태: **검토 대기** (구현 전 승인 필요)
- 작성일: 2026-05-31
- 브랜치: feat/official-program-parity
- 관련 버그: 사용기관 전환 후 수입지출처 내역에 다른 조직 거래처가 함께 표시됨

---

## 1. 문제 / 근본 원인 (조사 확정)

| 구분 | 내용 |
|---|---|
| 증상 | 조직(사용기관) 전환 후 **수입지출처 내역**에 이전 조직 거래처가 함께 보임 |
| 원인 ① | `pfam.customer` 테이블에 **`org_id` 컬럼이 없음** → DB 레벨에서 전 조직 공용 |
| 원인 ② | `customer/page.tsx`의 `showOnlyUsed` 기본값 `false` (commit `0cbf228`에서 "일괄등록 거래처 안 보임"을 고치려 전체표시로 변경 → 부작용) |
| 원인 ③ | `acc-book/route.ts` 배치 입력의 거래처 매칭이 **이름으로 전역 검색**(`.eq("name", provider)`, org 무관) → 조직 간 거래처 재사용 |
| 정상 | 수입/지출 내역·보고서·집계는 `org_id` 필터 + 조직 전환 재조회로 **정상 격리** |

## 2. 결정 방향

거래처를 **조직별로 분리** (사용자 확정). `customer`에 `org_id`를 추가한다.

### PFund2 호환 관점 (중요)
- PFund2 CUSTOMER DDL에는 **ORG_ID가 없음** (`export-sqlite/route.ts:122`).
- PFund2는 거래처 격리를 **org별 .db 파일 분리**로 달성 (Fund_Data_1.db=후보자, Fund_Data_2.db=후원회). 각 파일이 자기 CUSTOMER를 가짐.
- 우리 시스템은 단일 Supabase로 합치면서 **파일 단위 격리를 잃음**.
- → `customer.org_id` 추가는 PFund2의 "파일별 CUSTOMER" 모델을 컬럼으로 재현하는 것. **파리티를 깨지 않고 오히려 일치**시킴.
- export 시 PFund2 DDL에 ORG_ID가 없으므로 **org_id 컬럼은 stripping**하고, `data1`/`data2` 모드에서 **해당 org의 customer만 내보냄**.

## 3. 마이그레이션 (scripts/011_customer_org_id.sql)

```sql
-- 1) 컬럼 추가 (nullable로 먼저)
ALTER TABLE pfam.customer ADD COLUMN org_id INTEGER;

-- 2) 백필: acc_book에서 해당 거래처를 쓴 org로 귀속
--    (현 운영 데이터상 거래처는 조직 간 공유 0 → 1:1 귀속 가능)
UPDATE pfam.customer c
SET org_id = sub.org_id
FROM (
  SELECT cust_id, MIN(org_id) AS org_id
  FROM pfam.acc_book
  WHERE cust_id IS NOT NULL
  GROUP BY cust_id
) sub
WHERE c.cust_id = sub.cust_id;

-- 3) 어느 거래에도 안 쓰인 거래처 처리 (미사용/고아)
--    정책 결정 필요: (a) 특정 기본 org 귀속 (b) NULL 유지(전역) (c) 삭제
--    → 검토 시 결정. 잠정: NULL 유지 후 화면에서 제외 또는 관리자 확인.

-- 4) 익명 거래처(-999, name="익명") 처리
--    PFund2 표준 익명은 org별로 1행 필요할 수 있음.
--    → org별 익명 행 보장 전략 확정 후 반영 (pfund2-constants.ts 연계).

-- 5) 인덱스 + FK (백필 검증 후)
CREATE INDEX idx_customer_org_id ON pfam.customer(org_id);
-- ALTER TABLE pfam.customer ADD CONSTRAINT customer_org_fk
--   FOREIGN KEY (org_id) REFERENCES pfam.organ(org_id);  -- 고아 정리 후 적용

-- 6) RLS 정책 갱신 (002_fix_rls_and_schema 참고) — org_id 기준 격리 추가
```

### 백필 모호성 (검토 포인트)
- **여러 조직이 쓰는 거래처**: 현재 데이터는 공유 0이라 안전. 단 향후를 위해 "조직별 복제" 규칙 정의 필요.
- **미사용 거래처**: acc_book 참조 없는 행 → 귀속 org 불명. 정책 결정 필요.
- **익명(-999)**: org별 1행 보장 vs 전역 1행 유지. PFund2 export 동작과 정합 필요.
- ⚠️ 마이그레이션 직전 **최신 데이터 스냅샷으로 백필 검증** 재실행 (세션 중 데이터 변동 관찰됨).

## 4. 코드 변경 (약 10개 파일)

| 파일 | 변경 |
|---|---|
| `scripts/011_customer_org_id.sql` | 신규 마이그레이션 |
| `src/types/database.ts` | customer Row/Insert에 `org_id` |
| `src/app/api/customers/route.ts` | GET: `org_id` 필터로 조회(acc_book 우회 제거). POST insert: `org_id` 세팅 |
| `src/app/dashboard/customer/page.tsx` | org_id 기준 조회, `showOnlyUsed` 꼼수 제거(또는 의미 재정의) |
| `src/app/dashboard/customer-batch/page.tsx` | insert에 `org_id` |
| `src/app/api/acc-book/route.ts` | 배치 매칭을 **org 범위**로(`.eq("name",…).eq("org_id",…)`), 익명/신규 insert에 `org_id` |
| `src/app/api/system/import-sqlite/route.ts` | 익명 insert에 `org_id`, 복구 시 customer를 대상 org로 귀속 |
| `src/app/api/system/export-sqlite/route.ts` | `fetchTable("customer")`를 org별 필터, export 시 org_id strip, data1/data2 모드 정합 |
| `src/lib/accounting/pfund2-constants.ts` | 익명 거래처 org별 보장 로직 |
| RLS 정책 | customer org_id 격리 |

## 5. 리스크 / 롤백
- **운영 스키마 변경 + 백필** = 비가역적. → 별도 브랜치에서 구현, 마이그레이션은 **백업 후** 적용.
- export/import 계약 변경 → **방금 머지한 PFund2 export/import(import-helpers)에 영향**. 라운드트립 회귀 테스트 필수.
- 롤백: `org_id` 컬럼 DROP (데이터 손실 없음, 컬럼만 추가했으므로). 코드는 PR revert.

## 6. 테스트 계획
- 마이그레이션 백필 검증 쿼리(귀속 누락·고아 0 확인).
- 단위: customers API org 필터, acc-book 매칭 org 범위.
- 통합: 조직 A/B 전환 시 거래처 목록 분리 확인(라이브 dryRun 수준).
- PFund2 export(full/data1/data2) → import 라운드트립 회귀 (이전 검증 재실행).

## 7. 진행 순서
1. 본 설계 **검토/승인** ← 현재 단계
2. 백필 모호성(미사용·익명) 정책 확정
3. 브랜치에서 구현 + 마이그레이션 SQL 작성
4. 로컬/스냅샷에서 백필·라운드트립 검증
5. 운영 백업 → 마이그레이션 적용 → 코드 배포
