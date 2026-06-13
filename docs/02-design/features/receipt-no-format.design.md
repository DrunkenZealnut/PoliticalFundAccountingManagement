# 설계 — 영수증 일괄생성 번호 계정·과목 약자 형식("자(비)-01")

> Plan: `docs/01-plan/features/receipt-no-format.plan.md`
> 상태: Design · 2026-06-12

## 0. 한 줄 요약

영수증번호 = **`prefix + 2자리순번`**. `prefix = codevalue.cv_etc(계정) + cv_etc(과목)`(SSOT), 순번은 **prefix 문자열 그룹별** 01부터. `rcp_yn='Y'` 지출 전체 재생성. 클라이언트(`expense/page.tsx`)·서버(`api/acc-book`) 두 경로가 **공유 순수함수** `lib/accounting/receipt-no.ts`를 함께 사용.

---

## 1. 목표 출력 형식 (실데이터 검증 완료)

`acc_rel`(지출, `INCM_SEC_CD=2`) × `codevalue.cv_etc` 전수 시뮬레이션 결과. **raw 연결(계정 cv_etc + 과목 cv_etc)이 그대로 목표 형식**이다.

| org type (ORG_SEC_CD) | 계정 cv_etc | 과목 cv_etc | prefix 예시 | 번호 예시 |
|---|---|---|---|---|
| **(예비)후보자(90)·국회의원(54)** | `자`/`후`/`보`/`외` (cs_id=10, 하이픈無) | `(비)-`/`-` (cs_id=11) | `자(비)-`, `자-`, `후(비)-`, `보-`, `외(비)-` | **`자(비)-01`** ✅ |
| **정당 — 보조금외(acc=3)** | `` (빈값) | `비-`/`인-`/`사-`… (cs_id=3) | `비-`, `인-`, `사-` | `비-01` |
| **정당 — 보조금(acc=4/5/6/104)** | `경상-`/`선거-`/`여성-`/`장애-` (cs_id=2) | `비-`/`인-`… (cs_id=3) | `경상-비-`, `선거-인-` | `경상-비-01` |
| **후원회(91/92)** | `` (빈값, acc='지출') | `기-`/`모-`/`인-`/`사-`/`그-` (cs_id=12) | `기-`, `모-` | `기-01` |

**핵심 관찰**
- 모든 지출 **과목 cv_etc가 `-`로 끝남** → prefix는 자연히 `-`로 끝나 순번을 바로 붙이면 됨. 별도 구분자 삽입 불필요.
- 계정 cv_etc는 후보자계정(cs_id=10)만 비어있지 않고 하이픈도 없음(`자`) → 과목과 연결 시 `자(비)-`처럼 깔끔. cs_id=2(`경상-`)는 하이픈 포함이라 `경상-비-`(하이픈 2개)지만 이는 **PFund2 약자 체계 그대로**이므로 정답으로 본다.
- `--`(연속 하이픈) 발생 케이스 **없음**(과목 약자가 `-`로 시작하지 않음).

---

## 2. prefix 생성 규칙 — `buildReceiptPrefix`

```
prefix(accSecCd, itemSecCd, getEtc):
  a = getEtc(accSecCd) ?? ""      # 계정 약자
  i = getEtc(itemSecCd) ?? ""     # 과목 약자
  raw = a + i
  if raw == "":                   # 둘 다 약자 없음 → fallback (prefix 생략)
      return ""
  if not raw.endsWith("-"):       # 방어: 과목 약자 없고 계정 약자만 있는 비정상 케이스
      raw += "-"
  return raw                      # 정규화 끝 — 실데이터에선 raw 그대로가 정답
```

- **정규화는 최소.** cv_etc가 이미 PFund2 영수증 약자 체계를 담은 SSOT이므로 가공하지 않는다(말미 하이픈 보장 + 빈값 fallback만).
- `--` 압축 같은 추가 정규화는 **하지 않는다**(실데이터에 없고, 했다가 `경상-비-`의 의미를 훼손할 위험).

---

## 3. 그룹핑·순번 규칙 — `assignReceiptNumbers` (핵심 결정)

