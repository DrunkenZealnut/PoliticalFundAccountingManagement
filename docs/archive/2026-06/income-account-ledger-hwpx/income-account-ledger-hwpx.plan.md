# income-account-ledger-hwpx Planning Document

> **Summary**: 수입내역관리 데이터를 (예비)후보자 정치자금 **수입계정별 회계장부**(공식 서식 7) 레이아웃으로 채워 한글파일(HWPX)로 생성·다운로드한다.
>
> **Project**: 정치자금 회계관리 시스템 (political-fund-accounting)
> **Version**: 0.1.1.0
> **Author**: DrunkenZealnut
> **Date**: 2026-06-07
> **Status**: Draft

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 선관위 제출서류 7번 "(예비)후보자 정치자금 수입계정별 회계장부"가 현재 **빈 양식 다운로드만** 가능(`form-7` `fields: []`). 사용자가 수입 데이터를 한글에서 일일이 다시 옮겨 적어야 한다. |
| **Solution** | 수입내역관리(acc_book, incmSecCd=1) 데이터를 **계정명+과목명 조합별로 그룹핑**하고, 공식 form-7.hwpx 표 레이아웃에 행을 동적 생성해 누계·잔액까지 계산된 HWPX 1개 파일로 출력. |
| **Function/UX Effect** | 선관위 제출서류 화면에서 서식 7 선택 → 클릭 한 번으로 데이터가 채워진 공식 회계장부 HWPX 다운로드. 수기 전사 제거. |
| **Core Value** | 선관위 제출 양식 그대로의 데이터 충실한 회계장부를 자동 생성 → 제출 준비 시간 단축 + 전사 오류 제거. |

---

## 1. Overview

### 1.1 Purpose

(예비)후보자가 선관위에 제출하는 **정치자금 수입계정별 회계장부**(공식 서식 7)를, 시스템에 입력된 수입내역 데이터로 자동 채워 한글파일(HWPX)로 내려받을 수 있게 한다.

### 1.2 Background

- 기존 `hwpx-form-generator`(완료, v0.3.0.0)는 선관위 제출서류 24종을 HWPX로 생성하나, **회계장부·보고서 계열(서식 7·8·20·22·23 등)은 토큰이 없는 빈 양식 다운로드용**(`fields: []`)으로만 제공된다.
- form-7.hwpx 분석 결과: 제목 "정치자금 수입·지출부", **계정명+과목명 조합마다 표 1개**(작성예시 5개 표/22행/236셀), 표 컬럼은 `연월일 / 내역 / 수입액(금회·누계) / 지출액(금회·누계) / 잔액 / 수입제공자(성명·생년월일·주소·직업·전화) / 영수증 일련번호`. 현재 작성예시 데이터가 하드코딩되어 있고 `{{토큰}}`은 없다.
- 수입 데이터는 `/api/acc-book?orgId=&incmSecCd=1`로 조회되며 income 페이지가 사용 중. 단 customer 조인이 `name`만(`customer:cust_id(name)`) → 회계장부 필수 항목(생년월일=`reg_num`·`addr`·`job`·`tel`)은 select 확장 필요(컬럼은 customer 테이블에 존재).
- 사용자 결정사항(2026-06-07):
  1. **진입점** = 선관위 제출서류 페이지의 **서식 7 메뉴**(빈 양식 → 데이터 채움 모드로 업그레이드)
  2. **출력 단위** = 계정별 페이지 분리, **1개 파일**
  3. **양식 충실도** = 공식 **form-7 양식에 데이터 채움**(레이아웃 보존)

### 1.3 Related Documents

- 기존 기능 Plan: `docs/01-plan/features/hwpx-form-generator.plan.md`
- 코어 구현: `app/src/lib/hwpx/{generate,form-fields,escape}.ts`, `app/src/app/api/hwpx/generate/route.ts`
- 진입점: `app/src/app/dashboard/submission-forms/page.tsx` + `components/submission-forms/{FormCatalog,FormInputPanel}`
- 공식 양식(SSOT): `app/public/hwpx-templates/form-7.hwpx`
- 회계 로직 재사용 후보: `lib/accounting/{ledger-summary,settlement-calc}.ts`
- 참고: `RAG/1. 제9회 지방선거 정치자금 회계실무_(예비)후보자 및 그 후원회용.hwp`

---

## 2. Scope

### 2.1 In Scope

- [ ] 선관위 제출서류 화면에서 **서식 7 선택 시 "데이터 채움" 모드** 제공 (기존 빈 양식 다운로드와 구분/대체)
- [ ] 수입내역(acc_book, incmSecCd=1)을 **계정명(acc_sec_cd) + 과목명(item_sec_cd) 조합별 그룹핑**
- [ ] 각 그룹마다 form-7 표 1개 생성: 계정명/과목명 헤더 + 데이터 행 동적 생성
- [ ] 데이터 행 컬럼 매핑: 연월일·내역·수입액(금회·누계)·잔액·수입제공자(성명·생년월일·주소·직업·전화)·영수증번호
- [ ] 수입액 **누계·잔액 계산** (그룹 내 일자순 누적)
- [ ] 수입제공자 상세를 위한 **customer 조인 확장**(`reg_num,job,tel,addr,addr_detail`)
- [ ] 계정별 페이지 분리된 **단일 HWPX 파일** 다운로드 (공식 form-7 레이아웃 보존)
- [ ] 빈 데이터/미등록 수입제공자 등 엣지 케이스 안전 처리
- [ ] 단위 테스트 (그룹핑·누계·행 XML 생성·매핑)

