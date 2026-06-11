# 완료 보고서: 점자형 선거공보 등 부담비용 지급청구서(서식 44) HWPX 생성

> **Feature**: burden-cost-claim-hwpx
> **Period**: 2026-06-11 (Plan→Design→Do→Check→Act 단일 세션)
> **Status**: ✅ Completed (Phase 1)
> **Match Rate**: **100%** (gap-detector 97% → 설계 동기화 후 100%)

---

## Executive Summary

### 1.1 개요

| 항목 | 내용 |
|---|---|
| 기능 | 선관위 제출서류 화면에서 점자형 선거공보 등 부담비용 청구서(서식 44)를 선택 → organ 자동 prefill + 수량·금액·수령계좌 수기입력 → `.hwpx` 다운로드 |
| 방식 | 공식 `.hwpx` 템플릿의 `{{토큰}}`을 JSZip으로 치환(순수 토큰-채움, dataFill 없음. 기존 `/api/hwpx/generate` 재사용) |
| 범위 | Phase 1 — 토큰 40개(머리·수량·금액·수령·선관위명), 고정 셀 채움. 표 4개(작성·제출수량·청구금액·수령계좌·직인란) |
| 아키텍처 | 서식 43 선례 미러링. 전용 API·빌더·동적 표 복제 **불필요**. 기존 라우트/UI/훅 재사용으로 단순화 |

### 1.2 결과 요약

| 지표 | 값 |
|---|---|
| 설계-구현 일치율 | **100%** (gap-detector 초기 97%, 명명 동기화 후 100%) |
| 자동 테스트 | **47 files / 590 통과** (기존 586 + 신규 4) |
| Lint / Type | **0 오류** (eslint OK) |
| 토큰 정합성 | 3-way 검증(def=template=manifest) 통과 — `form-fields.test` |
| 구현 규모 | 소스 신규·수정 6 파일 + 스크립트 1 + 토큰 40개 |
| 신규 의존성 | 0 (기존 jszip·exceljs·supabase 재사용) |

### 1.3 Value Delivered (4관점)

| 관점 | 전달 가치 |
|---|---|
| **Problem** | 점자형 선거공보·점자공약서·저장매체·활동보조인 수당 등 부담비용은 선거일 후 10일 내 서식 44로 청구해야 하나, 현재 시스템엔 이 양식 생성 기능 부재. 회계책임자가 한글파일을 수기로 작성하며 선거명·후보자명·정당명·수령계좌 등 DB의 중복 정보를 재입력해야 함. |
| **Solution** | 기존 HWPX 폼-채움 시스템(lib/hwpx/ + `/api/hwpx/generate`)에 서식 44 토큰-채움 양식 추가. 공식 .hwpx의 머리·수량·금액·수령계좌 셀에 `{{토큰}}`을 삽입한 템플릿을 제작. organ DB에서 선거명·후보자명·정당명·회계책임자명을 자동 prefill, 수량·금액·수령계좌·선관위명은 사용자 입력. 한 번에 검증된 .hwpx 생성·다운로드. |
| **Function/UX 효과** | 제출서류 화면에서 "점자형 부담비용 청구서 채워 받기" 선택 → organ 자동채움(후보자명·정당명 등) + 필수 입력 5~10개(수량 7 + 금액 일부 + 수령 4 + 선관위명) → 채워받기 → .hwpx 다운로드 → 한글에서 인쇄·날인. 기한(선거일+10일) 내 제출 가능. 토큰 40개 모두 치환, 미치환 0개. |
| **Core Value** | 서식 43 보전청구서와 동일한 UX로 부담비용 청구 절차 시스템화. 선거비용 보전과 부담비용 청구를 구분 조직화하여 누락·서식오류 방지. 기존 `/api/hwpx/generate` 무변경 재사용으로 추가 인프라 0, 확장 가능한 구조(서식 추가 = 토큰 + 템플릿만) |

---

## 2. PDCA 사이클 요약

| 단계 | 산출물 | 핵심 |
|---|---|---|
| **Plan** | `01-plan/features/burden-cost-claim-hwpx.plan.md` | 공식 양식 분석(표 4개 추출), 토큰-채움 vs dataFill 선택, 순수 토큰(DB 집계 불가), 평면 필드 MVP, 서식 id "7B"→"44" 변경, 완료기준 명시 |
| **Design** | `02-design/features/burden-cost-claim-hwpx.design.md` | 토큰 레지스트리 전수(40개), 템플릿 토큰화 스펙(make-form-44-fill.py), 코드 변경 명세(form-fields.ts REG 신규 토큰 + id "44" 등록), 무변경 재사용(route/UI/prefill), 검증·테스트 계획 |
| **Do** | 소스 6 파일 + 스크립트 1 + 테스트 신규/수정 | `make-form-44-fill.py` 작성 → `form-44-fill.hwpx` 산출, form-fields.ts REG 토큰 추가 + "44" 등록, form-44-integration.test 신규(4건), 전체 vitest 590 통과, eslint 0 에러 |
| **Check** | `03-analysis/burden-cost-claim-hwpx.analysis.md` | gap-detector 97%→100%, 유일 gap(명명 불일치: 설계 `수당실비` ↔ 구현 `수당`)은 코드가 진실 → 설계 동기화로 해소. CHANGED 2건(id "7B"→"44", 직인란) 모두 정당한 설계 변경. 수동 QA 5항목 잔존(한글 열림·UI 노출·prefill·다운로드·required) |

