# 후원금 과목코드 반전 버그 수정 계획 (donation-code-fix)

## Executive Summary

| 항목 | 내용 |
|---|---|
| Feature | donation-code-fix |
| 시작일 | 2026-06-11 |
| 예상 기간 | 0.5일 (Starter 규모, 버그 수정) |
| 영향 범위 | `hooks/use-donation-limit.ts`, `app/dashboard/income/page.tsx` (자동내역 맵), 신규 테스트 `use-donation-limit.test.ts` |
| 근거 | `docs/03-analysis/pfund2-exe-feature-gap.analysis.md` (P1), PFund2 v2.6.1 `Fund_Master.db` 역분석 + 사용자 실데이터 교차검증 |

### Value Delivered (4-Perspective)

| Perspective | 내용 |
|---|---|
| **Problem** | 후원회 과목 코드가 공식과 반전 하드코딩됨. 공식 CODEVALUE(CS_ID=12)는 **94=기명후원금, 95=익명후원금, 96=그밖의수입**인데, 프로젝트는 `95=기명, 96=익명`으로 가정. 그 결과 ① **익명후원금(95) 입력 시 1회 10만원 한도 검증이 동작하지 않고**, ② 익명 입력에 "30만원 초과 공개대상" 경고·연간한도 검사가 잘못 적용되며, ③ 과목 선택 시 내역 자동입력이 뒤바뀜. 정당용 가정 `15=기명/16=익명`은 허구(공식 15=하급당부보조금, 16=상급당부보조금외 — 정당엔 기명/익명후원금 과목 자체가 없음). |
| **Solution** | 하드코딩 cv_id 비교를 제거하고 **과목명(`getName(item_sec_cd)`) 기반 분류로 전환**([[election-item-classification-ssot]] 원칙). "익명후원금"/"기명후원금" 과목명으로 판별하면 후원회 94/95는 물론 정당(과목 없음→매칭 안 됨)까지 자연스럽게 정합. income 페이지 `AUTO_CONTENT_MAP`도 명칭 기반으로 교체. |
| **Function/UX Effect** | 익명후원금 입력 시 1회 10만원 초과 경고가 정상 동작. 기명후원금 30만원 초과·연간 한도 경고가 올바른 과목에만 적용. 과목 선택 시 내역 자동입력 정확화. 코드값이 바뀌어도(차기 선거 코드 개정) 명칭 기반이라 깨지지 않음. |
| **Core Value** | 정치자금법상 **익명후원금 1회 한도(10만원)** 라는 법적 통제가 실제로 작동하게 됨. 저장된 데이터(cv_id 기준)는 무손상이며, 입력 검증 정확도만 회복 — 회계 신뢰성의 마지막 안전장치 복구. |

---

## 개요

2026-06-11 PFund2 v2.6.1 설치 exe 역분석에서 발견한 P1 버그를 수정한다. 후원금 과목 코드(익명/기명)가 공식 기준과 반대로 하드코딩되어 한도 검증이 잘못된 과목에 적용되는 문제다. 저장 로직은 사용자가 드롭다운에서 고른 `item_sec_cd`를 그대로 저장하므로 **DB에 잘못 저장된 데이터는 없다**. 오직 클라이언트 입력 검증·자동입력의 분기 조건만 틀렸다.

## 핵심 사실 (공식 vs 프로젝트)

### 공식 코드 (Fund_Master.db v2.6.1, CS_ID=12 후원회 과목)

| CV_ID | 과목명 | 비고 |
|---|---|---|
| 93 | 전년도이월 | |
| **94** | **기명후원금** | |
| **95** | **익명후원금** | 1회 10만원 한도(CS_ID=14, CV_ID=117) |
| 96 | 그 밖의 수입 | |

**실데이터 교차검증** (`Data/2022_Fund_Data_2.db`, 후원회): `item_sec_cd=94` 34건 4,500,000원(기명), `item_sec_cd=95` 13건 790,000원(전건 10만원 이하 = 익명) → 공식 코드가 사실임 확정.

### 정당 과목 (CS_ID=3) — 기명/익명 과목 없음

15=하급당부보조금, 16=상급당부보조금외. 정당은 직접 후원 금지이므로 기명/익명후원금 과목이 존재하지 않는다. 따라서 `15/16`을 후원금으로 본 가정은 전부 폐기.

### 현재 버그 코드

**`hooks/use-donation-limit.ts:44,53`**
```ts
const isAnonymous   = itemSecCd === 16 || itemSecCd === 96; // ❌ 95(익명)를 놓침, 96(그밖의수입)에 오적용
const isNamedDonation = itemSecCd === 15 || itemSecCd === 95; // ❌ 95(익명)를 기명으로 오판
```

**`app/dashboard/income/page.tsx:373-380`**
```ts
// 과목코드: 8=당비, 15=기명후원금, 16=익명후원금 (정당), 95=기명후원금, 96=익명후원금 (후원회)  ← 주석 자체가 틀림
const AUTO_CONTENT_MAP: Record<number, string> = {
  8: "당비", 15: "기명후원금", 16: "익명후원금", 95: "기명후원금", 96: "익명후원금", // ❌
};
```