### 2.2 Out of Scope

- 지출계정별 회계장부 / 지출부 데이터 채움 (서식은 수입·지출 통합 구조이나 이번엔 **수입 중심**; 지출 컬럼은 공란 또는 별도 차기 작업)
- 후원회 수입계정별 회계장부(서식 8) — 동일 패턴이나 별도 작업
- 회계보고서(서식 22·23) 데이터 채움
- 수입내역관리 페이지에 별도 진입점 추가 (사용자 결정: 제출서류 화면 단일 진입점)
- 기존 토큰 치환형 서식(1-1·2-1 등) 동작 변경

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | 제출서류 화면에서 서식 7 선택 시, 수동입력 토큰 패널 대신 **"수입 데이터로 회계장부 생성"** 액션을 노출 | High | Pending |
| FR-02 | 선택 org의 수입내역(incmSecCd=1)을 **계정+과목 조합별로 그룹핑**하고 그룹 내 연월일 오름차순 정렬 | High | Pending |
| FR-03 | 각 그룹을 공식 form-7 표 레이아웃으로 렌더: `[계 정 명 : …]`, `[과 목 명 : …]` 헤더 + 데이터 행 N개 | High | Pending |
| FR-04 | 데이터 행 매핑 — 연월일(YYYY/M/D), 내역(content), 수입액 금회(acc_amt)·누계, 잔액, 수입제공자(성명·생년월일·주소·직업·전화), 영수증 일련번호(rcp_no) | High | Pending |
| FR-05 | 수입액 **누계·잔액**을 그룹 내 일자순 누적 계산 (잔액 산정 기준은 §Open Questions에서 확정) | High | Pending |
| FR-06 | acc-book 조회의 **customer 조인을 확장**해 reg_num·job·tel·addr(+addr_detail) 포함 (회계장부 전용 조회 경로) | High | Pending |
| FR-07 | 결과를 **계정별 페이지 분리된 단일 HWPX**로 생성, `application/hwp+zip` attachment 다운로드 | High | Pending |
| FR-08 | 공식 form-7 **레이아웃(표/폰트/여백/secPr)을 보존**하면서 표 행만 동적 생성 (OWPML `<hp:tr>` 블록 복제·치환) | High | Pending |
| FR-09 | 수입 0건/특정 그룹 0건/미등록 수입제공자/익명(-999) 등 **엣지 케이스**에서 깨지지 않는 HWPX 생성 | Medium | Pending |
| FR-10 | 생성된 HWPX가 한글(Hancom)에서 **정상 열림**(zip 구조·mimetype STORED·문단/표 ID 무결성) 검증 | High | Pending |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| 호환성 | 생성 .hwpx가 한글에서 오류 없이 열림 | 실파일 수동 오픈 + zip 무결성 검사 |
| 정확성 | 수입 합계·누계·잔액이 수입내역관리 합계와 일치 | 단위 테스트 + 실데이터(org 9, 수입 18,099,055원) 대조 |
| 성능 | 일반 규모(≤ 수백 행) 생성 응답 < 3s | API 응답 측정 |
| 보안 | 서버 라우트 service-role 사용, org 스코프 강제, 입력 길이 제한 | 코드 리뷰 + 기존 generate route 패턴 준수 |
| 유지보수 | 행 생성 로직 순수 함수로 분리(테스트 가능) | lib/hwpx 단위 테스트 |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] FR-01~FR-10 구현
- [ ] 단위 테스트 작성·통과 (그룹핑/누계/행 XML 생성/customer 매핑)
- [ ] 실데이터(org 9 "오준석후보")로 생성한 HWPX가 한글에서 정상 열림 + 합계 대조 일치
- [ ] 코드 리뷰 완료, lint·build 통과
- [ ] CLAUDE.md `lib/hwpx/` 설명 갱신 (회계장부 데이터 채움 경로 추가)

### 4.2 Quality Criteria

