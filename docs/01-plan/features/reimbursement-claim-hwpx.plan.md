# reimbursement-claim-hwpx Planning Document

> **Summary**: 「선거비용 보전청구서」(서식 43)를 acc_book 의 **보전 체크된 선거비용 지출**로부터 자금원별로 자동 집계·채워 .hwpx 로 생성한다. (보전·청구 서식 중 첫 데이터 채움 구현)
>
> **Project**: 정치자금 회계관리 시스템 (political-fund-accounting-management)
> **Version**: 0.8.0.0 → 0.9.0.0(예정)
> **Author**: DrunkenZealnut
> **Date**: 2026-06-10
> **Status**: Draft

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 「선거비용 보전청구서」(서식 43)는 제출서류 화면에서 **빈 양식**(`form-43.hwpx`, `dataFill` 미지정)만 다운로드된다. 회계책임자는 보전 대상 선거비용을 자금원별(후보자자산/후원회기부금/보조금/보조금외)로 직접 손집계하고 후보자명·관할선관위·수령계좌 등을 일일이 손으로 적어야 하며, 누락·계산오류 시 보전금 반려 리스크가 있다. |
| **Solution** | 기존 `reimbursement-aggregator`(보전 체크 + 선거비용 + 자금원 4분류 SSOT)와 22-2 HWPX 빌더 패턴을 재사용해, `form-43-fill.hwpx` 템플릿의 자금원별 청구액 표를 채우고 후보자명·선거명·관할선관위·수령계좌·청구일 등 텍스트 토큰을 organ/auth 에서 prefill 한다. `form-fields.ts` 에 `dataFill="reimbursement"` 를 추가하고 신규 API `POST /api/hwpx/reimbursement-claim` 으로 분리. |
| **Function/UX Effect** | 제출서류 화면에서 서식 43 을 22-1~22-4 와 동일한 "데이터 채움" 버튼 한 번으로 다운로드. 자금원 분류 기준이 회계보고서(22-1/22-2)와 일치해 보전청구액과 회계보고서 선거비용 합계가 정합. |
| **Core Value** | 선관위 제출용 HWPX 자동생성 범위를 **회계보고서 → 보전·청구 서식**으로 확장. 보전청구의 마지막 관문(서식 작성·자금원 분류·검산)을 자동화해 보전금 누락·반려 리스크 제거. |

---

## 1. Overview

### 1.1 Purpose

「공직선거법」 제122조의2·공직선거관리규칙 제51조의3에 따른 **선거비용 보전청구서(서식 43)** 를 `acc_book` 의 보전 체크된 선거비용 지출 데이터로부터 자동으로 채워 `.hwpx` 파일로 생성한다. 이미 구현된 회계보고서 22-1·22-2·22-3·22-4 와 동일한 "데이터 채움" UX 로 제출서류 화면에 통합한다.

### 1.2 Background

- **현 상태**: `form-fields.ts:202` 의 서식 43(`선거비용 보전청구서`, category `보전·청구`, orgScope `candidate`)은 `dataFill` 플래그가 없어 제출서류 화면에서 **빈 `form-43.hwpx`(통합본 풀사이즈)** 만 다운로드된다.
- **선행 자산 존재**:
  - `lib/accounting/reimbursement-aggregator.ts` — `aggregateReimbursementByFundingSource()` 가 이미 **보전 체크(`acc_print_ok='Y'`) + 선거비용 과목 + 양수** 필터로 자금원 4분류(후보자자산/후원회기부금/보조금/보조금외) 합계를 산출한다.
  - `lib/accounting/funding-source.ts` — `classifyFundingSource()` 자금원 분류 SSOT (22-1/22-2 와 공유).
  - `lib/hwpx/election-expense-summary-builder.ts` + `lib/hwpx/generate.ts` — 자금원별 고정 셀 토큰 치환 패턴(22-2)이 거의 동일한 구조로 검증 완료.
  - 기존 Excel 보전청구서(`lib/excel-template/reimbursement-claim-form.ts`, `dashboard/reimbursement`) — 서식 1·2 데이터 모델·집계 참고 자료.
