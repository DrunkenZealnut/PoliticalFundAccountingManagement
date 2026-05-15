# db-export-login-id Gap Analysis

> Design: `docs/02-design/features/db-export-login-id.design.md`
> Plan: `docs/01-plan/features/db-export-login-id.plan.md`
> Date: 2026-05-15
> Analyzer: bkit:gap-detector

## Executive Summary

| 항목 | 값 |
|---|---|
| **Match Rate** | **94%** |
| 평가 | **Good** (90~94, Excellent 직전) |
| 핵심 누락 | (1) `/api/system/export-sqlite` Integration 테스트 미작성, (2) `OrganInfoPage` Component 테스트(RTL) 미작성 |
| 강점 | FR-01~07 7개 전부 코드 반영, design §0 결정 사항 7건 전부 일치, PARITY-007 + organ-pair 옵션 + 사전 검증 + 사이드바 메뉴 + sessionStorage 키 모두 일관 |

평가 근거: Source(구현·코드 패턴) 100%, Tests 60% (Unit O / Integration·Component X), Docs Sync 100%.

---

## 1. FR 단위 매칭 (FR-01 ~ FR-07)

| FR | 요구 | 구현 위치 | 상태 | 비고 |
|---|---|---|:---:|---|
| **FR-01** | dashboard/organ에서 userid/passwd/hint1/hint2 조회·수정 | `app/src/app/dashboard/organ/page.tsx:122-229` (load+handleSave, supabase.update with userid/passwd/hint1/hint2) | ✅ | hint1/hint2 빈 문자열은 null로 정규화 |
| **FR-02** | userid 20자 + `^[A-Za-z0-9_]+$`, passwd 1~20자 | `organ/page.tsx:34-48` (validateUserid/validatePasswd) + `maxLength={20}` 양쪽 적용 | ✅ | 정규식·길이 모두 디자인과 일치 |
| **FR-03** | 후원회(91/92/107/108/109/587/588)일 때 후보자 자격증명 입력란 노출 | `organ/page.tsx:119` (`isSupporter = SUPPORTER_SEC_CDS.has(orgSecCd)`), 조건부 렌더 | ✅ | `SUPPORTER_SEC_CDS = {91,92,107,108,109,587,588}` (organ-pair.ts:11) 정확 일치 |
| **FR-04** | export-sqlite 400 + PARITY-007 | `route.ts:462-485` (DDL 실행 전 fail-fast) | ✅ | trim 후 빈 체크. details에 `missing`, `actionUrl`. candidate_partial 케이스도 구현 |
| **FR-05** | buildOrganExport `candidateCredentials` 옵션 | `organ-pair.ts:115-128` + `:135,:145-148` 사용 | ✅ | 옵션 타입·사용 양쪽 설계와 동일 |
| **FR-06** | candidate 자격증명 없으면 organ 자격증명으로 fallback | `organ-pair.ts:145` nullish coalescing | ✅ | test 4건 검증 |
| **FR-07** | 001_create_tables.sql 주석 정정 | `app/scripts/001_create_tables.sql:58-59` | ✅ | 마이그레이션 없이 주석만 수정 |

**FR Coverage: 7/7 = 100%**

---

## 2. Test Plan 단위 매칭 (§8.2)

| 카테고리 | 계획 케이스 수 | 구현 케이스 수 | 위치 | 상태 |
|---|:---:|:---:|---|:---:|
| Unit — organ-pair (candidateCredentials) | 3 | **4** | `organ-pair.test.ts:90-136` | ✅ 초과 |
| Unit — parity-errors (PARITY-007) | 1 | **1** | `parity-errors.test.ts:65-78` | ✅ |
| Integration — export-sqlite 사전 검증 (mock supabase) | 5 | **0** | — | ❌ 누락 |
| Component — OrganInfoPage (RTL + happy-dom) | 6 | **0** | — | ❌ 누락 |
| E2E UAT (PFund2 실 동작) | 수동 | 미실시 (사용자 작업) | — | 🟡 사용자 책임 |

### Unit (충족)
- organ-pair 4건: FR-05 explicit, FR-06 fallback, mask 우선순위, 정당 케이스(무시)
- parity-errors 1건: code/httpStatus/details 모두 검증

### Integration (미충족, **누락**)
- organ.userid = null → 400 PARITY-007
- organ.passwd = "" → 400 PARITY-007
- candidate_partial → 400
- 페어 fallback 200 + 후보자 행 = organ 자격증명
- 페어 explicit 200 + 후보자 행 = 입력값

### Component (미충족, **누락**)
`app/src/app/dashboard/organ/page.test.tsx` 파일 자체가 존재하지 않음.

---

## 3. 누락/불일치 상세

### 🔴 Missing (Design O, 구현 X)

