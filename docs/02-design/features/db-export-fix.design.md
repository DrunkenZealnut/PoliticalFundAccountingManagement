# DB Export & 일괄등록 코드 매핑 결함 수정 — Design Document

> Plan: `docs/01-plan/features/db-export-fix.plan.md`

## 0. 설계 결정 요약 (Plan 의문점 해소)

| 의문점 | 결정 | 근거 |
|---|---|---|
| ACC_REL2 시드 라이선스 | **선관위 표준 데이터로 간주, JSON 시드로 번들** | Fund_Master.db는 선관위가 무료 배포한 프로그램의 일부로, 482행은 사용자별 비밀 데이터가 아닌 공개 매핑 데이터. JSON으로 추출해 `app/src/lib/sqlite-seed/acc_rel2.json` 번들 |
| sql.js page_size | **4096 유지 (1024 변경 안 함)** | sql.js는 페이지 사이즈 PRAGMA를 지원하지만 SQLite는 양방향 호환됨. 1024는 성능상 불리. 실제 호환성 차단 요인은 스키마/FK이며 page_size 변경 없이 해결 가능 |
| ORG_ID 변환 무결성 | **export 시점에만 변환, 메모리 매핑 테이블로 일괄 처리** | Supabase 측 `org_id` 보존, export 라우트 내부에서 `(supabaseOrgId → exportOrgId)` 매핑을 만들어 `acc_book`, `customer_addr` 등 모든 FK를 변환 |
| 후보자 ORGAN 행이 없는 경우 | **export 시점에 자동 생성** | 후원회 organ만 있을 때 후보자 행을 ACCT_NAME에서 추출해 별도 가상 row 생성 (ORG_SEC_CD=90) |

---

## 1. 아키텍처 개요

```text
┌─────────────────────────────────────────────────────────────────┐
│ Batch Import Page                                               │
│   ┌─────────────┐    ┌─────────────────────┐    ┌────────────┐ │
│   │ XLSX Parse  │ ─→ │ resolveAccountCodes │ ─→ │ Save POST  │ │
│   └─────────────┘    └─────────────────────┘    └─────┬──────┘ │
│                              (NEW)                    │        │
└───────────────────────────────────────────────────────┼────────┘
                                                       ▼
┌─────────────────────────────────────────────────────────────────┐
│ POST /api/acc-book  action=batch_insert                         │
│   ┌──────────────────────┐    ┌─────────────────────────┐      │
│   │ Customer Match/Create│ ─→ │ Server-side code mapping│      │
│   └──────────────────────┘    │ (safety net: if 0)      │      │
│                                └─────────────────────────┘      │
└─────────────────────────────────────────────────────────────────┘
                                                       │
                                                       ▼
                                                  acc_book (정상 코드 저장)
                                                       │
─────────────────────────────────────────────────────  │  ─────────
                                                       ▼
┌─────────────────────────────────────────────────────────────────┐
│ GET /api/system/export-sqlite                                   │
│   ┌──────────┐  ┌────────────┐  ┌─────────────┐  ┌───────────┐ │
│   │ Fetch    │→ │ Org Mapper │→ │ Pair Builder│→ │ SQLite DB │ │
│   │ Supabase │  │ (id remap) │  │ (후보자추가) │  │  (Fund_   │ │
│   └──────────┘  └────────────┘  └─────────────┘  │  Master   │ │
│                                                  │  스키마)  │ │
│   ┌─────────────────────────────────────────┐    └───────────┘ │
│   │ Seed: ACC_REL2, CODESETTEMP, TEST...    │                  │
│   └─────────────────────────────────────────┘                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. 코드 매핑 모듈 (신규)

### 2.1 파일: `app/src/lib/accounting/code-mapping.ts`

**역할**: account/subject 한글명 → SQLite CV_ID 변환. 클라이언트/서버 양쪽에서 사용.

### 2.2 인터페이스

```ts
export interface AccountCodes {
  acc_sec_cd: number;   // CV_ID (총괄계정/후원회계정/후보자계정)
  item_sec_cd: number;  // CV_ID (계정과목/후원회과목/후보자과목)
  exp_sec_cd: number;   // 경비구분 (수입은 0, 지출 일부에서 사용)
}