- **차이점(왜 단순 재사용이 아닌가)**: 22-2 는 "전체 선거비용"을 사무소/연락소로 교차 집계하는 반면, 보전청구서는 **보전 체크된 선거비용만**(실제 청구 대상)을 집계한다 → `reimbursement-aggregator`(보전 필터 포함)가 정확한 SSOT. 또한 보전청구서는 표 외에 **청구인·관할선관위·수령계좌** 등 텍스트 항목이 필수다.

#### 서식 43 표 구조 (가정 — design 단계에서 `form-43.hwpx` section0 실측 확정)

| 청구내역 열 | 의미 |
|---|---|
| 후보자자산 | 자기자금 / 차입금 (`classifyFundingSource` → 후보자자산) |
| 후원회 기부금 | 후원회로부터의 기부금 |
| 정당지원금 — 보조금 | 국고보조금 |
| 정당지원금 — 보조금외 | 정당 자체 자금 |
| **합계** | 위 4개 합산 = 보전청구 총액 |

- 텍스트 토큰(후보자명·선거명·선거일·관할선관위·수령 금융기관/계좌번호/예금주·청구일 등)은 organ/auth/설정에서 prefill, 일부(문서번호·날인)는 빈칸 유지.

### 1.3 Related Documents

- 선행 PDCA(패턴 동일): `docs/archive/2026-06/election-expense-summary-hwpx/` (22-2 자금원별 고정 셀 채움)
- 기존 Excel 보전청구서: `docs/01-plan/features/reimbursement-claim-form.plan.md`
- HWPX 인프라: `docs/01-plan/features/hwpx-form-generator.plan.md`
- 코드 SSOT: `app/src/lib/accounting/reimbursement-aggregator.ts`, `app/src/lib/accounting/funding-source.ts`
- 양식 정의: `app/src/lib/hwpx/form-fields.ts:202` (id "43")
- 근거 법령/안내: 공직선거법 §122의2, `RAG/(최종)제9회 전국동시지방선거 선거비용보전안내서(한글파일용).hwp`
- 메모리: `hwpx-form-generator`, `election-item-classification-ssot`, `release-version-ssot`

---

## 2. Scope

### 2.1 In Scope

- [ ] `form-fields.ts` 의 `dataFill` 유니온에 `"reimbursement"` 추가, 서식 43 정의에 플래그 부여
- [ ] `form-43-fill.hwpx` 템플릿 제작(자금원별 청구액 셀 + 텍스트 항목을 `{{토큰}}` 화) — `scripts/make-form-43-fill.py`
- [ ] 신규 순수 빌더 `lib/hwpx/reimbursement-claim-builder.ts` — `reimbursement-aggregator` 결과 → 서식 43 토큰 맵(금액 셀 + 텍스트 prefill) 생성
- [ ] 신규 API `POST /api/hwpx/reimbursement-claim` (orgId → 인증·멤버십 가드 → 데이터 조회 → 빌더 → `generateHwpx` 셀 치환 → .hwpx 응답)
- [ ] `submission-forms/page.tsx` 에서 서식 43 을 "데이터 채움" 경로로 노출(income-ledger/accounting-report 분기에 reimbursement 추가)
- [ ] 단위 테스트: 빌더(집계→토큰), 22-2/Excel 과의 합계 교차검증, 통합 테스트(생성된 .hwpx 토큰 잔류 없음)
- [ ] `app/VERSION` MINOR bump (0.8.0.0 → 0.9.0.0), 루트 `CHANGELOG.md`

### 2.2 Out of Scope

