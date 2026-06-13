# reimbursement-document-list Planning Document

> **Summary**: 「선거비용 보전 첨부서류목록」을 (예비)후보자 회계의 **보전 체크된 지출(acc_book) + 거래업체(customer) + 증빙파일(evidence_file)** 로부터 자동 집계해, 보전 항목(공직선거법 조항)별 **첨부서류 점검목록표** `.hwpx` 로 생성한다. (MVP — 상세양식·증빙사진 내장은 후속 PDCA)
>
> **Project**: 정치자금 회계관리 시스템 (political-fund-accounting-management)
> **Version**: 0.11.2.0 → 0.12.0.0(예정)
> **Author**: DrunkenZealnut
> **Date**: 2026-06-13
> **Status**: Draft
> **Branch**: `feature/reimbursement-document-list`

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 후보자는 선거비용 보전청구 시 항목별(간판·현수막·어깨띠·차량·문자·명함·벽보공보 등) **첨부서류목록 문서**(샘플: `RAG/9회지방선거_오준석_선거비용보전첨부서류목록.hwpx`)를 손으로 작성한다. 어떤 지출이 어느 보전 항목(공직선거법 조항)에 해당하는지 분류하고, 거래업체·금액·첨부증빙 유무를 일일이 옮겨 적어야 하며, 누락 시 보전금 반려 리스크가 있다. |
| **Solution** | 기존 `reimbursement-aggregator`(보전 필터 SSOT)·`expense-types`(지출유형 3단계)·`owpml-table`(표·행 동적 복제)·증빙파일 조회 인프라를 재사용한다. 신규 SSOT `reimbursement-item-map`(지출유형 level1/level2 → 7개 보전 항목·법조항)으로 지출을 보전 항목에 매핑하고, 보전 항목별로 지출(거래업체·내용·보전청구액)과 첨부증빙(매수·유형)을 **점검목록표**로 자동 채운 `.hwpx` 를 생성한다. 22-1~22-4·서식 7 과 동일한 "데이터 채움" UX 로 제출서류 화면에 통합. |
| **Function/UX Effect** | 제출서류 화면에서 「보전 첨부서류목록」 버튼 한 번으로, 보전 체크된 모든 선거비용 지출이 7개 보전 항목별로 분류·집계되고 첨부증빙 현황까지 표기된 점검목록표를 다운로드. 손분류·손집계·증빙누락 점검을 자동화. |
| **Core Value** | 선관위 제출용 HWPX 자동생성 범위를 회계보고서·보전청구서(서식 43/44) → **보전 첨부서류목록**으로 확장. 보전청구 제출 패키지의 "무엇을 어느 항목으로 어떤 증빙과 함께 내는가"를 데이터로 일원화해 반려·누락 리스크를 줄인다. |

---

## 1. Overview

### 1.1 Purpose

선거비용 보전청구 제출 시 동반되는 **「선거비용 보전 첨부서류목록」** 문서를, (예비)후보자 회계의 보전 체크된 지출 데이터로부터 자동으로 채워 `.hwpx` 로 생성한다. 보전 항목(공직선거법 조항)별로 ① 해당 지출(일자·거래업체·내용·보전청구액)과 ② 첨부된 증빙파일 현황(매수·유형·파일명)을 **점검목록표** 형태로 집계한다. 이미 구현된 회계보고서(22-1~22-4)·보전청구서(서식 43)·부담비용 지급청구서(서식 44)와 동일한 "데이터 채움" UX 로 제출서류 화면에 통합한다.

### 1.2 Background

