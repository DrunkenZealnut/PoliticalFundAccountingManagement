# 초보사용자를 위한 전체 프로젝트 접근성 개선

## Executive Summary

| 관점 | 내용 |
|------|------|
| **Problem** | 간편등록 마법사는 초보자 친화적이지만 나머지 28개 관리 화면은 선관위 프로그램의 전문가형 UI를 그대로 따르고 있어, 초보 사용자가 마법사 이후 일반 화면으로 넘어가는 순간 심각한 학습 절벽(learning cliff)에 직면함 |
| **Solution** | 프로젝트 전체에 걸쳐 5개 축의 접근성 개선을 시행: (1) 업무순서 안내 시스템, (2) 사이드바 초보자 모드, (3) 각 페이지 인라인 가이드, (4) 빈 상태(empty state) 안내, (5) 도움말 시스템 고도화 |
| **Function UX Effect** | 초보자가 "다음에 뭘 해야 하지?"라고 느끼지 않도록, 모든 화면에서 현재 위치·다음 단계·왜 이것을 해야 하는지를 자연스럽게 알려주는 문맥형 안내 제공 |
| **Core Value** | 간편등록 마법사의 "초보자도 1분 등록" 경험을 프로젝트 전체로 확장하여, 선거 회계 진입 장벽을 시스템 전반에 걸쳐 해소함 |

---

## 1. 배경 및 문제

### 1.1 현재 상황 분석

**두 개의 극단적 UI 계층이 공존:**

| 구분 | 간편등록 마법사 | 일반 관리 화면 (28개) |
|------|--------------|-------------------|
| 대상 | 초보자 | 전문가 (선관위 프로그램 경험자) |
| 입력 방식 | 카드 선택 → 3단계 | 코드 직접 선택 (계정→과목→지출유형 3단계) |
| 안내 수준 | 이모지 카드, 설명 문구, 자동 코드 매핑 | HelpTooltip(hover 시에만), 최소한 |
| 흐름 안내 | Step indicator 1/2/3 | 없음 (사용자가 스스로 다음 화면 판단) |
| 빈 상태 | 첫 방문 안내 문구 제공 | 대부분 빈 테이블만 표시 |

**선관위 프로그램(참조 PDF)과의 비교:**

선관위 프로그램 도움말(v1.3, 2020)은 총 91페이지에 걸쳐 다음을 제공:
- 메뉴 구조도 (조직유형별 4종)
- 업무처리절차 흐름도 (조직유형별 4종: 8단계 순서)
- 화면별 상세 설명 (기능·주의사항·TIP)
- FAQ 및 오류 조치 가이드

우리 웹앱은 이 도움말 PDF의 정보를 **프로그램 안에 내재화**해야 하지만, 현재는 HelpTooltip 81개 항목만 구현되어 있고, 업무 흐름 안내나 페이지 간 연결 맥락은 전혀 없음.

### 1.2 핵심 문제 정의

| # | 문제 | 영향 | 근거 |
|---|------|------|------|
| P1 | **업무순서를 모름** | 초보자가 사용기관관리 → 거래처 등록 → 수입/지출 입력 → 결산 순서를 파악 불가 | 선관위 도움말 p.14-17 업무처리절차 |
| P2 | **사이드바 메뉴 과부하** | 22-26개 메뉴가 평면 나열, 초보자에게 압도감 | layout.tsx MENU_ITEMS 4그룹 |
| P3 | **빈 화면 당혹감** | 데이터 없는 상태에서 "무엇을 해야 하는지" 안내 없음 | 각 page.tsx 빈 상태 미구현 |
| P4 | **도움말 접근 방식** | hover tooltip만 존재, 모바일 불가, 단계별 가이드 없음 | help-tooltip.tsx, help-texts.ts |
| P5 | **마법사→일반 화면 단절** | 마법사로 등록 후 수정/조회하려면 일반 화면에서 해야 하는데 UI 전환 충격 | wizard vs income/expense 페이지 |

