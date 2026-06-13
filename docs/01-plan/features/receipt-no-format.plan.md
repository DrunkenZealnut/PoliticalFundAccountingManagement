# 영수증 일괄생성 번호를 계정·과목 약자 형식("자(비)-01")으로 부여 (receipt-no-format)

## Executive Summary

| 항목 | 내용 |
|---|---|
| Feature | receipt-no-format |
| 시작일 | 2026-06-12 |
| 예상 기간 | 1일 (공유 순수함수 추출 + 2개 호출경로 적용 + 테스트) |
| 영향 범위 | `lib/accounting/receipt-no.ts`(신규, 순수), `app/dashboard/expense/page.tsx`(`handleBatchReceiptGen`), `app/api/acc-book/route.ts`(`batch_receipt` action), 신규 단위테스트 |
| 근거 | 사용자 보고("번호만 붙음 → 자(비)-01 형식 원함") + 코드 실측(현 로직 전역 순번) + `codevalue.cv_etc` 약자 데이터(SSOT) + 사용자 확정(계정·과목별 독립 순번 / 전체 재생성) |

### Value Delivered (4-Perspective)

| Perspective | 내용 |
|---|---|
| **Problem** | 지출내역 「영수증일괄생성」이 현재 단순 전역 순번(`1, 2, 3 …`)만 부여한다. 선관위 회계 실무 관행은 영수증번호에 **계정·과목 약자 접두사**를 붙여 `자(비)-01`(자=후보자등 자산, (비)=선거비용) 형태로 매기는데, 현 출력은 어떤 영수증이 어느 계정·과목 증빙인지 번호만으로 식별할 수 없다. |
| **Solution** | 영수증번호를 **`계정약자 + 과목약자 + 2자리 순번`** 형식으로 생성한다. 약자는 `codevalue.cv_etc`(이미 존재, SSOT)에서 `acc_sec_cd`/`item_sec_cd`로 조회하고, 순번은 **계정·과목 조합별 독립 시퀀스**로 01부터 부여한다. 일괄생성 시 `rcp_yn=Y` 지출 **전체를 재생성**하여 형식을 통일한다. |
| **Function/UX Effect** | 일괄생성 결과가 `자(비)-01, 자(비)-02, 후(비)-01, 자-01 …`처럼 계정·과목이 드러나는 번호로 출력된다. 증빙 정리·제출서류 대조 시 번호만으로 계정·과목을 즉시 식별 가능. |
| **Core Value** | 정치자금 증빙 관리의 **식별성·관행 적합성** 확보. 선관위 표준 영수증번호 체계와 일치시켜 제출·감사 대응 부담을 줄인다. |

---

## 조사 결과 (확정 사실)

### 현재 동작 (단순 전역 순번)
영수증 일괄생성은 **두 경로**에 거의 동일한 로직으로 존재한다:

1. **클라이언트** — `app/dashboard/expense/page.tsx:205` `handleBatchReceiptGen()`
   - 대상: `org_id` + `incm_sec_cd=2`(지출) + `rcp_yn='Y'` + (`rcp_no` 비어있음), `acc_date`·`acc_sort_num` 정렬
   - 시작번호: 기존 `MAX(rcp_no2) + 1` (없으면 1)
   - 부여: 순회하며 `rcp_no = String(num)`, `rcp_no2 = num` (전역 순번)
2. **서버 API** — `app/api/acc-book/route.ts:147` `action === "batch_receipt"`
   - 동일 로직(파싱만 `parseInt(rcp_no)` 기반). 현재 expense 페이지는 (1)을 직접 호출하지만, API 경로도 같은 책임을 가져 **동시 유지보수 대상**.

### 번호가 저장되는 컬럼 (`acc_book`, `scripts/001`)
- `rcp_no` `VARCHAR(30)` — 증빙서번호(문자열, UI 표시·필터). **여기에 `자(비)-01` 형식 문자열을 넣는다.**
- `rcp_no2` `INTEGER` — 정렬·("max+1") 계산용 숫자. 현재는 전역 순번과 동일.

### 약자(prefix) 소스 — `codevalue.cv_etc` (SSOT, 이미 존재)
`CodeValue` 인터페이스(`use-code-values.ts:10`)에 `cv_etc`가 이미 노출되어 있다. `acc_sec_cd`/`item_sec_cd`로 약자를 조회한다.