- **현 상태**: 후보자는 보전청구 첨부서류목록을 한글에서 직접 작성한다. 제출서류 화면(`dashboard/submission-forms`)에는 이 문서를 위한 양식·자동생성 경로가 없다.
- **선행 자산 존재(재사용)**:
  - `lib/accounting/reimbursement-aggregator.ts` — 보전 필터(`incm_sec_cd=2` ∧ `acc_print_ok='Y'` ∧ 선거비용 과목 ∧ `acc_amt>0`)와 자금원 4분류 집계 SSOT. 본 기능의 **대상 지출 필터·보전청구액 합계 교차검증**에 재사용.
  - `lib/expense-types.ts` — `ELECTION_EXP_TYPES`(지출유형 3단계, level1/level2/level3). 7개 보전 항목이 여기에 명확히 대응(§6.4 매핑표 참조).
  - `lib/hwpx/income-ledger-builder.ts` + `lib/hwpx/owpml-table.ts`(`renderIncomeLedgerSection`) — 표·행을 GROUP/ROW 마커 기반으로 동적 복제하는 패턴(서식 7). 점검목록표(가변 행)의 직접 선례.
  - `lib/hwpx/generate.ts`(`repackageSection`/`transformSection`/`generateHwpx`) — 토큰 치환·재패키징 코어.
  - `app/api/hwpx/income-ledger/route.ts` — 인증·org 멤버십 가드 + acc_book(+customer) 조회 + 빌더 + 표 렌더 + 재패키징의 라우트 패턴(복제 기준).
  - `app/api/evidence-file/route.ts` + `evidence_file` 테이블(`scripts/007`) — `acc_book_id` FK 로 거래별 증빙파일을 연결. 본 기능은 **메타데이터(매수·유형·파일명)만** 사용(이미지 바이트 미사용).
  - `components/submission-forms/FormInputPanel.tsx` — 데이터 채움 서식의 다운로드 디스패치 UI.
- **차이점(왜 신규 작업인가)**:
  - 기존 보전청구서(서식 43)는 자금원 4분류로 **금액만** 집계한다. 본 문서는 지출을 **공직선거법 조항별 보전 항목**으로 분류하고 **항목별 명세(거래업체·내용·증빙)** 를 나열한다 → 신규 매핑 SSOT(`reimbursement-item-map`)와 신규 빌더가 필요.
  - 첨부증빙 현황(매수·유형)을 함께 표기 → `evidence_file` 메타데이터 조회·집계가 신규.

#### 샘플 문서 분석 결과(조사 완료)

샘플 `9회지방선거_오준석_선거비용보전첨부서류목록.hwpx`(58MB)는 **보전 항목별 상세 첨부서류 양식 14건(7개 항목 유형) + 증빙사진 59장 내장**의 풀버전이다. 본 MVP 는 이 중 **데이터로 100% 자동 채움이 가능한 "점검목록표"** 만 1차 구현하고, 항목별 상세 양식·증빙사진 내장(고난도 이미지 임베딩)은 후속 PDCA 로 분리한다(§2.2, §5).

### 1.3 Related Documents

- 선행 PDCA(패턴 동일): `docs/archive/2026-06/income-account-ledger-hwpx/`(서식 7 표·행 복제), `docs/archive/2026-06/reimbursement-claim-hwpx/`(서식 43 보전 집계), `docs/archive/2026-06/burden-cost-claim-hwpx/`(서식 44)
- 코드 SSOT: `app/src/lib/accounting/reimbursement-aggregator.ts`, `app/src/lib/expense-types.ts`
- 표 렌더: `app/src/lib/hwpx/owpml-table.ts`, `app/src/lib/hwpx/income-ledger-builder.ts`
- 증빙: `app/scripts/007_evidence_file_table.sql`, `app/src/app/api/evidence-file/route.ts`
- 양식 정의: `app/src/lib/hwpx/form-fields.ts`
- 근거 자료: `RAG/9회지방선거_오준석_선거비용보전첨부서류목록.hwpx`(샘플), `RAG/선거비용_구분_및_보전항목_일람표_통합.md`, `RAG/(최종)제9회 전국동시지방선거 선거비용보전안내서(한글파일용).hwp`
- 메모리: `hwpx-form-generator`, `election-item-classification-ssot`, `release-version-ssot`

---

## 2. Scope

### 2.1 In Scope (MVP — 점검목록표)