### 1.3 대상 사용자

- **주 대상**: 처음 선거 출마하는 후보자의 회계책임자 (선관위 프로그램 미경험)
- **부 대상**: 정당/후원회의 신규 담당자, 자원봉사자
- **비대상**: 선관위 프로그램 경험이 풍부한 숙련 사용자 (기존 UI에 익숙, 방해받지 않아야 함)

---

## 2. 목표

| # | 목표 | 측정 기준 |
|---|------|----------|
| G1 | 초보자가 첫 로그인~첫 수입/지출 등록까지 **외부 도움말 없이** 완료 가능 | 업무 흐름 가이드 완주율 |
| G2 | 모든 화면에서 "다음에 뭘 해야 하나" 질문이 **자체 해결** | 빈 상태에서의 이탈률 감소 |
| G3 | 숙련 사용자의 기존 워크플로우에 **방해 없음** | 초보자 모드 토글로 분리 |
| G4 | 선관위 프로그램 도움말의 핵심 정보가 **앱 내에서 접근** 가능 | 채팅봇 + 인라인 가이드 커버리지 |

---

## 3. 핵심 기능 (5개 축)

### 3.1 업무순서 안내 시스템 (Workflow Guide)

**문제 P1 해결**: 선관위 도움말 p.14-17의 "업무처리절차"를 인터랙티브 가이드로 구현

#### 3.1.1 업무 흐름 (조직유형별)

**중앙당/시도당/정책연구소/정당선거사무소** (선관위 도움말 p.14):
```
1. 사용기관관리 → 2. 수입지출처 관리 → 3. 수입내역관리 → 4. 지출내역관리
→ 5. 재산내역관리 → 6. 결산 → 7. 회계보고자료 출력 → 8. 자료 백업
```

**국회의원/경선후보자** (p.15):
```
1. 사용기관관리 → 2. 수입지출처 관리 → 3. 수입내역관리 → 4. 지출내역관리
→ 5. 재산내역관리 → 6. 회계보고자료 출력 → 7. 자료 백업
```

**(예비)후보자** (p.16):
```
1. 사용기관관리 → 2. 수입지출처 관리 → 3. 수입내역관리 → 4. 지출내역관리
→ 5. 재산내역관리 → 6. 회계보고자료 출력 → 7. 자료 백업
+ 기타: 정치자금 수입지출 공개 / 보전비용 출력 (선거 후)
```

**후원회** (p.17):
```
1. 사용기관관리 → 2. 수입지출처 관리 → 3. 수입내역관리 → 4. 지출내역관리
→ 5. 재산내역관리 → 6. 후원금 초과기부자 조회 → 7. 회계보고자료 출력 → 8. 자료 백업
```

#### 3.1.2 구현: WorkflowProgress 컴포넌트

대시보드 페이지 상단에 표시. 초보자 모드 ON일 때만 노출.

```text
┌─────────────────────────────────────────────────────────────────────┐
│  📋 회계 업무 진행 현황                                               │
│                                                                       │
│  ① 사용기관  ② 수입지출처  ③ 수입등록  ④ 지출등록  ⑤ 재산  ⑥ 결산  │
│     ✅          ✅            🔵          ○          ○       ○     │
│                                                                       │
│  현재 단계: 수입등록                                                   │
│  💡 "간편등록 마법사 또는 수입내역관리에서 수입 자료를 등록하세요"       │
│                                                                       │
│  [간편등록 마법사로 등록] [수입내역관리에서 등록]                        │
└─────────────────────────────────────────────────────────────────────┘
```

**진행 판별 로직**:
- ① 사용기관: `orgId` 존재 → 완료
- ② 수입지출처: `customer` 테이블에 해당 orgId 레코드 1건 이상 → 완료
- ③ 수입등록: `acc_book`에 수입 레코드 1건 이상 → 완료
- ④ 지출등록: `acc_book`에 지출 레코드 1건 이상 → 완료
- ⑤ 재산: `estate` 테이블에 1건 이상 → 완료 (후원회 제외 시 선택)
- ⑥ 결산/보고: 결산 완료 플래그 or 보고서 출력 이력 → 완료

