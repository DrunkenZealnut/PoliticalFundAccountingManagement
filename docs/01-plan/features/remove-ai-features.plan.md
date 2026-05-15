# AI 이용 기능 전면 제거 (remove-ai-features) Planning Document

> **Summary**: Gemini(Google Generative AI)와 Pinecone 의존을 사용하는 모든 기능을 코드베이스에서 제거. 챗봇(`/api/chat` + `ChatBubble` AI 응답)과 영수증 OCR(`/api/receipt-scan`)을 제거하고, 관련 의존성/환경변수/PDCA 문서까지 일괄 정리.
>
> **Project**: PoliticalFundAccountingManagement
> **Author**: Claude
> **Date**: 2026-05-15
> **Status**: Draft
> **Related**: `chatbot-faq-integration`, `rag-chat`, `smart-auto-register`, `receipt-auto-register`, `search-pipeline` (모두 AI 기반 또는 AI 활용 기능)

---

## Executive Summary

| 항목 | 내용 |
|---|---|
| Feature | remove-ai-features |
| 시작일 | 2026-05-15 |
| 예상 기간 | 1~2일 (코드 제거 0.5일 + 영수증 등록 폼 수동입력 모드 정비 0.5일 + 회귀 테스트 0.5일) |
| 영향 범위 | **삭제**: `api/chat/`, `api/receipt-scan/`, `hooks/use-chat.ts`, `lib/chat/election-cost-guide.ts`, `lib/chat/sample-accounting-data.ts`, `lib/chat/receipt-naming-rules.ts` / **수정**: `components/chat/ChatBubble.tsx`(AI 부분만 제거, FAQ UI 유지), `ChatBubble.test.tsx`, `dashboard/document-register/page.tsx`(OCR 호출 제거), `package.json`(deps 2개 제거), `.env`/`CLAUDE.md`(GEMINI_API_KEY 제거) / **유지**: `dashboard/layout.tsx`(ChatBubble 마운트 유지), `lib/chat/faq-data.ts` / **Archive**: 5개 AI 관련 PDCA plan/design 문서 |

### Value Delivered (4-Perspective)

| Perspective | 내용 |
|---|---|
| **Problem** | (1) 외부 LLM(Gemini) 호출은 비용/지연/오류/할당량 리스크 + 정확성 검증 불가능. (2) 회계관리 도메인에서 AI가 잘못된 과목 분류·법조항 안내를 하면 사용자가 그대로 신뢰해 손해. (3) `GEMINI_API_KEY` 누출 위험 + 정치자금 데이터가 외부 LLM에 전송되는 개인정보·정치적 민감도 우려. (4) `@google/generative-ai` + `@pinecone-database/pinecone` 두 SDK가 번들 크기를 키움. |
| **Solution** | AI를 사용하는 모든 코드 경로(채팅 API, 영수증 OCR API, ChatBubble의 AI 응답 모드, 관련 훅·라이브러리·테스트)를 삭제. 의존성 2개 제거, `GEMINI_API_KEY` 환경변수 삭제. 영수증 등록은 수동 입력 폼만 남기고, 챗봇은 (Open Question 1 결과에 따라) 완전 삭제 또는 정적 FAQ 브라우저만 남김. |
| **Function/UX Effect** | 사용자는 외부 LLM 의존 없이 명시적 폼 입력으로만 회계 데이터를 작성. 응답 시간 안정화(타임아웃 60s 제거), 환경변수 1개 감소, 빌드 산출물 축소. document-register의 자동 OCR 버튼은 사라지고 수동 입력 UI만 남음. |
| **Core Value** | "**검증 가능한 결정론적 회계 시스템**". AI가 만들어내는 비결정적 응답을 모두 제거하여, 회계관리 시스템이 갖춰야 할 *재현 가능성(reproducibility)*과 *감사 추적성(auditability)*을 확보. 정치자금 도메인의 법적 책임 경계가 명확해짐. |

---

## 1. Overview

### 1.1 Purpose

