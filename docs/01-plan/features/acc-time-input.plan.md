# 수입·지출 거래 시각(분 단위) 입력 (acc-time-input) Planning Document

> **Summary**: 수입·지출·수기입력 폼에서 거래일자에 분(分) 단위 시각까지 입력 가능하게 한다. 시각은 `acc_book.acc_time`(HHmm) 별도 컬럼에 저장하고, `acc_date`(YYYYMMDD)는 그대로 두어 선관위 PFund2/SQLite export 호환을 유지한다. 목록 표시는 기존과 동일하게 날짜(YYYY-MM-DD)까지만 보여준다.
>
> **Project**: PoliticalFundAccountingManagement
> **Author**: Claude
> **Date**: 2026-06-09
> **Status**: Draft
> **Related**: `acc_book` 스키마, income/expense/document-register 페이지, acc-book API

---

## Executive Summary

| 항목 | 내용 |
|---|---|
| Feature | acc-time-input |
| 시작일 | 2026-06-09 |
| 예상 기간 | 1~2일 (마이그레이션 0.5일 + 입력폼 3곳 0.5일 + 정렬/테스트 0.5일) |
| 영향 범위 | `scripts/0NN_add_acc_time.sql`(신규) · `types/database.ts` · income/expense/document-register 페이지 · `api/acc-book`(정렬·통과) — 목록 표시·Excel·SQLite export는 **무변경** |

### Value Delivered (4-Perspective)

| Perspective | 내용 |
|---|---|
| **Problem** | 현재 거래일자는 `acc_date CHAR(8)`(YYYYMMDD)로 날짜 단위만 기록된다. 같은 날 여러 건의 수입·지출이 발생하면 정확한 거래 시각을 남길 수 없어, 거래 순서·감사 추적·실제 발생시각 기록이 불가능하다. 사용자는 분 단위까지 입력할 수 있기를 원한다. |
| **Solution** | `acc_date`는 건드리지 않고 `acc_time CHAR(4)`(HHmm, NULL 허용) 컬럼을 신규 추가한다. 수입·지출·수기입력 폼에 **선택 입력**인 시각 필드(`<input type="time">`)를 추가하고, 저장 시 `acc_time`에 분 단위 시각을 기록한다. 목록은 기존처럼 `acc_date`만 표시한다. |
| **Function/UX Effect** | 입력 화면: 날짜(필수) + 시각(선택) 한 줄. 시각을 비우면 기존과 동일하게 날짜만 저장. 같은 날짜 내 정렬은 `acc_date → acc_time → acc_sort_num` 순으로 시각 입력 건이 시간순 정렬된다. 목록·보고서·Excel은 화면 변화 없음(날짜만). |
| **Core Value** | "**선관위 호환을 깨지 않으면서 거래 시각 정밀도 확보**". 별도 컬럼 전략으로 PFund2/SQLite export(ACC_DATE CHAR(8))와 기존 목록·정렬·필터 로직을 그대로 유지하면서, 분 단위 거래 시각이라는 새 데이터 차원을 추가한다. 마이그레이션은 additive·nullable이라 롤백 안전. |

---

## 1. Overview

### 1.1 Purpose

수입·지출 내역의 거래일자에 분 단위 시각까지 입력·저장할 수 있게 한다. 단, 목록 표시는 기존처럼 날짜(YYYY-MM-DD)까지만 노출한다.

### 1.2 Background

#### 현재 날짜 처리 흐름 (Explore 조사 결과)

- **컬럼**: `acc_book.acc_date` — `CHAR(8)`, `YYYYMMDD` 문자열 (`scripts/001_create_tables.sql:138`, `types/database.ts:170`)
- **입력**: 수입/지출/수기입력 모두 `<input type="date">` → 저장 시 `replace(/-/g, "")`로 YYYYMMDD 변환
  - `income/page.tsx:520-523, :241`
  - `expense/page.tsx:738-740, :382`
  - `document-register/page.tsx:286-287, :189`
- **목록 표시**: 각 페이지의 `formatDate`/`fmtDate`가 `slice()`로 YYYY-MM-DD 변환 (`income:389-393, :709` / `expense:506-509, :950`)
- **정렬**: `api/acc-book/route.ts:62-63` — `.order("acc_date") .order("acc_sort_num")`
- **Export**: Excel(`excel/export:35-38`)·SQLite(`export-sqlite:96-121`, ACC_DATE CHAR(8))는 모두 YYYYMMDD 기반

#### 설계 결정 (사용자 확정)

| 결정 항목 | 선택 | 근거 |
|---|---|---|
| 시각 저장 위치 | **`acc_time` 별도 컬럼 추가** | `acc_date` CHAR(8) 유지 → 선관위 PFund2/SQLite export 호환, 목록·정렬·필터 영향 최소 |
| 적용 범위 | **수입·지출·수기입력 모두** | 요청 "수입과 지출내역" 전체 반영 |
| 시각 입력 필수 여부 | **선택 입력 (NULL 허용)** | 기존 데이터 무손실, 마이그레이션 안전 |

### 1.3 Related Documents

| 문서 | 관련성 |
|---|---|
| `app/scripts/001_create_tables.sql` | `acc_book.acc_date CHAR(8)` 정의 — 본 작업은 여기에 컬럼 추가 |
| `app/src/types/database.ts:170` | acc_book 타입 — `acc_time` 추가 대상 |
| `app/src/app/dashboard/{income,expense,document-register}/page.tsx` | 입력폼 3곳 |
| `app/src/app/api/acc-book/route.ts` | insert/update/batch_insert + 정렬 |
| CLAUDE.md "DB Schema Gotcha" / "SQLite Export" | 날짜 YYYYMMDD 규칙 · ACC_DATE CHAR(8) 호환 제약 |