- 비례대표 정당 보전청구서(서식 2 상당) — 현재 `form-fields.ts` 에 단일 서식 43(후보자)만 존재. 별도 HWPX 서식 미보유 → 추후 과제.
- 부담비용 지급청구서(서식 44/서식 7) HWPX 데이터 채움 — 별도 feature.
- 기존 Excel 보전청구서(`dashboard/reimbursement`) UI/로직 변경 — 본 작업은 제출서류 화면 HWPX 경로만 추가.
- 보전 요건(득표율 등) 자동 판정·청구 가능 여부 검증 — 보전 체크(`acc_print_ok`)는 사용자 책임.

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | 서식 43 의 자금원별(후보자자산/후원회기부금/보조금/보조금외) 청구액 + 합계를 `aggregateReimbursementByFundingSource` 결과로 자동 채운다. | High | Pending |
| FR-02 | 집계 대상은 `incm_sec_cd=2`(지출) ∧ `acc_print_ok='Y'`(보전 체크) ∧ 선거비용 과목 ∧ `acc_amt>0`. (기존 보전 SSOT 준수) | High | Pending |
| FR-03 | 후보자명·선거명·선거일·관할선관위·수령계좌(금융기관/번호/예금주)·청구일 등 텍스트 토큰을 organ/auth/설정에서 prefill 한다. | High | Pending |
| FR-04 | 제출서류 화면에서 서식 43 을 22-1~22-4 와 동일한 "데이터 채움" 버튼으로 .hwpx 다운로드. | High | Pending |
| FR-05 | API 는 income-ledger/accounting-report 와 동일한 인증·org 멤버십 가드, 후보자 org 스코프 검증. | High | Pending |
| FR-06 | 보전청구 합계 == 회계보고서 22-1 선거비용 합계의 보전 체크분(자금원 분류 기준 일치) — 교차검증 테스트로 보장. | Medium | Pending |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| 정합성 | 자금원 분류·선거비용 판별이 `funding-source`/`classifyExpenseCategory` SSOT 와 일치 | 22-2·Excel 과 합계 교차검증 단위 테스트 |
| 무결성 | 생성된 .hwpx 에 `{{토큰}}` 잔류 0, ZIP `mimetype` STORED, 한글에서 정상 오픈 | 통합 테스트 + 한글 수동 검수 |
| 순수성 | 빌더는 DB/IO 비의존 순수 함수(테스트 용이) | 빌더 단위 테스트(주입형 입력) |
| 보안 | service-role 키로 RLS 우회하되 org 멤버십 가드 필수 | 라우트 가드 테스트 |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] FR-01~FR-06 구현
- [ ] 빌더·통합·교차검증 테스트 작성 및 통과
- [ ] 한글(Hancom)에서 생성 .hwpx 레이아웃·토큰 위치 수동 검수
- [ ] design.md 작성 및 gap analysis ≥ 90%
- [ ] `app/VERSION`·`CHANGELOG.md` 갱신

### 4.2 Quality Criteria

- [ ] 신규/변경 모듈 테스트 커버리지 충분(빌더 분기·경계값)
- [ ] `node node_modules/eslint/bin/eslint.js` lint 0 errors
- [ ] `node node_modules/next/dist/bin/next build` 성공 (`next.config` outputFileTracingIncludes 에 `form-43-fill.hwpx` 포함 확인)

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| 서식 43 표가 셀 토큰화 시 `<hp:run>` 태그 균형 붕괴(22-2 와 유사) | High | Medium | 22-2 `make-form-*-fill.py` 검증 패턴 재사용, 텍스트 셀 토큰화 시 `</hp:run>` 이중 닫힘 주의, 통합 테스트로 ZIP 유효성·토큰 잔류 검증 |
| 서식 43 실제 표 열 구성이 가정(자금원 4분류)과 다름 | High | Medium | design 단계에서 `form-43.hwpx` section0 실측 후 토큰 맵 확정 — plan 의 구조는 가정 |
| 수령계좌 등 텍스트 항목의 DB 소스 부재(미입력 organ) | Medium | Medium | 미입력 시 빈칸 토큰 유지(수기 작성 가능), prefill 은 best-effort |
| 보전청구 합계와 22-1/22-2 합계 불일치(분류 기준 분기) | Medium | Low | `funding-source`/선거비용 판별 SSOT 단일 사용, 교차검증 테스트 강제 |
| `next.config` 트레이싱 누락으로 prod 에서 템플릿 fetch 실패 | Medium | Low | `outputFileTracingIncludes` 에 신규 fill 템플릿 추가, fs.readFile 사용(메모리 `hwpx-form-generator`) |

---

## 6. Architecture Considerations

### 6.1 Project Level Selection

| Level | Characteristics | Recommended For | Selected |
|-------|-----------------|-----------------|:--------:|
| **Starter** | Simple structure | Static sites | ☐ |
| **Dynamic** | Feature-based modules, BaaS integration | Web apps with backend | ☑ (기존 프로젝트 구조 유지) |
| **Enterprise** | Strict layer separation | High-traffic systems | ☐ |

