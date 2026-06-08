# candidate-accounting-report-hwpx Planning Document

> **Summary**: 수입·지출내역관리와 수입지출처(customer)·재산(estate) 데이터를 기반으로 (예비)후보자 **회계보고서**(공식 서식 **22-1 수입·지출보고서 / 22-3 재산명세서 / 22-4 수입·지출부**)를 자동 작성해 한글파일(HWPX)로 생성·다운로드한다. (22-2 선거비용 집계표는 이번 범위 제외)
>
> **Project**: 정치자금 회계관리 시스템 (political-fund-accounting)
> **Version**: 0.5.0.0
> **Author**: DrunkenZealnut
> **Date**: 2026-06-08
> **Status**: Draft

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 선관위 제출서류 22번 계열 "(예비)후보자 회계보고서"(22-1·22-3·22-4)가 현재 **빈 양식 다운로드만** 가능(`fields: []`). 사용자가 시스템에 입력한 수입·지출·수입지출처·재산 데이터를 한글 양식에 일일이 다시 옮겨 적어야 하고, 22-1 총괄표의 구분별 집계·잔액을 수기 계산해야 한다. |
| **Solution** | ① 수입·지출내역(acc_book)을 **구분(자산·후원회기부금·정당지원금)별 + 선거비용/선거비용외로 집계**해 22-1 총괄표를 채우고, ② 수입지출처(customer) 상세를 계정·과목별 **22-4 수입·지출부**로 행 동적 생성(form-7 패턴 재사용), ③ estate 데이터를 구분별 소계/합계로 **22-3 재산명세서**에 채워 공식 레이아웃 그대로의 HWPX를 출력. |
| **Function/UX Effect** | 선관위 제출서류 화면에서 서식 22-1·22-3·22-4 선택 → 클릭 한 번으로 데이터가 채워진 공식 회계보고서 HWPX 다운로드. 집계·전사 수작업 제거. |
| **Core Value** | 회계보고 핵심 3종(총괄·재산·수입지출부)을 데이터 기반으로 자동 작성 → 제출 준비 시간 단축 + 집계·전사 오류 제거 + 선관위 양식 100% 호환. |

---

## 1. Overview

### 1.1 Purpose

(예비)후보자가 선관위에 제출하는 **회계보고서**(공식 서식 22-1 수입·지출보고서, 22-3 재산명세서, 22-4 수입·지출부)를, 시스템에 입력된 수입·지출내역·수입지출처·재산 데이터로 자동 작성해 한글파일(HWPX)로 내려받을 수 있게 한다.

### 1.2 Background

- 직전 완료 기능 `income-account-ledger-hwpx`(v0.4.0.0, 서식 7)가 **데이터 채움(dataFill) 1호 사례**를 확립했다: `form-7-fill.hwpx`(GROUP/ROW 마커 템플릿) + `income-ledger-builder.ts`(순수 집계) + `owpml-table.ts`(OWPML 표·행 동적 복제) + `POST /api/hwpx/income-ledger`.
- 22번 계열은 현재 `form-fields.ts`에서 모두 `fields: []`(빈 양식 다운로드)로 정의됨. 템플릿(`form-22-1.hwpx`~`form-22-4.hwpx`)은 #57에서 추가 완료.
- **서식 구조 분석(템플릿 실측):**
  - **22-1 (정치자금 수입·지출보고서)** — 헤더(선거명·선거구명·후보자 성명·문서번호) + **수입·지출액 총괄표**. 표 행 = 구분(`자산` / `후원회기부금` / `정당의 지원금: 보조금·보조금외` / `합계`), 열 = `수입` / `지출(선거비용·선거비용외·소계)` / `잔액` / `비고`. 고정 행 구조에 **집계 금액을 채우는 방식**(행 복제 아님). 하단 서명란(후보자·선거사무장·회계책임자)·선관위명·구비서류.
  - **22-3 (재산명세서)** — `estate` 테이블 기반. 표 행 = 구분(`토지`/`건물`/`주식·유가증권`/`비품`/`현금 및 예금`/`그 밖의 재산`)별 **명세 행 + 소계 + 합계**, 열 = `종류`/`수량`/`내용`/`가액`/`비고`. 구분별 행 동적 생성 필요. 작성기준일 표기.
  - **22-4 (정치자금 수입·지출부)** — **서식 7과 거의 동일 레이아웃**. 계정명/과목명 + `년월일`/`내역`/`수입액(금회·누계)`/`지출액(금회·누계)`/`잔액`/`수입을 제공한 자 또는 지출을 받은 자(성명·생년월일·주소·직업·전화)`/`영수증 일련번호`/`비고`. → **income-ledger-builder + owpml-table 패턴을 그대로/거의 그대로 재사용**.
