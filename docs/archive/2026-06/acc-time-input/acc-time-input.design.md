# 수입·지출 거래 시각(분 단위) 입력 (acc-time-input) Design Document

> **Plan**: `docs/01-plan/features/acc-time-input.plan.md`
> **Project**: PoliticalFundAccountingManagement
> **Author**: Claude
> **Date**: 2026-06-09
> **Status**: Draft
> **Branch**: `feat/acc-time-input`

---

## 1. 설계 개요

`acc_book`에 `acc_time CHAR(4)`(HHmm, NULL) 컬럼을 추가하고, 수입·지출·수기입력 폼에 **선택 입력**인 시각 필드를 붙인다. 시각 변환(HHmm↔HH:mm)은 공용 헬퍼로 단일화한다. 목록 표시·Excel·SQLite export는 손대지 않는다. API는 정렬에만 `acc_time`을 추가하고, insert/update/batch는 payload 통과 방식이라 추가 변경이 없다.

### 핵심 데이터 흐름

```
입력(UI)         저장 변환              DB                   편집 역변환        목록
date  YYYY-MM-DD ─ replace(/-/g,"") ─▶ acc_date CHAR(8)  ─ slice ─▶ YYYY-MM-DD ─▶ acc_date만 표시
time  HH:mm      ─ toAccTime() ──────▶ acc_time CHAR(4)  ─ fmtTimeInput ─▶ HH:mm   (목록 미표시)
                  (빈값→null)                                                       └ 기존과 동일
```

---

## 2. 데이터 모델 변경

### 2.1 마이그레이션 — `app/scripts/014_add_acc_time.sql` (신규)

> 최신 마이그레이션이 `013`이므로 다음 번호는 `014`. **Supabase SQL 에디터에서 수동 적용**(DDL은 서비스롤 REST로 실행 불가). 스키마 접두사(`pfam.`)는 기존 `scripts/0NN_*.sql`의 표기와 일치시킬 것.

```sql
-- 014_add_acc_time.sql : 거래 시각(분 단위) 컬럼 추가
ALTER TABLE pfam.acc_book     ADD COLUMN IF NOT EXISTS acc_time CHAR(4);
ALTER TABLE pfam.acc_book_bak ADD COLUMN IF NOT EXISTS acc_time CHAR(4);
COMMENT ON COLUMN pfam.acc_book.acc_time IS '거래시각 HHmm (분 단위, NULL 허용)';
```

- **additive · nullable · 기본 NULL** → 기존 행/코드 무영향, 롤백 = `DROP COLUMN`
- `acc_book_bak`도 동기 추가 → 수정 백업(`action: "backup"`) 시 시각 보존 (FR-08)
- 인덱스 불필요: 정렬은 `acc_date` 인덱스 범위 내 보조 정렬이라 추가 인덱스 비용 대비 이득 없음

### 2.2 타입 — `app/src/types/database.ts`

`acc_book`의 `acc_date: string`(현재 `:170`) 정의 인근에 추가:

```typescript
acc_date: string;       // "YYYYMMDD"
acc_time: string | null; // "HHmm" 거래시각 (분 단위, 선택)
```

> Row/Insert/Update 타입이 분리돼 있으면 세 곳 모두에 추가(Insert/Update는 `acc_time?: string | null`).

---

## 3. 공용 시각 변환 헬퍼 — `app/src/lib/date-utils.ts` (신규)

날짜 변환이 페이지마다 흩어져 있는 현 상황을 답습하지 않도록, **시각 변환만** 공용화한다(날짜 변환 전면 리팩터링은 Out of Scope).

```typescript
/** DB 저장형 "HHmm" → input[type=time] 표시형 "HH:mm". 빈값/이상값은 "" */
export function fmtTimeInput(hhmm: string | null | undefined): string {
  if (!hhmm) return "";
  const s = hhmm.padStart(4, "0");
  if (!/^\d{4}$/.test(s)) return "";
  return `${s.slice(0, 2)}:${s.slice(2, 4)}`;
}

/** input[type=time] "HH:mm" → DB 저장형 "HHmm". 빈값은 null */
export function toAccTime(hm: string | null | undefined): string | null {
  if (!hm) return null;
  const digits = hm.replace(":", "");
  return /^\d{4}$/.test(digits) ? digits : null;
}
```

- 입력은 `<input type="time">`가 형식(HH:mm, 00:00~23:59)을 보장 → 추가 검증 최소
- `toAccTime`은 빈 문자열을 명시적으로 `null`로 매핑 (선택 입력)
- **단위 테스트 대상** (§7)

---

## 4. 입력폼 변경 (3곳 동일 패턴)

세 페이지 모두 ①state에 `acc_time` 추가 → ②date input 옆 time input 추가 → ③저장 payload에 `acc_time: toAccTime(...)` → ④(편집 있는 곳) 역변환. 목록 렌더(`formatDate(r.acc_date)`)는 **변경 없음**.

### 4.1 수입 — `app/src/app/dashboard/income/page.tsx`