| 구분 | cs_id | 예시 코드 → cv_etc |
|---|---|---|
| 후보자 계정 | 10 | 후보자등 자산=`자`, 후원회기부금=`후`, 보조금=`보`, 보조금외 지원금=`외` |
| 후보자 과목 | 11 | 선거비용=`(비)-`, 선거비용외 정치자금=`-` |
| 일반 계정구분 | 2 | 경상보조금=`경상-`, 선거보조금=`선거-` … |
| 일반 계정과목 | 3 | 선거비용=`비-`, 인건비=`인-`, 사무소설치·운영비=`사-` … |

→ **후보자 org**: `acc_sec_cd`(cs_id=10) + `item_sec_cd`(cs_id=11) = `자` + `(비)-` = **`자(비)-`** + 순번 → `자(비)-01` ✅ (사용자 예시와 정확히 일치)
→ **정당·국회의원 org**: `acc_sec_cd`·`item_sec_cd`가 cs_id=2/3 체계라 약자 형태가 다름(예: `경상-`/`비-`). 단순 연결 시 하이픈 중복 가능 → **정규화 규칙 필요**(아래 설계).

### 사용자 확정 설계 결정 (AskUserQuestion)
1. **순번 범위 = 계정·과목 조합별 독립.** 같은 `(acc_sec_cd, item_sec_cd)`끼리 `01, 02, 03 …`, 조합이 바뀌면 순번 리셋.
2. **기존 번호 처리 = 전체 재생성.** `rcp_yn='Y'` 지출 전체를 새 형식으로 재부여(기존 `1,2,3`·수기값 포함 통일, 혼재 방지).

---

## 해결 방향

### 1. 공유 순수 함수 신설 — `lib/accounting/receipt-no.ts`
클라이언트/서버 두 경로가 같은 결과를 내도록 **코드→약자 매핑을 주입받는 순수 함수**로 추출(테스트 용이).

```ts
// 약자 조회는 호출측에서 주입 (클라: useCodeValues, 서버: codevalue 조회 결과)
type EtcLookup = (cvId: number) => string | null; // cv_etc 반환

interface ReceiptTarget { acc_book_id: number; acc_sec_cd: number; item_sec_cd: number; }

// prefix = 정규화(계정약자 + 과목약자), 끝에 '-' 1개 보장
function buildReceiptPrefix(accSecCd: number, itemSecCd: number, getEtc: EtcLookup): string

// 정렬된 targets를 받아 (acc_sec_cd,item_sec_cd) 그룹별 01..N 순번 부여
// 반환: { acc_book_id, rcp_no: "자(비)-01", rcp_no2: <전역 처리순번> }[]
function assignReceiptNumbers(targets: ReceiptTarget[], getEtc: EtcLookup): {...}[]
```

**prefix 정규화 규칙(초안, design에서 확정):**
- `prefix = (계정 cv_etc ?? "") + (과목 cv_etc ?? "")`
- 말미 하이픈 **정확히 1개** 보장: 약자가 `-`로 끝나면 그대로, 아니면 `-` 추가 (예: `자`+`(비)-`=`자(비)-` / `자`+`-`=`자-`)
- 중간 하이픈 중복 정규화(`--` → `-`)는 design에서 org type별 실데이터로 검증
- 약자가 둘 다 없으면 prefix 생략(순번만) — fallback

**순번 규칙:**
- 그룹 키 = `${acc_sec_cd}-${item_sec_cd}`
- 순번 2자리 zero-pad(`01`), 100건↑은 자연 증가(`100`)
- `rcp_no = prefix + paddedSeq`

**`rcp_no2`(정렬 정수) 재정의:**
- 전체 재생성이므로 "max+1" 증분 불필요. 처리 순서(`acc_date`·`acc_sort_num`)대로 **전역 일련번호 1..N**을 `rcp_no2`에 부여 → 기존 정렬·표시 안정성 유지(그룹별 순번 중복이 정렬을 깨지 않음).

### 2. 클라이언트 적용 — `expense/page.tsx` `handleBatchReceiptGen`
- 대상 SELECT에 `acc_sec_cd, item_sec_cd` 추가
- `MAX(rcp_no2)+1` 시작번호 로직 제거(전체 재생성)
- `useCodeValues().codeValues`로 `getEtc(cvId)` 구성 → `assignReceiptNumbers` 호출 → 결과로 `rcp_no`/`rcp_no2` 일괄 update
- 확인 문구 변경: "{n}건의 영수증번호를 계정·과목 형식으로 재생성합니다."