- [ ] **신규 매핑 SSOT** `lib/accounting/reimbursement-item-map.ts` — 지출유형(level1=`exp_group1_cd`, level2=`exp_group2_cd`) → 7개 보전 항목 `{ itemKey, itemName, law }` 매핑(순수). 7개 항목 = 간판·현판·현수막(§61) / 거리게시용 현수막(§67) / 어깨띠 등 소품(§68) / 공개장소 연설·대담차량(§79) / 문자메시지(§82의5) / 명함(§93) / 선거벽보·선거공보(§64·65).
- [ ] **신규 빌더** `lib/hwpx/reimbursement-doclist-builder.ts`(순수) — (보전 체크 지출 행 + 거래업체 맵 + 증빙파일 집계) → 보전 항목별 그룹·소계·합계·증빙현황 점검목록표 모델 생성.
- [ ] **증빙 집계** — `evidence_file` 을 `acc_book_id` 기준으로 조회해 거래별 **매수·유형(이미지/문서)·파일명** 집계(메타데이터만).
- [ ] **신규 템플릿** `public/hwpx-templates/form-doclist-fill.hwpx` — 점검목록표(헤더 + GROUP/ROW 마커) 템플릿. 제작 스크립트 `app/scripts/make-form-doclist-fill.py`.
- [ ] **표 렌더** — `owpml-table.ts` 에 점검목록표 섹션 렌더러 추가(`renderDoclistSection`) — 항목 그룹·명세 행 동적 복제, rowAddr 재계산.
- [ ] **신규 API** `POST /api/hwpx/reimbursement-doclist` — income-ledger 와 동일한 인증·org 멤버십 가드(후보자 org 스코프) → acc_book(+customer) + evidence_file 조회 → 빌더 → 렌더 → 재패키징 → `.hwpx` 응답.
- [ ] **form-fields.ts** — `dataFill` 유니온에 `"reimbursement-doclist"` 추가, 신규 서식 정의(category `보전·청구`, orgScope `candidate`).
- [ ] **UI 통합** — `FormInputPanel.tsx` 에 신규 dataFill 분기(버튼 → 신규 API 호출), 제출서류 화면 노출.
- [ ] **테스트** — 매핑 단위, 빌더 단위, 통합(생성 .hwpx 토큰 잔류 0), **교차검증**(점검목록표 보전청구액 합계 == `reimbursement-aggregator` 합계).
- [ ] `app/VERSION` MINOR bump(0.11.2.0 → 0.12.0.0), 루트 `CHANGELOG.md`, `next.config` `outputFileTracingIncludes` 에 신규 템플릿 추가.

### 2.2 Out of Scope (후속 PDCA)