### 결정 D-1: 그룹 키 = **prefix 문자열** (≠ (acc,item) 쌍)
Plan 사용자 확정은 "계정·과목 조합별 독립 순번"이나, 실데이터에 **다른 과목이 같은 cv_etc를 갖는 충돌**이 존재:

| org | item=26 상급당부보조금 → `상-` | item=28 상급당부보조금외 → `상-` |
|---|---|---|

→ (acc,item) 쌍으로 그룹핑하면 `상-01`이 두 번 생겨 **번호 중복**. 따라서 **그룹 키는 prefix 문자열**로 한다.
- 효과: 같은 약자로 표기되는 과목은 한 시퀀스로 묶여 **번호 유일성 보장**. 사용자 의도("같은 분류=연번")에도 부합(약자가 같다 = 사용자 눈에 같은 분류).
- 주 사용 케이스(후보자/국회의원)는 과목별 cv_etc가 모두 달라 충돌 없음 → 사실상 "계정·과목별"과 동일하게 동작.

### 순번 부여
```
assignReceiptNumbers(targets, getEtc):
  # targets: acc_date ASC, acc_sort_num ASC 로 이미 정렬된 배열
  counters = {}              # prefix -> 현재 순번
  result = []
  for idx, t in enumerate(targets):     # idx = 0..N-1 (전역 처리순서)
      p = buildReceiptPrefix(t.acc_sec_cd, t.item_sec_cd, getEtc)
      n = counters.get(p, 0) + 1
      counters[p] = n
      seq = str(n).zfill(2)             # 2자리, 100↑은 자연증가("100")
      result.push({
        acc_book_id: t.acc_book_id,
        rcp_no: p + seq,                # "자(비)-01"  (p=="" 이면 그냥 "01")
        rcp_no2: idx + 1,               # 전역 일련번호 1..N (정렬 안정성용)
      })
  return result
```

### 결정 D-2: `rcp_no2` = 전역 처리순번(1..N)
- 전체 재생성이므로 기존 "max+1 증분" 로직 **삭제**.
- `rcp_no2`는 그룹별 순번이 아니라 **처리 순서(날짜순) 전역 일련번호** → 목록 정렬·기존 정렬 의존부 안정성 유지(그룹별 순번 중복이 정렬을 깨지 않음).

### 결정 D-3: 순번 2자리 zero-pad
- 사용자 예시 `-01` 기준. `1~99`는 `01`~`99`, `100`부터 자연 증가. `String(n).padStart(2,"0")`.

---

## 4. 공유 순수 함수 — `app/src/lib/accounting/receipt-no.ts` (신규)

```ts
/** cv_id → cv_etc(약자) 조회. 클라/서버가 각자 소스로 구성해 주입 */
export type EtcLookup = (cvId: number) => string | null;

export interface ReceiptTarget {
  acc_book_id: number;
  acc_sec_cd: number;
  item_sec_cd: number;
}

export interface ReceiptAssignment {
  acc_book_id: number;
  rcp_no: string;   // "자(비)-01"
  rcp_no2: number;  // 1..N 전역 순번
}

/** 계정·과목 약자 접두사 (말미 '-' 보장, 빈값이면 "") */
export function buildReceiptPrefix(
  accSecCd: number,
  itemSecCd: number,
  getEtc: EtcLookup,
): string;

/** 정렬된 targets에 prefix-그룹별 2자리 순번 부여 (순수, 부작용 없음) */
export function assignReceiptNumbers(
  targets: ReceiptTarget[],
  getEtc: EtcLookup,
): ReceiptAssignment[];
```

- **순수 함수**: DB·React 의존 없음. targets는 **호출측이 정렬해서 전달**(클라/서버 모두 `acc_date`, `acc_sort_num` 정렬).
- 약자 소스 주입(`EtcLookup`)으로 클라(`useCodeValues`)·서버(`codevalue` 조회)가 동일 로직 공유.

---

## 5. 클라이언트 적용 — `expense/page.tsx` `handleBatchReceiptGen` (재작성)