- [ ] 신규 로직 테스트 커버리지 ≥ 80%
- [ ] Zero lint errors
- [ ] Build 성공 (`node node_modules/next/dist/bin/next build`)

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| OWPML 표 행 복제 시 문단/셀 ID·`<hp:tr>` 구조 충돌 → 한글에서 파일 손상 | High | High | hwpx 스킬 활용, 단일 "행 템플릿" 추출→복제 후 ID 재부여, 매 변경마다 실파일 오픈 검증 |
| 누계/잔액 산정 기준(계정별 vs 전체 통합) 불명확 → 공식 양식과 수치 불일치 | High | Medium | §Open Questions 선확정, 작성예시(form-7 내장 데이터) 수치 패턴 역분석, ledger-summary/settlement-calc 재사용 |
| customer 미조인·미등록 수입제공자(익명 -999) 시 빈 셀/오류 | Medium | Medium | 안전 기본값(공란/"생략"), FR-09 엣지 테스트 |
| 페이지 수 드리프트(행 다수 시 표가 페이지 경계 침범) | Medium | Medium | 공식 표 셀 스타일 재사용, 행 높이 고정, 대량 데이터 실측 |
| 기존 토큰 치환형 서식 회귀 | Medium | Low | 회계장부 경로를 **별도 생성기**로 분리(generateHwpx는 불변), 기존 테스트 유지 |
| 서식 7이 본래 "수입·지출 통합부" 구조라 수입-only 채움이 양식과 어긋남 | Medium | Medium | 지출 컬럼 공란 유지 + 헤더/잔액 기준을 양식 의미에 맞춤(§Open Questions) |

---

## 6. Architecture Considerations

### 6.1 Project Level Selection

| Level | Characteristics | Selected |
|-------|-----------------|:--------:|
| **Starter** | 정적 사이트/포트폴리오 | ☐ |
| **Dynamic** | 기능 모듈 + 백엔드(Supabase) 연동, 풀스택 웹앱 | ☑ |
| **Enterprise** | 마이크로서비스/k8s | ☐ |

→ 기존 Next.js 16 + Supabase 풀스택 구조(**Dynamic**)에 기능 추가.

### 6.2 기술 접근 (Design 단계에서 확정)

핵심 난제는 **표 행 동적 생성**이다. 기존 `generateHwpx`는 `{{토큰}}` 1:1 치환만 지원하므로 회계장부에는 부족. 후보 접근:

- **(A) 행 템플릿 복제형 (권장)**: form-7.hwpx에서 ① 표 단위(계정/과목 1조합) 블록과 ② 데이터 1행(`<hp:tr>`) 블록을 토큰화한 템플릿을 마련 → 그룹 수만큼 표, 행 수만큼 `<hp:tr>`를 복제·치환 후 재조립. 공식 레이아웃 보존.
- (B) 데이터 우선 자체 표 생성 — 레이아웃 충실도 낮아 제외(사용자 결정).

데이터 흐름:
```
submission-forms (form-7 선택, "회계장부 생성")
  → POST /api/hwpx/income-ledger { orgId }   (신규 또는 generate route 확장)
     → acc-book 수입 조회 (customer 상세 조인 확장)
     → 계정/과목 그룹핑 + 누계/잔액 계산 (lib/accounting 재사용)
     → form-7 템플릿 표/행 복제·치환 (lib/hwpx 신규 모듈)
     → HWPX bytes 반환 (application/hwp+zip)
```

신규/수정 파일(예상):
- `lib/hwpx/income-ledger.ts` (그룹핑·행 데이터 빌드, 순수 함수) + 테스트
- `lib/hwpx/table-builder.ts` 또는 generate 확장 (OWPML 표/행 복제) + 테스트
- `app/api/hwpx/income-ledger/route.ts` (또는 기존 generate route에 분기)
- `lib/hwpx/form-fields.ts` (form-7 def에 데이터 채움 메타 추가)
- `components/submission-forms/FormInputPanel.tsx` (서식 7 데이터 채움 UI 분기)
- acc-book 조회 경로 customer select 확장 (전용 쿼리 권장, 기존 income 응답 영향 최소화)

### 6.3 Convention 준수

- 날짜는 DB `YYYYMMDD` 저장 → 양식 표기 `YYYY/M/D` 변환 (CLAUDE.md DB gotcha 준수)
- org 스코프 강제 (`org_id` 필터), 익명 customer(-999) 처리
- 서버 라우트 service-role 패턴, 입력 검증, no-store 캐시 (기존 generate route 준수)

---

## 7. Open Questions (Design 전 확정 필요)

1. **잔액/누계 산정 기준**: ① 계정·과목 그룹 내 수입 누계만, ② 전체 수입 누계, ③ 전체 수입−지출 통합 잔액(양식 본래 의미) 중 무엇? — form-7 내장 작성예시(계정별 표마다 잔액 컬럼) 역분석으로 추정 후 확정.
2. **지출 컬럼 처리**: 양식은 수입·지출 통합부. 수입-only이면 지출 금회/누계 컬럼은 공란 유지 vs 제거? (레이아웃 보존상 공란 유지 가정)
3. **계정/과목 그룹 정렬 순서**: 공식 양식 계정 표시 순서(후보자 자산 → 후원회기부금 → 정당지원금 → 보조금 …)와 acc_sec_cd 코드 순서 매핑.
4. **수입제공자 생년월일 표기**: customer.reg_num이 주민/사업자번호 형태 → 양식의 `생년월일(YY/MM/DD)` 변환 규칙.

---

## 8. Next Step

→ `/pdca design income-account-ledger-hwpx` (Open Questions 확정 + OWPML 표/행 복제 설계)