본 프로젝트의 AI 기능(Gemini 2.5 Flash 챗봇, Gemini Vision 영수증 OCR)은 *편의 기능*이지만, 회계관리 시스템의 신뢰성/법적 책임/개인정보 관점에서 부담이 더 크다고 판단. 모든 AI 호출 경로를 제거해 도메인 코어 기능만 남긴다.

### 1.2 Background

#### 현재 AI 활용 지점 (코드베이스 스캔 결과)

| 영역 | 파일 | LoC | 설명 |
|---|---|---:|---|
| API: 챗봇 | `app/src/app/api/chat/route.ts` | 278 | Gemini 2.5 Flash + SSE streaming + 키워드 기반 RAG (선관위 가이드 + 샘플 데이터) |
| API: 영수증 OCR | `app/src/app/api/receipt-scan/route.ts` | 78 | Gemini Vision으로 영수증 이미지 → JSON 추출 |
| UI: 챗 컴포넌트 | `app/src/components/chat/ChatBubble.tsx` | 321 | FAQ 탐색 + AI 응답 통합 UI (대시보드 우하단 버블) |
| UI: 챗 테스트 | `app/src/components/chat/ChatBubble.test.tsx` | - | 컴포넌트 테스트 |
| Hook | `app/src/hooks/use-chat.ts` | 101 | 채팅 SSE 스트리밍 클라이언트 |
| Lib | `app/src/lib/chat/election-cost-guide.ts` | 450 | 챗봇 RAG 컨텍스트(선관위 가이드 텍스트) |
| Lib | `app/src/lib/chat/faq-data.ts` | 226 | FAQ 정적 데이터 (AI 없이도 사용 가능) |
| Lib | `app/src/lib/chat/receipt-naming-rules.ts` | 124 | AI 응답 후처리 규칙 |
| Lib | `app/src/lib/chat/sample-accounting-data.ts` | 207 | 챗봇 RAG 샘플 데이터 |
| 통합 지점 1 | `app/src/app/dashboard/layout.tsx:13,356` | - | `<ChatBubble />` 마운트 |
| 통합 지점 2 | `app/src/app/dashboard/document-register/page.tsx:143` | - | `fetch("/api/receipt-scan")` 호출부 |
| 의존성 | `app/package.json` | - | `@google/generative-ai ^0.24.1`, `@pinecone-database/pinecone ^7.1.0` |
| 환경변수 | `.env`, `app/CLAUDE.md` | - | `GEMINI_API_KEY` |

#### 관련 PDCA 문서 (정리 대상)

`docs/01-plan/features/`와 `docs/02-design/features/`에 다음 plan/design이 존재:
- `chatbot-faq-integration` — 챗봇 FAQ 통합 (AI 기반)
- `rag-chat` — Pinecone + Gemini RAG 챗봇
- `smart-auto-register` — AI 자동 등록 (확인 필요)
- `receipt-auto-register` — 영수증 자동 등록 (AI OCR 사용)
- `search-pipeline` — 검색 파이프라인 (Pinecone 가능성)

→ Design 단계에서 각 문서를 열어 AI 의존 여부 확인 후, 의존한다면 `docs/archive/2026-05/removed-features/`로 이동.

### 1.3 Related Documents

| 문서 | 관련성 |
|---|---|
| `app/CLAUDE.md` | AI 관련 환경변수/아키텍처 기술 — 본 작업 후 업데이트 필요 |
| `CLAUDE.md` (root) | AI 의존 언급 — 본 작업 후 업데이트 필요 |
| `docs/01-plan/features/chatbot-faq-integration.plan.md` | 챗봇 FAQ 통합 — 삭제 또는 archive |
| `docs/01-plan/features/rag-chat.plan.md` | RAG 챗봇 — 삭제 또는 archive |
| `docs/01-plan/features/receipt-auto-register.plan.md` | 영수증 자동 등록(OCR) — 삭제 또는 archive |
| `docs/01-plan/features/smart-auto-register.plan.md` | 스마트 자동 등록 — AI 의존 여부 확인 후 결정 |
| `docs/01-plan/features/search-pipeline.plan.md` | Pinecone 검색 — 의존 여부 확인 후 결정 |

---

## 2. Scope

### 2.1 In Scope

