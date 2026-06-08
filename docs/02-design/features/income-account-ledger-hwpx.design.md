# income-account-ledger-hwpx Design Document

> **Summary**: 수입내역(acc_book, incmSecCd=1)을 계정+과목 그룹별로 묶어 공식 form-7 레이아웃의 표·행을 OWPML 복제로 동적 생성, 누계·잔액 계산된 단일 HWPX로 출력한다.
>
> **Project**: 정치자금 회계관리 시스템 (political-fund-accounting)
> **Version**: 0.1.1.0
> **Author**: DrunkenZealnut
> **Date**: 2026-06-08
> **Status**: Draft
> **Planning Doc**: [income-account-ledger-hwpx.plan.md](../../01-plan/features/income-account-ledger-hwpx.plan.md)

---

## 1. Overview

### 1.1 Design Goals

- 공식 form-7 "(예비)후보자 정치자금 수입계정별 회계장부" **레이아웃을 보존**하면서 수입 데이터로 표/행을 채운다.
- 기존 `generateHwpx`(토큰 1:1 치환)를 **건드리지 않고** 회계장부 전용 생성 경로를 추가(회귀 방지).
- 그룹핑·누계·매핑 로직을 **순수 함수**로 분리해 단위 테스트한다.

### 1.2 Design Principles

- **SSOT 재사용**: 계정/과목 코드명은 `getName()`(codevalue), 자금원 분류는 `classifyFundingSource()` 재사용. 하드코딩 금지(아카이브 교훈: acc_sec_cd 가정 오류 사전 차단).
- **기존 아키텍처 비침습**: 토큰 치환 코어·기존 서식 동작 불변. 회계장부는 별도 빌더/라우트.
- **레이아웃 보존 우선**: 표 구조(borderFillID·cellSz·secPr)는 템플릿에서 복제, 텍스트만 주입.

### 1.3 form-7 역분석 결과 (설계 근거)

form-7.hwpx 작성예시(5개 표) 분석:

| 항목 | 발견 |
|------|------|
| 표 단위 | **계정명+과목명 조합마다 표 1개** + 표 위 `[계 정 명 : …]`/`[과 목 명 : …]` 헤더 문단 |
| 표 속성 | `<hp:tbl rowCnt="3" colCnt="13" borderFillIDRef="11">` (헤더 2행 + 데이터 1행) |
| 컬럼(13) | 연월일 / 내역 / 수입액(금회·누계) / 지출액(금회·누계) / 잔액 / 수입제공자(성명·생년월일·주소·직업·전화) / 영수증번호 |
| 문단 ID | 표 내 `<hp:p id="0">` — **모든 문단 id=0** (paraId 충돌 없음 → 행 복제 안전) |
| 잔액 공식 | 잔액 = 수입누계 − 지출누계. 예) 20,000,000 → +1,500,000 → 수입누계 21,500,000 = 잔액 ✓ |
| 생년월일 | 개인 `57/09/23`(YY/MM/DD), 법인 `123-85-12345`(사업자번호) |

→ **수입-only**이므로 지출 금회/누계 컬럼은 공란, 잔액 = 그룹 내 수입 누계.

---

## 2. Architecture

### 2.1 Component Diagram

```
┌──────────────────────────┐      ┌───────────────────────────────┐      ┌──────────────┐
│ submission-forms page     │      │ POST /api/hwpx/income-ledger  │      │ Supabase     │
│  FormCatalog(서식7 선택)  │─────▶│  1. acc_book 수입 + customer  │─────▶│ pfam.acc_book│
│  FormInputPanel(데이터모드)│      │     상세 조회 (org 스코프)     │      │ pfam.customer│
└──────────────────────────┘      │  2. codevalue 코드명 조회      │      │ pfam.codevalue│
            │ download .hwpx       │  3. groupRowsByAccount()      │      └──────────────┘
            ◀──────────────────────│  4. buildIncomeLedgerModel()  │
                                   │  5. renderIncomeLedgerHwpx()  │ ← lib/hwpx (신규)
                                   └───────────────────────────────┘
```

### 2.2 Data Flow

```
서식7 선택 → "수입 데이터로 회계장부 생성" 클릭
  → POST /api/hwpx/income-ledger { orgId }
     → acc_book(incm_sec_cd=1, org_id) + customer(상세) 조회
     → codevalue 로 acc_sec_cd/item_sec_cd → 코드명 맵
     → 계정+과목 그룹핑 (정렬: 계정코드 → 과목코드, 그룹 내 acc_date ASC)
     → 그룹별 누계/잔액 계산 (수입 누적)
     → form-7-fill.hwpx 템플릿: 표 블록 그룹수만큼 복제 + 데이터행 건수만큼 복제 + 텍스트 치환
     → HWPX bytes (application/hwp+zip, attachment)
```