```ts
async function handleBatchReceiptGen() {
  if (!orgId) return;
  // 1) 대상: rcp_yn='Y' 지출 "전체" (전체 재생성 → rcp_no 빈값 조건 제거)
  const { data: targets } = await supabase
    .from("acc_book")
    .select("acc_book_id, acc_sec_cd, item_sec_cd")
    .eq("org_id", orgId).eq("incm_sec_cd", 2).eq("rcp_yn", "Y")
    .order("acc_date").order("acc_sort_num");
  if (!targets?.length) { alert("영수증번호를 생성할 대상이 없습니다."); return; }

  // 2) 약자 조회기 구성 (codeValues는 useCodeValues 스냅샷)
  const etcMap = new Map(codeValues.map((c) => [c.cv_id, c.cv_etc]));
  const getEtc = (id: number) => etcMap.get(id) ?? null;

  // 3) 순수 함수로 번호 산출
  const assigns = assignReceiptNumbers(targets, getEtc);

  if (!confirm(`${assigns.length}건의 영수증번호를 계정·과목 형식으로 재생성합니다.`)) return;

  // 4) 일괄 update (현행과 동일하게 개별 update)
  for (const a of assigns) {
    await supabase.from("acc_book")
      .update({ rcp_no: a.rcp_no, rcp_no2: a.rcp_no2 })
      .eq("acc_book_id", a.acc_book_id);
  }
  alert(`${assigns.length}건의 영수증번호를 부여했습니다.`);
  loadRecords(activeFilters);
}
```

변경점: ① `MAX(rcp_no2)+1` 시작번호 로직 제거 ② 대상 SELECT에 `acc_sec_cd, item_sec_cd` 추가, `rcp_no` 빈값 필터 제거(전체) ③ `useCodeValues`의 `codeValues`를 컴포넌트에서 구조분해(이미 `getName` 등 사용 중) ④ 순수함수 호출.

> `useCodeValues()` 반환에 `codeValues` 배열이 이미 포함됨(`use-code-values.ts:174`) → 추가 API 불필요.

## 6. 서버 적용 — `api/acc-book/route.ts` `batch_receipt` (재작성)

```ts
if (action === "batch_receipt") {
  const { orgId: oid, incmSecCd: isc } = payload;  // isc=2(지출)
  const { data: targets } = await supabase
    .from("acc_book")
    .select("acc_book_id, acc_sec_cd, item_sec_cd")
    .eq("org_id", oid).eq("incm_sec_cd", isc).eq("rcp_yn", "Y")
    .order("acc_date").order("acc_sort_num");
  if (!targets?.length) return NextResponse.json({ count: 0 });

  // 서버측 약자 소스: codevalue 1회 조회
  const { data: cvs } = await supabase.from("codevalue").select("cv_id, cv_etc");
  const etcMap = new Map((cvs ?? []).map((c) => [c.cv_id, c.cv_etc]));
  const getEtc = (id: number) => etcMap.get(id) ?? null;

  const assigns = assignReceiptNumbers(targets, getEtc);
  for (const a of assigns) {
    await supabase.from("acc_book")
      .update({ rcp_no: a.rcp_no, rcp_no2: a.rcp_no2 })
      .eq("acc_book_id", a.acc_book_id);
  }
  return NextResponse.json({ count: assigns.length });
}
```

변경점: 동일 순수함수 사용. `parseInt(rcp_no)` 증분 로직 제거. `codevalue` 테이블 조회 추가(스키마: `pfam.codevalue`, 컬럼 `cv_id`/`cv_etc`).

> **두 경로 정합**: 동일 `assignReceiptNumbers` + 동일 codevalue 데이터 → 같은 입력에 같은 결과. (현재 expense 페이지는 클라 경로만 호출하지만 API 경로도 동기화해 회귀 방지.)

---

## 7. 테스트 — `lib/accounting/receipt-no.test.ts` (신규)