1. **API 라우트 삭제**
   - `app/src/app/api/chat/` 디렉토리 전체 삭제
   - `app/src/app/api/receipt-scan/` 디렉토리 전체 삭제

2. **UI/컴포넌트/훅 — AI 부분만 제거, FAQ 정적 브라우저 유지** (결정 1 = 옵션 B)
   - `app/src/components/chat/ChatBubble.tsx`: **유지** — AI 응답 호출부(useChat 사용·assistant message 스트리밍·"AI 답변" 문구·disclaimer 등) 제거, FAQ 탐색 UI(`faqView`, `FAQ_DATA` 기반 카테고리/서브섹션/항목 탐색 및 정답 표시)만 남김
   - `app/src/components/chat/ChatBubble.test.tsx`: AI 관련 테스트 제거, FAQ 탐색 테스트만 유지(리팩토링)
   - `app/src/hooks/use-chat.ts`: **삭제** (AI SSE 스트리밍 전용)
   - `app/src/lib/chat/faq-data.ts`: **유지** (정적 FAQ 데이터)
   - `app/src/lib/chat/election-cost-guide.ts`: **삭제** (Gemini RAG 컨텍스트 전용)
   - `app/src/lib/chat/sample-accounting-data.ts`: **삭제** (Gemini RAG 컨텍스트 전용)
   - `app/src/lib/chat/receipt-naming-rules.ts`: **삭제** (영수증 OCR 후처리 규칙)

3. **통합 지점 수정**
   - `app/src/app/dashboard/layout.tsx`: `ChatBubble` import/마운트 **유지** (FAQ 브라우저로 동작)
   - `app/src/app/dashboard/document-register/page.tsx`: 영수증 스캔(OCR) 버튼·`/api/receipt-scan` fetch 호출부 제거. **수동 입력 폼은 보존** (결정 3) — 사용자가 모든 필드를 수동으로 채워서 등록

4. **의존성/환경변수 제거**
   - `app/package.json`에서 `@google/generative-ai`, `@pinecone-database/pinecone` 제거
   - `package-lock.json` 갱신 (`npm install` 재실행)
   - `.env`/`.env.example` 등에서 `GEMINI_API_KEY` 제거
   - `CLAUDE.md`(root)와 `app/CLAUDE.md`에서 AI 관련 기술 섹션 업데이트

5. **PDCA 문서 정리** (결정 2 = 모두 제거)
   - 다음 5개 feature의 plan/design 문서를 모두 `docs/archive/2026-05/removed-features/`로 이동:
     - `chatbot-faq-integration` (단, 챗봇 컨테이너는 FAQ 브라우저로 재활용되므로 문서는 archive 후 본 plan으로 대체)
     - `rag-chat`
     - `smart-auto-register`
     - `receipt-auto-register`
     - `search-pipeline`
   - `docs/archive/2026-05/removed-features/_INDEX.md`에 archive 사유 기록

6. **회귀 테스트**
   - `npm run lint` 통과
   - `npm run test` 통과 (ChatBubble.test 제거 후 다른 테스트 영향 없는지 확인)
   - `npm run build` 통과
   - dashboard 페이지 정상 렌더링 (E2E 또는 수동 확인)
   - document-register 수동 입력 경로 정상 동작 확인

### 2.2 Out of Scope

- 새로운 비-AI 챗봇/문서 검색 기능 구현 (이번에는 *삭제만*)
- 영수증 이미지의 비-AI OCR 대안 도입 (Tesseract 등) — 별도 plan
- 회계 자동완성·과목 추천 로직 신규 도입
- FAQ 정적 데이터 보존 결정 시에도, 새로운 UI 디자인 작업은 본 작업 외 (필요하다면 후속 plan)

### 2.3 Decisions Made (2026-05-15 사용자 확정)

