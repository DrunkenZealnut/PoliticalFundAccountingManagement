# real-data QA Analysis Report

> **Analysis Type**: Real-Data QA (Test → Fix → Verify)
>
> **Project**: 정치자금 회계관리 시스템 (political-fund-accounting)
> **Tester**: Claude Code (/qa, Standard tier)
> **Date**: 2026-06-02 (정리 2026-06-03)
> **Target**: `http://localhost:3001` (Next.js 16.2.1 dev, Turbopack)
> **Account**: kcsvictory@gmail.com · org 9 "오준석후보" (candidate)
> **Data**: 실데이터 (수입 18,099,055원 / 지출 14,796,125원 / 잔액 3,302,930원, 집행률 82%)
> **Source Report**: `app/.gstack/qa-reports/qa-report-localhost-3001-2026-06-02.md`
> **Related PRs**: #49 (링크 수정), #50 (CLAUDE.md 갱신)

---

## 1. Overview

### 1.1 Scope
대시보드 전 라우트를 실데이터로 순회하며 로드/콘솔에러/렌더/데이터 표시를 점검하고, 발견 이슈를 소스에서 수정·검증.

| 항목 | 값 |
|------|-----|
| 점검 라우트 | 22 / 22 |
| 콘솔 에러 | 0 (전 페이지) |
| 발견 이슈 | 6 (High 1, Medium 3, Low 2) |
| Health score | 86 → 96 (수정 후) |

### 1.2 결과 요약

```
┌──────────────────────────────────────────────┐
│  발견 6건                                      │
├──────────────────────────────────────────────┤
│  ✅ 수정 완료(코드):   4건 (PR #49 머지)        │
│  ✅ 정리 완료(데이터): 1건 (프로덕션 DB)        │
│  🟡 후속 과제:         1건 (미구현 페이지)      │
└──────────────────────────────────────────────┘
```

---

## 2. 발견 이슈

| # | 심각도 | 영역 | 내용 | 상태 |
|---|--------|------|------|------|
| 001 | **High** | 라우팅 | 대시보드 "제출파일 생성" → `/dashboard/export-db` **404** | ✅ Fixed (#49) |
| 002 | Medium | 라우팅 | party "취합작업" → `/dashboard/aggregation` 404 | ✅ Fixed (#49) |
| 003 | Medium | 라우팅 | supporter "기부자 조회" → `/dashboard/donor-search` 404 | ✅ Fixed (#49) |
| 004 | Medium | 미구현 | party "당비영수증" → `/dashboard/party-fee-receipt` 페이지 없음 | 🟡 퀵액션 제거(#49), 페이지 구현 후속 |
| 005 | Low | 잔여물 | `app/src/app/dashboard/layout 2.tsx` 복사본 파일 | ✅ 삭제(미추적 로컬파일) |
| 006 | Low | 데이터 | `user_organ` 기본조직(`is_default`) 2건 중복 (org 9·11) | ✅ DB 정리 |

---

## 3. 이슈 상세

### ISSUE-001 (High) — 대시보드 "제출파일 생성" 카드 404 ✅
- **재현**: candidate 계정 대시보드 → "제출파일 생성" 퀵액션 → `/dashboard/export-db` → Next.js 기본 404. (라이브 재현, 스크린샷 증거)
- **근본 원인**: `components/dashboard/QuickActions.tsx`의 `href`가 실제 라우트와 어긋남. `export-db` 디렉토리 미존재. 실제 페이지는 `/dashboard/submit`("제출파일 생성").
- **수정**: `href` `/dashboard/export-db` → `/dashboard/submit`.
- **검증**: 대시보드 링크가 `submit`으로 변경·`export-db` 소거 확인. submit 페이지는 QA에서 정상.

### ISSUE-002 (Medium) — party "취합작업" 깨진 링크 ✅
- `href` `/dashboard/aggregation`(미존재) → `/dashboard/aggregate`("취합작업"). 페이지 제목 대조로 확정.

### ISSUE-003 (Medium) — supporter "기부자 조회" 깨진 링크 ✅
- `href` `/dashboard/donor-search`(미존재) → `/dashboard/donors`("후원금 기부자 조회").

> 002·003은 로그인 계정이 candidate라 라이브 재현 불가. 라우트/페이지 제목 대조로 확정.

### ISSUE-004 (Medium) — party "당비영수증" 대상 페이지 미존재 🟡
- `href` `/dashboard/party-fee-receipt` → 대응 라우트가 **존재하지 않음**(유사 라우트도 없음 = 미구현).
- **조치**: 재연결 대상이 없어 퀵액션을 제거(#49).
- **후속 과제**: "당비영수증" 기능이 필요하면 `/dashboard/party-fee-receipt` 페이지를 신규 구현하고 퀵액션 복원.

### ISSUE-005 (Low) — 잔여 복사본 파일 ✅
- `app/src/app/dashboard/layout 2.tsx` (9.6KB, 권한 600) — `layout.tsx`(16.5KB)와 다른 잔여물. Next.js 미사용.
- git 미추적 로컬 파일이라 디스크에서만 삭제.

### ISSUE-006 (Low) — 기본조직 데이터 중복 ✅
- `pfam.user_organ`에서 이 유저의 `is_default=true`가 2건(org 9·11)이어야 하나 1건이어야 함.
- **조치**: org 11(`id=19`)의 `is_default`를 `false`로 정리 (프로덕션 DB, service-role PATCH). 코드 변경 아님.
- **참고**: 단일 Supabase 프로젝트(스테이징 없음)라 프로덕션 직접 수정.

---

## 4. 재발 방지

- **회귀 테스트**: `app/src/components/dashboard/QuickActions.test.tsx` 신설 — 모든 퀵액션 `href`가 실제 `app/dashboard/<route>/page.tsx`와 매칭되는지 검증 (11 passed). 이 부류(href↔라우트 불일치 404) 재발 차단.
- **문서화**: `CLAUDE.md`에 "Org-Type Differentiation" 섹션 추가 — orgType별 QuickActions 분기 + href 일치 규칙 명시 (PR #50).

## 5. 점검 라우트 (전부 콘솔 클린)
income(14행)·expense(28행)·customer(25행)·organ·settlement·estate(1행)·codes·income-expense-book·income-expense-report·reports·backup·submit·document-register·reimbursement(1행)·audit·asset-report(2표 9행)·forms·customer-batch·batch-import·resolution·reset·dashboard — 모두 정상 렌더. `export-db`만 404.

## 6. 도구/환경 메모 (앱 버그 아님)
- browse `fill`/`type`가 React 제어 input에 값 미반영 → 네이티브 setter + `input` 이벤트로 우회(실사용자 타이핑은 정상).
- dev 환경에서 macOS iCloud 동기화 폭주 시 Turbopack 첫 컴파일 hang(CPU 0%) — 동기화 중단으로 해소.
- browse 데몬이 호출 간 세션 미유지 + 간헐 크래시 → 페이지당 1회 호출(로그인 포함)·재시도로 대응.