export interface CodeMappingContext {
  orgSecCd: number;      // 91, 92, 109, 587, 588, ...
  incmSecCd: number;     // 1=수입, 2=지출
}

export class CodeMappingError extends Error {
  constructor(
    public readonly account: string,
    public readonly subject: string,
    public readonly context: CodeMappingContext,
  ) {
    super(`코드 매핑 실패: 계정="${account}", 과목="${subject}", orgSec=${context.orgSecCd}, incm=${context.incmSecCd}`);
  }
}

/** account/subject 이름과 organ 컨텍스트로 SQLite 코드 ID 매핑 */
export function resolveAccountCodes(
  accountName: string,
  subjectName: string,
  context: CodeMappingContext,
  codeValues: CodeValue[],   // useCodeValues()에서 가져온 캐시
  accRel: AccRel[],          // useCodeValues()에서 가져온 캐시
): AccountCodes;
```

### 2.3 매핑 알고리즘

```text
1. codeValues에서 name === accountName인 CV 찾기
   - 후원회 계정(CS_ID=12)에는 "수입"/"지출" 직접 없음. 대신 총괄계정(CS_ID=1)의
     "수입"(CV_ID=1)/"지출"(CV_ID=2)을 ACC_SEC_CD로 사용.
   - 후보자 계정(CS_ID=10)도 동일.
   - 일치하는 CV가 여러 CS_ID에 걸쳐 있을 수 있음 → 우선순위: 1(총괄) > 2(계정구분) > 10/11/12
2. codeValues에서 name === subjectName인 CV 찾기
   - 후원회: CS_ID=12, 후보자: CS_ID=11, 그 외: CS_ID=3
3. accRel에서 (orgSecCd, incmSecCd, acc_sec_cd, item_sec_cd, input_yn='Y')에
   일치하는 행 찾기
   - 일치하면 그 행의 exp_sec_cd 사용
   - 0건이면 CodeMappingError throw
   - 2건 이상이면 acc_order 작은 것 우선