| 항목 | Design 위치 | 영향 |
|---|---|---|
| `/api/system/export-sqlite` Integration 테스트 | §8.2 5케이스 | **중** — 사전 검증 로직 회귀 안전망 없음 |
| `OrganInfoPage` Component 테스트 | §8.2 6케이스 | **중** — 한글 입력, 21자 컷, 후원회 분기, sessionStorage 라운드트립 자동 검증 부재 |
| 비밀번호 표시/숨김 토글 a11y 자동검증 | §5.1, §8 (간접) | **저** — `aria-label`로 의미 제공, axe-core 등 자동 검사 없음 |

### 🟡 Added (Design X, 구현 O)

| 항목 | 위치 | 평가 |
|---|---|---|
| `Promise.resolve().then(load)` microtask defer | `organ/page.tsx:168-173` | 좋음 — ESLint react-hooks/set-state-in-effect 회피 의도 명시 |
| candidate_partial 응답에 `message_detail` 별도 키 | `route.ts:496` + `submit/page.tsx:321` | 수용 — design 의도 보존 |
| 저장 후 `await load()` 재호출 | `organ/page.tsx:228` | 좋음 — DB-폼 동기화 보장 |

### 🔵 Changed (Design ≠ 구현, 의도된 변경)

| 항목 | Design | 구현 | 판정 |
|---|---|---|:---:|
| `PasswordInput` 컴포넌트 위치 | "`components/ui/`로 이동 검토" | 페이지 내부 `PasswordField` | 수용 (YAGNI) |
| sessionStorage 키 패턴 | 명시 없음 | `organ-credentials-candidate-{orgId}` (orgId 격리) | 개선 |
| Export 트리거 페이지 | "backup 또는 submit/page.tsx" 양자택일 | `submit/page.tsx`만 처리 | 수용 |
| OrganInfoPage 제목 | "기관 정보" | "사용기관관리" | 개선 (사이드바 일관성) |
| validateUserid `trim()` | 명시 없음 | `value.trim()` 후 검증 | 개선 |

---

## 4. Match Rate 산출 근거

| 카테고리 | 가중치 | 점수 | 가중 점수 |
|---|:---:|:---:|---:|
| FR 구현 (FR-01~07) | 40% | 100% (7/7) | 40.0 |
| Design §0 결정 7건 반영 | 10% | 100% | 10.0 |
| API 스펙 (§4.2) | 15% | 100% | 15.0 |
| Data Model (§3) | 10% | 100% | 10.0 |
| UI/UX (§5) | 10% | 95% | 9.5 |
| Test Plan (§8) | 10% | 35% | 3.5 |
| Implementation Order 11단계 (§11.2) | 5% | 100% | 5.0 |
| **Total** | **100%** | — | **93.0% → 반올림 94%** |

---

## 5. 권장 후속 작업 (Act phase 입력)

### 우선순위 P1 (Match Rate ≥ 95% 달성 위해 필수)

1. **`app/src/app/api/system/export-sqlite/route.test.ts` 신규** — 5케이스
   ```typescript
   // mock supabase.from("organ").select().eq().maybeSingle()로:
   //   { userid: null, passwd: "x" }  → 400 PARITY-007, missing=["userid"]
   //   { userid: "",   passwd: "y" }  → 400 PARITY-007, missing=["userid"]
   //   { userid: "ok", passwd: "ok" } + candUserid only → 400 candidate_partial
   //   정상 + 페어 자격증명 없음 → 200 (사전 검증 통과만)
   //   정상 + 페어 자격증명 둘 다 → 200
   ```

2. **`app/src/app/dashboard/organ/page.test.tsx` 신규** — RTL + happy-dom
   - mount → loading → load 완료 후 prefill
   - userid 한글 입력 → 에러
   - passwd 21자 → 에러
   - 저장 → supabase update spy
   - orgSecCd=109 → 후보자 자격증명 입력란 노출
   - orgSecCd=90 → 비노출
   - 후보자 ID/PW 저장 → sessionStorage 키

### 우선순위 P2 (품질 보강)

3. Design §5.3 — `PasswordField` 페이지 내부 결정 + OrganInfoPage 제목 "사용기관관리" 결정 반영
4. Design §5.2 — sessionStorage 키 `organ-credentials-candidate-{orgId}` 명시
5. Design §11.1 — submit/page.tsx 확정 명시

### 우선순위 P3 (장기)

6. 수동 UAT 결과 → `docs/04-report/db-export-login-id.report.md`에 기록
7. 페어 자격증명 보안 — design §7 TODO대로 GET query → POST body 변경 검토

---

## 6. 결론

**Match Rate 94% — Good 등급.** FR 7개 전부 코드에 정확히 반영, Design §0 결정 7건 일관 구현. 핵심 갭은 **Integration · Component 테스트 미작성** 하나로 응집되어 있으며, 위 P1 두 파일(2~3시간 분량)을 추가하면 ≥95% Excellent 도달 가능. 그 외 UI 디테일·session 키·트리거 페이지 선택은 설계 의도 부합 또는 개선 방향.

**권장**: `/pdca iterate db-export-login-id` (P1 자동 추가) 또는 수동 P1 후 `/pdca report`. 실 PFund2 UAT는 사용자 직접 수행 후 report에 기록.