#### 3.1.3 기술: API 엔드포인트

`/api/system/workflow-status` — 각 단계별 완료 여부 반환
```json
{
  "steps": [
    { "id": "organ", "label": "사용기관관리", "completed": true, "href": "/dashboard/organ" },
    { "id": "customer", "label": "수입지출처 등록", "completed": true, "href": "/dashboard/customer" },
    { "id": "income", "label": "수입 등록", "completed": false, "href": "/dashboard/wizard", "altHref": "/dashboard/income" },
    ...
  ],
  "currentStep": "income",
  "orgType": "candidate"
}
```

### 3.2 사이드바 초보자 모드 (Beginner Sidebar)

**문제 P2 해결**: 22-26개 메뉴를 초보자에게 압도감 없이 제공

#### 3.2.1 초보자 모드 사이드바

초보자 모드 ON 시 사이드바에 다음 변경 적용:

**A. 업무순서 배지 표시**
```text
기본자료관리
  ① 사용기관관리        ✅
  ② 수입지출처관리      ✅
     수입지출처 일괄등록

정치자금관리
  ⭐ 간편등록 마법사     ← 추천 표시
  ③ 수입내역관리        🔵 ← 현재 단계
  ④ 지출내역관리
     수입지출내역 일괄등록
     영수증/계약서 자동등록
     ...
```

- 업무순서 번호(①②③...)를 메뉴 앞에 표시
- 완료 단계는 ✅, 현재 단계는 🔵 (Primary 색상 dot)
- "간편등록 마법사"에 ⭐ 추천 표시 (아직 수입/지출 등록 전일 때)
- 업무 흐름에 포함되지 않는 메뉴(일괄등록, 코드관리 등)는 번호 없이 표시

**B. 접근 불가 메뉴 시각적 비활성화**
- 아직 이전 단계를 완료하지 않은 메뉴는 `opacity-50` + 클릭 시 안내 토스트
- 예: 수입 등록 전에 "결산작업" 클릭 → "먼저 수입/지출 내역을 등록해주세요"

**C. 토글 위치**
- 헤더의 기존 "도움말" 스위치를 "초보자 모드"로 확장
- 초보자 모드 ON = 도움말 tooltip ON + 사이드바 가이드 ON + 빈 상태 가이드 ON

#### 3.2.2 데이터 구조

```typescript
// stores/beginner-mode.ts
interface BeginnerModeState {
  isEnabled: boolean;     // 초보자 모드 ON/OFF
  toggle: () => void;
  workflowStatus: WorkflowStep[] | null;  // 캐시된 업무 진행 현황
  setWorkflowStatus: (steps: WorkflowStep[]) => void;
}
```

### 3.3 페이지별 인라인 가이드 (Page Guide)

**문제 P3, P5 해결**: 각 페이지 진입 시 맥락에 맞는 안내

#### 3.3.1 PageGuide 컴포넌트

초보자 모드 ON일 때, 각 페이지 상단에 접을 수 있는 가이드 패널 표시:

```text
┌─────────────────────────────────────────────────────────────┐
│  📖 수입내역관리 안내                                  [접기] │
│                                                               │
│  이 화면에서는 수입(후원금, 보조금 등) 자료를 등록·조회·수정    │
│  합니다.                                                      │
│                                                               │
│  📌 핵심 흐름:                                                │
│  1. [신규입력] 클릭 → 계정·과목 선택 → 수입제공자·금액 입력   │
│     → [저장]                                                  │
│  2. 목록에서 자료 클릭 → 상단에서 수정 → [저장]               │
│  3. 목록에서 자료 선택 → [삭제] (복구 가능: 로그인 중만)       │
│                                                               │
│  💡 TIP: 계정·과목이 어렵다면 "간편등록 마법사"를 이용하세요   │
│  [간편등록 마법사로 이동]                                      │
│                                                               │
│  📊 선관위 프로그램 대응: "수입내역관리" (도움말 p.23-30)      │
└─────────────────────────────────────────────────────────────┘
```