```

### 2.4 단위 테스트 케이스

| 입력 | 예상 출력 |
|---|---|
| ("수입", "기명후원금", {109, 1}) | {1, 94, 0} |
| ("수입", "익명후원금", {109, 1}) | {1, 95, 0} |
| ("지출", "기부금", {109, 2}) | {2, 97, 0} |
| ("수입", "기명후원금", {91, 1}) | {1, ??(후보자과목)} |
| ("수입", "존재하지않음", {109, 1}) | CodeMappingError throw |

테스트 파일: `app/src/lib/accounting/code-mapping.test.ts` (Vitest)

---

## 3. Batch Import 페이지 변경

### 3.1 파일: `app/src/app/dashboard/batch-import/page.tsx`

### 3.2 변경 지점

**3.2.1 hook 추가** (line 64 근처):
```ts
const { orgId, orgType, orgSecCd } = useAuth();  // orgSecCd 추가
const { codeValues, accRel } = useCodeValues();  // accRel 추가 필요
```

**3.2.2 검증 로직 확장** (line 138~186):
```ts
function handleValidate() {
  const reqErrs: ErrorRow[] = [];
  const fmtErrs: ErrorRow[] = [];

  for (const row of parsed) {
    // ... 기존 필수/형식 검증 ...

    // [NEW] 코드 매핑 가능 여부 검증
    if (row.account && row.subject) {
      try {
        resolveAccountCodes(row.account, row.subject,
          { orgSecCd, incmSecCd: isExpense ? 2 : 1 },
          codeValues, accRel);
      } catch (e) {
        if (e instanceof CodeMappingError) {
          fmtErrs.push({ ...row, errorType: "format",
            error: `계정/과목 매핑 실패: '${row.account}/${row.subject}' (코드값 없음)` });
        }
      }
    }
  }
  // ...
}
```

**3.2.3 저장 로직에서 매핑 적용** (line 189~244):
```ts
async function handleSave() {
  // ...
  const rows = parsed.map((row) => {
    const dateStr = row.date.replace(/[.\-\/]/g, "").slice(0, 8);

    // [CHANGED] 0 하드코딩 제거 → 매핑
    const codes = resolveAccountCodes(row.account, row.subject,
      { orgSecCd, incmSecCd }, codeValues, accRel);

    return {
      org_id: orgId,
      incm_sec_cd: incmSecCd,
      acc_sec_cd: codes.acc_sec_cd,       // [WAS] 0
      item_sec_cd: codes.item_sec_cd,     // [WAS] 0
      exp_sec_cd: codes.exp_sec_cd,       // [WAS] 0
      acc_date: dateStr,
      // ... 기존과 동일 ...
    };
  });
  // ...
}
```

### 3.3 useCodeValues() hook 보강

**파일**: `app/src/hooks/use-code-values.ts`

`accRel` 데이터를 함께 fetch하여 노출:
- 현재: codes만 반환
- 변경: `{ codeValues, accRel, getName, getAccounts, getItems }`
- `/api/codes` route도 acc_rel 동시 반환하도록 수정

---

## 4. /api/acc-book batch_insert 백엔드 안전망

### 4.1 파일: `app/src/app/api/acc-book/route.ts:148-211`

### 4.2 변경 사항

```ts
if (action === "batch_insert") {
  const { rows } = payload;

  // [NEW] codeValues/accRel 일괄 로드 (요청당 1회)
  const { data: codeValues } = await supabase.from("codevalue").select("*");
  const { data: accRel } = await supabase.from("acc_rel").select("*");

  // [NEW] organ 정보 로드 (orgSecCd 조회)
  const orgIds = [...new Set(rows.map(r => r.org_id))];
  const { data: organs } = await supabase.from("organ").select("org_id, org_sec_cd").in("org_id", orgIds);
  const orgSecMap = new Map(organs.map(o => [o.org_id, o.org_sec_cd]));

  for (const row of rows) {
    // [NEW] 안전망: acc_sec_cd=0이면 _account/_subject로 매핑 시도
    if (row.acc_sec_cd === 0 && row._account && row._subject) {
      try {
        const codes = resolveAccountCodes(
          row._account, row._subject,
          { orgSecCd: orgSecMap.get(row.org_id), incmSecCd: row.incm_sec_cd },
          codeValues, accRel,
        );
        row.acc_sec_cd = codes.acc_sec_cd;
        row.item_sec_cd = codes.item_sec_cd;
        row.exp_sec_cd = codes.exp_sec_cd;
      } catch (e) {
        errors.push(`row ${row._account}/${row._subject}: 코드 매핑 실패`);
        continue;
      }
    }
    // ... 기존 customer match/insert 로직 ...
    // ... 기존 _-prefix 제거 후 insert ...
  }
}
```

목적: 구버전 클라이언트가 acc_sec_cd=0을 보내도 서버에서 자동 교정.

---

## 5. export-sqlite 대규모 재작성

### 5.1 파일: `app/src/app/api/system/export-sqlite/route.ts`

### 5.2 DDL 전면 교체 (Fund_Master.db 스키마와 동일)

**핵심 변경**:
- `[ORGAN]`, `[CUSTOMER]`, `[ACC_BOOK]` 등 대괄호 식별자 + NOT NULL + FK + VARCHAR(N) 명시
- `[info]` 스키마: `(no INTEGER PK, name VARCHAR(10), number VARCHAR(10))`
- 추가 테이블: `ACC_REL2`, `CODESETTEMP`, `CODEVALUETEMP`, `CUSTOMERTEMP`, `TEST`

**DDL 코드**:
```ts
const SQLITE_DDL = `
-- 메인 테이블 (Fund_Master와 동일)
CREATE TABLE [ORGAN] (
  [ORG_ID] INTEGER NOT NULL PRIMARY KEY,
  [ORG_SEC_CD] INTEGER NOT NULL CONSTRAINT [ORGAN_FK1] REFERENCES [CODEVALUE]([CV_ID]),
  [ORG_NAME] varchar(100) NOT NULL,
  [REG_NUM] varchar(13) NOT NULL,
  [REG_DATE] Char(8),
  ...
);
CREATE TABLE [ACC_BOOK] (
  [ACC_BOOK_ID] INTEGER NOT NULL PRIMARY KEY,
  [ORG_ID] INTEGER NOT NULL CONSTRAINT [ACC_BOOK_FK1] REFERENCES [ORGAN]([ORG_ID]),
  [INCM_SEC_CD] INTEGER NOT NULL,
  [ACC_SEC_CD] INTEGER NOT NULL,
  [ITEM_SEC_CD] INTEGER NOT NULL,
  [EXP_SEC_CD] INTEGER NOT NULL,
  ...
);
-- ... 13개 테이블 동일 패턴 ...

-- 누락 테이블 추가
CREATE TABLE ACC_REL2 ( ... );    -- 482행 시드 데이터
CREATE TABLE CODESETTEMP ( ... );
CREATE TABLE CODEVALUETEMP ( ... );
CREATE TABLE CUSTOMERTEMP ( TEMPINDEX integer, ... );
CREATE TABLE TEST (AA INTEGER PRIMARY KEY, NAME VARCHAR(20));

-- info 스키마 교체
CREATE TABLE info (
  no INTEGER PRIMARY KEY,
  name VARCHAR(10),
  number VARCHAR(10)
);
`;
```

**전체 DDL은 `Fund_Master.db`의 `.schema` 출력 그대로 사용**. 길이 약 4KB.

### 5.3 ORG_ID 매핑 + 후보자 행 자동 생성

```ts
async function buildOrganRows(supabaseOrgan: SupabaseOrgan): Promise<{
  organRows: ExportOrganRow[];
  orgIdMap: Map<number, number>;   // supabaseOrgId → exportOrgId
}> {
  const orgIdMap = new Map();

  // 후원회(SEC_CD=109 등) row가 input
  const supporter = supabaseOrgan;
  if (supporter.org_sec_cd === 109 /* 등 후원회 코드 */) {
    // 후보자 행 자동 생성 (ORG_ID=1)
    const candidateRow = {
      ORG_ID: 1,
      ORG_SEC_CD: 90,  // (예비)후보자
      ORG_NAME: supporter.acct_name || supporter.rep_name, // 후보자 이름
      REG_NUM: supporter.cand_reg_num || "",  // 후보자 등록번호 (없으면 빈값)
      // ... 기본 메타 ...
    };
    // 후원회 행 (ORG_ID=2)
    const supporterRow = { ...mapSupabaseToExport(supporter), ORG_ID: 2 };
    orgIdMap.set(supporter.org_id, 2);
    return { organRows: [candidateRow, supporterRow], orgIdMap };
  }
  // 후보자(SEC_CD=90, 91, 92 등)만 있는 경우 → 단일 행
  // ...
}
```

### 5.4 acc_book/customer_addr/estate/opinion/alarm 변환

```ts
function remapOrgId<T extends { org_id?: number }>(row: T, orgIdMap: Map<number,number>): T {
  if (row.org_id != null) row.org_id = orgIdMap.get(row.org_id) ?? row.org_id;
  return row;
}

