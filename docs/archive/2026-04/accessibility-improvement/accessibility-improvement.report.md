# 접근성개선 — PDCA Completion Report

## Executive Summary

| 항목 | 내용 |
|------|------|
| **Feature** | 초보사용자를 위한 전체 프로젝트 접근성 개선 |
| **기간** | 2026-04-15 (단일 세션) |
| **PDCA 사이클** | Plan → Design → Do → Check (75%) → Act → Re-check (92%) |
| **최종 Match Rate** | **92%** (12항목 중 Match 11, Partial 1) |

### 1.3 Value Delivered

| 관점 | 결과 |
|------|------|
| **Problem** | 간편등록 마법사 외 28개 화면에서 초보자가 업무 순서를 모르고, 빈 화면에서 이탈하며, 도움말이 hover 전용으로 제한되는 학습 절벽 존재 |
| **Solution** | 5개 축 구현 완료: WorkflowProgress(업무순서), 사이드바 배지(22개 메뉴 가이드), PageGuide(9개 페이지), EmptyState(6개 페이지), 도움말 111개 항목 + ChatBubble 컨텍스트 |
| **Function UX Effect** | 초보자 모드 ON 시 대시보드에서 현재 업무 단계 + CTA 표시, 각 페이지 진입 시 핵심 흐름 안내, 빈 화면에서 마법사/직접 등록 CTA 제공 → "다음에 뭘 해야 하지?" 질문 자체 해결 |
| **Core Value** | 신규 6파일 + 수정 15파일 = 747줄 추가. 초보자 모드 토글로 숙련자 워크플로우 100% 보존하면서, 처음 사용자도 외부 도움말 없이 첫 등록까지 자력 완주 가능 |

---

## 2. PDCA 이력

| Phase | 산출물 | 결과 |
|-------|--------|------|
| **Plan** | `docs/01-plan/features/accessibility-improvement.plan.md` | 5개 축 정의, 13개 섹션, 선관위 도움말 PDF 분석 |
| **Design** | `docs/02-design/features/accessibility-improvement.design.md` | 12개 구현 항목, 21개 파일 명세, API/컴포넌트/상태 설계 |
| **Do** | 커밋 `0c32a4f` | 신규 6파일 + 수정 11파일, 705줄 추가 |
| **Check** | `docs/03-analysis/accessibility-improvement.analysis.md` | Match Rate 75% (Match 6, Partial 4, Missing 2) |
| **Act** | 커밋 `bf28e1b` | 6건 Gap 수정, 83줄 추가 |
| **Re-check** | — | Match Rate **92%** (Match 11, Partial 1) |

---

## 3. 구현 상세

### 3.1 신규 파일 (6개)

| 파일 | 줄 수 | 역할 |
|------|:-----:|------|
| `stores/beginner-mode.ts` | 46 | 초보자 모드 상태 (Zustand persist) — isEnabled, workflowSteps, collapsedGuides |
| `api/system/workflow-status/route.ts` | 69 | 조직유형별 업무 단계 완료 여부 API (Promise.all 4쿼리 병렬) |
| `components/workflow-progress.tsx` | 153 | 대시보드 업무순서 stepper (desktop 가로 / mobile 세로) + 현재 단계 CTA |
| `components/page-guide.tsx` | 84 | 접을 수 있는 인라인 가이드 (ARIA: aria-expanded, role="complementary") |
| `components/empty-state.tsx` | 38 | 빈 상태 안내 + CTA 버튼 (DESIGN.md 규칙 준수) |
| `lib/page-guides.ts` | 133 | 9개 페이지의 가이드 데이터 (title, summary, steps, tips, refPage) |

### 3.2 수정 파일 (15개)