#### 3.3.2 가이드 데이터 구조

```typescript
// lib/page-guides.ts
interface PageGuide {
  pageId: string;         // 라우트 식별자 (예: "income")
  title: string;          // "수입내역관리 안내"
  summary: string;        // 1-2줄 요약
  steps: string[];        // 핵심 흐름 번호 목록
  tips: string[];         // TIP 목록
  wizardLink?: string;    // 마법사로 이동 링크 (관련 있을 때)
  refPage?: string;       // 선관위 도움말 참조 페이지
}
```

#### 3.3.3 커버리지 — 우선순위별

| 우선순위 | 페이지 | 이유 |
|---------|--------|------|
| P0 (필수) | income, expense, customer, organ | 핵심 업무 화면, 초보자 최다 접근 |
| P0 (필수) | wizard | 이미 가이드 문구 있으나 통일 |
| P1 (중요) | settlement, estate, reports | 보고 업무 흐름 |
| P1 (중요) | document-register, batch-import | 대량 등록 진입점 |
| P2 (향후) | 나머지 보고/시스템 관리 | 빈도 낮음 |

### 3.4 빈 상태(Empty State) 안내

**문제 P3 해결**: 데이터 없는 화면에서의 당혹감 해소

#### 3.4.1 EmptyState 컴포넌트

```text
┌─────────────────────────────────────────────────────┐
│                                                       │
│              📋                                       │
│                                                       │
│         아직 수입 내역이 없습니다                      │
│                                                       │
│    수입 자료를 등록하면 여기에 목록이 표시됩니다.       │
│    먼저 수입지출처를 등록해두면 입력이 빠릅니다.        │
│                                                       │
│    [간편등록 마법사로 시작]  [직접 등록하기]            │
│                                                       │
└─────────────────────────────────────────────────────┘
```

#### 3.4.2 빈 상태 시나리오

| 페이지 | 빈 상태 조건 | 안내 메시지 | CTA |
|--------|------------|-----------|-----|
| income | 수입 레코드 0건 | "수입 자료를 등록하면 여기에 목록이 표시됩니다" | 마법사 / 직접 등록 |
| expense | 지출 레코드 0건 | "지출 자료를 등록하면 여기에 목록이 표시됩니다" | 마법사 / 직접 등록 |
| customer | 거래처 0건 | "수입제공자·지출대상자를 등록하세요" | 직접 등록 / 일괄등록 |
| estate | 재산 0건 | "재산 내역을 등록하면 결산에 반영됩니다" | 등록하기 |
| settlement | 데이터 부족 | "결산하려면 수입/지출 자료가 필요합니다" | 수입관리 / 지출관리 |
| reports | 결산 미완료 | "보고서를 생성하려면 먼저 결산을 완료하세요" | 결산 화면으로 |

### 3.5 도움말 시스템 고도화

**문제 P4 해결**: hover tooltip 넘어서는 다층 도움말

#### 3.5.1 도움말 3계층 구조

| 계층 | 트리거 | 내용 | 현재 상태 |
|------|--------|------|----------|
| L1. Tooltip | hover/focus | 필드/버튼 1줄 설명 | ✅ 81개 구현 (help-texts.ts) |
| L2. Page Guide | 페이지 진입 | 화면 전체 사용법 | ❌ 미구현 → **3.3에서 구현** |
| L3. AI 챗봇 | 우하단 버블 | 맥락 인지형 Q&A | ✅ ChatBubble 구현, 맥락 미연동 |

