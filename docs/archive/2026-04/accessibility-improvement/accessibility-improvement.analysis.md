# 접근성개선 — Gap Analysis Report

- **분석일**: 2026-04-15
- **Match Rate**: **75%**
- **판정**: WARNING (90% 미달 → 자동 개선 필요)

## 항목별 판정 요약

| # | Design 항목 | 판정 | Gap |
|---|------------|:----:|-----|
| 1 | beginner-mode 스토어 | Partial | `migrate` 함수 + `version: 1` 누락 |
| 2 | workflow-status API | Match | - |
| 3 | WorkflowProgress 컴포넌트 | Partial | `role="navigation"` + `aria-label` 누락 |
| 4 | PageGuide 컴포넌트 | Match | - |
| 5 | page-guides.ts 데이터 | Match | - |
| 6 | EmptyState 컴포넌트 | Match | - |
| 7 | layout.tsx 사이드바 | Partial | Switch `aria-label` 누락 |
| 8 | dashboard/page.tsx | Match | - |
| 9 | P0 페이지 통합 | Partial | settlement EmptyState 누락 |
| 10 | P1 페이지 통합 | Missing | reports, document-register, batch-import 미적용 |
| 11 | help-texts.ts 보충 | Match | - |
| 12 | ChatBubble 컨텍스트 | Missing | chat API 시스템 프롬프트 미수정 |

## Gap 상세

### Missing (2건)
- **P1 페이지 통합**: `page-guides.ts`에 데이터 준비 완료, 3개 페이지에 import + JSX 추가만 필요
- **ChatBubble 컨텍스트**: `/api/chat/route.ts`에 pathname 기반 가이드 추가 필요

### Partial (4건)
- **beginner-mode migrate**: 기존 help-mode localStorage → beginner-mode 마이그레이션 함수
- **WorkflowProgress ARIA**: Card 레벨 `role="navigation"` + `aria-label="회계 업무 진행 현황"`
- **layout Switch ARIA**: `aria-label="초보자 모드 켜기/끄기"`
- **settlement EmptyState**: 결산 데이터 없을 때 안내 + CTA

## 권장 조치 (Match Rate 90%+ 달성용)
1. P1 페이지 3개에 PageGuide 추가 (단순 import + JSX)
2. settlement EmptyState 추가
3. ARIA 속성 3곳 보완
4. ChatBubble 컨텍스트는 P2로 분류 가능
