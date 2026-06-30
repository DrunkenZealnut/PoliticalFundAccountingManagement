# Plan — 수입·지출 내역 선택 상세 영역 상단 고정(sticky) UI 개선

- 기능: `ledger-detail-sticky`
- 단계: Plan
- 작성일: 2026-06-30
- 유형: UI/UX 개선 (순수 레이아웃·CSS, 데이터·저장 로직 불변)
- 관련 메모: [[ledger-summary-header]] · [[expense-page-bypasses-accbook-api]]
- 관련 문서: `DESIGN.md` (색·spacing·그림자 토큰 준수)

## Executive Summary

| 관점 | 내용 |
|------|------|
| **Problem** | 수입(income)·지출(expense) 내역 목록에서 행을 선택하면 그 항목의 구체 정보가 **페이지 최상단의 입력 폼**에 채워진다. 그런데 이 영역은 `sticky`/`fixed` 없이 **정적 흐름(static)**에 있어, 리스트가 길어 아래로 스크롤하면 상세(입력 폼)가 **뷰포트 밖으로 사라진다**. 결과적으로 선택한 행의 정보를 다시 보려면 매번 맨 위로 스크롤해야 해 **정보 확인이 대단히 불편**하다. income·expense·document-register 모두 동일 구조. |
| **Solution** | 선택 상세를 담는 **입력 폼 컨테이너에 `position: sticky; top` 을 적용**해 페이지를 스크롤해도 상단에 고정시킨다. 불투명 배경·하단 구분선/그림자·`z-index`로 리스트 위에 떠 있게 하고, 폼이 큰 화면(특히 지출)은 **컴팩트/접기**로 점유 높이를 관리한다. 데이터·집계·저장 로직은 일절 건드리지 않는 **순수 UI/CSS 변경**. |
| **Function/UX** | 리스트를 아래로 스크롤해도 선택 항목 상세가 **항상 상단에 노출** → 정보를 확인하며 긴 내역을 탐색할 수 있다. income·expense·document-register **3개 입력 페이지에 일관 적용**. |
| **Core Value** | 회계 입력·검토 효율 향상(긴 내역에서 선택 항목 정보를 잃지 않음) + 데이터/로직 무변경으로 **회귀 위험 최소**(CSS·레이아웃 한정). |

## 1. 배경 / 문제

### 1.1 현상 (사용자 보고)
> "수입이나 지출내역목록에서 항목을 선택하면 구체적인 정보가 최상단에 나오는데, 리스트가 아래로 내려가면 정보가 보이는 영역이 안 나옵니다. 그래서 정보 확인이 대단히 불편합니다."

### 1.2 구조 분석 (코드 조사 결과)
- **"선택 항목 상세 정보"의 실체는 독립 패널이 아니라 페이지 최상단의 입력 폼**이다. 행을 클릭하면 `selectRecord(r)`가 `selected` state와 `form`을 그 행 데이터로 채우고, 그 값이 입력 폼 필드에 표시된다.
  - income: `app/src/app/dashboard/income/page.tsx` — `selected` state(~52), `selectRecord`(~157), 입력 폼(~418–607), 테이블(~627–), 선택 행 하이라이트 `bg-blue-50`(~677).
  - expense: `app/src/app/dashboard/expense/page.tsx` — `selected`(~79), `selectRecord`(~296), 입력 폼(~580–888), 테이블(~907–), 하이라이트(~961). 추가로 후보자 전용 `FundingAllocationPanel`·`FundingDraftPreview`·`EvidenceFileManager`로 **폼이 더 큼**(총 1063줄).
  - document-register: `app/src/app/dashboard/document-register/page.tsx`(455줄) — 수기 입력(증빙서류 등록), 입력 폼+리스트 구조 유사(상세 구조는 Design에서 확정 확인).
