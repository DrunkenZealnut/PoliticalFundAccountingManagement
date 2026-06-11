# Design-Implementation Gap Analysis — donation-code-fix

> 분석일: 2026-06-11 · PDCA Check 단계 · gap-detector

## 분석 개요

| 항목 | 내용 |
|---|---|
| 분석 대상 | donation-code-fix (후원금 과목코드 반전 버그 수정) |
| 기준 문서 | `docs/01-plan/features/donation-code-fix.plan.md` (Plan이 설계 겸함, Starter) |
| 검증 대상 | `hooks/use-donation-limit.ts`, `app/dashboard/income/page.tsx`, `hooks/use-donation-limit.test.ts` |

## 종합 점수

| 카테고리 | 점수 | 상태 |
|---|:---:|:---:|
| 설계 정합(Plan 체크리스트/Acceptance) | 100% | ✅ |
| 명칭 기반 SSOT 전환 정합 | 100% | ✅ |
| 영향 없음 항목 검증 | 100% | ✅ |
| **Overall Match Rate** | **100%** | ✅ |

## 항목별 대조표

### 변경 1 — `use-donation-limit.ts`

| 요구사항 | 구현 | 상태 |
|---|---|:---:|
| cv_id 하드코딩(16/96, 15/95) 제거 | 비교 전부 제거 | ✅ |
| `getName(itemSecCd)` 도출 | `const itemName = getName(itemSecCd)` | ✅ |
| `isAnonymous = itemName === "익명후원금"` | 일치 | ✅ |
| `isNamedDonation = itemName === "기명후원금"` | 일치 | ✅ |
| 익명 1회 한도 / 기명 30만 / 연간 한도 분기 유지 | 유지(연간은 양 과목 모두) | ✅ |
| 의존성 배열에 `getName` 추가 | `[getByCategory, getName]` | ✅ |
| JSDoc 94/95 기준 정정 | "94=기명, 95=익명, 96=그 밖의 수입" 명시 | ✅ |

### 변경 2 — `income/page.tsx` AUTO_CONTENT

| 요구사항 | 구현 | 상태 |
|---|---|:---:|
| cv_id 맵(`AUTO_CONTENT_MAP`) 제거 | 제거됨 | ✅ |
| 명칭 기반 교체 | `AUTO_CONTENT_NAMES` + `handleItemChange`가 `getName(v)` 기반 | ✅ |
| 틀린 주석 제거 | 정정된 주석으로 교체 | ✅ |

> Plan 예시는 삼항식, 구현은 `includes()+if/else` — Plan이 허용한 동등 로직(갭 아님).

### 변경 3 — `use-donation-limit.test.ts`

| Plan 명시 케이스 | 구현 | 상태 |
|---|---|:---:|
| 익명(95)+11만 → 초과 경고 | ✅ | ✅ |
| 익명(95)+9만 → 경고 없음 | ✅ | ✅ |
| 기명(94)+31만 → 30만 공개 경고 | ✅ | ✅ |
| 그밖의수입(96) → 경고 없음(회귀 핵심) | ✅ | ✅ |
| 정당(16) → 경고 없음(회귀 핵심) | ✅ | ✅ |
| (보너스) 기명에 익명 한도 미부착 | ✅ | ✅ |

→ Plan 5케이스 전부 + 교차오염 방지 1 = 6케이스. 픽스처는 공식 코드(94/95/96/16, 한도 117/102) 정확 반영.

### 검증 기준(Acceptance) 5항목

| # | 기준 | 결과 | 상태 |
|---|---|---|:---:|
| 1 | 익명 +100,001 → 10만 초과 경고 | 코드+테스트 충족 | ✅ |
| 2 | 그밖의수입(96) → 경고 일절 없음 | 명칭 양성매칭만 → 96 미매칭 | ✅ |
| 3 | 기명 +300,001 → 30만 공개 경고 | 코드+테스트 충족 | ✅ |
| 4 | "익명후원금" 선택 시 내역 자동입력 | handleItemChange 연결 | ✅ |
| 5 | 신규 6건 + 기존 테스트 통과 | **vitest 606 passed (실행 확인)** | ✅ |

### 영향 없음 항목 검증

| 파일 | 확인 | 상태 |
|---|---|:---:|
| `donors/page.tsx` | over30/over300은 금액 임계값 비교, 후원금 cv_id 하드코딩 없음 | ✅ |
| `lib/accounting/code-mapping.ts` | 한글 과목명→코드 매핑(명칭 기반) | ✅ |
| `lib/wizard-mappings.ts` / `lib/help-texts.ts` | 설명 텍스트만, 로직 무관 | ✅ |

전체 `src` grep: 잘못된 후원금 cv_id 하드코딩(`=== 15/16/95/96`) **잔존 0건**.

## Gap 목록

🔴 Missing 0 / 🟡 Added 0 / 🔵 Changed 0 — **해당 없음.**

정보성(비-갭): Plan 예시와 구현 형태 차이(동등 로직), 테스트 5→6 초과 충족.

## 결론

| 판정 | 값 |
|---|---|
| Match Rate | **100%** |
| Gap | 0 / 0 / 0 |
| 권고 | ≥ 90% → Check 완료, `/pdca report` 진행 |

cv_id 하드코딩이 명칭 기반 SSOT로 완전 전환되어 후원회 94/95 정합 + 정당 과목 자동 비대상 + 코드값 개정 내구성 확보. 잘못된 15/16/95/96 후원금 하드코딩은 코드베이스에 잔존하지 않음.

### 후속 확정 (분석 후 실행)
- `node node_modules/vitest/vitest.mjs run` → **606 passed** (신규 6 + 기존 600)
- `eslint` 변경 3파일 → **0 errors**
- `next build` → **✓ Compiled successfully**

→ Acceptance 5 실측 확정. 갭 0이므로 iterate 불필요 → `/pdca report donation-code-fix`.