- 데이터 소스:
  - 수입·지출: `acc_book`(org 스코프, `incm_sec_cd` 1=수입/2=지출), customer 상세 조인(`name, reg_num, addr, addr_detail, job, tel`) — income-ledger route에 이미 구현됨.
  - 코드명: `codevalue`(계정명/과목명 cv_id→cv_name).
  - 선거비용/선거비용외 구분: `lib/expense-types.ts`의 `detectItemCategory(expGroup1)`.
  - 재산: `estate`(estate_sec_cd 구분, kind/qty/content/amt/remark/estate_order).
- **사용자 결정사항(2026-06-08):** 작업 범위 = **22-1 + 22-3 + 22-4** (22-2 선거비용 지출내역 집계표는 제외).

### 1.3 Related Documents

- 직전 기능(데이터 채움 선례): `docs/archive/2026-06/income-account-ledger-hwpx/*`
- 코어 재사용: `app/src/lib/hwpx/{generate,form-fields,escape,income-ledger-builder,owpml-table}.ts`
- 진입점: `app/src/app/dashboard/submission-forms/page.tsx` + `components/submission-forms/*`
- API 선례: `app/src/app/api/hwpx/income-ledger/route.ts`
- 회계 로직 재사용 후보: `lib/accounting/{settlement-calc,funding-source}.ts`, `lib/expense-types.ts`(`detectItemCategory`)
- 공식 양식(SSOT): `app/public/hwpx-templates/form-22-1.hwpx`, `form-22-3.hwpx`, `form-22-4.hwpx`
- 참고: `RAG/1. 제9회 지방선거 정치자금 회계실무_(예비)후보자 및 그 후원회용.hwp`

---

## 2. Scope

### 2.1 In Scope

- [ ] 선관위 제출서류 화면에서 **서식 22-1 / 22-3 / 22-4 선택 시 "데이터 채움" 모드** 제공 (income-ledger와 동일 진입 패턴)
- [ ] **22-4 수입·지출부**: acc_book(수입+지출) → 계정+과목 그룹별 표, 행 동적 생성, 수입·지출액 금회/누계·잔액 계산, 수입지출처 상세 매핑 (income-ledger-builder/owpml-table 재사용·확장)
- [ ] **22-1 수입·지출보고서(총괄표)**: 구분(자산·후원회기부금·정당지원금[보조금·보조금외])별로 수입 합계·지출(선거비용/선거비용외/소계)·잔액 **집계**, 고정 표 셀 채움, 합계 행 산출
- [ ] **22-3 재산명세서**: estate 데이터를 구분(토지·건물·주식/유가증권·비품·현금및예금·그밖의재산)별 명세 행 + 소계 + 총합계로 채움
- [ ] 헤더/서명/날짜/선관위명 등 공통 메타 채움 (organ·auth 소스 재사용)
- [ ] 각 서식별 단일 HWPX 파일 다운로드 (`application/hwp+zip`, 공식 레이아웃 보존)
- [ ] 빈 데이터/미등록 수입지출처/재산 0건 등 엣지 케이스 안전 처리
- [ ] 순수 함수 단위 테스트(집계·구분 매핑·행 XML 생성·재산 그룹핑)