- **레이아웃**: 페이지 전체가 `<div className="space-y-6">` 세로 스택. 순서 = PageGuide → OrgCycleLockBanner → 제목/요약 → LedgerSummaryHeader(현황 요약) → **입력 폼(상세)** → 검색 패널 → 테이블.
- **스크롤/포지셔닝**: 입력 폼·테이블 모두 정적 흐름. 테이블 컨테이너만 `overflow-x-auto`(좌우 스크롤). 세로 스크롤은 **페이지 전체 스크롤**에 의존 → 리스트가 길면 상단 입력 폼이 화면 밖으로 밀려난다. `sticky`/`fixed` 미적용.

### 1.3 근본 원인
선택 상세를 표시하는 입력 폼이 **정적 흐름 + 페이지 전체 스크롤** 조합이라, 리스트 하단을 보려고 스크롤하면 상세가 함께 위로 사라진다. 즉 상세와 리스트를 **동시에 볼 수 없는 레이아웃**이 원인이며, 데이터/로직 문제가 아니다.

## 2. 목표 / 비목표

### 2.1 목표 (Goals)
- 선택 항목 상세(입력 폼)를 **리스트 스크롤 중에도 화면에 유지**한다(상단 고정).
- income·expense·document-register **3개 페이지 일관 적용**.
- `DESIGN.md` 디자인 토큰(배경·spacing·그림자·z-index 위계)을 준수.
- **데이터·집계·저장·정렬·영수증 채번 등 기존 로직 무변경**(순수 UI/CSS).

### 2.2 비목표 (Non-goals)
- 입력/저장 흐름, 폼 필드 구성, 검증(`isAccDateInOrgPeriod` 등) 변경 — 하지 않음.
- 상세 패널을 모달/드로어 등 **다른 인터랙션 모델로 교체** — 하지 않음(사용자 결정 = sticky 고정).
- 좌우 2단(마스터-디테일) 분할 — 하지 않음(넓은 테이블과 충돌, 사용자 미선택).
- 테이블 가상화/페이지네이션 등 리스트 성능 개선 — 본 건 범위 밖(후속).

## 3. 기능 요구사항 (FR)

- **FR-1 (상세 폼 sticky 고정)**: 선택 상세를 담는 입력 폼 컨테이너에 `sticky`를 적용해 페이지 스크롤 시 상단(`top`)에 고정한다. 고정 시 **불투명 배경 + 하단 구분선/그림자**로 리스트와 시각 분리(스크롤되는 행이 폼 아래로 비쳐 보이지 않게).
- **FR-2 (z-index 위계)**: sticky 폼이 테이블 헤더·드롭다운(과목/계정 select)·`CustomerSearchDialog` 등과 **겹침·클릭 가림 없이** 올바른 위계로 쌓이게 한다(다이얼로그/팝오버는 폼보다 위).
- **FR-3 (큰 폼 점유 높이 관리)**: 폼이 큰 화면(특히 expense — 자금배분/증빙 패널 포함)에서 sticky 영역이 화면을 과도하게 차지하지 않도록 **컴팩트화 또는 접기/펼치기**(혹은 선택 시 핵심 요약만 고정)를 둔다. 구체 방식은 Design에서 확정(OQ-1).
- **FR-4 (반응형)**: 모바일/좁은 화면에서 sticky 폼이 리스트를 과도하게 가리지 않게 한다(sticky 해제 또는 컴팩트 요약만 고정). 데스크톱 우선, 모바일 동작은 Design 확정(OQ-3).
- **FR-5 (3개 페이지 일관 적용)**: income·expense·document-register에 동일 동작 적용. 중복 최소화를 위해 **공통 패턴(유틸 클래스) 또는 공통 래퍼 컴포넌트**로 추출 검토(OQ-5).
- **FR-6 (디자인 일관성·로직 불변)**: `DESIGN.md` 토큰만 사용, 신규 색/그림자 임의 추가 금지. 저장/검증/집계/정렬 코드 **무변경**.
- **FR-7 (sticky 동작 보장)**: `position: sticky`는 **조상 중 `overflow: hidden/auto/scroll`**이 있으면 깨진다. dashboard 레이아웃(`dashboard/layout`)·페이지 래퍼 조상 체인을 점검해 sticky가 실제로 동작하는 컨테이너 구조를 확보한다.

