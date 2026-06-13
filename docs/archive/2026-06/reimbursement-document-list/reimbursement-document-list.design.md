# reimbursement-document-list Design Document

> **Plan**: `docs/01-plan/features/reimbursement-document-list.plan.md`
> **Project**: 정치자금 회계관리 시스템 (political-fund-accounting-management)
> **Version**: 0.11.2.0 → 0.12.0.0(예정)
> **Author**: DrunkenZealnut
> **Date**: 2026-06-13
> **Branch**: `feature/reimbursement-document-list`
> **Status**: Draft

---

## 1. Overview

### 1.1 Design Goals

보전 체크된 선거비용 지출을 **공직선거법 조항별 보전 항목(7종)** 으로 분류해, 항목별 명세(지출일자·거래업체·내용·보전청구액)와 첨부증빙 현황(매수·유형·대표 파일명)을 담은 **「선거비용 보전 첨부서류 점검목록표」** `.hwpx` 를 자동 생성한다. 기존 dataFill 서식(서식 7/22-3)과 동일한 인프라·UX 를 재사용한다.

### 1.2 Design Principles

- **SSOT 재사용**: 대상 필터는 `reimbursement-aggregator` 와 동일 조건, 표 렌더는 `owpml-table` 의 검증된 그룹/행 복제 패턴.
- **순수 함수 분리**: 매핑(`reimbursement-item-map`)·뷰모델(`reimbursement-doclist-builder`)은 DB/IO 비의존 → 단위 테스트.
- **명시적 매핑 allowlist**: 보전 항목 판별은 `detectItemCategory` 가 아닌 (level1, level2) 명시 맵이 권위(§6.4 근거).
- **누락 가시화**: 매핑 불가 보전체크 지출은 버리지 않고 "기타/미분류" 그룹으로 표기.

### 1.3 서식 역분석 결과 (설계 근거)

샘플 `RAG/9회지방선거_오준석_선거비용보전첨부서류목록.hwpx`(58MB) 분석:
- 7개 보전 항목 유형: 간판·현판·현수막(§61) / 거리게시용 현수막(§67) / 어깨띠 등 소품(§68) / 공개장소 연설·대담차량(§79) / 문자메시지(§82의5) / 명함(§93) / 선거벽보·선거공보(§64·65).
- 각 항목 = 거래업체현황 + 거래내역(규격·재질·수량 등, **데이터 모델 부재**) + 금액(보전청구액) + 첨부증빙(사진 59장 내장).
- **MVP 설계 결론**: 데이터로 100% 자동 채움 가능한 **점검목록표**(거래업체·보전청구액·첨부증빙 현황)만 구현. 거래내역 상세·증빙사진 내장은 후속(Plan §2.2).

---

## 2. Architecture

### 2.1 Component Diagram

```
[제출서류 화면]
  submission-forms/page.tsx → FormInputPanel.tsx
        │ (dataFill="reimbursement-doclist" 분기)
        ▼  POST { orgId }
[API] app/api/hwpx/reimbursement-doclist/route.ts
        │ 1) 인증 + user_organ 멤버십 가드 (income-ledger·reimbursement-claim 동일)
        │ 2) 조회: acc_book(지출+customer 조인) / evidence_file(org_id)
        │ 3) 빌더 호출
        │    (후보자 orgScope 는 UI formsForOrgType 에서 게이트 — 형제 라우트 규약)
        ▼
[순수 로직]
  lib/accounting/reimbursement-item-map.ts  (지출유형 label → 보전항목·법조항, SSOT)
  lib/hwpx/reimbursement-doclist-builder.ts (행+증빙 → 그룹/소계/합계 모델)
        ▼
[렌더] lib/hwpx/owpml-table.ts → renderDoclistSection (DOCLIST:GROUP/ROW 복제)
        ▼
[재패키징] lib/hwpx/generate.ts → repackageSection (mimetype STORED)
        ▼  200 application/hwp+zip
   form-doclist-fill.hwpx 채워진 .hwpx 다운로드
```

### 2.2 API 구조 결정