#### 3.5.2 AI 챗봇 맥락 연동 (개선)

현재 ChatBubble은 RAG 기반 일반 질의만 지원. 개선:
- 현재 페이지 경로를 챗봇 컨텍스트로 전달
- "이 화면에서 어떻게 해야 하나요?" → 해당 페이지의 가이드 우선 제공
- 선관위 도움말 PDF의 해당 섹션 참조

#### 3.5.3 Tooltip 보완 항목

현재 `help-texts.ts`에 81개 항목이 있으나, 다음이 누락:
- 대시보드 요약 카드 설명
- 마법사 카드별 설명
- 보고관리 각 화면 필드 설명
- 재산내역관리 상세 필드

→ 접근성 개선 과정에서 **추가 30개 항목** 보충 목표

---

## 4. 구현 범위

### 4.1 구현 대상

| 영역 | 파일 | 설명 |
|------|------|------|
| 업무 진행 컴포넌트 | `components/dashboard/WorkflowProgress.tsx` | 대시보드 업무순서 가이드 |
| 업무 상태 API | `app/api/system/workflow-status/route.ts` | 단계별 완료 여부 조회 |
| 초보자 모드 스토어 | `stores/beginner-mode.ts` | Zustand persist, helpMode 통합 |
| 사이드바 개선 | `app/dashboard/layout.tsx` | 초보자 모드 시 배지·비활성화 |
| PageGuide 컴포넌트 | `components/page-guide.tsx` | 접을 수 있는 페이지 안내 |
| 페이지 가이드 데이터 | `lib/page-guides.ts` | 페이지별 가이드 텍스트 |
| EmptyState 컴포넌트 | `components/empty-state.tsx` | 빈 상태 안내 + CTA |
| 도움말 텍스트 보충 | `lib/help-texts.ts` | 추가 30개 항목 |
| 챗봇 맥락 연동 | `app/api/chat/route.ts` + `ChatBubble.tsx` | 현재 페이지 컨텍스트 전달 |

### 4.2 영향 받는 기존 페이지 (수정)

| 페이지 | 변경 내용 |
|--------|----------|
| `dashboard/page.tsx` | WorkflowProgress 추가 |
| `dashboard/layout.tsx` | 초보자 모드 사이드바 + 모드 토글 변경 |
| `dashboard/income/page.tsx` | PageGuide + EmptyState 추가 |
| `dashboard/expense/page.tsx` | PageGuide + EmptyState 추가 |
| `dashboard/customer/page.tsx` | PageGuide + EmptyState 추가 |
| `dashboard/organ/page.tsx` | PageGuide 추가 |
| `dashboard/settlement/page.tsx` | PageGuide + EmptyState 추가 |
| `dashboard/estate/page.tsx` | PageGuide + EmptyState 추가 |
| `dashboard/reports/page.tsx` | PageGuide 추가 |
| `dashboard/document-register/page.tsx` | PageGuide 추가 |
| `dashboard/batch-import/page.tsx` | PageGuide 추가 |

### 4.3 구현 제외

- 기존 일반 화면의 입력 UX 변경 (계정/과목 선택 등 — 숙련자 워크플로우 보존)
- 온보딩 투어/코치마크 (초기에는 정적 가이드로 충분, 향후 별도 이슈)
- 다크 모드 (DESIGN.md에서 별도 관리)
- 반응형 모바일 전용 레이아웃 (현재 데스크톱 우선)
- 선관위 프로그램의 전체 기능 재구현 (이미 구현된 기능만 개선)

---

## 5. 기술 설계 방향

### 5.1 컴포넌트 구조

```text
dashboard/layout.tsx (수정)
├── BeginnerModeSidebar (초보자 모드 시 사이드바 확장)
│   ├── WorkflowBadge (① ✅ 배지)
│   └── MenuLockToast (미완료 단계 클릭 시 토스트)
├── header (수정: "도움말" → "초보자 모드" 토글)
└── main
    └── page content
        ├── PageGuide (각 페이지 상단)
        └── EmptyState (데이터 없을 때)

dashboard/page.tsx (수정)
└── WorkflowProgress (업무순서 진행 현황)
```