## 해결 방향 — 명칭 기반 분류 (SSOT)

cv_id 하드코딩 대신 `getName(itemSecCd)` 과목명으로 판별한다. 이유:
- 후원회 94/95를 명칭으로 정확히 구분
- 정당은 해당 명칭 과목이 없어 자동으로 검증 비대상 (오적용 차단)
- 코드값 개정(차기 선거)에도 명칭이 같으면 동작 유지 — [[election-item-classification-ssot]]와 동일 철학(과목명 SSOT)

### 변경 1: `use-donation-limit.ts`

`checkLimit` 내부에서 `const itemName = getName(itemSecCd);` 도출 후:
```ts
const isAnonymous     = itemName === "익명후원금";
const isNamedDonation = itemName === "기명후원금";
```
- `getName`은 이미 `useCodeValues()`에서 노출됨 → 의존성 배열에 추가
- 익명 1회 한도 / 기명 30만원 공개 / 연간 한도(연간 한도는 두 과목 모두) 분기는 그대로 유지하되 조건만 명칭 기반으로 교체
- 상단 JSDoc 주석의 코드 설명(16/96 등)도 94/95 기준으로 정정

### 변경 2: `income/page.tsx` AUTO_CONTENT_MAP

cv_id 맵 대신 명칭 기반으로 자동내역 입력:
```ts
function handleItemChange(v: number) {
  const name = getName(v); // "당비" | "기명후원금" | "익명후원금" | ...
  const auto = (name === "당비" || name === "기명후원금" || name === "익명후원금") ? name : "";
  setForm({ ...form, item_sec_cd: v, content: (auto && !form.content) ? auto : form.content });
}
```
- income 페이지에서 `getName` 사용 가능 여부 확인 후 `useCodeValues()`에서 가져옴
- 틀린 주석(373행) 제거

### 변경 3: 신규 테스트 `hooks/use-donation-limit.test.ts`

회귀 방지 — `getByCategory`/`getName`을 모킹하여:
- 익명후원금(95)+11만원 → `isOverLimit=true`, 10만원 한도 경고 포함
- 익명후원금(95)+9만원 → 한도 경고 없음
- 기명후원금(94)+31만원 → 30만원 공개 경고 포함
- 그밖의수입(96) → 어떤 후원금 경고도 없음 (과거 버그면 96이 익명으로 잡혔음 — 회귀 검출 핵심)
- 정당 과목(16=상급당부보조금외) → 후원금 경고 없음

## 영향 없음(검토 완료) 항목

- **저장 데이터**: 사용자가 고른 cv_id를 그대로 저장 → DB 무손상, 마이그레이션 불필요
- **`donors/page.tsx`**: over30/over300 분류는 금액 기준 + DB 집계라 과목 cv_id 하드코딩 없음
- **`lib/accounting/code-mapping.ts`**: 일괄등록은 한글 과목명→코드 매핑이라 이미 명칭 기반(영향 없음)
- **`lib/wizard-mappings.ts:138`, `lib/help-texts.ts:27`**: 설명 텍스트만, 로직 무관

## 작업 항목 (체크리스트)

- [ ] `use-donation-limit.ts` — 명칭 기반 분기 + JSDoc 정정 + 의존성 배열 `getName` 추가
- [ ] `income/page.tsx` — `AUTO_CONTENT_MAP` 명칭 기반 교체 + 틀린 주석 제거
- [ ] `use-donation-limit.test.ts` — 신규 5케이스 (96/정당과목 회귀 포함)
- [ ] 전체 테스트 통과(`vitest run`) + lint 0 + build 성공
- [ ] gap-detector로 설계 정합 확인

## 검증 기준 (Acceptance)

1. 익명후원금(과목명 "익명후원금") + 100,001원 입력 → 1회 10만원 초과 경고 표시
2. 그밖의수입(96) 입력 → 후원금 관련 경고 일절 없음 (버그 회귀 검출)
3. 기명후원금(94) + 300,001원 → 30만원 공개대상 경고
4. 과목 "익명후원금" 선택 시 내역란에 "익명후원금" 자동 입력
5. 신규 단위 테스트 5건 + 기존 테스트 전부 통과

## 리스크 / 함정

- `getName`이 코드값 미로딩 시 `String(cvId)` 폴백을 반환 → 명칭 비교가 실패할 수 있음. 코드값은 `useCodeValues`가 마운트 시 1회 fetch하므로 입력 시점엔 로딩 완료가 일반적이나, 테스트에서는 mock으로 명칭 보장.
- "그 밖의 수입" 표기 흔들림: 공식 `Fund_Master.db`는 `96=그밖의수입`(공백 없음), 사용자 2022 DB는 `96=그 밖의 수입`(공백 있음). 분류는 "익명후원금"/"기명후원금" 양성 매칭만 하므로 96 표기 차이는 무영향(어느 쪽도 후원금으로 매칭되지 않음).
- 후원회 외 org에서 동일 cv_id가 다른 의미일 위험 → 명칭 기반이므로 해소.

## 다음 단계

`/pdca design donation-code-fix` 또는 규모가 작아 곧바로 `/pdca do` 후 구현. 구현 완료 시 `/pdca analyze`.