- **신규 라우트** `POST /api/hwpx/reimbursement-doclist` — income-ledger·accounting-report·reimbursement-claim 과 동일하게 "서식 1개 = 라우트 1개" 원칙. 기존 `reimbursement-claim`(서식 43, 자금원 집계)과 데이터·표 구조가 달라 분리.

### 2.3 Dependencies

| 재사용 | 역할 |
|---|---|
| `lib/expense-types.ts` (`ELECTION_EXP_TYPES`) | (level1, level2) label 원천 — 매핑 맵 정의 근거 |
| `lib/accounting/reimbursement-aggregator.ts` | 대상 필터 조건·합계 교차검증 기준 |
| `lib/hwpx/owpml-table.ts` (`renderEstateSection` 헬퍼) | c0 rowSpan·행 복제·rowAddr 재계산 패턴 |
| `lib/hwpx/income-ledger-builder.ts` (`formatAmount`/`formatLedgerDate`/`formatBirthFromRegNum`) | 금액·일자·거래처 포맷 |
| `lib/hwpx/generate.ts` (`transformSection`/`repackageSection`) | 토큰 치환·재패키징 |
| `app/api/hwpx/income-ledger/route.ts` | 인증·org 가드·조회 패턴(복제 기준) |
| `evidence_file` 테이블 + `app/api/evidence-file/route.ts` | 증빙 메타데이터(매수·유형·파일명) |
| `components/submission-forms/FormInputPanel.tsx` | dataFill 디스패치 UI |

---

## 3. Data Model

### 3.1 조회 (서버, org 스코프 강제)

```sql
-- 지출 + 거래처 (income-ledger 패턴)
SELECT acc_book_id, acc_date, content, acc_amt, acc_print_ok, rcp_no,
       exp_group1_cd, exp_group2_cd, item_sec_cd, acc_sec_cd, cust_id,
       customer:cust_id ( name, reg_num, addr, addr_detail, job, tel )
FROM   acc_book
WHERE  org_id = :orgId AND incm_sec_cd = 2;     -- 지출만

-- 증빙 메타데이터 (org 격리, acc_book_id 기준 집계)
SELECT acc_book_id, file_name, file_type, file_size
FROM   evidence_file
WHERE  org_id = :orgId;
```

> `exp_group1_cd`/`exp_group2_cd` 는 **label 문자열**(`string|null`, 예 "선거사무소"/"간판")로 저장됨(코드 아님) — 매핑에 직접 사용.

### 3.2 매핑 SSOT (`reimbursement-item-map.ts`, 순수)

```ts
export interface ReimbItem { key: string; name: string; law: string; }

/** 7개 보전 항목 (출력 순서 = 배열 순서). */
export const REIMB_ITEMS: ReimbItem[] = [
  { key: "signboard", name: "선거사무소 등 간판·현판·현수막", law: "법 제61조" },
  { key: "street_banner", name: "거리게시용 현수막", law: "법 제67조" },
  { key: "props", name: "어깨띠 등 소품", law: "법 제68조" },
  { key: "speech_vehicle", name: "공개장소 연설·대담차량", law: "법 제79조" },
  { key: "sms", name: "문자메시지", law: "법 제82조의5" },
  { key: "namecard", name: "명함", law: "법 제93조" },
  { key: "poster_bulletin", name: "선거벽보·선거공보", law: "법 제64조·제65조" },
] as const;

/** (exp_group1 label, exp_group2 label) → 보전 항목 key. 명시적 allowlist. */
const MAP: Record<string, Record<string, string>> = {
  "선거사무소": { 간판: "signboard", 현판: "signboard", 현수막: "signboard", 옥상구조물: "signboard" },
  "거리게시용현수막": { "*": "street_banner" },          // level1 전체
  "소품": { 어깨띠: "props", 윗옷: "props", 모자: "props", 소품: "props" },
  "공개장소연설대담": { "*": "speech_vehicle" },           // level1 전체
  "전화/전자우편/문자메시지": { 문자메시지: "sms" },   // 전화·전자우편은 조항 상이 → 제외
  "인쇄물": { 명함: "namecard", 선거벽보: "poster_bulletin", 선거공보: "poster_bulletin", 선거공약서: "poster_bulletin" },
};

/** 미매핑 → null (→ 빌더에서 "기타/미분류" 그룹). */
export function mapReimbItemKey(expGroup1: string|null, expGroup2: string|null): string | null {
  const g1 = MAP[expGroup1 ?? ""]; if (!g1) return null;
  return g1["*"] ?? g1[expGroup2 ?? ""] ?? null;
}
```