### 5.2 상태 관리

```typescript
// stores/beginner-mode.ts
// 기존 help-mode.ts를 확장 — isEnabled가 helpMode도 제어
interface BeginnerModeState {
  isEnabled: boolean;
  toggle: () => void;
  workflowStatus: WorkflowStep[] | null;
  fetchWorkflowStatus: (orgId: number) => Promise<void>;
}
```

- 기존 `help-mode.ts`의 `isEnabled`를 `beginner-mode.ts`로 통합
- `help-tooltip.tsx`는 `useBeginnerMode`의 `isEnabled`를 참조하도록 변경
- localStorage persist 유지 (기존 "help-mode" 키 마이그레이션)

### 5.3 데이터 흐름

```text
로그인 → 대시보드 진입
  → /api/system/workflow-status 호출 (orgId 기반)
  → 응답을 BeginnerModeStore에 캐시
  → WorkflowProgress + 사이드바 배지에 반영

각 페이지 진입 시:
  → page-guides.ts에서 해당 pageId의 가이드 데이터 조회
  → PageGuide 컴포넌트에 전달
  → 빈 상태 판별은 각 페이지의 기존 데이터 로딩 로직 활용
```

### 5.4 API 설계

```
GET /api/system/workflow-status?orgId=123
Response: {
  "steps": [
    { "id": "organ", "label": "사용기관관리", "completed": true, "href": "/dashboard/organ" },
    { "id": "customer", "label": "수입지출처 등록", "completed": true, "count": 15, "href": "/dashboard/customer" },
    { "id": "income", "label": "수입 등록", "completed": false, "count": 0, "href": "/dashboard/income", "wizardHref": "/dashboard/wizard" },
    { "id": "expense", "label": "지출 등록", "completed": false, "count": 0, "href": "/dashboard/expense", "wizardHref": "/dashboard/wizard" },
    { "id": "estate", "label": "재산관리", "completed": false, "count": 0, "href": "/dashboard/estate" },
    { "id": "settlement", "label": "결산/보고", "completed": false, "href": "/dashboard/settlement" },
    { "id": "backup", "label": "자료 백업", "completed": false, "href": "/dashboard/backup" }
  ],
  "currentStep": "income",
  "orgType": "candidate"
}
```

SQL 쿼리 (service role):
```sql
SELECT
  (SELECT COUNT(*) FROM pfam.customer WHERE org_id = $1) as customer_count,
  (SELECT COUNT(*) FROM pfam.acc_book WHERE org_id = $1 AND incm_sec_cd = '1') as income_count,
  (SELECT COUNT(*) FROM pfam.acc_book WHERE org_id = $1 AND incm_sec_cd = '2') as expense_count,
  (SELECT COUNT(*) FROM pfam.estate WHERE org_id = $1) as estate_count
```

---

## 6. 디자인 시스템 적용 (DESIGN.md 참조)

| 요소 | 토큰 | 값 |
|------|------|-----|
| WorkflowProgress 배경 | --surface | #FFFFFF |
| 진행 dot 완료 | --success | #166534 |
| 진행 dot 현재 | --primary | #1B3A5C |
| 진행 dot 미완료 | --border | #E2E0DC |
| 사이드바 배지 텍스트 | --text-muted | #6B7280 |
| PageGuide 배경 | --info-bg | #EFF6FF |
| PageGuide 접기 버튼 | --text-muted | #6B7280 |
| EmptyState 아이콘 | --text-muted | #6B7280 |
| EmptyState CTA (Primary) | --primary | #1B3A5C |
| EmptyState CTA (마법사 추천) | --accent | #D4883A |
| 비활성 메뉴 | opacity: 0.5 | - |
| 토스트 알림 | --warning-bg | #FFFBEB |

