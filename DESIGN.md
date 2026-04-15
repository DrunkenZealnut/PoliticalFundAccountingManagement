# Design System — 정치자금 회계관리

## Product Context
- **What this is:** 선거 캠페인 정치자금의 수입/지출을 관리하는 회계 시스템
- **Who it's for:** 초보 회계책임자 (자원봉사자, 신규 담당자, 처음 출마하는 후보자 측)
- **Space/industry:** 정부/공공 (선관위 규정 준수 필수)
- **Project type:** Data-heavy web app / dashboard (28+ pages)

## Aesthetic Direction
- **Direction:** Industrial/Utilitarian + Warm Professionalism
- **Decoration level:** Minimal (타이포그래피와 색상이 모든 일을 함)
- **Mood:** 정부 시스템의 신뢰감을 유지하면서 초보자가 겁먹지 않는 따뜻함. "이 도구를 믿어도 되겠다"는 느낌.
- **Classification:** APP UI (workspace-driven, data-dense, task-focused)

## Typography
- **Display/Hero:** Pretendard Bold — 한국어 UI 최적화, 깔끔하고 권위감
- **Body:** Pretendard Regular — 장문 데이터에서도 가독성 유지
- **UI/Labels:** Pretendard Medium
- **Data/Tables:** Pretendard (tabular-nums) — 숫자 열 정렬
- **Code:** JetBrains Mono — 증빙번호, 코드값 표시
- **Loading:** `cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css`
- **Scale:**
  - Display: 36px / Bold / -0.03em / 1.2 line-height
  - H1: 22px / Bold / -0.02em / 1.3
  - H2: 18px / SemiBold / -0.01em / 1.4
  - H3: 15px / SemiBold / 1.5
  - Body: 14-15px / Regular / 1.7
  - Small: 13px / Regular / 1.5
  - Caption: 11-12px / Medium / 1.4

## Color
- **Approach:** Restrained (1 accent + neutrals)
- **Primary:** `#1B3A5C` — 깊은 남색. 정부/금융의 신뢰. 헤더, 선택 상태, 주요 버튼
- **Primary Light:** `#2A5580` — 호버 상태
- **Accent:** `#D4883A` — 따뜻한 호박색. CTA, 주의 환기, 마법사 진행 강조
- **Accent Light:** `#E8A45C` — 호버 상태
- **Surface:** `#FFFFFF` — 카드, 모달 배경
- **Background:** `#F8F7F5` — 따뜻한 회백색 페이지 배경
- **Border:** `#E2E0DC` — 따뜻한 회색 보더
- **Border Hover:** `#C8C5C0`
- **Text:** `#1A1A1A` — 거의 블랙 (순수 블랙보다 부드러움)
- **Text Muted:** `#6B7280` — 보조 텍스트, 설명
- **Semantic:**
  - Success: `#166534` / bg `#F0FDF4`
  - Warning: `#92400E` / bg `#FFFBEB`
  - Error: `#991B1B` / bg `#FEF2F2`
  - Info: `#1E40AF` / bg `#EFF6FF`
- **Dark mode strategy:** CSS 변수 기반 전환. 배경 `#141414`, 서피스 `#1E1E1E`, primary를 `#6B9FD4`로 밝게, 채도 10-20% 감소

## Spacing
- **Base unit:** 4px
- **Density:** Comfortable (초보자에게 여유 있는 간격)
- **Scale:** 2xs(2px) xs(4px) sm(8px) md(16px) lg(24px) xl(32px) 2xl(48px) 3xl(64px)

## Layout
- **Approach:** Grid-disciplined
- **Grid:** 사이드바(240px) + 메인 콘텐츠(fluid)
- **Max content width:** 960px (폼/마법사), full-width (데이터 테이블)
- **Border radius:** sm: 4px (뱃지, 작은 요소) / md: 6px (인풋, 버튼) / lg: 8px (카드, 모달) / full: 9999px (스텝 인디케이터)

## Motion
- **Approach:** Minimal-functional
- **Easing:** enter(ease-out) exit(ease-in) move(ease-in-out)
- **Duration:** micro(50-100ms) short(150ms) medium(250ms)
- **Usage:**
  - 스텝 전환: 150ms fade + slide
  - 카드 호버: shadow 변화 150ms
  - 모달/다이얼로그: 250ms fade-in
  - 폼 유효성 검증 피드백: 즉시 (50ms)
  - 로딩 스피너: CSS animation

## Component Patterns
- **Buttons:** Primary(남색) / Accent(호박색, CTA) / Outline(보더) / Ghost(텍스트만)
- **Cards:** 흰 배경 + 1px 보더(#E2E0DC) + 8px radius + subtle shadow on hover
- **Tables:** 좌측 정렬 기본, 금액 우측 정렬, 합계행 볼드 + 상단 2px 보더
- **Alerts:** 시맨틱 색상 배경 + 아이콘 + 텍스트 (success/warning/error/info)
- **Empty states:** 따뜻한 문구 + 주요 액션 버튼 + 맥락 설명 (절대 "데이터 없음"만 표시하지 않음)

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-10 | Initial design system created | /design-consultation based on product context (정치자금 회계관리, 초보자 대상) |
| 2026-04-10 | Pretendard selected as primary font | 한국어 UI 최적화 서체, tabular-nums 지원, 정부/회계 도구에 적합한 깔끔함 |
| 2026-04-10 | Warm off-white background (#F8F7F5) | 순백 대비 눈 피로 감소, 정부 시스템 차가움을 누그러뜨림 |
| 2026-04-10 | Amber accent (#D4883A) | 남색 일색인 회계 소프트웨어에서 차별화, 초보자에게 온기와 주목 |