> **§6.4 설계 근거**: `"선거사무소"`·`"유지비용"` 은 ELECTION·NON_ELECTION 양쪽에 존재해 `detectItemCategory` 가 `null` 을 반환한다. 그러므로 선거비용/보전 항목 판별을 `detectItemCategory` 에 의존하지 않고 **(level1, level2) 명시 allowlist** 로 한다. 이 맵에 들어간 조합은 정의상 선거비용 보전 항목이다. (메모리 `election-item-classification-ssot` 준수)

### 3.3 증빙 집계 (`reimbursement-doclist-builder.ts` 입력)

```ts
export interface EvidenceSummary { images: number; docs: number; firstName: string; }
// acc_book_id → EvidenceSummary 맵. file_type startsWith "image/" → images, 그 외 → docs.
// 표기: "사진 {images}매" + "문서 {docs}건" (0 생략), 둘 다 0 → "없음". 대표 파일명 firstName.
```

### 3.4 점검목록표 뷰모델 (`reimbursement-doclist-builder.ts`, 순수)

```ts
export interface DoclistInputRow {
  acc_book_id: number; acc_date: string; content: string; acc_amt: number;
  acc_print_ok: string|null; rcp_no: string|null;
  exp_group1_cd: string|null; exp_group2_cd: string|null;
  customer: { name: string|null } | null;
}
export interface DoclistCellRow {
  seq: string; date: string; vendor: string; content: string;
  amount: string; evidence: string; remark: string;   // 7개 행 토큰
}
export interface DoclistGroup {
  itemName: string; law: string;          // c0: "{name}\n({law})"
  rows: DoclistCellRow[]; subtotalAmount: string; subtotalCount: string;
}
export interface DoclistModel {
  groups: DoclistGroup[];                  // 7개 항목 + (있으면) "기타/미분류"
  totalAmount: string; totalCount: string; // 합계행
}

export function buildDoclistModel(
  rows: DoclistInputRow[],
  evidence: Map<number, EvidenceSummary>,
): DoclistModel;
```

- **대상 필터**(aggregator 동일): `acc_amt > 0` ∧ `acc_print_ok === 'Y'`. (조회에서 `incm_sec_cd=2` 이미 보장)
- **그룹화**: `mapReimbItemKey(exp_group1, exp_group2)` → key. null → "기타/미분류" 그룹(맨 끝).
- **그룹 출력 순서**: `REIMB_ITEMS` 순서 → 기타/미분류. 거래 0건 항목은 빈 행 1개(손기입) 또는 항목 생략(§8 결정).
- **그룹 내 정렬**: `acc_date` ASC.
- **소계/합계**: 그룹별 보전청구액 합·첨부 건수 합, 전체 합.

---

## 4. API Specification

### 4.1 Endpoint

`POST /api/hwpx/reimbursement-doclist` · Request `{ orgId: number }` · Response `200 application/hwp+zip`(attachment) | `4xx/5xx { error: { code, message } }`

### 4.2 흐름 (income-ledger route 복제)

1. body JSON 파싱·`orgId` 정수 검증 → `INVALID_REQUEST(400)`.
2. `createSupabaseServer().auth.getUser()` → 미로그인 `UNAUTHORIZED(401)`.
3. `user_organ` 멤버십 확인(타 기관 IDOR 차단) → `FORBIDDEN(403)`.
4. (후보자 orgScope 는 UI `formsForOrgType` 에서 게이트 — reimbursement-claim·income-ledger 와 동일 규약. API 는 멤버십만 검증; 비후보자 org 는 데이터상 빈 표.)
5. service-role 클라이언트로 `acc_book`(+customer 조인, 지출) / `evidence_file`(org_id) 조회.
6. `buildDoclistModel(rows, evidenceMap)` → `transformSection(template, sec => renderDoclistSection(sec, model))` → `repackageSection`.
7. `Content-Disposition: attachment; filename*=UTF-8''...` 로 bytes 반환.