---

## 2. Scope

### 2.1 In Scope

- `acc_book` 테이블에 `acc_time CHAR(4)` NULL 컬럼 추가 (마이그레이션 SQL, Supabase SQL 에디터 수동 적용)
- `acc_book_bak` 백업 테이블에도 동일 컬럼 추가 (백업/복구 정합)
- `types/database.ts`의 acc_book 타입에 `acc_time: string | null`
- 입력폼 3곳(income / expense / document-register)에 **시각 선택 입력 필드** 추가
  - 저장: 시각 입력값 `HH:mm` → `HHmm`(콜론 제거), 미입력 시 `null`
  - 편집(기존 행 선택) 시: `acc_time`(HHmm) → `HH:mm` 역변환하여 폼에 채움
- `api/acc-book` 정렬에 `acc_time` 추가 (`acc_date → acc_time → acc_sort_num`); insert/update/batch에서 `acc_time` 통과 보장
- (선택) 수입·지출 입력폼 단건 조회/수정 경로에서 `acc_time` round-trip 검증

### 2.2 Out of Scope

- **목록·테이블 표시 변경 없음** — 기존처럼 날짜(YYYY-MM-DD)까지만 표시 (요구사항)
- **Excel export / 보고서 출력 변경 없음** — 선관위 서식은 날짜 기준
- **SQLite/PFund2 export·import 포맷 변경 없음** — ACC_DATE CHAR(8) 유지 (단 §5 제약 참조)
- 초 단위(ss) 입력 — 분 단위까지만
- 기존 데이터 일괄 시각 채우기(백필) — 불필요(선택 입력)

---

## 3. Functional Requirements

| ID | 요구사항 | 우선순위 |
|---|---|---|
| FR-01 | `acc_book`에 `acc_time CHAR(4)` NULL 컬럼 추가 (HHmm) | High |
| FR-02 | 수입 입력폼에 시각(선택) 입력 필드 추가, 저장/편집 round-trip | High |
| FR-03 | 지출 입력폼에 시각(선택) 입력 필드 추가, 저장/편집 round-trip | High |
| FR-04 | 수기입력(document-register)에 시각(선택) 입력 필드 추가 | High |
| FR-05 | 목록 표시는 기존과 동일(날짜까지만) — 회귀 없음 | High |
| FR-06 | 같은 날짜 내 시각순 정렬 (`acc_date→acc_time→acc_sort_num`) | Medium |
| FR-07 | 시각 미입력 건은 NULL 저장, 기존 데이터 정상 동작 | High |
| FR-08 | `acc_book_bak` 동기 컬럼 추가 — 백업/복구 정합 | Medium |

---

## 4. Non-Functional Requirements

- **호환성**: 선관위 PFund2/SQLite export(ACC_DATE CHAR(8)) 무변경, 기존 목록/필터/정렬/Excel 회귀 0건
- **마이그레이션 안전성**: additive + nullable + 기본 NULL → 롤백 가능, 기존 행 영향 없음
- **일관성**: 시각 입출력 변환(HHmm↔HH:mm)을 공용 헬퍼로 두어 3개 페이지 중복 방지 고려 (design 단계 판단)
- **테스트**: 변환 헬퍼 단위테스트(HHmm↔HH:mm, 빈값/경계 0000·2359), 정렬 순서 테스트

---

## 5. Risks & Constraints

| 항목 | 내용 | 대응 |
|---|---|---|
| 마이그레이션 수동 적용 | DDL은 Supabase SQL 에디터에서 수동 실행 필요 (REST 서비스롤로 DDL 불가) | `scripts/0NN_*.sql`로 작성 후 배포 전 수동 적용 안내 |
| PFund2 round-trip 시 시각 손실 | PFund2 .db에는 시각 컬럼 없음 → export→import 왕복 시 `acc_time` 유실 | **알려진 제약**으로 명시. 선관위 호환 우선, 시각은 본 시스템 내부 데이터로 취급 |
| 입력 UI 방식 | `datetime-local`은 날짜 비우면 시각도 못 넣음 → 선택 입력과 상충 | **date(필수) + time(선택) 분리** 방식 채택 (design에서 확정) |
| `acc_time` 형식 검증 | 잘못된 시각 문자열 저장 방지 | 입력은 `<input type="time">`로 형식 보장 + 저장 전 정규화 |

---

## 6. Implementation Phases (개요)

1. **DB**: `scripts/0NN_add_acc_time.sql` (acc_book + acc_book_bak에 `acc_time CHAR(4) NULL`), `types/database.ts` 타입 추가
2. **입력폼**: income → expense → document-register 순으로 시각 필드 + 저장/편집 변환 추가
3. **API**: 정렬에 acc_time 반영, insert/update/batch 통과 확인
4. **테스트**: 변환 헬퍼·정렬 단위테스트, 목록 무변경 회귀 확인
5. **Check**: gap 분석 → 90%+ 시 report

---

## 7. Success Criteria

- 수입·지출·수기입력 3곳에서 분 단위 시각 입력·저장·재편집이 정상 동작
- 시각 미입력 건과 기존 데이터가 오류 없이 동작
- 목록·Excel·SQLite export 화면/출력 회귀 0건
- 같은 날짜 내 시각순 정렬 동작 (FR-06)
- 변환 헬퍼·정렬 테스트 통과, lint·build 성공