- **항목별 상세 첨부서류 양식 전체**(샘플 58MB 풀버전: 구분 체크/거래내역 규격·재질·수량·게시기간/작성요령/별첨 증빙) — 거래내역 상세 필드가 데이터 모델에 없어 수동입력 영역이 큼. **후속 feature**.
- **증빙사진 HWPX 내장**(Storage 다운로드 → BinData 추가 → content.hpf manifest 등록 → section0 `<hp:pic>` 주입) — 신규 이미지 임베딩 엔진 필요(난이도 moderate). 본 MVP 는 **매수·유형·파일명 텍스트 기재**만. **후속 feature**.
- **공식 일람표 전체 20여 보전 항목**(신문·방송광고, 여론조사, 사무소 운영 등) 매핑 — MVP 는 샘플의 7개 고정. 후속 확장.
- **첨부서류 유형 정밀 분류**(계약서/견적서/영수증 구분) — `evidence_file` 에 유형 컬럼이 없어 MIME 기반 best-effort(이미지=사진 / PDF·기타=서류)만 표기. 정밀 분류는 evidence 카테고리 컬럼 신설(별도).
- 보전 요건(득표율 등) 자동 판정 — 보전 체크(`acc_print_ok`)는 사용자 책임(기존 정책 유지).
- 후원회·정당 등 후보자 외 org — 본 문서는 `candidate` 스코프 전용.

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | 보전 체크된 선거비용 지출(`incm_sec_cd=2` ∧ `acc_print_ok='Y'` ∧ 선거비용 과목 ∧ `acc_amt>0`)을 대상으로 한다. (`reimbursement-aggregator` 필터와 동일 SSOT) | High | Pending |
| FR-02 | 각 지출을 지출유형(level1/level2)으로 7개 보전 항목(공직선거법 §61/§67/§68/§79/§82의5/§93/§64·65)에 매핑한다. 매핑 불가 지출은 "기타/미분류" 그룹으로 분리·표기(누락 방지). | High | Pending |
| FR-03 | 보전 항목별로 명세 행(연번·지출일자·거래업체명·지출내용·보전청구액)을 나열하고 항목 소계·전체 합계를 산출한다. | High | Pending |
| FR-04 | 각 지출의 첨부증빙 현황(첨부 매수, 유형=이미지/문서, 대표 파일명)을 `evidence_file`(acc_book_id 기준)에서 집계해 표기한다. 증빙 0건은 명시적으로 "없음" 표기. | High | Pending |
| FR-05 | 거래업체명·사업자번호·전화·주소는 `customer`(cust_id 조인)에서 가져온다. | Medium | Pending |
| FR-06 | 제출서류 화면에서 22-1~22-4·서식 7 과 동일한 "데이터 채움" 버튼으로 `.hwpx` 다운로드. | High | Pending |
| FR-07 | API 는 income-ledger 와 동일한 로그인·org 멤버십 가드 + 후보자 org 스코프 검증(IDOR 방지). | High | Pending |
| FR-08 | 점검목록표 보전청구액 합계 == `reimbursement-aggregator` 합계(자금원 4분류 합계)와 일치 — 교차검증 테스트로 보장. | Medium | Pending |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| 정합성 | 대상 필터·보전청구액 합계가 `reimbursement-aggregator` SSOT 와 일치 | 교차검증 단위 테스트 |
| 무결성 | 생성 .hwpx 에 `{{토큰}}`·마커 잔류 0, ZIP `mimetype` STORED, 한글에서 정상 오픈 | 통합 테스트 + 한글 수동 검수 |
| 순수성 | 매핑·빌더는 DB/IO 비의존 순수 함수(주입형 입력) | 단위 테스트 |
| 보안 | service-role RLS 우회 + org 멤버십 가드 필수 | 라우트 가드 테스트 |
| 성능 | 수백 건 지출·증빙 조회·렌더 < 3s | 수동 측정 |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] FR-01~FR-08 구현
- [ ] 매핑·빌더·통합·교차검증 테스트 작성 및 통과
- [ ] 한글(Hancom)에서 생성 .hwpx 레이아웃·행 복제·합계 수동 검수
- [ ] design.md 작성 및 gap analysis ≥ 90%
- [ ] `app/VERSION`·`CHANGELOG.md`·`next.config` 갱신

### 4.2 Quality Criteria

- [ ] 테스트 커버리지(빌더·매핑) 80%+
- [ ] Lint 0 / Build 성공
- [ ] `form-fields.test.ts` 의 dataFill 예외 처리(토큰 정합성 검사 제외) 통과

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| 지출유형 → 7개 보전 항목 매핑 누락/오분류 | High | Medium | §6.4 매핑표를 SSOT 로 명문화, 매핑 불가 지출은 "기타/미분류" 그룹으로 가시화(FR-02), 매핑 단위 테스트로 전 level1/level2 커버 |
| 점검목록표 합계 ≠ 보전청구서(서식 43) 합계 | High | Low | `reimbursement-aggregator` 와 동일 필터 SSOT 사용 + 교차검증 테스트(FR-08) |
| 신규 템플릿 표 마커 경계·태그 균형 오류(서식 7 에서 겪은 `</hp:run>` 이중닫힘류) | Medium | Medium | `owpml-table` 의 검증된 GROUP/ROW 마커 패턴 답습, rowAddr 재계산 단위 테스트, 한글 수동 오픈 검수 |
| evidence_file 유형이 계약서/영수증 구분 불가(MIME만) | Medium | High | MVP 는 이미지/문서 2분류 best-effort 표기로 한정(§2.2), 정밀 분류는 후속 |
| 거래내역 상세(규격·수량 등) 부재로 "자동" 기대치 불일치 | Medium | Medium | MVP 범위를 "점검목록표"로 사용자와 합의 완료(상세양식 후속), 문서 제목·안내에 범위 명시 |
| 한 지출이 복수 보전 항목에 걸침(예: 인쇄물=명함+벽보) | Low | Low | 매핑 키를 (level1, level2) 조합으로 정의해 level2 단위로 명확 분기(§6.4) |

