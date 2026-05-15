# db-export-fix Gap Analysis Report

> **Date**: 2026-05-14
> **Plan**: `docs/01-plan/features/db-export-fix.plan.md`
> **Design**: `docs/02-design/features/db-export-fix.design.md`
> **Analyzer**: bkit:gap-detector (inline analysis, persisted by parent)

## 1. Overall Match Rate

| Category | Score | Status |
|---|:---:|:---:|
| Design 체크리스트 (§8.1–8.12) | **83%** (10/12) | ✅ |
| Code-vs-design 충실도 | **96%** | ✅ |
| Convention / Architecture | **95%** | ✅ |
| **Overall** | **92%** | ✅ |

체크리스트 2건(8.7 통합 테스트, 8.12 Windows E2E)은 환경 의존 항목이며 Design 단계에서 명시적으로 "사용자 검증 대기"로 분류됨. Open으로 처리 시 92%, Failed로 처리 시 75%.

## 2. Per-Section Match Score

| Design Section | Spec | Implementation | Match | Evidence |
|---|---|---|:---:|---|
| §2 code-mapping 모듈 | `resolveAccountCodes(...)` + `CodeMappingError`, CS_ID 우선순위 1/2/10 (계정), 12/3(후원회) 또는 11/3(후보자) (과목), acc_rel 필터 + `acc_order` 정렬 | 모두 구현 | **100%** | `lib/accounting/code-mapping.ts:73,75-82,111-152` |
| §2.4 단위 테스트 | 5개 명시 케이스 + Vitest | 9개 케이스 (5개 + 엣지) | **100%** | `code-mapping.test.ts:38-188` |
| §3.2.1 hook `{ codeValues, accRel }` | `useCodeValues()`에 `accRel` 추가 | `accRels`(복수형)로 노출 | **95%** | `use-code-values.ts:173-182`. 명칭 미세 차이(`accRel`→`accRels`), 일관 사용 |
| §3.2.2 검증 매핑 체크 | validate 루프에 `tryResolveAccountCodes`, "계정/과목 매핑 실패" 추가 | 정확히 동일 패턴 | **100%** | `batch-import/page.tsx:188-200` |
| §3.2.3 저장 매핑 | `acc_sec_cd:0` 하드코딩 제거, `resolveAccountCodes()` 호출 | try/catch로 `CodeMappingError` 처리 | **100%** | `batch-import/page.tsx:236-278` |
| §4 batch_insert 서버 안전망 | codevalue+acc_rel+organ 일괄 로드, `acc_sec_cd===0` && `_account/_subject` 시 매핑 시도 | 정확히 동일 + `acc_sec_cd==null`도 처리 | **100%** | `acc-book/route.ts:168-210` |
| §5.2 DDL: 대괄호 식별자, NOT NULL/FK, VARCHAR(N), 5개 보조 테이블, info(no,name,number) | 13개 메인 + ACC_REL2/CODESETTEMP/CODEVALUETEMP/CUSTOMERTEMP/TEST + info 스키마 | 모두 포함 | **100%** | `export-sqlite/route.ts:83-390` |
| §5.3 buildOrganRows | 후원회 → 후보자(ORG_ID=1, SEC=90) + 후원회(ORG_ID=2) | 구현됨 + non-supporter 단일 행 폴백 | **100%** | `export-sqlite/route.ts:427-513` |
| §5.4 remapOrgId | acc_book/estate/opinion/alarm/sum_rept/col_organ 변환 | ACC_BOOK, ACC_BOOK_BAK, ESTATE, OPINION, SUM_REPT, COL_ORGAN, ALARM 7개 모두 적용 | **100%** | `export-sqlite/route.ts:623-630` |
| §5.5 ACC_REL2 시드 | 482행 JSON 번들 + INSERT | 정확히 일치 | **100%** | `acc_rel2.json` (482 entries), `export-sqlite/route.ts:6,613` |
| §6.1 organ_pair_normalization.sql | 진단 SELECT + 주석 처리된 UPDATE 예시 | 정확히 일치 | **100%** | `app/scripts/009_organ_pair_normalization.sql:14-57` |
| §6.2 acc_rel_seed_check.sql (P2) | 미작성 | **0%** | Plan에서 P2로 분류, 의도적 보류 |
| §7.1 Customer 무결성 | 미구현 (orphan cust_id 처리 없음) | **0%** | 리스크 R3로 기록 |
| §7.2 ORG_SEC_CD FK in CODEVALUE | CODEVALUE를 ORGAN 전에 export | **100%** | `export-sqlite/route.ts:610-616` |
| §9.1 단위 테스트 | 5개 케이스 + 11/11 인라인 통과 | **100%** | `code-mapping.test.ts`, 사용자 검증 11/11 |
| §9.2 통합 테스트 | 미실행 (dev 서버 환경 필요) | **0%** (지연) | R1 |
| §9.3 회귀 테스트 | 미실행 | **0%** (지연) | R3 |

