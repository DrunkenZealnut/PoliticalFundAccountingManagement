# 2026년 6월 아카이브

PDCA 사이클 완료 후 아카이브된 기능 목록.

## Features

### dashboard-org-differentiation (메인 대시보드 조직 유형별 콘텐츠 차별화)

- **기간**: 2026-06-01 (1일, 단일 세션 — Plan→Design→Do→Check→Act→ReCheck→Report)
- **브랜치**: `feat/dashboard-org-differentiation`
- **Match Rate**: 97% (Iter 0: 89% → Iter 1: 97%, +8%p)
- **Iteration**: 1회 (보전 산식 SSOT 통일 + 후보자 기부금 식별 교정 + Edge 테스트 보강)
- **테스트**: org-metrics 단위 15건, 전체 suite 315건 통과 / ESLint 0 / Next build 성공
- **목적**: `/dashboard`를 `orgType`(candidate/supporter)별로 다른 요약 카드·차트로 차별화. 정당/국회의원은 기존 공통 뷰 유지
- **핵심 산출물**:
  - 신규 순수 함수: `lib/dashboard/org-metrics.ts` (`computeCandidateMetrics`/`computeSupporterMetrics`, `OrgMetricsContext` 주입식)
  - 신규 공통 렌더러: `components/dashboard/MetricCardGrid.tsx`
  - 후보자 뷰: `candidate/{CandidateSummaryCards, FundingSourceChart, ElectionExpenseChart}` (선거비용/외·보전예상액·집행률 + 수입출처·선거비용비중)
  - 후원회 뷰: `supporter/{SupporterSummaryCards, FundraisingTrendChart, GrantStatusChart}` (모금총액·기부자수·후보자지급·잔여 + 월별추이·지급현황)
  - 수정: `use-dashboard-data.ts`(select 3컬럼 확장 + 컨텍스트 주입), `app/dashboard/page.tsx`(orgType 분기)
  - 규모: 신규 8 + 수정 2 파일, 약 1,458줄
- **확정 산식**:
  - 선거비용/선거비용외 = `exp_sec_cd > 0` (reports 패턴)
  - 보전 예상액 = `aggregateReimbursementByFundingSource()` 재사용 → 보전청구서(claim-form)와 100% 동일 기준 (SSOT)
  - 수입 출처 = `classifyFundingSource(acc_sec_cd)` (82보조금/83보조금외/84후보자자산/85후원회기부금)
  - 후보자 기부금 지급 = 후원회 지출 중 **과목 코드명 "기부금"** (item_sec_cd)
- **핵심 성과 — 실데이터 검증으로 가정 오류 사전 차단**: 초기 가정(후보자 기부금=`acc_sec_cd=85`)이 `Fund_Data_2.db`(후원회 55건) 검증으로 오류임을 확인. 후원회 지출 `acc_sec_cd`는 수입(1)/지출(2) 플래그일 뿐, 후보자 기부금은 과목 코드명 "기부금"으로 기록 → item 코드명 정확 매칭으로 교정 (미수정 시 "후보자 기부금 지급" 항상 0원 표시되는 운영 버그였음)
- **잔여 갭**: GAP-5(currentYM `new Date()` 의존 — 설계 부합, 정보성) / 수동 QA(실 계정 화면 검증)·커밋·PR 미진행

문서:
- [Plan](dashboard-org-differentiation/dashboard-org-differentiation.plan.md)
- [Design](dashboard-org-differentiation/dashboard-org-differentiation.design.md)
- [Analysis](dashboard-org-differentiation/dashboard-org-differentiation.analysis.md)
- [Report](dashboard-org-differentiation/dashboard-org-differentiation.report.md)