| code | status | 상황 |
|---|---|---|
| INVALID_REQUEST | 400 | body/orgId 오류 |
| UNAUTHORIZED | 401 | 미로그인 |
| FORBIDDEN | 403 | 비멤버십 / 비후보자 org |
| TEMPLATE_MISSING | 500 | 템플릿 파일 부재 |
| QUERY_FAILED | 500 | acc_book·evidence_file 조회 실패 |
| GENERATE_FAILED | 500 | 마커 부재·렌더·재패키징 실패 |

---

## 5. UI/UX Design

### 5.1 진입점 (`form-fields.ts` 확장)

```ts
// dataFill 유니온에 추가
dataFill?: "income-ledger" | "accounting-report" | "reimbursement" | "reimbursement-doclist";

// 신규 서식 정의 (HWPX_FORM_DEFS 에 추가)
{ id: "보전목록", label: "선거비용 보전 첨부서류목록", category: "보전·청구",
  template: "form-doclist-fill.hwpx", orgScope: "candidate", fields: [],
  dataFill: "reimbursement-doclist" }
```

> `id` 는 공식 서식번호가 아닌 식별자(문자열 허용). `fields: []`(전체 자동, 수동 입력 없음).

### 5.2 `FormInputPanel.tsx` 분기 (맵 2곳 추가)

```ts
DATA_FILL_ENDPOINT["reimbursement-doclist"] = "/api/hwpx/reimbursement-doclist";
DATA_FILL_TEXT["reimbursement-doclist"] = {
  desc: "보전 체크된 선거비용 지출을 항목(법조항)별로 분류해 첨부서류 점검목록표를 자동 생성합니다.",
  button: "보전 첨부서류목록 생성",
};
```
`fields: []` → 기존 dataFill 분기가 그대로 처리(수동 입력 없이 버튼만 노출, `payload = { orgId, formId }`).

### 5.3 User Flow

사용기관(후보자) 선택 → 제출서류 화면 → "선거비용 보전 첨부서류목록" 선택 → "보전 첨부서류목록 생성" 클릭 → `.hwpx` 다운로드 → 한글에서 확인·인쇄·날인·제출.

---

## 6. 핵심 기술 설계

### 6.1 템플릿 제작 (`make-form-doclist-fill.py`, Do 단계)

점검목록표 = 단일 표(헤더행 + 보전항목별[명세행 N + 소계행] + 합계행), **6컬럼**.

| col | 토큰 | 내용 | 도너(22-3) 대응 |
|:--:|---|---|---|
| 0 | `보전항목` | 항목명 + (법조항) — c0, rowSpan | 구분 |
| 1 | `지출일자` | YYYY/M/D | 종류 |
| 2 | `거래업체` | customer.name (익명 정규화) | 수량 |
| 3 | `지출내용` | acc_book.content | 내용 |
| 4 | `보전청구액` | 천단위 콤마 | 가액 |
| 5 | `첨부증빙` | "사진 N매 / 문서 M건 (대표파일명)" · 0건 "없음" | 비고 |

- 소계행: `소계_금액`(col4). 합계행: `합계_금액`(col4). 마커: `DOCLIST:GROUP_START/END`, 명세행 `DOCLIST:ROW_START/END`.
- **연번·비고(rcp_no)는 MVP 제외**(점검목록 self-numbering, 6컬럼 도너 정합 우선).

**베이스 템플릿 확보 — 결정(B 채택, 완전 자동·저위험)**: 공식 서식번호 없는 커스텀 문서라 시작 폼이 없다. 점검목록표 6컬럼을 재산명세서(서식 22-3) 6컬럼에 **1:1 매핑**(구분→보전항목/종류→지출일자/수량→거래업체/내용→지출내용/가액→보전청구액/비고→첨부증빙)하면 **검증된 표 구조를 그대로 재사용**할 수 있다. `make-form-doclist-fill.py` 가 도너 `form-22-3-fill.hwpx`(토큰·ESTATE 마커 기보유)를 ① 재산명세서 푸터 주석(주 1~4) 절단 ② 제목/헤더/첨부 텍스트 치환 ③ 토큰·마커(ESTATE→DOCLIST) 치환 — **구조 무변경(텍스트 치환만)** 으로 변환한다. 한글 수기 작성 불요, XML 손상 위험 최소(태그 균형·잔재 0 assert로 가드).

