# Design — 수입·지출 내역 선택 상세 영역 상단 고정(sticky)

- 기능: `ledger-detail-sticky`
- 단계: Design
- 작성일: 2026-06-30
- Plan 참조: `docs/01-plan/features/ledger-detail-sticky.plan.md`
- 유형: UI/UX (순수 레이아웃·CSS, 데이터·저장 로직 불변)
- 관련 메모: [[ledger-summary-header]] · [[expense-page-bypasses-accbook-api]]
- 디자인 토큰: `DESIGN.md` (Surface `#FFFFFF` / Border `#E2E0DC` / radius-lg 8px / shadow-on-hover / z 관례)

## 1. 개요

행을 선택하면 채워지는 **입력 폼(=선택 상세)**이 페이지 최상단에 `static`으로 있어, 리스트를 스크롤하면 화면 밖으로 사라진다. 입력 폼 컨테이너에 **`sticky`를 적용해 상단 고정**한다. Plan의 미해결(OQ)은 코드 조사 + 사용자 확인으로 모두 확정되었다(아래 §7).

### 확정 범위 (사용자 승인)
- **대상 = income · expense 2페이지** (document-register는 '행 선택→상세' 구조가 아니어서 **제외**).
- **방식 = 입력 폼 컨테이너 전체를 sticky 고정** (접기 토글·내부 스크롤 없이 단순).

## 2. 기술 분석 (코드 조사 결과 — 설계 근거)

### 2.1 스크롤 컨테이너 = `<main>` (가장 중요)
`app/src/app/dashboard/layout.tsx`:
```
:337  <div className="flex-1 flex flex-col overflow-hidden min-w-0">
:339    <header className="h-14 border-b bg-white ... flex-shrink-0">   // 56px, static
:367    <main className="flex-1 overflow-y-auto p-3 md:p-6">{children}</main>
```
- **세로 스크롤은 `<main>`(`overflow-y-auto`)에서 일어난다 — 문서(body) 스크롤이 아니라 컨테이너 스크롤.**
- 따라서 `{children}`(페이지) 안의 요소에 `sticky top-0`을 주면 **`<main>`의 콘텐츠 영역 최상단** 기준으로 고정된다. `<header>`(56px)는 `<main>` **바깥 형제**이므로 **top 오프셋에 포함할 필요가 없다** → `top-0`이 곧 헤더 바로 아래.
- 조상 체인에 sticky를 깨는 추가 스크롤 컨테이너 없음(`:337` 의 `overflow-hidden`은 `<main>`보다 바깥이라 무해). **레이아웃 구조 변경 불필요** (Plan FR-7 해소 ✅).

### 2.2 입력 폼 컨테이너 (sticky 적용 지점)
| 페이지 | 파일:줄 | 현재 className | 폼 규모 |
|--------|---------|----------------|---------|
| income | `income/page.tsx:418` | `bg-white rounded-lg border p-4` | 4열 grid, ~250–300px |
| expense | `expense/page.tsx:580` | `bg-white rounded-lg border p-4` | 4열 grid + FundingDraftPreview·EvidenceFileManager, ~400–500px |

- 두 페이지가 **동일 className** → 동일 변경.
- 폼 형제 순서(`<div className="space-y-6">` 안): 제목/요약 → `LedgerSummaryHeader` → **입력 폼** → `AccBookSearch` → `<table>`. (expense는 입력 폼 위에 `FundingAllocationPanel`(후보자 전용)이 추가.)

### 2.3 z-index 관례 (조사)
- sidebar `z-40`(fixed), 모바일 backdrop `z-30`, shadcn Dialog/Select/Popover **portal `z-50`**, 기존 sticky `thead` `z-10`.
- → 새 sticky 폼은 **`z-10`**: 리스트/테이블 위, Dialog·Select 드롭다운(z-50)·sidebar(z-40) 아래. 폼 내부 달력/Select는 portal(z-50)로 폼 위에 정상 렌더.

## 3. 상세 설계