### 2.3 Dependencies

| Component | Depends On | Purpose |
|-----------|-----------|---------|
| `/api/hwpx/income-ledger` | `lib/hwpx/income-ledger-builder`, `lib/hwpx/owpml-table` | 모델 빌드 + OWPML 렌더 |
| `income-ledger-builder` | `lib/accounting/funding-source` | 자금원 분류(정렬·표시 보조) |
| `owpml-table` | `jszip`, `lib/hwpx/escape` | 표/행 복제·치환·재패키징 |
| `FormInputPanel` | `form-fields`(dataFill 메타) | 데이터 채움 모드 분기 |

---

## 3. Data Model

### 3.1 조회 행 (서버)

```typescript
// acc_book 수입행 + customer 상세 조인 (전용 조회)
interface IncomeLedgerRow {
  acc_date: string;        // YYYYMMDD
  acc_sec_cd: number;      // 계정
  item_sec_cd: number;     // 과목
  content: string;         // 내역
  acc_amt: number;         // 수입 금회
  rcp_no: string | null;   // 영수증 일련번호
  cust_id: number;
  customer: {              // cust_id(...) 상세 조인
    name: string | null;
    reg_num: string | null;   // 주민/사업자번호 → 생년월일 변환
    addr: string | null;
    addr_detail: string | null;
    job: string | null;
    tel: string | null;
  } | null;
}
```

### 3.2 뷰모델 (순수 빌더 출력)

```typescript
interface LedgerCellRow {
  date: string;            // YYYY/M/D
  content: string;
  incomeNow: string;       // 금회 (천단위 콤마)
  incomeCum: string;       // 누계
  expenseNow: "";          // 공란(수입-only)
  expenseCum: "";          // 공란
  balance: string;         // 잔액 = 수입누계
  name: string;            // 성명/법인·단체명
  birth: string;           // 생년월일(YY/MM/DD) 또는 사업자번호
  addr: string;
  job: string;
  tel: string;
  receiptNo: string;       // 영수증 일련번호 (rcp_no ?? "")
}

interface LedgerGroup {
  accountName: string;     // [계 정 명 : …] (getName(acc_sec_cd))
  itemName: string;        // [과 목 명 : …] (getName(item_sec_cd))
  rows: LedgerCellRow[];
}

interface IncomeLedgerModel {
  groups: LedgerGroup[];   // 정렬됨, 빈 그룹 없음
}
```

### 3.3 코드명 조회

- 서버 라우트는 `useCodeValues`(클라 훅) 사용 불가 → `pfam.codevalue`를 직접 조회해 `cv_id → cv_name` 맵 구성 (기존 `/api/codes` 동일 소스).
- 계정/과목 정렬: `acc_sec_cd ASC, item_sec_cd ASC` 1차. 자금원 우선순위(후보자자산→후원회기부금→보조금→보조금외)는 보조 정렬 키로 적용 가능(`classifyFundingSource`).

---

## 4. API Specification

### 4.1 Endpoint

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | /api/hwpx/income-ledger | 수입계정별 회계장부 HWPX 생성·다운로드 | service-role (org 스코프) |

### 4.2 Detailed

#### `POST /api/hwpx/income-ledger`

**Request:**
```json
{ "orgId": 9 }
```

**Response (200):** `application/hwp+zip` (attachment; filename*=UTF-8''…회계장부.hwpx)

**Error:**
- `400 INVALID_REQUEST` — orgId 누락/형식 오류
- `404 NO_DATA` — 해당 org 수입 0건 (또는 0건 안내용 빈 양식 반환 — §7 결정)
- `500 TEMPLATE_MISSING` / `GENERATE_FAILED`

**보안/검증** (기존 generate route 패턴 준수):
- service-role 클라이언트 + `org_id` 필터 강제
- 익명 customer(-999)·null customer 안전 처리
- no-store 캐시

---

## 5. UI/UX Design

### 5.1 진입점 (서식 7 데이터 채움 모드)

`form-fields.ts`의 form-7 def에 데이터 채움 메타 추가:

```typescript
{ id: "7", label: "(예비)후보자 정치자금 수입계정별 회계장부",
  category: "회계장부", template: "form-7-fill.hwpx",
  orgScope: "candidate", fields: [],
  dataFill: "income-ledger" }   // ← 신규 플래그
```

`FormInputPanel` 분기:
- `def.dataFill === "income-ledger"` → 안내문("수입내역관리에 입력된 데이터로 회계장부를 생성합니다") + **"수입 데이터로 회계장부 생성"** 버튼 → `POST /api/hwpx/income-ledger`
- 그 외(기존) → 토큰 입력 폼(변경 없음)

### 5.2 User Flow

```
대시보드 → 선관위 제출서류 → [회계장부] 서식 7 선택
  → (자동) 안내문 표시 → "수입 데이터로 회계장부 생성" 클릭
  → .hwpx 다운로드 → 한글에서 열람/인쇄/날인 → 제출
```

### 5.3 Component List

| Component | Location | Responsibility |
|-----------|----------|----------------|
| FormInputPanel | components/submission-forms/ | dataFill 모드 분기, 생성 API 호출 |
| (route) income-ledger | app/api/hwpx/income-ledger/route.ts | 조회·빌드·렌더 오케스트레이션 |
| income-ledger-builder | lib/hwpx/ | 그룹핑·누계·셀 매핑(순수) |
| owpml-table | lib/hwpx/ | 표/행 복제·치환(순수) |

---

## 6. 핵심 기술 설계 — OWPML 표/행 복제

### 6.1 템플릿 전략 (Option A 확정)

`public/hwpx-templates/form-7-fill.hwpx` 신규 제작:
- form-7.hwpx에서 **표 1개(헤더 2행 + 데이터 1행)** + 표 위 계정/과목 헤더 문단만 남기고 작성예시 표 4개 삭제.
- 토큰화:
  - 계정/과목 헤더 문단: `[계 정 명 : {{계정명}}]`, `[과 목 명 : {{과목명}}]`
  - 데이터행 13개 셀: `{{연월일}}`,`{{내역}}`,`{{수입금회}}`,`{{수입누계}}`,`{{지출금회}}`,`{{지출누계}}`,`{{잔액}}`,`{{성명}}`,`{{생년월일}}`,`{{주소}}`,`{{직업}}`,`{{전화}}`,`{{영수증}}`
- 빌드타임 검증: 토큰 13+2개가 템플릿에 정확히 존재(테스트).

### 6.2 렌더 알고리즘 (`renderIncomeLedgerHwpx`)

```
1. JSZip 로 form-7-fill.hwpx 로드 → section0.xml 파싱
2. "블록 단위" 추출:
   - HEADER_BLOCK = 계정/과목 헤더 문단(들)  ← {{계정명}}/{{과목명}} 포함 영역
   - TABLE_BLOCK  = <hp:tbl …>…</hp:tbl>     (헤더2행 + 데이터행1)
   - DATA_TR      = TABLE_BLOCK 내 데이터 <hp:tr> (마지막 tr)
3. for each group in model.groups:
     a. headerXml = HEADER_BLOCK 치환({{계정명}},{{과목명}})
     b. rowsXml = group.rows.map((row,i) =>
            DATA_TR 복제 → cellAddr rowAddr 를 (2 + i) 로 치환 → 셀 텍스트 치환)
        join
     c. tableXml = TABLE_BLOCK 에서
            - rowCnt = 2 + group.rows.length 로 치환
            - 기존 DATA_TR 1개를 rowsXml 로 치환
            - <hp:tbl id="…"> 의 id 를 그룹별 고유값으로 치환(충돌 방지)
     d. groupXml = headerXml + tableXml (+ 그룹 간 간격 문단)
4. section0.xml 의 원본 (HEADER_BLOCK+TABLE_BLOCK) 위치를 모든 groupXml 연결로 치환
5. mimetype STORED 보장 재패키징(기존 generate 와 동일) → bytes
```

### 6.3 ID·구조 무결성 규칙

- **tbl id**: 표마다 고유 정수 필요 → 기준 id에 그룹 인덱스 오프셋(예: `baseId + idx`). 한글에서 동일 id 표 2개면 손상 위험.
- **cellAddr rowAddr**: 데이터행 복제 시 0-기반 행 인덱스를 헤더 행수(2) + i 로 설정. colAddr는 셀 순서 유지.
- **p id=0**: 그대로 둠(템플릿이 이미 0, 한글 허용).
- **borderFillIDRef / cellSz / 문단 prop**: 템플릿 DATA_TR 값을 그대로 복제(스타일 보존).
- 검증: 생성 후 한글 실오픈 + zip 엔트리/`section0.xml` well-formed(XML 파서) 체크.