### 6.2 `renderDoclistSection` (owpml-table, 행 복제)

`renderEstateSection` 과 동형 — 단일 표, c0(보전항목) rowSpan = 명세n + 소계1, 명세행 복제, 소계행, 합계행(그룹 밖), 표 전체 rowAddr 0..N 재계산 + rowCnt 동기화. 기존 헬퍼(`recalcTableRowAddr`/`setC0RowSpan`/`removeC0Cell`/`setTblAttr`/`readTblId`)를 **공용 내부 함수로 추출**해 재사용(estate·doclist 공유). 잔여 `DOCLIST:` 마커·미치환 토큰 제거.

```ts
export function renderDoclistSection(sectionXml: string, model: DoclistModel): string;
// 그룹 0개(보전체크 지출 없음): 빈 그룹 1개("해당 없음") 또는 헤더만 — §8 결정.
```

### 6.3 분류 축·매핑 무결성 (핵심 정합성)

- **선거비용 판별 축**: 본 기능은 `exp_group1/exp_group2` label 축(지출유형)을 쓴다. aggregator(서식 43)는 `item_sec_cd`(과목) 축을 쓴다 — **별개 축**(메모리 `election-item-classification-ssot`).
- **보전 항목 판별 권위 = `reimbursement-item-map`(allowlist)**, `detectItemCategory` 아님(선거사무소/유지비용 양쪽 존재로 null 반환하므로).
- **합계 의미(FR-08 재정의)**: 점검목록표 `합계_금액` = Σ(보전체크 ∧ 양수 지출 acc_amt). 자금원 aggregator `합계` 와는 **축이 달라 강한 동치를 보장하지 않음** — 두 축이 일관된(과목 선거비용 ⟺ 지출유형 선거비용, 자금원 known) 픽스처에서만 `7개 항목 소계 합 == aggregator 합계` 를 교차검증 테스트로 확인(soft reconciliation). 불일치 행은 "기타/미분류" 로 가시화돼 누락되지 않음.

### 6.4 무결성 규칙 (income-ledger 검증 승계)

표 id 고유화(단일 표라 baseId 1개), cellAddr/rowAddr 0..N 재계산, rowCnt = tr 수, `mimetype` STORED 첫 엔트리, 잔여 토큰/마커 0. 텍스트 셀 토큰화 시 `</hp:run>` 이중 닫힘 주의(서식 7 교훈) → make 스크립트 태그 균형 assert.

---

## 7. Open Questions 해소 (Plan §8)