---

## 7. 인터랙션 상태 명세

### 7.1 초보자 모드 토글

```text
헤더 우측:
┌──────────────────────────┐
│  초보자 모드  [==●]  ON   │  ← 기존 "도움말" 스위치 대체
│  로그아웃                  │
└──────────────────────────┘
```

- ON: tooltip + page guide + workflow badge + empty state CTA 모두 활성
- OFF: 기존과 동일한 최소 UI
- 전환 시 150ms fade 애니메이션
- 신규 사용자: 기본값 ON (첫 로그인 감지 시)
- 기존 사용자: 기존 help-mode 값 마이그레이션

### 7.2 사이드바 비활성 메뉴 클릭

```text
토스트 (하단 중앙, 3초 자동 닫힘):
┌─────────────────────────────────────────────┐
│ ℹ️ 먼저 수입/지출 내역을 등록해주세요.        │
│    [수입 등록하기]                             │
└─────────────────────────────────────────────┘
```

### 7.3 PageGuide 접기/펼치기

- 기본값: 첫 방문 시 펼침, 재방문 시 접힘 (localStorage 저장)
- 접기 상태: 한 줄 요약 + [자세히 보기] 링크
- 애니메이션: 150ms height transition

### 7.4 WorkflowProgress 클릭

- 각 단계 클릭 → 해당 페이지로 이동
- 미완료 단계: "간편등록 마법사로 시작" 추천 팝오버 (수입/지출 단계)
- 완료 단계: 바로 이동

---

## 8. 반응형 설계

| 요소 | Desktop (≥768px) | Mobile (<768px) |
|------|-----------------|-----------------|
| WorkflowProgress | 가로 stepper | 세로 리스트 + 현재 단계 강조 |
| 사이드바 배지 | 메뉴명 옆 번호+아이콘 | 동일 (사이드바 접힘 시 아이콘만) |
| PageGuide | 페이지 상단 펼침 패널 | 동일, padding 축소 |
| EmptyState | 중앙 정렬 아이콘+텍스트 | 동일, 버튼 전체 너비 |

---

## 9. 접근성 (Accessibility)

### 9.1 키보드 내비게이션

| 요소 | 키보드 동작 |
|------|-----------|
| WorkflowProgress | Tab으로 단계 간 이동, Enter로 해당 페이지 이동 |
| 사이드바 메뉴 배지 | 기존 Link 키보드 접근 유지 |
| PageGuide 접기/펼치기 | Enter/Space로 토글 |
| EmptyState CTA | Tab + Enter |

### 9.2 스크린리더 지원

- WorkflowProgress: `role="navigation"` + `aria-label="회계 업무 진행 현황"` + 각 단계 `aria-current="step"`
- PageGuide: `role="complementary"` + `aria-label="{페이지명} 안내"` + 접기 버튼 `aria-expanded`
- EmptyState: 안내 텍스트는 `role="status"`
- 사이드바 배지: `aria-label="완료"`, `aria-label="현재 단계"` 등

### 9.3 색상 대비

- 모든 텍스트: WCAG AA 이상 (DESIGN.md 토큰 준수)
- 진행 dot: 색상만으로 구분하지 않고 ✅/🔵/○ 아이콘 병행

---

## 10. 테스트 요구사항

### 10.1 컴포넌트 테스트

| 파일 | 테스트 내용 |
|------|-----------|
| `WorkflowProgress.test.tsx` | 단계 렌더링, 완료/미완료 표시, 클릭 이동 |
| `PageGuide.test.tsx` | 가이드 표시, 접기/펼치기, 초보자 모드 OFF 시 미표시 |
| `EmptyState.test.tsx` | 메시지 표시, CTA 클릭, 다양한 시나리오 |
| `beginner-mode.test.ts` | 토글, persist, helpMode 연동 |

### 10.2 API 테스트