기존 Next.js 16 App Router + Supabase 프로젝트에 모듈 추가 — 신규 레벨 결정 불필요.

### 6.2 Key Architectural Decisions

| Decision | Options | Selected | Rationale |
|----------|---------|----------|-----------|
| 집계 로직 | 신규 / `reimbursement-aggregator` 재사용 / `election-expense-summary-builder` 재사용 | **`reimbursement-aggregator` 재사용** | 보전 체크(`acc_print_ok='Y'`) 필터가 보전청구 대상과 정확히 일치 |
| HWPX 채움 방식 | 행 동적 복제(owpml-table) / **고정 셀 치환(generateHwpx)** | **고정 셀 치환** | 자금원 4분류+합계는 고정 셀 수 → 22-2 와 동일하게 토큰 치환 |
| API 배치 | accounting-report 확장 / **신규 `/api/hwpx/reimbursement-claim`** | **신규 라우트** | category(보전·청구)·dataFill 종류가 회계보고서와 달라 분리가 명확 |
| 텍스트 prefill | 클라이언트 입력 / **서버 organ/auth prefill** | **서버 prefill** | 22-x 와 동일 패턴, organ 데이터 단일 소스 |

### 6.3 Clean Architecture Approach

```
Selected Level: Dynamic (기존 구조 유지)

신규/변경 파일:
  app/src/lib/hwpx/
    reimbursement-claim-builder.ts        (신규, 순수: 집계→토큰맵)
    reimbursement-claim-builder.test.ts   (신규)
    reimbursement-claim-integration.test.ts (신규)
    form-fields.ts                        (변경: dataFill "reimbursement" + 서식43 플래그)
  app/src/app/api/hwpx/reimbursement-claim/route.ts (신규)
  app/src/app/dashboard/submission-forms/page.tsx   (변경: 서식43 데이터 채움 분기)
  app/scripts/make-form-43-fill.py        (신규: 템플릿 토큰화)
  app/public/hwpx-templates/form-43-fill.hwpx (신규 산출물)
  app/next.config.*                       (변경: outputFileTracingIncludes)
  app/VERSION, CHANGELOG.md               (변경)
재사용(무변경):
  lib/accounting/reimbursement-aggregator.ts, funding-source.ts
  lib/hwpx/generate.ts, escape.ts
```

---

## 7. Convention Prerequisites

### 7.1 Existing Project Conventions

- [x] `CLAUDE.md` 코딩/아키텍처 컨벤션 존재 (HWPX 모듈 규약 포함)
- [x] `app/AGENTS.md` (Next.js 16 주의)
- [x] ESLint v9 flat config, TypeScript, Vitest 구성 존재

### 7.2 Conventions to Define/Verify

| Category | Current State | To Define | Priority |
|----------|---------------|-----------|:--------:|
| **Naming** | exists | `reimbursement-claim-*` 모듈명, `dataFill="reimbursement"` 키 | High |
| **HWPX 토큰** | exists | 서식 43 토큰 명세(`_token-manifest.json` 갱신) | High |
| **빌더 순수성** | exists | DB IO 비의존, 입력 주입형 | High |
| **테스트** | exists | 빌더/통합/교차검증 3종 | High |

### 7.3 Environment Variables Needed

| Variable | Purpose | Scope | To Be Created |
|----------|---------|-------|:-------------:|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase URL | Client | 기존 |
| `SUPABASE_SERVICE_ROLE_KEY` | RLS 우회(서버) | Server | 기존 |

신규 환경변수 없음.

### 7.4 Pipeline Integration

9-phase 파이프라인 비적용(기존 시스템 기능 추가) — PDCA 단독 진행.

---

## 8. Next Steps

1. [ ] `/pdca design reimbursement-claim-hwpx` — `form-43.hwpx` section0 실측 후 토큰 맵·표 구조 확정
2. [ ] 템플릿 제작(`make-form-43-fill.py`) → 빌더 → API → UI 순 구현(`/pdca do`)
3. [ ] Gap analysis(`/pdca analyze`) ≥ 90% 후 완료 보고서

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-06-10 | Initial draft | DrunkenZealnut |