---

## 6. Architecture Considerations

### 6.1 Project Level Selection

| Level | Characteristics | Recommended For | Selected |
|-------|-----------------|-----------------|:--------:|
| **Starter** | 단순 구조 | 정적 사이트 | ☐ |
| **Dynamic** | 기능 모듈 + Supabase | 백엔드 연동 웹앱 | ☑ |
| **Enterprise** | 엄격 레이어 분리 | 대규모 시스템 | ☐ |

기존 프로젝트(Next.js 16 + Supabase, 기능 모듈식) 컨벤션을 그대로 따른다.

### 6.2 Key Architectural Decisions

| Decision | Options | Selected | Rationale |
|----------|---------|----------|-----------|
| 문서 형태 | 상세양식 전체 / 점검목록표 / 둘 다 | **점검목록표(MVP)** | 데이터 100% 자동 채움 가능, 즉시 가치, 상세양식은 후속(사용자 합의) |
| 보전 항목 매핑 | DB 컬럼 신설 / 코드 SSOT 매핑 / item_sec_cd 직접 | **코드 SSOT(`reimbursement-item-map`)** | 지출유형 level1/level2 가 7개 항목에 명확 대응, 마이그레이션 불필요, 테스트 용이 |
| 표 생성 | 고정 셀 토큰 / GROUP·ROW 마커 동적 복제 | **마커 동적 복제(owpml-table)** | 항목·행 수 가변, 서식 7 검증된 패턴 재사용 |
| 증빙 처리 | 이미지 내장 / 메타데이터 텍스트 | **메타데이터 텍스트** | MVP 안정성, 이미지 임베딩 엔진은 후속(사용자 합의) |
| API | 기존 라우트 확장 / 신규 라우트 | **신규 `/api/hwpx/reimbursement-doclist`** | income-ledger·accounting-report 와 동일하게 서식 1개=라우트 1개 |
| 대상 필터 SSOT | 신규 정의 / aggregator 재사용 | **aggregator 필터 재사용** | 보전청구서와 합계 정합 보장(FR-08) |

### 6.3 Clean Architecture Approach

```
신규/수정 파일 (Dynamic)
─ app/src/lib/accounting/
    reimbursement-item-map.ts        (신규, 순수 SSOT: 지출유형→보전항목·법조항)
    reimbursement-item-map.test.ts   (신규)
─ app/src/lib/hwpx/
    reimbursement-doclist-builder.ts        (신규, 순수: 지출+증빙→점검목록표 모델)
    reimbursement-doclist-builder.test.ts   (신규)
    reimbursement-doclist-integration.test.ts (신규)
    owpml-table.ts                   (수정: renderDoclistSection 추가)
    form-fields.ts                   (수정: dataFill 유니온 + 서식 정의)
─ app/src/app/api/hwpx/reimbursement-doclist/
    route.ts                         (신규: 가드+조회+빌더+렌더+재패키징)
─ app/src/components/submission-forms/
    FormInputPanel.tsx               (수정: dataFill 분기 추가)
─ app/public/hwpx-templates/
    form-doclist-fill.hwpx           (신규 템플릿)
─ app/scripts/
    make-form-doclist-fill.py        (신규 템플릿 제작 스크립트)
─ app/next.config.*                  (수정: outputFileTracingIncludes)
─ app/VERSION, CHANGELOG.md          (버전·변경이력)
```

### 6.4 핵심: 지출유형 → 보전 항목 매핑표 (SSOT 초안)

`expense-types.ts` 의 `ELECTION_EXP_TYPES`(level1) → 7개 보전 항목. design 단계에서 level2 경계를 확정한다.