### 2.2 Out of Scope

- **22-2 (선거비용 지출내역 집계표)** — 사용자 결정으로 이번 범위 제외
- 후원회 회계보고서(서식 23 계열) 데이터 채움
- 회계보고서 3종을 1개 파일로 묶는 통합 패키징(서식별 개별 파일로 제공; 통합은 차기 검토)
- 기존 토큰 치환형 서식(1-1·2-1 등) 및 서식 7 income-ledger 동작 변경
- estate 데이터 입력 UI 변경(기존 estate 페이지 그대로 사용)

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | 제출서류 화면에서 22-1/22-3/22-4 선택 시 수동입력 패널 대신 **"데이터로 회계보고서 생성"** 액션 노출 (`dataFill` 분기) | High | Pending |
| FR-02 | **22-4**: acc_book(수입+지출, org 스코프) 을 계정+과목 조합별로 그룹핑·일자 오름차순 정렬, 그룹별 form-22-4 표 1개 렌더 | High | Pending |
| FR-03 | **22-4**: 데이터 행 매핑 — 년월일(YYYY. M. D.)·내역·수입액(금회·누계)·지출액(금회·누계)·잔액·수입지출처(성명·생년월일·주소·직업·전화)·영수증 일련번호·비고 | High | Pending |
| FR-04 | **22-4**: 그룹 내 일자순 수입·지출 누계 및 잔액(수입누계−지출누계) 계산 | High | Pending |
| FR-05 | **22-1**: 수입을 구분(자산·후원회기부금·정당지원금[보조금·보조금외])별로 집계, 지출을 `detectItemCategory`로 **선거비용/선거비용외** 구분 집계, 소계·잔액·합계 행 산출 | High | Pending |
| FR-06 | **22-1**: 총괄표 고정 셀(구분별 수입/선거비용/선거비용외/지출소계/잔액 + 합계행)에 집계값 채움, 천단위 구분 표기 | High | Pending |
| FR-07 | **22-3**: estate 데이터를 estate_sec_cd 구분별 그룹 + estate_order 정렬, 구분별 명세 행 + 소계 + 총합계 렌더 | High | Pending |
| FR-08 | 공통 헤더/서명/날짜/선관위명/후보자 성명 등 메타를 organ·auth 소스에서 채움(선관위명 등 미보유 값은 공란/수동 처리 규칙 §Open Questions) | Medium | Pending |
| FR-09 | 각 서식 결과를 **개별 단일 HWPX**로 생성, `application/hwp+zip` attachment 다운로드, 공식 레이아웃(표/폰트/여백/secPr) 보존 | High | Pending |
| FR-10 | 수입·지출 0건 / estate 0건 / 미등록 수입지출처 / 익명(-999) 등 엣지 케이스에서 깨지지 않는 HWPX 생성 | Medium | Pending |
| FR-11 | 생성 HWPX가 한글(Hancom)에서 정상 열림(zip 구조·mimetype STORED·문단/표/마커 무결성) | High | Pending |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| 호환성 | 생성 .hwpx가 한글에서 오류 없이 열림 | 실파일 수동 오픈 + zip 무결성 검사 |
| 정확성 | 22-1 구분별 집계·합계, 22-4 누계·잔액이 수입·지출내역관리/정산 합계와 일치 | 단위 테스트 + 실데이터(org 9) 대조 |
| 성능 | 일반 규모(≤ 수백 행) 서식별 생성 응답 < 3s | API 응답 측정 |
| 보안 | 서버 라우트 service-role + SSR 로그인·user_organ 멤버십 가드(IDOR 방지), org 스코프 강제 | income-ledger route 가드 패턴 준수 |
| 유지보수 | 집계·행 생성 로직을 순수 함수로 분리, income-ledger 모듈 최대 재사용 | lib/hwpx 단위 테스트 |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] FR-01~FR-11 구현 (22-1·22-3·22-4)
- [ ] 단위 테스트 작성·통과 (22-1 구분 집계/22-3 재산 그룹핑/22-4 누계·잔액·행 XML)
- [ ] 실데이터(org 9 "오준석후보")로 생성한 3종 HWPX가 한글에서 정상 열림 + 합계 대조 일치
- [ ] 코드 리뷰 완료, lint·build 통과
- [ ] CLAUDE.md `lib/hwpx/` 설명 + next.config `outputFileTracingIncludes`(신규 *-fill 템플릿) 갱신

