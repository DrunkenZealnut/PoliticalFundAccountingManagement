# DB Export & 일괄등록 코드 매핑 결함 수정 계획 (db-export-fix)

## Executive Summary

| 항목 | 내용 |
|---|---|
| Feature | db-export-fix |
| 시작일 | 2026-05-14 |
| 예상 기간 | 1~2일 (Starter 규모) |
| 영향 범위 | `batch-import` UI, `/api/acc-book` (batch_insert), `/api/system/export-sqlite`, Supabase `organ` 데이터 |

### Value Delivered (4-Perspective)

| Perspective | 내용 |
|---|---|
| **Problem** | 일괄등록 시 계정/과목 한글명이 코드 ID로 매핑되지 않아 `acc_book.acc_sec_cd=0, item_sec_cd=0`으로 저장됨. 그 결과 (a) batch_insert가 FK 위반으로 일부 실패하거나 (b) export-sqlite로 만든 `.db`를 윈도우 선관위 프로그램에서 복구하면 `NOT NULL FK REFERENCES CODEVALUE(CV_ID)` 위반으로 거부됨. ORGAN 출력도 ORG_ID/ORG_NAME 불일치로 "기관명 [ ]" 다이얼로그 발생. |
| **Solution** | (1) `batch-import` 페이지가 `_account`/`_subject` 한글명을 `ACC_REL` 매핑으로 정상 코드 ID로 변환. (2) `export-sqlite` 라우트가 Fund_Master.db와 동일한 스키마/누락 테이블/`info` 형식을 출력하고 ORGAN 행을 후보자+후원회 2행으로 보장. (3) Supabase `organ` 데이터 정합성 보정 (후원회 행의 `org_name` + 후보자 행 추가). |
| **Function/UX Effect** | 일괄등록 → 저장 시 더 이상 FK 오류 없이 36건 100% 저장. 자체분 .db 다운로드 → 선관위 윈도우 프로그램의 [자료 복구]에서 다이얼로그 없이 바로 인식. 사용자가 매번 직접 패치할 필요가 사라짐. |
| **Core Value** | 정치자금 회계 데이터가 **선관위 제출 가능한 형식**으로 보장됨. 회계관리 워크플로우의 마지막 단계(제출용 백업 파일 생성)가 신뢰성을 가짐. |

---

## 개요

후원회 일괄등록 → DB 자체분 .db 생성 → 선관위 프로그램 복구의 전체 파이프라인에서 발생하는 데이터 호환성 결함을 일괄 수정한다. 이번 세션에서 발견한 진단 결과를 근거로 한다 (이전 대화 컨텍스트, `data/오준석후보(자체분) (2).db` vs `data/Fund_Master.db` 비교 결과).

## 핵심 문제 (3가지)

### 문제 1: 일괄등록 시 코드 ID가 0으로 저장됨 (가장 치명적)

**현재 동작** (`app/src/app/dashboard/batch-import/page.tsx:199-224`):
```ts
const rows = parsed.map((row) => ({
  org_id: orgId,
  incm_sec_cd: incmSecCd,
  acc_sec_cd: 0,    // ← 하드코딩
  item_sec_cd: 0,   // ← 하드코딩
  exp_sec_cd: 0,    // ← 하드코딩
  ...
  _account: row.account,    // "수입" — API에서 무시
  _subject: row.subject,    // "기명후원금" — API에서 무시
}));
```

**API 측** (`app/src/app/api/acc-book/route.ts:200-205`): `_`-prefixed 필드를 사용하지 않고 모두 삭제한 뒤 그대로 insert.

**결과**:
- Supabase `acc_book`에 acc_sec_cd=0, item_sec_cd=0 저장
- export-sqlite로 .db 생성 시 그대로 export
- 윈도우 선관위 프로그램의 ACC_BOOK 스키마는 `NOT NULL CONSTRAINT REFERENCES CODEVALUE(CV_ID)` — 0은 CODEVALUE에 존재하지 않아 복구 실패

**정상값 (Fund_Master 기준)**:
- 후원회(`ORG_SEC_CD=109`) + 수입(`INCM_SEC_CD=1`) + 기명후원금
- → `ACC_SEC_CD=1`, `ITEM_SEC_CD=94`, `EXP_SEC_CD=0`
- 출처: `ACC_REL` 테이블의 `ACC_REL_ID=518`

### 문제 2: export-sqlite 출력이 선관위 스키마와 다름

**현재 결함** (`app/src/app/api/system/export-sqlite/route.ts:80-171`):