| 보전 항목(법조항) | 매핑 키 (level1 / level2) |
|---|---|
| 선거사무소 등 간판·현판·현수막 (§61) | level1=`선거사무소` ∧ level2 ∈ {간판, 현판, 현수막, 옥상구조물} |
| 거리게시용 현수막 (§67) | level1=`거리게시용현수막` |
| 어깨띠 등 소품 (§68) | level1=`소품` (어깨띠/윗옷/모자/소품) |
| 공개장소 연설·대담차량 (§79) | level1=`공개장소연설대담` |
| 문자메시지 (§82의5) | level1=`전화/전자우편/문자메시지` ∧ level2 ∈ {문자메시지, 전자우편} |
| 명함 (§93) | level1=`인쇄물` ∧ level2=`명함` |
| 선거벽보·선거공보 (§64·65) | level1=`인쇄물` ∧ level2 ∈ {선거벽보, 선거공보, 선거공약서} |

> 매핑 불가(예: 인쇄물·후보자사진/예비후보자홍보물, 광고, 방송연설, 선거사무관계자, 유지비용 등)는 FR-02 에 따라 **"기타/미분류"** 그룹으로 분리·표기해 누락을 막는다(7개 항목 외 보전 지출의 가시화).

### 6.5 점검목록표 컬럼(초안 — design 확정)

| 연번 | 보전 항목(법조항) | 지출일자 | 거래업체 | 지출내용 | 보전청구액 | 첨부증빙(매수·유형) | 비고 |

- 보전 항목별 그룹 헤더 + 명세 행 + 항목 소계, 최하단 전체 합계.
- 첨부증빙: `사진 N매 / 문서 M건` + 대표 파일명, 0건은 `없음`.

---

## 7. Convention Prerequisites

### 7.1 Existing Project Conventions

- [x] `CLAUDE.md`·`app/AGENTS.md` 코딩 컨벤션 존재(Next.js 16 docs 우선)
- [x] HWPX 생성 컨벤션 확립(`lib/hwpx/*`, dataFill 패턴, 템플릿 제작 스크립트)
- [x] ESLint v9 flat config / TypeScript / Vitest
- [x] `release-version-ssot`(app/VERSION) · `hwpx-form-generator`(fs.readFile 필수, mimetype STORED) 메모리 준수

### 7.2 Conventions to Define/Verify

| Category | Current State | To Define | Priority |
|----------|---------------|-----------|:--------:|
| 네이밍 | 기존 `*-builder.ts`/`render*Section`/`make-form-*.py` | `reimbursement-doclist-*`, `renderDoclistSection`, `make-form-doclist-fill.py` | High |
| 매핑 SSOT 위치 | accounting 계층 | `lib/accounting/reimbursement-item-map.ts` | High |
| 템플릿 추적 | `next.config` outputFileTracingIncludes | 신규 템플릿 등록 | High |
| dataFill 검사 예외 | `form-fields.test.ts` | `"reimbursement-doclist"` 예외 추가 | Medium |

### 7.3 Environment Variables Needed

| Variable | Purpose | Scope | To Be Created |
|----------|---------|-------|:-------------:|
| (없음 — 기존 `SUPABASE_*` 재사용) | DB·Storage 접근 | Server | ☐ |

### 7.4 Pipeline Integration

| Phase | Status | Note |
|-------|:------:|------|
| Schema | ☑ 변경 없음 | acc_book/customer/evidence_file 기존 스키마로 충분(마이그레이션 불필요) |
| Convention | ☑ 기존 | HWPX dataFill 컨벤션 준수 |

---

## 8. Next Steps

1. [ ] 설계 문서 작성 — `/pdca design reimbursement-document-list`
   - 샘플 `form-doclist` 표 레이아웃 실측·확정, 점검목록표 컬럼/마커 스펙 확정
   - 7개 보전 항목 level2 경계 확정(§6.4), "기타/미분류" 처리 규칙
   - evidence_file 집계 쿼리·MIME 분류 규칙 확정
2. [ ] 구현 — 매핑 → 빌더 → 템플릿/렌더 → API → UI → 테스트
3. [ ] Gap 분석(≥90%) → 완료 보고서 → 아카이브

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-06-13 | 초안(조사 4영역 병렬 분석 + 사용자 범위 확정 반영) | DrunkenZealnut |