### 4.2 Quality Criteria

- [ ] 신규 로직 테스트 커버리지 ≥ 80%
- [ ] Zero lint errors
- [ ] Build 성공 (`node node_modules/next/dist/bin/next build`)

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| OWPML 표 셀/행 마커 치환 시 문단·셀 ID·`<hp:tr>` 구조 충돌 → 한글에서 파일 손상 | High | High | hwpx 스킬 + income-ledger 검증된 owpml-table 패턴 재사용, *-fill 마커 템플릿 분리, 매 변경 실파일 오픈 검증 |
| 22-1 구분 집계 매핑 오류(계정 코드 → 자산/후원회기부금/정당지원금 분류, 보조금/보조금외 구분) | High | Medium | acc_rel/codevalue 코드 체계 역분석, funding-source 재사용, 작성예시 수치 대조, §Open Questions 선확정 |
| 선거비용/선거비용외 구분 부정확(`detectItemCategory` 미매칭 항목) | Medium | Medium | 미매칭 시 안전 기본값 + 단위 테스트로 분류 케이스 고정 |
| 22-4가 서식 7과 미세하게 다른 레이아웃(마커 위치·열 구성) → income-ledger 모듈 그대로 못 씀 | Medium | Medium | 템플릿 차이 실측 후 builder/table 파라미터화(공용 코어 추출), 차이만 분기 |
| 22-3 estate 데이터 부족/구분 코드 불일치 | Medium | Medium | estate_sec_cd↔구분 매핑표 확정, 0건 구분은 "해당없음"/0 표기 |
| 잔액/누계 산정 기준(계정별 vs 통합) 불명확 | High | Medium | income-ledger에서 확정된 기준 승계, form 내장 작성예시 역분석 |
| 신규 *-fill 템플릿 build 트레이싱 누락 → 배포 시 템플릿 404 | Medium | Low | next.config outputFileTracingIncludes 갱신 + form-fields.test dataFill 예외 처리 |

---

## 6. Architecture Considerations

### 6.1 Project Level Selection

| Level | Characteristics | Selected |
|-------|-----------------|:--------:|
| **Starter** | 정적 사이트/포트폴리오 | ☐ |
| **Dynamic** | 기능 모듈 + 백엔드(Supabase) 연동, 풀스택 웹앱 | ☑ |
| **Enterprise** | 마이크로서비스/k8s | ☐ |

→ 기존 Next.js 16 + Supabase 풀스택 구조(**Dynamic**)에 기능 추가. income-ledger 데이터 채움 아키텍처 확장.

### 6.2 기술 접근 (Design 단계에서 확정)

세 서식이 **두 가지 표 채움 패턴**으로 나뉜다:

- **행 복제형 (22-4, 22-3)** — income-ledger의 `owpml-table` GROUP/ROW 마커 복제 패턴 재사용. 22-4는 서식 7과 거의 동일하므로 builder/table 공용 코어 추출 후 재사용; 22-3은 재산 구분 그룹용 마커 템플릿 신규.
- **고정 셀 채움형 (22-1)** — 행 수가 고정(구분 5~6행)이므로 `{{토큰}}` 치환(기존 `generateHwpx`) 또는 셀 단위 마커 치환으로 충분. 핵심은 **집계 로직**(순수 함수).