### 3. 서버 적용 — `api/acc-book/route.ts` `batch_receipt`
- 동일하게 `acc_sec_cd, item_sec_cd` 조회 + 서버측 `codevalue`(cv_id→cv_etc) 조회로 `getEtc` 구성 → `assignReceiptNumbers` 재사용
- 클라이언트와 **같은 순수 함수** 사용으로 두 경로 결과 일치

### 4. 테스트 — `lib/accounting/receipt-no.test.ts`(신규)
- `자(비)-01/02`, 조합 바뀌면 리셋(`후(비)-01`, `자-01`)
- prefix 정규화(하이픈 1개 보장, 중복 제거, 약자 없음 fallback)
- 100건↑ 순번 자연 증가
- `rcp_no2` 전역 1..N 순차
- 정당/국회의원 코드(cs_id=2/3) 샘플 prefix 형태 스냅샷

## 검증 기준 (Acceptance)

1. 후보자 org에서 일괄생성 시 `rcp_no`가 `자(비)-01`, `자(비)-02`, `후(비)-01` … 형식(계정약자+과목약자+2자리 순번)
2. 같은 `(acc_sec_cd, item_sec_cd)`는 연속 순번, 조합이 바뀌면 `-01`부터 리셋
3. 전체 재생성: `rcp_yn='Y'` 지출 전부 새 형식, 기존 순수 숫자(`1,2,3`) 잔존 0
4. 정렬·목록 표시 정상(`rcp_no2` 전역 순번 유지)
5. 클라이언트 경로와 서버 `batch_receipt` 경로가 **동일 입력 → 동일 결과**
6. 신규/갱신 테스트 통과 + lint 0 + build 성공

## 영향 범위 점검

- **`income`(수입) 영수증번호**: 사용자 요청은 지출 한정. 동일 패턴 재사용 가능하나 이번 범위 제외(income 페이지에 동일 기능 존재 여부는 design에서 확인 후 별 feature로).
- **PFund2 SQLite export/import**: `rcp_no`는 그대로 문자열(`VARCHAR(30)`/official 영수증번호 컬럼) → 형식 변경이 라운드트립에 영향 없음(자릿수만 `VARCHAR(30)` 내 확인). [[hwpx-form-generator]] 무관.
- **`rcp_no2` 의미 변경**: 전역 순번 의미는 유지(정렬용). "max+1 증분" 의존 코드가 다른 곳에 없는지 grep 확인 필요(현재 일괄생성 2경로 외 없음으로 추정 → design 확인).
- **수기 입력 영수증번호 덮어쓰기**: 전체 재생성이라 사용자가 수기로 넣은 `rcp_no`도 덮어씀(사용자 확정사항). 단건 입력/수정 경로(`insert`/`update`)는 무변경.

## 리스크 / 함정

- **org type별 약자 체계 차이**: 후보자(cs_id=10/11)는 `자(비)-`로 깔끔하나, 정당·국회의원(cs_id=2/3)은 약자 형태가 달라 prefix가 어색하거나 하이픈 중복 가능 → **정규화 규칙을 org type 무관하게** 정하고 실데이터로 검증(design 필수).
- **`cv_etc` 누락/legacy 코드**: 일부 코드에 `cv_etc`가 `null`/빈값 → prefix 생략 fallback 필요(번호 누락 금지).
- **클라이언트/서버 약자 소스 불일치**: 클라는 `/api/codes` fetch, 서버는 직접 `codevalue` 조회 — **같은 codevalue 테이블**이므로 일치하지만, 순수 함수로 분리해 회귀 테스트로 고정.
- **전체 재생성 비용**: 건수만큼 개별 `update` 호출(현 구조와 동일). 대량 시 느릴 수 있으나 현행 대비 악화 없음(필요 시 batch update는 별도 개선).

## 다음 단계

prefix 정규화 규칙(org type별 하이픈 처리)과 `getEtc` 주입 인터페이스가 핵심 → **`/pdca design receipt-no-format`** 으로 순수 함수 시그니처·정규화 표·테스트 케이스를 확정한 뒤 구현(`/pdca do`).