const remappedAccBook = accBook.map(r => remapOrgId(r, orgIdMap));
insertRows(db, "ACC_BOOK", remappedAccBook);
```

### 5.5 ACC_REL2 시드 데이터 처리

**전략**: Fund_Master.db에서 추출한 482행 JSON을 번들로 포함.

**파일 추가**: `app/src/lib/sqlite-seed/acc_rel2.json`
```json
[
  {"ACC_REL_ID":1, "ORG_SEC_CD":91, "INCM_SEC_CD":1, "ACC_SEC_CD":1, "ITEM_SEC_CD":13, "EXP_SEC_CD":0, "INPUT_YN":"Y", "ACC_ORDER":1},
  ...
]
```

**추출 명령** (build 단계 일회성):
```bash
sqlite3 data/Fund_Master.db ".mode json" "SELECT * FROM ACC_REL2;" > app/src/lib/sqlite-seed/acc_rel2.json
```

**export-sqlite 라우트에서 사용**:
```ts
import accRel2Seed from "@/lib/sqlite-seed/acc_rel2.json";
insertRows(db, "ACC_REL2", accRel2Seed);
```

### 5.6 ALARM 데이터 변환

ALARM 테이블에 `ORG_ID` 컬럼이 있으므로 `orgIdMap`으로 변환 필수.

---

## 6. Supabase 데이터 마이그레이션

### 6.1 파일: `app/scripts/009_organ_pair_normalization.sql`

**목적**: 후원회로 등록된 organ 행 중 `org_name`이 후보자 이름으로 잘못 들어간 경우 보정.

```sql
-- 6.1.1: 후원회인데 이름에 "후원회"가 없는 행 식별
SELECT org_id, org_name, acct_name, rep_name
FROM pfam.organ
WHERE org_sec_cd IN (91, 92, 107, 108, 109, 587, 588)
  AND org_name NOT LIKE '%후원회%';