### 3.1 적용 클래스 (income·expense 공통)
입력 폼 컨테이너(`income:418`, `expense:580`)의 className을 다음으로 변경:
```
기존:  bg-white rounded-lg border p-4
변경:  bg-white rounded-lg border p-4 md:sticky md:top-0 z-10 shadow-sm
```
- **`md:sticky md:top-0`** — 데스크톱(≥768px)에서만 고정. 모바일은 기존 `static` 유지(§3.4 근거).
- **`z-10`** — §2.3 위계.
- **`shadow-sm`** — 고정된 폼과 그 아래로 흐르는 리스트를 시각 분리(DESIGN.md "subtle shadow", radius-lg 유지). 불투명 `bg-white`(Surface #FFFFFF)라 리스트가 비쳐 보이지 않음.

### 3.2 top 오프셋 / 패딩 처리
- `<main>`의 `p-3 md:p-6` 패딩 안쪽이 스크롤 콘텐츠 영역 → `top-0`이면 폼이 그 패딩 상단 경계에 붙는다(헤더 바로 아래, 위쪽에 main 패딩 만큼의 여백만).
- 스크롤 시 폼 **위로 살짝 보이는 패딩 틈**이 거슬리면, 폼 래퍼에 음수 마진+상단 패딩 보정(`-mt-* pt-*`) 또는 sticky 래퍼 배경 확장으로 QA 단계에서 미세 조정(MVP는 `top-0`로 시작).

### 3.3 LedgerSummaryHeader 동시 고정 여부 (OQ-4)
- **입력 폼만 sticky, `LedgerSummaryHeader`(현황 요약)는 비고정.** 둘 다 고정하면 상단 점유가 과해 리스트 공간을 잠식한다. 현황 요약은 부차 정보라 스크롤되어 사라져도 무방.

### 3.4 모바일/반응형 (OQ-3)
- expense 폼(~400–500px)을 좁은 모바일에서 통째로 고정하면 리스트가 거의 안 보여 **역효과**. → **`md:sticky`로 데스크톱만 적용**, 모바일은 기존 세로 스크롤 유지.
- (사용자 선택 "폼 전체 고정"은 데스크톱 기준으로 충실히 구현하되, 모바일은 가독성 위해 static — 합리적 기본값. 모바일도 고정을 원하면 `sticky top-0`로 쉽게 전환 가능.)

### 3.5 미선택(신규 입력) 동작 (OQ-2)
- sticky는 선택 여부와 무관하게 **항상 적용**. 미선택 시 신규 입력 폼이 상단 고정 → 입력 중에도 리스트를 보며 작업할 수 있는 부수 이점.

### 3.6 공통화 (OQ-5)
- 변경이 **className 1줄씩**이라 별도 공통 컴포넌트 추출은 과한 추상화. **페이지별로 동일 클래스 문자열을 추가**(중복 1회 허용). 향후 3페이지 이상으로 늘면 그때 추출 재검토.

## 4. 변경 파일 (총 2개 파일, 각 1줄)

| 파일 | 변경 |
|------|------|
| `app/src/app/dashboard/income/page.tsx:418` | 입력 폼 컨테이너 className에 `md:sticky md:top-0 z-10 shadow-sm` 추가 |
| `app/src/app/dashboard/expense/page.tsx:580` | 동일 |

> 데이터/API/집계/정렬/저장/검증 코드는 **변경 없음**.

## 5. 엣지 케이스 / 리스크 (조사 반영)
- **폼 내부 드롭다운/달력**(과목·계정 `Select`, 날짜 picker): shadcn은 portal(`z-50`)이라 sticky 폼(`z-10`) 위로 정상 렌더 — 잘림 없음. (인라인 펼침 요소가 있으면 QA에서 확인.)
- **CustomerSearchDialog 등 모달**(z-50): sticky 폼 위에 정상 표시.
- **expense `FundingAllocationPanel`**(폼 밖 위, 후보자 전용): 비고정 → 스크롤되어 사라짐(의도, 폼만 고정).
- **OrgCycleLockBanner**(옛 주기 읽기전용 잠금): 폼 위 형제이므로 스크롤로 사라짐. 잠금 시 폼이 disabled여도 sticky 동작엔 무관.
- **패딩 틈**(§3.2): 시각적 거슬림 가능 → QA 미세 조정.
- **회귀 위험 낮음**: 로직 불변(CSS 한정).

## 6. 구현 순서 (Do)
1. `income/page.tsx:418` 입력 폼 컨테이너 className에 sticky 클래스 추가.
2. `expense/page.tsx:580` 동일 적용.
3. 데스크톱 QA: ①행 선택 → 리스트 끝까지 스크롤 시 폼 상단 유지, ②과목/계정 드롭다운·날짜 picker·고객검색 다이얼로그 가림 없음, ③OrgCycleLock 배너/현황 요약과 충돌 없음.
4. 모바일 QA: `md:sticky`로 static 유지 확인(폼이 리스트를 가리지 않음).
5. 그림자/패딩 틈 미세 조정(필요 시 §3.2).
6. `app/VERSION` MINOR bump + 루트 `CHANGELOG.md`([[release-version-ssot]]).

## 7. 확정 결정 (OQ 종결)
| ID | 항목 | 결정 |
|----|------|------|
| D-1 | sticky 대상 | 입력 폼 컨테이너 **전체** 고정(접기·내부스크롤 X) — 사용자 |
| D-2 | 적용 범위 | **income · expense** (document-register 제외) — 사용자 |
| D-3 | LedgerSummaryHeader | **비고정**(입력 폼만 sticky) |
| D-4 | 미선택 동작 | sticky **항상 적용** |
| D-5 | 모바일 | **`md:sticky`(데스크톱만)**, 모바일 static |
| D-6 | 공통화 | 공통 컴포넌트 미추출, **페이지별 className** |
| D-7 | top / z-index | **`top-0`**(컨테이너 스크롤), **`z-10`** |
| D-8 | FR-7 overflow | 구조 변경 **불필요**(main이 스크롤 컨테이너) |

## 8. 테스트 / 검증
- **수동 QA(주)**: §6의 데스크톱·모바일 체크리스트(income·expense 각각).
- **회귀**: 로직 무변경 → 기존 vitest 전부 통과 기대(`node node_modules/vitest/vitest.mjs run`). UI-only라 신규 데이터 테스트 불필요.
- **빌드/린트**: `node node_modules/next/dist/bin/next build`, `node node_modules/eslint/bin/eslint.js app/src/app/dashboard/income/page.tsx app/src/app/dashboard/expense/page.tsx`.
- **디자인 검토**: sticky 그림자/배경이 DESIGN.md 토큰 준수(임의 색/그림자 금지).

## 9. 롤아웃
- 순수 UI(스키마/마이그레이션 없음) → additive·즉시 reversible.
- 수동 QA 후 main 머지 → Vercel 자동 배포.
- 후속(범위 밖): document-register 별도 처리, 리스트 가상화/페이지네이션, 모바일 고정 옵션.