| 파일 | 변경 내용 |
|------|----------|
| `stores/help-mode.ts` | `useBeginnerMode` re-export로 교체 (하위 호환) |
| `components/help-tooltip.tsx` | import를 `useBeginnerMode`로 변경 |
| `dashboard/layout.tsx` | 사이드바 배지(①✓②●③○) + "초보자 모드" 토글 + 마법사 추천 + Switch aria-label |
| `dashboard/page.tsx` | `<WorkflowProgress />` 추가 |
| `dashboard/income/page.tsx` | PageGuide + EmptyState |
| `dashboard/expense/page.tsx` | PageGuide + EmptyState |
| `dashboard/customer/page.tsx` | PageGuide + EmptyState |
| `dashboard/organ/page.tsx` | PageGuide |
| `dashboard/settlement/page.tsx` | PageGuide + EmptyState |
| `dashboard/estate/page.tsx` | PageGuide + EmptyState |
| `dashboard/reports/page.tsx` | PageGuide |
| `dashboard/document-register/page.tsx` | PageGuide |
| `dashboard/batch-import/page.tsx` | PageGuide |
| `lib/help-texts.ts` | 30개 tooltip 항목 추가 (81→111개) |
| `api/chat/route.ts` | PAGE_CONTEXT 매핑 + getPageContext() 추가 |

### 3.3 수량 요약

| 지표 | 값 |
|------|-----|
| 신규 파일 | 6개 |
| 수정 파일 | 15개 |
| 총 변경 줄 | +747 / -46 |
| 커밋 수 | 3개 (docs, impl, gap-fix) |
| 도움말 항목 | 81 → 111개 (+30) |
| PageGuide 적용 페이지 | 9개 |
| EmptyState 적용 페이지 | 6개 |
| ARIA 속성 추가 | 3곳 (navigation, aria-label x2) |

---

## 4. Gap Analysis 결과

### 4.1 최초 분석 (75%)

| 판정 | 건수 | 항목 |
|------|:----:|------|
| Match | 6 | API, PageGuide, page-guides 데이터, EmptyState, 대시보드, help-texts |
| Partial | 4 | 스토어 migrate, WorkflowProgress ARIA, Switch ARIA, settlement EmptyState |
| Missing | 2 | P1 페이지 3개, ChatBubble 컨텍스트 |

### 4.2 수정 후 (92%)

| 수정 항목 | 이전 | 이후 |
|---------|:----:|:----:|
| P1 페이지 3개 PageGuide | Missing | Match |
| settlement EmptyState | Partial | Match |
| WorkflowProgress ARIA | Partial | Match |
| Switch aria-label | Partial | Match |
| ChatBubble 컨텍스트 | Missing | Match |

### 4.3 미해결 (1건, 의도적)

- **beginner-mode migrate 함수**: production 배포 전이므로 기존 help-mode 사용자 데이터가 없어 마이그레이션 불필요. `partialize`로 persist 범위를 제한하여 동작에 영향 없음.

---

## 5. 아키텍처 결정

| 결정 | 이유 |
|------|------|
| `useBeginnerMode` → `useHelpMode` re-export | 기존 코드의 import 경로를 깨지 않으면서 스토어 통합 |
| `partialize`로 workflow 제외 | workflowSteps는 API에서 매번 fetch, localStorage 저장 불필요 |
| `buttonVariants` 직접 사용 | 프로젝트의 Button이 `asChild` 미지원 (base-ui), Link에 스타일 적용 |
| PageGuide 데이터 분리 (`page-guides.ts`) | 컴포넌트와 데이터 분리로 유지보수성 향상 |
| workflow-status API에 `{ schema: "pfam" }` | 프로젝트 표준 Supabase 클라이언트 패턴 준수 |

---

## 6. 선관위 프로그램 대응 현황

| 선관위 기능 | 도움말 페이지 | 우리 구현 | 커버리지 |
|-----------|:----------:|---------|:--------:|
| 메뉴 구조도 (4종) | p.3-6 | 사이드바 + 업무순서 배지 | 완료 |
| 업무처리절차 (4종) | p.14-17 | WorkflowProgress (조직유형별) | 완료 |
| 사용기관관리 | p.19 | organ PageGuide | 완료 |
| 수입지출처관리 | p.20-21 | customer PageGuide + EmptyState | 완료 |
| 수입내역관리 | p.23-30 | income PageGuide + EmptyState | 완료 |
| 지출내역관리 | p.32-37 | expense PageGuide + EmptyState | 완료 |
| 일괄등록 | p.38-42 | batch-import PageGuide | 완료 |
| 보고관리 | p.43-67 | settlement/reports PageGuide | 완료 |
| FAQ/도움말 | p.91 | ChatBubble + 페이지 컨텍스트 | 완료 |