-- 6.1.2: 후원회 이름 보정 (DRY RUN으로 먼저 확인 후 실행)
-- 예: 사용자별 정식 후원회 이름이 acct_name 또는 별도 컬럼에 있다고 가정
-- 자동 일괄 변경은 위험하므로, 수동 검증 후 사용자가 직접 update
-- (스크립트는 SELECT만 제공하고 UPDATE는 주석 처리)
```

**중요**: 후원회 정식 이름은 사용자가 입력해야 정확함. 스크립트는 진단용 SELECT만 제공하고, 실제 UPDATE는 사용자 검토 후.

### 6.2 파일: `app/scripts/010_acc_rel_seed_check.sql` (이름 변경)

**목적**: `acc_rel` 데이터가 Supabase에 충분히 시드되어 있는지 검증. 부족하면 알림.

```sql
-- 후원회용 매핑 9건이 모두 있는지 확인
SELECT COUNT(*) AS expected_9
FROM pfam.acc_rel
WHERE org_sec_cd = 109 AND input_yn = 'Y';
-- 결과가 9 미만이면 acc_rel 시드 부족 → import-sqlite로 Fund_Master에서 복원 필요
```

---

## 7. 데이터 무결성 보장

### 7.1 Customer 무결성

`acc_book.cust_id`가 export-sqlite 시 `CUSTOMER` 테이블에 모두 존재해야 함:
- 현재: `fetchTable("customer")`로 모든 customer fetch
- 보강: `acc_book.cust_id` 중 `customer`에 없는 ID가 있으면 익명 customer (CUST_ID=-999) 또는 placeholder 자동 생성

### 7.2 ORG_SEC_CD가 CODEVALUE에 존재

Fund_Master의 ORGAN_FK1은 `ORG_SEC_CD REFERENCES CODEVALUE(CV_ID)`. export 시 CODEVALUE 데이터가 함께 export되므로 무결성 유지.

---

## 8. 구현 순서 (체크리스트)

- [ ] **8.1** Fund_Master.db에서 ACC_REL2 482행 JSON 추출 → `app/src/lib/sqlite-seed/acc_rel2.json`
- [ ] **8.2** Fund_Master.db에서 누락 테이블의 정확한 DDL 추출 → `app/src/lib/sqlite-seed/ddl.ts`
- [ ] **8.3** `app/src/lib/accounting/code-mapping.ts` 신규 작성 + Vitest 테스트
- [ ] **8.4** `useCodeValues()` hook + `/api/codes` route에 `acc_rel` 추가
- [ ] **8.5** `batch-import/page.tsx` 검증/저장 매핑 적용
- [ ] **8.6** `/api/acc-book` `batch_insert` 백엔드 안전망 추가
- [ ] **8.7** 통합 테스트: `data/2단계_수입내역등록_후원자_260514.xlsx` 재업로드 → acc_book 정상 코드 확인
- [ ] **8.8** `export-sqlite/route.ts` SQLITE_DDL 전면 교체
- [ ] **8.9** `export-sqlite/route.ts`에 ORG_ID 매핑 + 후보자 행 자동 생성 로직 추가
- [ ] **8.10** `export-sqlite/route.ts`에 ACC_REL2 시드 INSERT 추가
- [ ] **8.11** `app/scripts/009_organ_pair_normalization.sql` 신규
- [ ] **8.12** E2E: 자체분 .db 다운로드 → 윈도우 선관위 프로그램 복구 다이얼로그 없이 인식 확인

---

## 9. 테스트 시나리오

### 9.1 단위 테스트

| 테스트 | 입력 | 기대 결과 |
|---|---|---|
| `resolveAccountCodes` | ("수입", "기명후원금", {109,1}) | `{1, 94, 0}` |
| `resolveAccountCodes` | ("지출", "기부금", {109,2}) | `{2, 97, 0}` |
| `resolveAccountCodes` (실패) | ("수입", "유령", {109,1}) | throws `CodeMappingError` |
| `buildOrganRows` (후원회만) | `{org_sec_cd:109, acct_name:"오준석"}` | `[ORG_ID=1 후보자, ORG_ID=2 후원회]` |
| `remapOrgId` | `{org_id:11}` with map(11→2) | `{org_id:2}` |

### 9.2 통합 테스트

1. **batch-import 재시도**:
   - `data/2단계_수입내역등록_후원자_260514.xlsx` 업로드
   - "저장 전 자료확인" → 오류 0건
   - "저장" → 36/36건 성공
   - Supabase 확인: `SELECT DISTINCT acc_sec_cd, item_sec_cd FROM pfam.acc_book WHERE org_id=11` → `(1, 94)` 1행만

2. **export-sqlite 검증**:
   - `/api/system/export-sqlite?orgId=11&orgName=오준석후보` 호출
   - 반환된 .db 파일 검증:
     ```bash
     sqlite3 newfile.db ".schema ACC_BOOK"  # NOT NULL FK 포함된 Fund_Master 스타일
     sqlite3 newfile.db "SELECT COUNT(*) FROM ACC_REL2"  # 482
     sqlite3 newfile.db "SELECT ORG_ID, ORG_SEC_CD, ORG_NAME FROM ORGAN"  # 2행
     sqlite3 newfile.db "SELECT DISTINCT ITEM_SEC_CD FROM ACC_BOOK"  # 94만
     ```

3. **윈도우 선관위 프로그램 E2E** (사용자 수동):
   - 새로 export한 .db를 윈도우로 전송
   - 자료 백업 및 복구 → 백업 목록에서 선택 → 복구
   - 기대: 다이얼로그 없이 진행, 36건 데이터 정상 표시

### 9.3 회귀 테스트

- 영수증 자동등록(`/api/document-parse` + `/api/acc-book` insert) 흐름의 코드값이 깨지지 않음
- 마법사(`/dashboard/wizard`)의 사전 매핑 코드값이 유지됨
- 기존 export-sqlite 사용자의 데이터 → 새 형식으로 동일 데이터 export

---

## 10. 롤백 계획

각 변경은 독립 PR로 분리해 단계적 배포:

1. PR1: `code-mapping.ts` + 테스트 (단독 배포 가능, 영향 없음)
2. PR2: `batch-import` + `/api/acc-book` 안전망 (기존 페이지에 영향 가능, 검증 필요)
3. PR3: `export-sqlite` 재작성 + seed JSON (출력 결과 변경, 사용자 영향)

문제 시 git revert로 단일 PR만 되돌릴 수 있도록 유지.

---

## 11. 미해결 / 향후 과제

- 후보자 등록번호(REG_NUM) 데이터 모델: 현재 Supabase organ에 후원회 행만 있어 후보자 REG_NUM이 없음. 1차에서는 빈 문자열, 2차에서 organ 페이지에 후보자 페어 등록 UX 추가.
- ACC_REL2 vs ACC_REL 의미 차이: Fund_Master에 두 테이블이 공존하는 이유 미확인. 1차에서는 ACC_REL2를 정적 시드로 처리, 2차에서 의미 분석.
- page_size 1024 강제 필요성: 실제 호환성 확인 후 결정.