---

## 3. 구현 산출물

### 3.1 신규 파일

| 파일 | 책임 | 상태 |
|---|---|---|
| `app/scripts/make-form-44-fill.py` | 공식 RAG .hwpx → 템플릿 토큰화(표 4개, 셀 40개, run/t 태그 균형 유지) | ✅ |
| `app/public/hwpx-templates/form-44-fill.hwpx` | 토큰화 산출물 (40개 토큰 삽입, 바이너리) | ✅ |
| `app/src/lib/hwpx/form-44-integration.test.ts` | 통합 테스트 — 샘플 values로 generateHwpx → XML 미치환 토큰 0개, 주요값 포함 | ✅ |

### 3.2 수정 파일

| 파일 | 변경 | 상태 |
|---|---|---|
| `app/src/lib/hwpx/form-fields.ts` | REG 신규 토큰 9개(`소속정당명`, `비고`, 수량 7종) + burdenAmountMetas 25개(`금액_<행>_<열>`) + HWPX_FORM_DEFS 항목("44" 등록, candidate orgScope, dataFill 없음) | ✅ |
| `app/public/hwpx-templates/_token-manifest.json` | "44" 토큰 40개 메타 추가(일관성 검증용) | ✅ |
| `app/public/hwpx-templates/form-44.hwpx` | RAG 파일 구조 소스로 교체(기존 복제본 제거) | ✅ |

### 3.3 무변경 재사용

| 컴포넌트 | 이유 |
|---|---|
| `/api/hwpx/generate` | 순수 토큰-채움이라 formId 분기 불필요, generic route 그대로 처리 |
| `lib/hwpx/generate.ts` | `replaceTokens` / `stripUnresolvedTokens` / `repackage` 메서드 재사용 |
| `app/dashboard/submission-forms/page.tsx` + `FormInputPanel` | `formsForOrgType("candidate")`에 자동 노출, 필드 자동 렌더 |
| `hooks/use-hwpx-prefill.ts` | organ 토큰 자동 prefill (후보자명·정당명·회계책임자명·수령계좌 재사용) |
| `app/next.config.*` | 이미 `public/hwpx-templates/**` 번들링 포함 → 무변경 |

---

## 4. 핵심 설계 결정 (회고)

| 결정 | 이유 | 결과 |
|---|---|---|
| 순수 토큰-채움 | 수량·금액 세분류는 DB에 없음(수기 문서), DB 집계 불신뢰 | 기존 route 재사용, 단순화 |
| 서식 id "7B"→**"44"** | 공식 서식번호(부담비용청구), 기존 등록 슬롯 "44" 활용 | 명확한 의미, 충돌 회피 |
| 평면 필드 MVP | 표 격자(5행×5열=25셀) 입력 UI는 Phase 2 | 신속 출시, 확장 가능 |
| 직인란 손기입 유지 | 서식 43 선례, 날인·서명은 원본 보전 | 공식 양식 규격 준수 |
| 40개 토큰 확정 | 머리 3 + 수량 7 + 금액 25 + 수령 4 + 선관위명 1 | 3-way 정합성(def=template=manifest) |

---

## 5. 미해결 / 후속 (Phase 2·3)

| 항목 | 상태 | 노트 |
|---|---|---|
| 한글 레이아웃 육안 검수 | ⏳ 수동 QA (구조검증·테스트는 통과) | DoD 필수, 릴리스 전 1회 |
| 수량/금액 표 그리드 UI | 🔄 Phase 2 | 행×열 격자 입력, 합계 자동계산, 천단위 포맷 |
| 금액 합계 자동검산 | 🔄 Phase 2 | 행·열 합계 검증, 오입력 경고 |
| 천단위 포맷팅 | 🔄 Phase 2 | 금액 입력 시 콤마 자동추가 |
| 다른 부담비용 서식 확장 | 🔄 Phase 3 | 활동보조인 명세서·점자공약서 명세 등 |

---

## 6. 교훈 (Lessons Learned)