| 위치 | 변경 |
|---|---|
| form state `:64-74` | `acc_date: "",` 다음 줄에 `acc_time: "",` 추가 |
| selectRecord `:182-185` | `acc_date` 역변환 블록 뒤에 `acc_time: fmtTimeInput(r.acc_time),` 추가 |
| payload `:241` | `acc_date: form.acc_date.replace(/-/g, ""),` 다음에 `acc_time: toAccTime(form.acc_time),` 추가 |
| backup payload `:253-259` | `acc_date: selected.acc_date,` 옆에 `acc_time: selected.acc_time,` 추가(시각 백업 보존) |
| 입력 필드 `:515-524` | 수입일자 `<div>` 아래에 시각 `<div>` 추가(아래 스니펫) |

입력 필드(수입일자 div 다음):
```tsx
<div>
  <Label>수입시각 <span className="text-xs text-gray-400">(선택)</span></Label>
  <Input
    type="time"
    value={form.acc_time}
    onChange={(e) => setForm({ ...form, acc_time: e.target.value })}
  />
</div>
```
> import 추가: `import { fmtTimeInput, toAccTime } from "@/lib/date-utils";`
> `handleSave`의 `acc_date` 필수 검증(`:205`)은 유지, 시각은 검증 없음(선택).

### 4.2 지출 — `app/src/app/dashboard/expense/page.tsx`

income과 동일. 위치 매핑:

| 위치 | 변경 |
|---|---|
| form state `:89-104` | `acc_date: "",`(`:93`) 다음에 `acc_time: "",` |
| selectRecord `:324-327` | `acc_date` 역변환 뒤 `acc_time: fmtTimeInput(r.acc_time),` |
| payload `:382` | `acc_date: ...replace(...)` 다음에 `acc_time: toAccTime(form.acc_time),` |
| backup payload (지출 handleSave 내 backup 블록) | `acc_time: selected.acc_time,` 추가 |
| 입력 필드 `:734-741` | 지출일자 `<div>` 다음에 시각 `<div>`(라벨만 "지출시각") |

> 지출폼은 `md:grid-cols-4` 그리드(`:733`). 시각 div를 일자 바로 뒤에 넣으면 한 칸 차지 → 레이아웃 자연스러움(일자·시각·금액·…). 칸 수가 넘치면 일자+시각을 한 셀에 묶는 안은 §6 참조.

### 4.3 수기입력 — `app/src/app/dashboard/document-register/page.tsx`

엔트리 객체 기반(여러 행 일괄). selectRecord 없음(신규 입력 전용).

| 위치 | 변경 |
|---|---|
| entry 타입/초기값 (entries 생성부) | `acc_date: ""` 옆에 `acc_time: ""` 추가 |
| handleSave payload `:185-194` | `acc_date: e.acc_date.replace(/-/g, ""),`(`:189`) 다음에 `acc_time: toAccTime(e.acc_time),` |
| 입력 필드 `:284-288` | "{typeLabel}일자" div 다음에 시각 `<div>` 추가 |
| 유효성 `:153` | 시각은 조건에 **미포함**(선택). `acc_date`만 필수 유지 |

> entry 타입 정의 위치를 찾아 `acc_time: string` 필드 추가, `updateEntry(entry.id, { acc_time: e.target.value })` 패턴 사용. 그리드 `:283`이 `grid-cols-4`(지출)/`grid-cols-3`(수입)이므로 시각 칸 추가 시 칸 수 1 증가 고려.

---

## 5. API 변경 — `app/src/app/api/acc-book/route.ts`

### 5.1 정렬 (FR-06) — `:61-64`

```typescript
// Before
const { data, error } = await query
  .order("acc_date", { ascending: true })
  .order("acc_sort_num", { ascending: true })
  .limit(100000);

// After — 같은 날짜 내 시각순, 시각 미상(null)은 앞으로
const { data, error } = await query
  .order("acc_date", { ascending: true })
  .order("acc_time", { ascending: true, nullsFirst: true })
  .order("acc_sort_num", { ascending: true })
  .limit(100000);
```

- `nullsFirst: true` → 시각 없는 기존 건이 같은 날짜 내 앞쪽, 시각 입력 건이 시간순 뒤따름. (supabase-js `order`의 `nullsFirst` 옵션 사용)

### 5.2 insert / update / batch_insert — **코드 변경 없음**

- `action: "insert"`/`"update"`: `payload.data`를 그대로 DB에 전달(`:93-96` 등) → 클라이언트가 `acc_time`을 포함하면 자동 반영
- `action: "batch_insert"`: row를 그대로 처리하고 `_`-prefix 메타만 strip → `acc_time`은 일반 컬럼이라 통과
- `action: "backup"`: `acc_book_bak`에 insert. 클라이언트 backup payload에 `acc_time` 추가(§4.1)하면 보존됨

> **확인 포인트(구현 시)**: insert/update가 `payload.data`를 화이트리스트가 아닌 그대로 insert하는지 재확인. 만약 명시적 컬럼 매핑이 있으면 `acc_time` 매핑 추가 필요. (`:93-96` 기준 그대로 전달 방식으로 확인됨)