### 6.4 셀 값 매핑 규칙

| 셀 | 소스 | 변환 |
|----|------|------|
| 연월일 | acc_date(YYYYMMDD) | `YYYY/M/D` (앞 0 제거, CLAUDE.md 날짜 규칙) |
| 내역 | content | escapeXml |
| 수입금회 | acc_amt | `toLocaleString` 콤마 |
| 수입누계 | 그룹 내 누적합 | 콤마 |
| 지출금회/누계 | — | `""`(공란) |
| 잔액 | 수입누계 | 콤마 |
| 성명 | customer.name | 익명/-999 → "생략" 또는 공란 |
| 생년월일 | customer.reg_num | 6/13자리 주민 → 앞6 `YY/MM/DD`, `XXX-XX-XXXXX` 사업자 → 유지, else 공란 |
| 주소 | addr + addr_detail | join(" ") |
| 직업 | job | — |
| 전화 | tel | — |
| 영수증 | rcp_no | `?? ""` |

---

## 7. Edge Cases & Decisions

| 케이스 | 처리 |
|--------|------|
| 수입 0건 | 빈 표 1개(데이터행 0) 양식 반환 + UI 사전 안내. (404 대신 빈 양식 권장) |
| 특정 그룹 0건 | 그룹 자체 생략(빈 그룹 미생성) |
| customer null / 익명(-999) | 성명="생략"/공란, 상세 셀 공란 (오류 없이 생성) |
| reg_num 형식 불명 | 생년월일 셀 공란 |
| 대량 행(수백) | 표가 페이지 경계 침범 가능 → repeatHeader 유지, 실측 검증(NFR) |
| 지출 데이터 | 범위 외 — 지출 컬럼 공란 유지(양식 보존) |

---

## 8. 구현 순서 (Do 단계 체크리스트)

1. `lib/hwpx/income-ledger-builder.ts` + 테스트 — 그룹핑/정렬/누계/셀 매핑(순수)
2. `lib/hwpx/owpml-table.ts` + 테스트 — 표/행 복제·치환·rowCnt·tbl id·rowAddr
3. `public/hwpx-templates/form-7-fill.hwpx` 제작 + `_token-manifest`/토큰 정합 테스트
4. `app/api/hwpx/income-ledger/route.ts` — 조회(acc_book+customer 상세, codevalue)·빌드·렌더
5. `lib/hwpx/form-fields.ts` — form-7 def에 `dataFill` 메타 + 타입 확장
6. `components/submission-forms/FormInputPanel.tsx` — dataFill 분기 UI
7. 실데이터(org 9, 수입 18,099,055원) 생성 → 한글 실오픈 + 합계 대조
8. CLAUDE.md `lib/hwpx/` 설명 갱신

---

## 9. Test Strategy

| 레벨 | 대상 | 검증 |
|------|------|------|
| 단위 | income-ledger-builder | 그룹핑·정렬·누계·잔액·날짜/생년월일 변환·익명 처리 |
| 단위 | owpml-table | rowCnt 갱신, rowAddr 증가, tbl id 고유, 토큰 치환, XML well-formed |
| 정합 | form-7-fill 토큰 | 템플릿 토큰 ↔ 빌더 출력 키 1:1 (빌드타임) |
| 통합 | route | mock 조회 → 200 + hwp+zip 헤더 + unresolved 토큰 0 |
| 수동 | 실데이터 | 한글 실오픈 무손상 + 수입 합계 = 수입내역관리 합계 |

---

## 10. Risks (Plan 위험 대비 설계 반영)

| Plan Risk | 설계 대응 |
|-----------|-----------|
| OWPML 행 복제 ID 충돌 | p id=0(충돌 없음 확인) + tbl id 그룹별 오프셋 + XML well-formed 테스트 + 실오픈 |
| 누계/잔액 기준 불명확 | form-7 예시 역분석으로 확정(잔액=수입누계) §1.3 |
| customer 미조인 | 전용 라우트 상세 조인 + 안전 기본값 §6.4·§7 |
| 기존 서식 회귀 | generateHwpx 불변, 별도 빌더/라우트/템플릿 |

---

## 11. Next Step

→ `/pdca do income-account-ledger-hwpx` (구현 순서 §8 따름) — builder/owpml-table 순수 함수부터 TDD.