| Plan Open Q | 설계 결론 |
|---|---|
| 표 레이아웃 확정 | §6.1 6컬럼(도너 22-3 1:1 매핑) + 소계/합계 토큰 확정 |
| 7개 항목 level2 경계 | §3.2 명시 allowlist 맵 확정 |
| "기타/미분류" 처리 | 미매핑 보전체크 지출을 끝 그룹으로 표기(누락 방지) |
| evidence 집계·MIME 분류 | §3.3 image/* → 사진, 그 외 → 문서, 0건 → "없음" |
| 베이스 템플릿 확보 | §6.1 B 채택 — form-22-3 도너 텍스트 치환(완전 자동) |

---

## 8. Edge Cases & Decisions

| 케이스 | 결정 |
|---|---|
| 보전체크 지출 0건 | 빈 표 + "해당 없음" 1행, 합계 0 |
| 항목 거래 0건 | 해당 항목 그룹 **생략**(점검목록은 실데이터 기반; 빈 손기입 행 불요) |
| 미매핑 보전체크 지출(광고·방송연설 등 7항목 외, 또는 선거비용외 오체크) | "기타/미분류" 그룹으로 표기(가시화) |
| 증빙 0건 지출 | 첨부증빙 셀 "없음"(누락 점검 목적) |
| 익명/무거래처(cust_id=-999) | 거래업체 "익명" 표기(income-ledger 규칙 준용) |
| 음수/0 지출 | 제외(보전 대상 아님) |
| `exp_group` null | 미매핑 → 기타/미분류 |

---

## 9. 구현 순서 (Do 단계 체크리스트)

1. [ ] `lib/accounting/reimbursement-item-map.ts` + 단위 테스트(전 level1/level2 매핑·미매핑 커버)
2. [ ] `lib/hwpx/reimbursement-doclist-builder.ts` + 단위 테스트(그룹화·정렬·소계/합계·증빙 표기·기타그룹)
3. [ ] `owpml-table.ts`: 공용 헬퍼 추출 + `renderDoclistSection` + 단위 테스트
4. [ ] 베이스 `form-doclist.hwpx` 확보(§6.1 A/B) → `make-form-doclist-fill.py` → `form-doclist-fill.hwpx`
5. [ ] `app/api/hwpx/reimbursement-doclist/route.ts`(가드+조회+빌더+렌더+재패키징)
6. [ ] `form-fields.ts`(dataFill 유니온 + 서식 def) + `FormInputPanel.tsx`(맵 2곳) + `form-fields.test.ts` 예외(`!== "reimbursement-doclist"` fields 검사 제외)
7. [ ] 통합 테스트(생성 .hwpx 토큰/마커 잔류 0) + aggregator 교차검증(§6.3) + 한글 수기 오픈 검수
8. [ ] `next.config` outputFileTracingIncludes 에 `form-doclist-fill.hwpx` 추가
9. [ ] `app/VERSION` 0.12.0.0 + `CHANGELOG.md`

---

## 10. Test Strategy

| 레벨 | 대상 | 핵심 케이스 |
|---|---|---|
| 단위 | `reimbursement-item-map` | 7항목 매핑, 선거사무소×유지비용→미매핑, 미매핑→null |
| 단위 | `reimbursement-doclist-builder` | 그룹 순서·정렬, 소계/합계, 증빙 표기(사진/문서/없음), 기타그룹, 0건 |
| 단위 | `renderDoclistSection` | c0 rowSpan, rowAddr 재계산, rowCnt, 마커/토큰 잔류 0 |
| 통합 | route(주입 픽스처) | 생성 .hwpx unzip → 토큰/마커 0, mimetype STORED |
| 교차검증 | builder vs aggregator | 일관 픽스처에서 7항목 소계합 == aggregator 합계 |
| 수동 | 한글 오픈 | 표·행 복제·소계/합계·rowSpan 레이아웃 |

### 8.1 Test Scope / 8.2 Key Cases
- 빌더·매핑 커버리지 80%+. lint 0 / build 성공. `form-fields.test.ts` dataFill 예외 통과.

---

## 11. Security Considerations

- service-role(RLS 우회) + `user_organ` 멤버십 가드 필수(IDOR 차단, income-ledger 동일).
- org 스코프: `acc_book`·`evidence_file` 모두 `org_id` 필터. 후보자 orgScope 는 UI 게이트(형제 라우트 규약) — 멤버는 자기 소속 org 만 접근 가능하므로 IDOR 없음.
- 증빙은 **메타데이터만** 사용(파일명·매수·MIME) — Storage 바이트 미다운로드(노출면 최소).

---

## 12. Clean Architecture / Convention

- 레이어: accounting(매핑 SSOT) ← hwpx(빌더·렌더) ← api(조회·조립) ← components(UI). 순수 모듈은 상위 비의존.
- 네이밍: `reimbursement-item-map.ts`, `reimbursement-doclist-builder.ts`, `renderDoclistSection`, `make-form-doclist-fill.py` (기존 컨벤션 동형).
- 메모리 준수: `hwpx-form-generator`(fs.readFile·mimetype STORED), `release-version-ssot`(app/VERSION), `election-item-classification-ssot`(분류 축 분리).

---

## 13. Next Step

1. [ ] `/pdca do reimbursement-document-list` — §9 순서로 구현
2. [ ] 베이스 템플릿 A/B 확정 → 구현 → 한글 검수
3. [ ] `/pdca analyze` Gap 분석(≥90%)

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-06-13 | 초안(인프라 정밀 분석 + 분류 축/매핑 무결성 확정) | DrunkenZealnut |