---

## 6. 입력 UI 방식 결정 (Plan §5 리스크 해소)

- **채택: `date`(필수) + `time`(선택) 두 입력 분리.**
  - 이유: `datetime-local`은 날짜를 비우면 시각 입력 불가 → "시각 선택 입력" 요구와 충돌. 분리하면 시각만 비우는 케이스가 자연스럽다.
- 레이아웃 대안(그리드 칸 부족 시): 일자 라벨 `<div>` 안에 date+time을 `flex gap-2`로 가로 배치하여 한 셀 유지. 1차 구현은 별도 셀, 칸 넘침이 보이면 flex 병합.

---

## 7. 테스트 설계

### 7.1 단위 테스트 — `app/src/lib/date-utils.test.ts` (신규)

| 케이스 | 입력 | 기대 |
|---|---|---|
| fmtTimeInput 정상 | `"1430"` | `"14:30"` |
| fmtTimeInput 자정/경계 | `"0000"` / `"2359"` | `"00:00"` / `"23:59"` |
| fmtTimeInput null/빈 | `null` / `""` | `""` |
| fmtTimeInput 이상값 | `"12"` / `"abcd"` | `""` (12는 `padStart`로 `"0012"`→`"00:12"`? → 정책 확정) |
| toAccTime 정상 | `"14:30"` | `"1430"` |
| toAccTime 빈값 | `""` / `null` | `null` |
| toAccTime 이상값 | `"99"` | `null` |
| round-trip | `toAccTime(fmtTimeInput("0930"))` | `"0930"` |

> `fmtTimeInput("12")` 정책: DB에는 항상 4자리로 저장하므로 비정상 길이는 방어적으로 `""` 처리 권장 → `padStart` 대신 `length===4` 체크로 단순화 가능. 테스트에서 확정.

### 7.2 정렬 테스트 (선택)

acc_time 혼재 시 `acc_date → acc_time(nullsFirst) → acc_sort_num` 순서 단위 검증(정렬 비교 함수 분리 가능 시). API 통합 테스트가 없으면 정렬 비교 헬퍼만 테스트.

### 7.3 회귀 확인

- 목록 표시(`formatDate(r.acc_date)`)·Excel·SQLite export 출력 무변경
- 시각 미입력 저장 시 `acc_time = null`, 기존 데이터 로드 정상

---

## 8. 구현 순서 (Do 단계 체크리스트)

1. `scripts/014_add_acc_time.sql` 작성 + **Supabase 수동 적용**
2. `types/database.ts` — `acc_time` 타입 추가
3. `lib/date-utils.ts` + `date-utils.test.ts` (TDD: 헬퍼 먼저)
4. `income/page.tsx` — state·selectRecord·payload·backup·입력필드
5. `expense/page.tsx` — 동일
6. `document-register/page.tsx` — entry·payload·입력필드
7. `api/acc-book/route.ts` — 정렬에 `acc_time` 추가
8. 테스트(vitest)·lint·build → gap 분석(`/pdca analyze`)

---

## 9. 엣지 케이스 / 주의

| 케이스 | 처리 |
|---|---|
| 기존 데이터(acc_time 없음) 편집 | `fmtTimeInput(null)→""` → 시각 빈 칸, 저장 시 미입력이면 null 유지 |
| 시각만 입력하고 날짜 비움 | `acc_date` 필수 검증에서 차단(기존 로직) |
| 같은 날짜·동일 시각 다건 | `acc_sort_num` 보조 정렬로 안정 정렬 |
| PFund2 export→import 왕복 | `acc_time` 미보존(알려진 제약, Plan §5). import 시 null로 들어옴 |
| backup/복구(undo) | `acc_book_bak.acc_time` 추가로 복구 시 시각 보존 |
| `CHAR(4)` 공백 패딩 | PostgreSQL `CHAR`는 우측 공백 패딩 가능 → 읽을 때 `fmtTimeInput`이 `\d{4}` 검증으로 방어(필요 시 `.trim()`) |

---

## 10. 영향 파일 요약

| 파일 | 변경 | 신규/수정 |
|---|---|---|
| `app/scripts/014_add_acc_time.sql` | acc_book(_bak) 컬럼 추가 | 신규 |
| `app/src/types/database.ts` | acc_time 타입 | 수정 |
| `app/src/lib/date-utils.ts` | 시각 변환 헬퍼 | 신규 |
| `app/src/lib/date-utils.test.ts` | 헬퍼 테스트 | 신규 |
| `app/src/app/dashboard/income/page.tsx` | state·편집·payload·backup·입력 | 수정 |
| `app/src/app/dashboard/expense/page.tsx` | state·편집·payload·backup·입력 | 수정 |
| `app/src/app/dashboard/document-register/page.tsx` | entry·payload·입력 | 수정 |
| `app/src/app/api/acc-book/route.ts` | 정렬 acc_time | 수정 |
| 목록/Excel/SQLite export | **무변경**(회귀 확인만) | — |