## 4. 설계 스케치 (Design 단계에서 확정)

```
[현행]  space-y-6 (페이지 전체 스크롤)
  ├─ 제목/요약 ─┐
  ├─ LedgerSummaryHeader │  ← 스크롤하면 전부 위로 사라짐
  ├─ 입력 폼(상세)  ─┘     ← 여기가 사라져서 불편
  ├─ 검색
  └─ 테이블(길다)

[개선]  입력 폼 컨테이너에 sticky
  ├─ 제목/요약            ← 스크롤로 사라져도 무방
  ├─ LedgerSummaryHeader  ← (동시 고정 여부는 OQ-4)
  ╔═ 입력 폼(상세) ══════╗ ← position: sticky; top:0(또는 헤더 높이)
  ║ 계정 과목 금액 날짜  ║   z-index↑, 불투명 bg, 하단 border/shadow
  ╚══════════════════════╝
  ├─ 검색
  └─ 테이블  ← 이 영역만 스크롤되며 흐르고, 상세는 상단에 붙어 유지
```

핵심 구현 포인트(Design 확정 대상):
- `sticky top-{N}`의 `N` = 상단 고정 헤더/네비 높이에 맞춤(겹침 방지).
- 불투명 배경(`bg-white` 등 DESIGN.md 토큰) + `border-b`/`shadow-sm` + 적정 `z-index`.
- 조상 `overflow` 점검(FR-7). 필요 시 sticky 컨테이너 경계 조정.
- 큰 폼(expense)은 접기/컴팩트(FR-3) 또는 선택 시 요약 우선.

## 5. 영향 받는 파일

1. `app/src/app/dashboard/income/page.tsx` — 입력 폼 컨테이너에 sticky 클래스/구조.
2. `app/src/app/dashboard/expense/page.tsx` — 동일 + 큰 폼 점유 관리(FR-3).
3. `app/src/app/dashboard/document-register/page.tsx` — 구조 확인 후 동일 패턴 적용.
4. (선택) 공통 래퍼/유틸 — 3곳 중복 제거 시 신규 컴포넌트 또는 공유 className(OQ-5). 예: `components/dashboard/StickyDetailForm.tsx`(가칭).
5. (점검) `app/src/app/dashboard/layout.tsx` 및 조상 — sticky를 깨는 `overflow` 여부(FR-7).
6. (참조) `DESIGN.md` — 사용 토큰 확인.

> 데이터/API/집계/정렬/export 경로는 **변경 없음**(영향 파일 아님).

## 6. 엣지 케이스
- **미선택(신규 입력) 상태**: 아직 행을 고르지 않았을 때도 sticky 유지할지, 선택 시에만 강조할지(OQ-2).
- **폼이 화면보다 큰 경우**(저해상도/모바일 + expense 큰 폼): sticky가 리스트를 거의 가림 → FR-3/FR-4 보완 필수.
- **과목/계정 드롭다운·달력 팝오버**가 sticky 폼 경계 밖으로 펼쳐질 때 잘리지 않게(z-index/overflow).
- **CustomerSearchDialog 등 모달**이 sticky 폼보다 위에 오도록 위계 보장.
- **LedgerSummaryHeader와 동시 상단 고정** 시 둘이 합쳐 화면을 과점유(OQ-4).
- **OrgCycleLockBanner(읽기전용 잠금)** 표시 중 레이아웃 — 배너와 sticky 폼 공존 확인.
- **테이블 가로 스크롤(`overflow-x-auto`)** 과 세로 sticky 상호작용(가로 스크롤 시 폼은 고정 유지).