| 항목 | 우리 출력 | Fund_Master |
|---|---|---|
| `info` 스키마 | `(name TEXT, value TEXT)` | `(no INTEGER PK, name VARCHAR(10), number VARCHAR(10))` |
| `info` 데이터 | version, export_date 메타 | 비어있음 (사용 안 함) |
| 컬럼 제약 | 모두 nullable TEXT | NOT NULL, FK, VARCHAR(N) 명시 |
| 누락 테이블 | — | `ACC_REL2`(482행), `CODESETTEMP`, `CODEVALUETEMP`, `CUSTOMERTEMP`, `TEST` |
| ORGAN 출력 행 수 | 1행 (사용자 orgId만) | 2행 (후보자 + 후원회) |
| page_size | 4096 (sql.js 기본) | 1024 |

### 문제 3: ORGAN 데이터 정합성

**Supabase `organ` 현황** (사용자 환경):
- 1개 행만 존재: `org_id=11, org_sec_cd=109(후원회), org_name="오준석후보"` ← 후원회인데 후보자 이름

**Fund_Master 정상 형태**:
- `ORG_ID=1, ORG_SEC_CD=90(후보자), ORG_NAME="오준석후보", REG_NUM=19850228`
- `ORG_ID=2, ORG_SEC_CD=109(후원회), ORG_NAME="동대문구라선거구구의회의원후보자오준석후원회", REG_NUM=2348261566`

**결과**: 선관위 프로그램이 백업 파일에서 후원회 기관명을 찾을 때 매칭 실패 → "기관명 [ ]" 다이얼로그.

---

## 구현 범위

### 1. `batch-import` 페이지 코드 매핑 (Priority 1)

**파일**: `app/src/app/dashboard/batch-import/page.tsx`

**변경**:
- `useCodeValues()` hook으로 `acc_rel` 데이터 로드
- 저장 직전 각 row에 대해 `(orgSecCd, incmSecCd, account, subject)` → `(acc_sec_cd, item_sec_cd)` 매핑 함수 호출
- 매핑 실패 시 검증 단계에서 형식 오류로 표시 ("계정/과목 매핑 실패: ...")
- API 전송 payload에서 `acc_sec_cd: 0` 하드코딩 제거

**매핑 함수 의사코드**:
```ts
function mapAccountCodes(orgSecCd, incmSecCd, accountName, subjectName) {
  // 1. account name → CV_ID (총괄계정 CS_ID=1 또는 후원회계정 CS_ID=12)
  // 2. subject name → CV_ID (계정과목 CS_ID=3 또는 후원회과목 CS_ID=12)
  // 3. ACC_REL 조회: ORG_SEC_CD + INCM_SEC_CD + ACC_SEC_CD + ITEM_SEC_CD + INPUT_YN='Y'
  // 4. 일치하는 row 1건 반환, 없으면 throw
}
```

### 2. `/api/acc-book` batch_insert 보강 (Priority 1)

**파일**: `app/src/app/api/acc-book/route.ts:148-211`

**변경**:
- 클라이언트가 잘못된 코드를 보낸 경우의 백엔드 안전망: `acc_sec_cd=0` row를 발견하면 `_account`/`_subject` 기반으로 서버에서도 매핑 시도
- 매핑 실패 row는 failed로 분리하고 에러 메시지 명시

### 3. `export-sqlite` 스키마 정합성 (Priority 1)

**파일**: `app/src/app/api/system/export-sqlite/route.ts`

**변경**:
- `SQLITE_DDL` 상수를 Fund_Master 스키마와 동일하게 재작성:
  - NOT NULL, FK, VARCHAR(N) 명시
  - 누락 테이블 추가: `ACC_REL2`, `CODESETTEMP`, `CODEVALUETEMP`, `CUSTOMERTEMP`, `TEST`
  - `info` 테이블 스키마 변경: `(no INTEGER PK, name VARCHAR(10), number VARCHAR(10))`
- `ACC_REL2` 데이터를 Fund_Master에서 가져와 정적으로 export (선관위 표준 482행)
  - 옵션: Supabase에 `acc_rel2` 테이블 추가하고 정적 데이터 시드
- ORGAN 출력 시 후원회 1행 + 자동으로 후보자 행 추가 (별도 organ_pair 매핑)
- `db.run("PRAGMA page_size = 1024")` 추가 시도 (sql.js 지원 여부 확인 필요)

**스키마 참조**: 위 분석에서 확인한 Fund_Master.db의 `.schema` 출력 그대로 사용

### 4. ORGAN 데이터 정합성 (Priority 2)

**선택지 A** (즉시): Supabase `organ` 테이블 직접 수정
- 사용자 orgId=11 행의 `org_name`을 정식 후원회 이름으로 갱신
- 후보자 행 신규 추가 (sec_cd=90)

**선택지 B** (장기): organ 페이지에서 "후보자 + 후원회 페어 등록" UX 제공
- `/dashboard/organ` 페이지에 페어 생성 마법사 추가

Priority 2이며 1차 구현에서는 A만 수행.

### 5. ORG_ID 매핑 (Priority 2)