### §8 체크리스트 요약

| # | 항목 | 상태 |
|:---:|---|:---:|
| 8.1 | ACC_REL2 JSON 482행 시드 | ✅ |
| 8.2 | DDL 추출 → 상수 (분리 모듈 대신 인라인) | ✅ |
| 8.3 | code-mapping.ts + Vitest | ✅ |
| 8.4 | useCodeValues + /api/codes accRel | ✅ |
| 8.5 | batch-import 검증+저장 매핑 | ✅ |
| 8.6 | /api/acc-book 서버 안전망 | ✅ |
| 8.7 | xlsx 재업로드 통합 테스트 | ⏸ 사용자 검증 대기 |
| 8.8 | export-sqlite DDL 교체 | ✅ |
| 8.9 | ORG_ID 매핑 + 후보자 자동 생성 | ✅ |
| 8.10 | ACC_REL2 INSERT in export-sqlite | ✅ |
| 8.11 | 009_organ_pair_normalization.sql | ✅ |
| 8.12 | 윈도우 선관위 E2E 복구 | ⏸ 사용자 검증 대기 |

## 3. Gaps

### 🔵 미세 편차 (기능적으로 동등)

| 항목 | Design | 구현 | 영향 |
|---|---|---|---|
| DDL 위치 | `lib/sqlite-seed/ddl.ts` 별도 파일 | route.ts 내 `SQLITE_DDL` 상수 인라인 | 없음 (출력 동일, 모듈성만 차이) |
| Hook 필드명 | `accRel` (단수) | `accRels` (복수) | 없음 (생산/소비 일관) |

### 🟡 의도적 보류

| 항목 | 사유 | 리스크 |
|---|---|---|
| `010_acc_rel_seed_check.sql` | Plan P2 분류 | 낮음 — 기존 `pfam.acc_rel` 시드 정상 동작 중 |
| 8.7 통합 테스트 | `npm run dev` + Supabase 필요 | **중간** — Plan DoD의 핵심 검증 |
| 8.12 Windows E2E | Windows + 선관위 프로그램 필요 | **높음** — 최종 가치 검증 |
| Customer 무결성 placeholder | 미구현 | 중간 — orphan cust_id 시 FK 위반 가능 |

### 🔴 누락된 P1 기능

없음.

## 4. 코드 품질 스팟 체크

| 체크 | 결과 |
|---|:---:|
| `resolveAccountCodes`가 알고리즘 §2.3 (4단계, miss 시 throw, `acc_order` 정렬) | ✅ |
| `CodeMappingError`에 `account/subject/context` + `reason` enum | ✅ |
| `pickItemCsIds`가 후원회 코드 91/92/107/108/109/587/588 전부 | ✅ |
| 서버 안전망의 cv/acc_rel/organ 일괄 로드 (per-request 1회) | ✅ |
| Insert 순서: CODESET → CODEVALUE → ACC_REL → ACC_REL2 → ORGAN → CUSTOMER → ACC_BOOK | ✅ |
| `remapOrgId`가 7개 org-scoped 테이블 모두 적용 | ✅ |
| `tryResolveAccountCodes` 분리 export (비-throw 경로) | ✅ |

## 5. Risks

| # | 리스크 | 권장 조치 |
|---|---|---|
| R1 | xlsx 재업로드 E2E 미검증 (8.7) | `npm run dev` → 업로드 → `SELECT DISTINCT acc_sec_cd, item_sec_cd FROM pfam.acc_book WHERE org_id=11` 결과 (1, 94) 확인 |
| R2 | Windows 선관위 프로그램 E2E 미검증 (8.12) | 사용자 수동 검증 |
| R3 | `customer` 테이블이 org 필터 없이 fetch (`export-sqlite/route.ts:585`) | 멀티테넌트 격리는 후속 과제, 현재 동작은 정상 |
| R4 | 후보자 행의 `REG_NUM=""` 빈 문자열 (NOT NULL 통과는 하지만 검증기에서 문제 가능) | Design §11에 미해결 과제로 명시됨 |
| R5 | `acc_rel2.json` 번들 정적 스냅샷 | 선관위 신규 매핑 시 stale 가능 — 장기 관리 |

## 6. Recommendation

**상태: `/pdca report` 진행 가능 (조건부)**

이유:
- P1 코드/설계 항목 96% 충실도로 모두 구현
- 미완 2건은 사용자 환경 검증 단계 (구현 단계 아님)
- 보류된 010 SQL은 Plan에서 P2

**`/pdca report` 전 권장**: R1(8.7 통합 테스트)만 사용자 dev 환경에서 1회 검증. Plan DoD의 핵심 항목이며, 비용 낮음. R2는 Windows 의존이라 보고 후 후속 확인 가능.

`/pdca iterate`는 **권장하지 않음** — 사용자 환경 접근 없이 closer iterator가 할 일이 없음.