| 엔드포인트 | 테스트 내용 |
|-----------|-----------|
| `/api/system/workflow-status` | 조직유형별 단계 반환, 완료 판별 정확성 |

### 10.3 통합 테스트

- 첫 로그인 시나리오: 모든 단계 미완료 → 사용기관 안내
- 중간 진행 시나리오: 수입 등록까지 완료 → 지출 안내
- 완전 완료 시나리오: 모든 단계 완료 → 축하 메시지

---

## 11. 구현 순서

| 순서 | 작업 | 의존성 | 우선순위 |
|------|------|--------|---------|
| 1 | `stores/beginner-mode.ts` 생성 (helpMode 통합) | 없음 | P0 |
| 2 | `/api/system/workflow-status` API 구현 | 없음 | P0 |
| 3 | `WorkflowProgress` 컴포넌트 + 대시보드 통합 | 1, 2 | P0 |
| 4 | 사이드바 초보자 모드 (layout.tsx 수정) | 1, 2 | P0 |
| 5 | `PageGuide` 컴포넌트 + `page-guides.ts` 데이터 | 1 | P0 |
| 6 | `EmptyState` 컴포넌트 | 없음 | P0 |
| 7 | P0 페이지에 PageGuide + EmptyState 적용 (income, expense, customer, organ) | 5, 6 | P0 |
| 8 | P1 페이지에 PageGuide + EmptyState 적용 | 7 | P1 |
| 9 | help-texts.ts 30개 항목 보충 | 없음 | P1 |
| 10 | ChatBubble 페이지 컨텍스트 연동 | 없음 | P1 |
| 11 | 테스트 작성 | 3-7 | P1 |

---

## 12. 성공 지표

| 지표 | 목표 | 측정 방법 |
|------|------|----------|
| 첫 등록 완료율 | 초보자 모드 ON 상태에서 **90%** 이상이 외부 도움 없이 첫 등록 완료 | 업무 흐름 단계 진행 로그 |
| 빈 화면 이탈률 | 빈 상태 페이지에서의 **즉시 이탈 50% 감소** | EmptyState CTA 클릭률 |
| 도움말 커버리지 | Tooltip 항목 **81 → 111개** | help-texts.ts 항목 수 |
| 숙련자 비영향 | 초보자 모드 OFF 시 기존 동작 **100% 동일** | 기존 테스트 통과 |

---

## 13. 선관위 프로그램 대응표

우리 프로젝트의 각 페이지가 선관위 프로그램 도움말의 어느 섹션에 대응하는지 참조표:

| 우리 페이지 | 선관위 프로그램 화면 | 도움말 페이지 | 메뉴그룹 |
|-----------|------------------|------------|---------|
| organ | 사용기관관리 | p.19 | 기본자료관리 |
| customer | 수입지출처관리 | p.20 | 기본자료관리 |
| customer-batch | 수입지출처 일괄등록 | p.21 | 기본자료관리 |
| income | 수입내역관리 | p.23-30 | 정치자금관리 |
| expense | 지출내역관리 | p.32-37 | 정치자금관리 |
| batch-import | 수입지출내역 일괄등록 | p.38-42 | 정치자금관리 |
| receipt | 당비영수증 출력 | p.31 | 정치자금관리 |
| resolution | 지출결의서 출력 | p.36 | 정치자금관리 |
| settlement | 결산작업 | p.43-48 | 보고관리 |
| reports | 보고서 출력 | p.49-67 | 보고관리 |
| estate | 재산내역관리 | p.43 | 보고관리 |
| backup | 자료 백업 및 복구 | p.68-72 | 시스템관리 |
| codes | 코드관리 | p.78 | 시스템관리 |
| wizard | *신규 (선관위 프로그램에 없음)* | - | 정치자금관리 |
| document-register | *신규 (선관위 프로그램에 없음)* | - | 정치자금관리 |
| ChatBubble | 도움말 | p.91 (FAQ) | - |