1. ✅ **FAQ 정적 브라우저 보존 = 옵션 B**: `faq-data.ts` + ChatBubble의 FAQ 탐색 UI는 유지, AI 응답 호출 부분(useChat·assistant streaming·RAG context lib)만 제거. 사용자가 카테고리 → 서브섹션 → 항목 클릭 시 정적 정답을 보여주는 형태로 동작.
2. ✅ **smart-auto-register / search-pipeline / receipt-auto-register / chatbot-faq-integration / rag-chat = 모두 제거**: 5개 PDCA 문서 전부 archive 대상.
3. ✅ **document-register 수동 입력 폼 = 보존**: OCR 버튼/호출만 제거하고 기존 수동 입력 폼은 그대로 유지. 모든 필드(거래일자·금액·내역·거래처·사업자번호·주소·결제수단·품목)를 사용자가 직접 입력.

---

## 3. Stakeholders & Users

| 역할 | 영향 |
|---|---|
| 최종 사용자 (선거사무소 회계 담당자) | 챗봇/영수증 OCR 사라짐 → 수동 입력만 가능. 단, 정확성·법적 책임은 명확해짐 |
| 개발자(나) | 코드/의존성/환경변수 정리 → 유지보수 부담 감소 |
| 배포 환경(Vercel) | `GEMINI_API_KEY` 환경변수 미설정 시 발생하던 런타임 오류 사라짐 |

---

## 4. Success Criteria

| # | 기준 | 검증 방법 |
|---|---|---|
| 1 | `app/src` 내 `GoogleGenerativeAI`, `@google/generative-ai`, `@pinecone-database/pinecone`, `GEMINI_API_KEY`, `use-chat`, `useChat` 참조 0건 (단, `faq-data` 참조는 유지 허용) | `grep -r` 결과 0 |
| 2 | `app/package.json`에 AI 관련 deps 0개 | `cat package.json` 확인 |
| 3 | `npm run lint && npm run test && npm run build` 모두 통과 | CI/로컬 실행 |
| 4 | dashboard 페이지 정상 렌더(ChatBubble 없음) | 수동 확인 (`npm run dev`) |
| 5 | document-register 수동 입력 폼으로 영수증 1건 등록 성공 | 수동 확인 |
| 6 | AI 의존 PDCA 문서 archive 완료 | `docs/archive/2026-05/removed-features/` 존재 + INDEX 갱신 |
| 7 | Match Rate (Design vs Implementation) ≥ 90% | `/pdca analyze remove-ai-features` |

---

## 5. Risks & Mitigations

| 위험 | 영향 | 완화 |
|---|---|---|
| 영수증 OCR 제거로 사용자 등록 속도 저하 | UX 저하 | 수동 입력 폼 UX 점검 + 키보드 단축키 등 후속 개선 별도 plan |
| ChatBubble 제거로 사용자 학습 자료 소실 | 학습 비용 증가 | Open Question 1에서 FAQ 정적 보존 옵션 검토 |
| 다른 페이지에서 `use-chat`/`ChatBubble` 잠재 참조 누락 | 빌드 실패 | grep 전수 조사 + `npm run build` 통과를 Success Criteria 1·3에 명시 |
| 의존성 제거 시 lockfile 변경으로 부작용 | 빌드 환경 차이 | `package-lock.json` 함께 커밋, CI 재빌드 검증 |
| 환경변수 `GEMINI_API_KEY` 제거 누락 | 배포 환경 혼란 | Vercel 환경변수 페이지에서도 수동 삭제 안내 (배포 시 체크리스트) |

---

## 6. Milestones

| # | 마일스톤 | 산출물 |
|---|---|---|
| M1 | Design 문서 작성 (`/pdca design remove-ai-features`) | `docs/02-design/features/remove-ai-features.design.md` (Open Questions 확정) |
| M2 | 코드/의존성/환경변수 제거 (`/pdca do`) | 위 In Scope 1~4 모두 적용된 PR 1개 |
| M3 | PDCA 문서 archive | `docs/archive/2026-05/removed-features/_INDEX.md` |
| M4 | Gap 분석 (`/pdca analyze`) ≥ 90% | `docs/03-analysis/remove-ai-features.analysis.md` |
| M5 | 완료 보고서 (`/pdca report`) | `docs/04-report/remove-ai-features.report.md` |

---

## 7. Dependencies

- Vercel 배포 환경의 `GEMINI_API_KEY` 환경변수 삭제 (사용자 수동 작업)
- 기존 archive 디렉토리 구조 (`docs/archive/2026-05/` 패턴 재사용)