| # | 케이스 | 입력 | 기대 |
|---|---|---|---|
| T1 | 후보자 기본 | acc=84,item=86 ×3 | `자(비)-01`, `자(비)-02`, `자(비)-03` |
| T2 | 조합 전환 리셋 | (84,86),(84,86),(85,86),(84,87) | `자(비)-01`,`자(비)-02`,`후(비)-01`,`자-01` |
| T3 | prefix 충돌 병합(D-1) | (3,26)`상-`,(3,28)`상-` 교차 | `상-01`,`상-02`(중복 없음, 한 시퀀스) |
| T4 | 정당 보조금 | (4,19)`경상-비-` | `경상-비-01` |
| T5 | 계정약자 없음 | (3,19) 계정etc="" | `비-01` |
| T6 | 약자 둘 다 없음 fallback | etc 모두 "" | `01`(prefix 생략) |
| T7 | 100건↑ | 동일 prefix ×101 | …`-99`,`-100` |
| T8 | rcp_no2 전역순번 | 혼합 ×N | `rcp_no2` = 1..N (처리순서) |
| T9 | buildReceiptPrefix 말미 하이픈 | 계정만 `자`, 과목 "" | `자-` (하이픈 보장) |

- 순수함수라 `getEtc`는 고정 맵으로 주입(DB 불필요). happy-dom 무관.

## 8. 구현 순서 (Do)

1. `lib/accounting/receipt-no.ts` 작성 (`buildReceiptPrefix`, `assignReceiptNumbers`)
2. `lib/accounting/receipt-no.test.ts` 작성 → `node node_modules/vitest/vitest.mjs run src/lib/accounting/receipt-no.test.ts` 통과
3. `expense/page.tsx` `handleBatchReceiptGen` 재작성 (`codeValues` 구조분해 + 순수함수)
4. `api/acc-book/route.ts` `batch_receipt` 재작성 (codevalue 조회 + 순수함수)
5. lint(`eslint`) + build(`next build`) + 전체 테스트
6. 수동 확인: 후보자 org 지출 일괄생성 → `자(비)-01…` 확인

## 9. 결정 사항 / 미해결

| ID | 결정 | 근거 |
|---|---|---|
| D-1 | 그룹 키 = prefix 문자열 | `상-` 충돌(item 26/28) 번호 중복 방지 + 사용자 "분류별 연번" 의도 |
| D-2 | `rcp_no2` = 전역 처리순번 1..N | 정렬 안정성, max+1 증분 폐기 |
| D-3 | 순번 2자리 zero-pad, 100↑ 자연증가 | 사용자 예시 `-01` |
| D-4 | 정규화 최소(말미 하이픈+빈값 fallback만) | cv_etc가 SSOT, 가공 시 의미 훼손 위험 |
| D-5 | 범위 = 지출 + 수입(공유 `batch_receipt` API) | 사용자 확정(2026-06-12). income(`incmSecCd=1`)이 동일 서버 API를 호출 → §6 변경이 수입에도 적용. **단 수입은 과목 cv_etc가 대부분 빈값**(후원회 전 과목, 정당 다수)이라 prefix 효과 제한적: 후원회 수입=`01,02…`, 정당 수입=빈prefix/계정약자 혼재. fallback 정상 동작으로 수용. 후보자/국회의원 수입만 지출 코드(82~85/86·87) 공유로 `자(비)-01` 정상 |
| CLOSED | income 페이지 공유 API 처리 | Do에서 확인 — `income/page.tsx:140` 동일 API 호출. alert 메시지를 `count` 기반으로 수정(`startNum/endNum` 제거) |
| CLOSED | PFund2 export `rcp_no` 길이 | `export-sqlite/route.ts:163` `RCP_NO VARCHAR(30)` 확인. 최장 ~9자 < 30, 영향 없음 |

## 10. 영향 범위 / 비변경

- **변경**: `handleBatchReceiptGen`(클라 지출), `batch_receipt`(서버, 지출+수입 공유), `income/page.tsx` alert(공유 API 응답 변경 대응), 신규 `receipt-no.ts`/`.test.ts`.
- **비변경**: `insert`/`update` 단건 경로(수기 영수증번호 입력), PFund2 export/import 로직, `rcp_no2` 컬럼 스키마.
- DB 마이그레이션 **불필요**(컬럼 재사용).
- ⚠️ **수입 동작 변경**(D-5): income도 공유 API라 "빈것만 채우기+전역순번" → "전체재생성+prefix그룹순번"으로 함께 변경됨(사용자 수용).