데이터 흐름(서식별 동일 골격):
```text
submission-forms (서식 22-1/22-3/22-4 선택, "데이터로 생성")
  → POST /api/hwpx/accounting-report { orgId, form: "22-1"|"22-3"|"22-4" }
     → 인증 + user_organ 멤버십 가드 (income-ledger route 패턴)
     → 데이터 조회: acc_book(+customer) | estate, codevalue, organ
     → 빌더(순수): 22-1 집계 / 22-3 재산 그룹 / 22-4 수입·지출부 모델
     → *-fill.hwpx 템플릿 표/행/셀 치환 (owpml-table 재사용/확장)
     → HWPX bytes 반환 (application/hwp+zip)
```

신규/수정 파일(예상):
- `lib/hwpx/report-summary-builder.ts` (22-1 구분별 집계, 순수) + 테스트
- `lib/hwpx/estate-builder.ts` (22-3 재산 그룹/소계/합계, 순수) + 테스트
- 22-4: `income-ledger-builder.ts`/`owpml-table.ts` 재사용(필요 시 공용 코어 추출) + 차이 분기
- `app/api/hwpx/accounting-report/route.ts` (form 파라미터 분기) 또는 서식별 라우트
- `app/public/hwpx-templates/form-22-1-fill.hwpx`, `form-22-3-fill.hwpx`, `form-22-4-fill.hwpx` (마커 템플릿)
- `lib/hwpx/form-fields.ts` (22-1/22-3/22-4 `dataFill` 메타 추가, 타입에 신규 dataFill 값 추가)
- `components/submission-forms/*` (해당 서식 데이터 채움 UI 분기)
- `next.config` outputFileTracingIncludes (신규 *-fill 템플릿)

### 6.3 Convention 준수

- 날짜 DB `YYYYMMDD` → 양식 표기(22-4 `YYYY. M. D.`, 22-1/22-3 작성일) 변환 (CLAUDE.md DB gotcha)
- org 스코프 강제(`org_id` 필터), 익명 customer(-999) 처리, customer.org_id 필터 일관성
- 서버 라우트 service-role + SSR 멤버십 가드, no-store 캐시 (income-ledger route 준수)
- 데이터 채움 모듈은 순수 함수로 분리, 기존 generate/income-ledger 불변 유지(회귀 방지)

---

## 7. Open Questions (Design 전 확정 필요)

1. **22-1 구분 분류 매핑**: 계정 코드(acc_sec_cd) → 총괄표 구분(자산 / 후원회기부금 / 정당지원금-보조금 / 정당지원금-보조금외)의 정확한 대응. funding-source/acc_rel 코드 체계 역분석으로 확정.
2. **22-1 잔액 정의**: 잔액 = 구분별 (수입 − 지출소계)인지, 작성예시(잔액 0)처럼 수입=지출+잔액 항등이 깨질 때 표기 규칙. form 내장 예시 + settlement-calc 대조.
3. **22-4 vs 서식 7 레이아웃 차이**: 마커/열 구성이 동일하면 income-ledger 모듈 그대로, 다르면 공용 코어 추출 범위 확정(템플릿 실측).
4. **22-3 estate_sec_cd ↔ 구분 매핑** 및 비품/현금예금 등 0건 구분 표기("해당없음" vs 빈칸).
5. **공통 메타 미보유 값**(선관위명, 선거구명, 문서번호, 서명 등) — 자동 공란 vs 수동입력 보조 필드 제공 여부.
6. **출력 형태**: 서식별 개별 파일 확정(이번 범위). 추후 3종 통합 1파일 필요 여부.

---

## 8. Next Step

→ `/pdca design candidate-accounting-report-hwpx` (Open Questions 확정 + 22-1 집계 로직·22-3/22-4 OWPML 마커 설계 + income-ledger 공용 코어 추출 범위 결정)