export-sqlite 출력 시:
- Supabase `org_id`(예: 11) → 선관위 표준 `ORG_ID`(후보자=1, 후원회=2)로 자동 변환
- `acc_book.org_id`, `estate.org_id`, `opinion.org_id`, `alarm.org_id` 등 참조도 일괄 변환

---

## 구현 순서

```text
[1] 코드 매핑 유틸 추가  (lib/accounting/code-mapping.ts 신규)
       ↓
[2] batch-import 페이지에 매핑 적용 (검증 단계 + 저장 직전)
       ↓
[3] /api/acc-book batch_insert 백엔드 매핑 안전망
       ↓
[4] 통합 테스트: 2단계_수입내역등록_후원자_260514.xlsx 재업로드 → acc_book에 정상 코드 저장 확인
       ↓
[5] export-sqlite DDL/누락 테이블/info/ORG_ID 매핑 수정
       ↓
[6] Supabase organ 데이터 정합성 보정 (SQL 마이그레이션)
       ↓
[7] E2E 검증: 자체분 .db 다운로드 → 선관위 프로그램에서 복구 시도
```

---

## 영향받는 파일

| 파일 | 변경 종류 |
|---|---|
| `app/src/lib/accounting/code-mapping.ts` | 신규 |
| `app/src/app/dashboard/batch-import/page.tsx` | 수정 (매핑 적용) |
| `app/src/app/api/acc-book/route.ts` | 수정 (batch_insert 보강) |
| `app/src/app/api/system/export-sqlite/route.ts` | 대규모 수정 (DDL + 누락 테이블 + ORG_ID 매핑) |
| `app/scripts/009_organ_pair_normalization.sql` | 신규 (Supabase 데이터 보정) |
| `app/scripts/010_acc_rel2_seed.sql` | 신규 (선관위 표준 482행 시드) |

---

## 검증 방법

### 단위 검증
1. **코드 매핑 함수**: ("수입", "기명후원금", 109, 1) → `{ acc_sec_cd: 1, item_sec_cd: 94, exp_sec_cd: 0 }`
2. **batch-import 검증 통과**: `data/2단계_수입내역등록_후원자_260514.xlsx` 업로드 → 검증 0건 → 저장 성공 36건

### 통합 검증
3. **acc_book 코드값 정상**: `SELECT DISTINCT acc_sec_cd, item_sec_cd FROM acc_book WHERE org_id=11` → 모두 1, 94
4. **export 산출물 검증**: `sqlite3 newfile.db ".schema ACC_BOOK"` → Fund_Master와 동일
5. **선관위 프로그램 복구**: 윈도우에서 다이얼로그 없이 정상 인식 + 자료 확인 가능

### 회귀 검증
6. **기존 페이지 영향 없음**: 영수증 자동등록, 마법사 등 다른 입력 경로의 정상 코드 저장이 깨지지 않음
7. **export-sqlite 기존 사용자**: 이전에 export하던 데이터도 새 형식으로 정상 export

---

## 리스크 & 가정

| 항목 | 리스크 | 완화 |
|---|---|---|
| ACC_REL2 시드 | Fund_Master.db 라이선스/저작권 불명 | 선관위 공식 배포 양식이므로 동일 데이터 시드는 허용 가정. 의심 시 사용자 환경의 Fund_Master.db를 일회성 import 도구로 제공 |
| sql.js page_size | sql.js가 1024 page_size를 지원하는지 미확인 | 4096 그대로 사용해도 선관위 프로그램이 읽을 가능성 큼 (실제 호환성 문제는 스키마/FK가 주요). 1차에서는 4096 유지 |
| ORG_ID 변환 | acc_book이 다른 페이지에서 org_id로 조회 | export 시점에만 변환, Supabase 측은 그대로 유지하여 영향 없음 |
| Supabase organ 보정 | 다른 organ을 사용하는 사용자도 있을 수 있음 | 마이그레이션 스크립트는 idempotent + 조건부 (현재 org_name이 후보자 이름인 경우만 갱신) |

---

## 완료 조건 (Definition of Done)

- [ ] 일괄등록 후 `acc_book.acc_sec_cd != 0`, `item_sec_cd != 0` 검증 통과
- [ ] `export-sqlite` 출력 .db의 `ACC_BOOK` 스키마가 Fund_Master와 동일 (FK 포함)
- [ ] 출력 .db에 `ACC_REL2`, `CODESETTEMP`, `CODEVALUETEMP`, `CUSTOMERTEMP`, `TEST` 테이블 존재
- [ ] 출력 .db의 `ORGAN`에 후보자(SEC=90) + 후원회(SEC=109) 두 행 존재
- [ ] 출력 .db의 `info` 스키마가 `(no, name, number)`
- [ ] 윈도우 선관위 프로그램에서 [자료 복구] 시 기관명 다이얼로그 없이 정상 인식
- [ ] 회귀: 기존 페이지(영수증 자동등록, 마법사)의 acc_book 입력이 정상 코드 저장 유지