### 6.1 잘된 점

1. **기존 HWPX 시스템 성숙화 활용** — 서식 43 보전청구서로 검증된 토큰-채움 패턴을 그대로 재사용. 전용 API·빌더 0, 범위 축소 가능 (예상 3주 → 실제 1일)

2. **공식 양식 구조 실물 분석** — RAG 파일을 `.hwpx` 형태로 받아 표 4개·셀 40개를 정밀 추출. 문서-구현 명명 일치도 조기 발견(수당실비↔수당)

3. **설계-구현 검증 자동화** — gap-detector + form-fields.test의 3-way 정합성(def=template=manifest) 체크로 미치환 토큰 0 보장. 토큰 40개 중 미스 0

4. **순수 토큰 선택의 정당성** — 수량·금액이 DB 입도로 존재하지 않으므로 dataFill(자동 집계) 불가. 순수 토큰으로 설계, 구현 복잡도 0

### 6.2 개선점

1. **평면 필드 입력 부담** — 25개 금액 셀을 각각 입력하는 UX 낮음. Phase 2에서 표 그리드 컴포넌트로 개선

2. **서식 id 실수** — Plan §2.3에서 "7B" 제안했으나 구현이 공식 번호 "44" 선택. 설계 동기화 필요 → 즉시 수정

3. **수기 QA 필수** — 자동 테스트로 구조 검증 가능하나 한글 실제 열림, 표 레이아웃 깨짐 여부는 수동 확인 필수

### 6.3 향후 적용 (Phase 2 체크리스트)

- [ ] 표 그리드 입력 UI 컴포넌트 설계(행×열 격자 선택, 셀별 입력, 합계 자동계산)
- [ ] 천단위 포맷팅 헬퍼(금액 필드에 `useNumberFormat` 적용)
- [ ] 행·열 합계 검증 로직(선택항목 합 = 계 열 검증)
- [ ] 토큰 명명 정규화(금액 명명이 일관인지 사전 검증)

---

## 7. 메트릭 및 품질

### 7.1 테스트

```
Files:     47 scanned
Passed:    590 total (기존 586 + 신규 4)
Failed:    0
Lint:      0 errors (eslint OK)
Type:      0 errors (TypeScript)
```

### 7.2 토큰 정합성

| 항목 | 값 | 검증 |
|---|---|---|
| form-fields.ts 토큰 | 40 | REG def 기준 |
| form-44-fill.hwpx 토큰 | 40 | template 삽입 확인 |
| _token-manifest.json | 40 | manifest 메타 |
| Gap | 0 | 3-way 일치 |

### 7.3 커버리지

- `form-fields.ts`: id "44" 등록, fields 40개, candidate orgScope, dataFill 없음 ✅
- `form-44-integration.test.ts`: generateHwpx + stripUnresolvedTokens → 미치환 토큰 0 ✅
- 빈 입력 처리: `금액_활동보조인_한글인쇄료 = ""` → 셀 공란, 토큰 잔존 0 ✅

---

## 8. 수동 QA 체크리스트 (릴리스 전 필수)

- [ ] `form-44-fill.hwpx`를 한글에서 열었을 때 표 4개 레이아웃 정상(깨짐 없음)
- [ ] candidate org 제출서류 목록에 "점자형 선거공보 등 부담비용 지급청구서(서식 44)" 노출
- [ ] 서식 선택 시 organ 자동 prefill(후보자명·정당명·회계책임자명) 화면 동작
- [ ] 수량·금액·수령계좌·선관위명 입력 후 "채워 받기" 클릭 → .hwpx 다운로드 성공
- [ ] required 미입력(`선거명`, `후보자명`, `선관위명`) 시 검증 에러 노출

---

## 9. 다음 단계

### 즉시 (내일)
1. 수동 QA 5항목 수행 (개발 서버에서 한글 열기, UI 동작 확인)
2. 이상 없으면 `/ship` 으로 PR 생성

### 릴리스 후 (Phase 2)
1. 표 그리드 입력 UI 설계·구현
2. 금액 합계 자동계산 로직
3. 천단위 포맷팅

### 미래 (Phase 3)
1. 활동보조인 명세서, 점자공약서 세부 양식 추가
2. 부담비용 자동 필터/집계(IF 선거비용 관리 domain 확장)

---

## 10. 참고문서

- **Plan**: `docs/01-plan/features/burden-cost-claim-hwpx.plan.md`
- **Design**: `docs/02-design/features/burden-cost-claim-hwpx.design.md`
- **Analysis**: `docs/03-analysis/burden-cost-claim-hwpx.analysis.md`
- **선례**: `docs/04-report/hwpx-form-generator.report.md` (서식 43 구현 참고)