## 7. 테스트 / 검증 계획
- **수동 QA(주)**: income·expense·document-register 각각에서 ①행 선택 → ②리스트를 끝까지 스크롤 → 상세가 상단에 계속 보이는지, ③드롭다운/달력/고객검색 다이얼로그가 가려지지 않는지, ④모바일 폭(반응형)에서 동작, ⑤OrgCycleLock 배너/현황 요약과 레이아웃 충돌 없음.
- **회귀 무영향 확인**: 저장/검증/집계 로직 미변경이므로 기존 단위 테스트(vitest) 전부 통과(코드 진입점: `node node_modules/vitest/vitest.mjs run`). UI-only 변경이라 신규 데이터 테스트 불필요.
- (가능 시) 공통 컴포넌트로 추출하면 해당 컴포넌트 렌더 스모크 테스트 추가.
- **빌드/린트**: `node node_modules/next/dist/bin/next build`, `node node_modules/eslint/bin/eslint.js <경로>`.

## 8. 결정 (확정) / 미해결

### 확정된 결정 (사용자 승인)
- **D-1 레이아웃 = 상세 폼 상단 sticky 고정** (옵션 B). 좌우 분할/모달/리스트 내부 스크롤은 미채택(넓은 테이블·정보확인 목적 고려).
- **D-2 적용 범위 = income · expense · document-register** 3개 페이지 모두.

### 미해결 (Design에서 확정)
- **OQ-1**: sticky 대상이 **입력 폼 전체**인가, 아니면 선택 시 **핵심 요약 바**만 고정인가(특히 expense 큰 폼). → FR-3과 연동.
- **OQ-2**: 미선택(신규 입력) 상태에서도 sticky 유지 vs 선택 시에만 고정.
- **OQ-3**: 모바일/좁은 화면 동작 — sticky 해제 vs 컴팩트 요약만 고정.
- **OQ-4**: `LedgerSummaryHeader`(현황 요약)와 동시 상단 고정 시 우선순위/높이 배분(둘 다 고정 vs 상세만 고정).
- **OQ-5**: 3개 페이지 공통 래퍼 컴포넌트 추출 vs 페이지별 className(중복 허용).
- **OQ-6**: `document-register`의 입력 폼+리스트 구조가 income/expense와 동일한지 확정(다르면 적용 방식 조정).
- **OQ-7**: sticky `top` 오프셋 값(상단 고정 네비/헤더 높이)과 z-index 토큰 확정(FR-2/FR-7).

## 9. 리스크
- **sticky 무효화**: 조상 `overflow`로 sticky가 동작 안 할 수 있음 → FR-7로 사전 점검(가장 흔한 실패 원인).
- **공간 과점유**: 큰 폼(expense)이 sticky로 고정되면 리스트 볼 공간 축소 → FR-3(컴팩트/접기) 필수.
- **z-index 충돌**: 드롭다운/달력/다이얼로그가 sticky 폼에 가리거나 잘림 → 위계 정의 필요.
- **디자인 일탈**: 임의 그림자/색 추가로 DESIGN.md 위반 → 토큰만 사용, Design에서 design-review 체크.
- **낮은 리스크 총평**: 데이터·로직 불변(UI/CSS 한정)이라 회계 정합/회귀 위험은 낮음. 주 리스크는 레이아웃 디테일.

## 10. 롤아웃
- 순수 UI 변경(스키마/마이그레이션 없음) → additive·즉시 reversible.
- `app/VERSION` feature MINOR bump + 루트 `CHANGELOG.md` 갱신([[release-version-ssot]]).
- 수동 QA(3개 페이지 × 데스크톱/모바일) 후 main 머지 → Vercel 자동 배포.
- 후속(별도): 리스트 가상화/페이지네이션, 좌우 분할 옵션 등은 본 건 범위 밖.
