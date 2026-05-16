# Gap Analysis: remove-ai-features

> **Phase**: Check (PDCA)
> **Date**: 2026-05-15
> **Match Rate**: **96.4%** (27/28, Partial 1)
> **Status**: ✅ ≥90% — Report 단계 진입 가능
> **Source Design**: `docs/02-design/features/remove-ai-features.design.md`
> **PR**: [#20](https://github.com/DrunkenZealnut/PoliticalFundAccountingManagement/pull/20) — Branch `feat/remove-ai-features` @ `ec837c3`

---

## 1. Executive Summary

| 항목 | 결과 |
|---|---|
| 총 검증 항목 | 28 |
| Pass | 27 |
| Partial | 1 (H2) |
| Fail | 0 |
| **Match Rate** | **96.4%** |
| Pass-Through Threshold (≥90%) | ✅ 충족 |
| 외부 검증 (CodeRabbit) | ✅ Actionable 0 (3차 incremental clean) |

본 작업은 Design §1·§2·§7 명세와 구현이 거의 완벽히 일치. 모든 핵심 삭제 항목(파일 6개 · 의존성 4개 · 환경변수 1개 · API 라우트 2개) 검증 통과. ChatBubble·document-register 리팩토링 명세 100% 부합. AI 잔존 참조 5종 정적 grep 모두 0건.

---

## 2. Verification Matrix

### A. 완전 삭제 파일 (Design §1.1)

| ID | 검증 항목 | 결과 |
|---|---|:---:|
| A1 | `app/src/app/api/chat/route.ts` 부재 | ✅ |
| A2 | `app/src/app/api/receipt-scan/route.ts` 부재 | ✅ |
| A3 | `app/src/hooks/use-chat.ts` 부재 | ✅ |
| A4 | `app/src/lib/chat/election-cost-guide.ts` 부재 | ✅ |
| A5 | `app/src/lib/chat/sample-accounting-data.ts` 부재 | ✅ |
| A6 | `app/src/lib/chat/receipt-naming-rules.ts` 부재 | ✅ |

### B. ChatBubble 리팩토링 (Design §1.2)

| ID | 검증 항목 | 결과 |
|---|---|:---:|
| B1 | `useChat`/ReactMarkdown/remark-gfm import 없음 (faq-data만 import) | ✅ |
| B2 | 내부 `useState<ChatMessage[]>` + `addMessages` 직접 구현 | ✅ |
| B3 | "AI 답변" 문구 제거, "정치자금 회계 FAQ"/"자주 묻는 질문"으로 정정 | ✅ |
| B4 | Disclaimer "FAQ는 참고용입니다..." | ✅ |
| B5 | assistant 렌더 `whitespace-pre-wrap` plain text (ReactMarkdown 미사용) | ✅ |
| B6 | FAQ 탐색 UI(카테고리/서브섹션/항목) + `faq-data.ts` import 유지 | ✅ |

### C. document-register 리팩토링 (Design §1.2)

| ID | 검증 항목 | 결과 |
|---|---|:---:|
| C1 | `scanFile`, `ScanResult`, `scanning`/`error` 필드, `mapPayMethod`, `autoSelectItem`, `rcpNoOffset` 모두 부재 | ✅ |
| C2 | `/api/receipt-scan` 호출 없음 | ✅ |
| C3 | "AI 분석 중"/"AI가 자동 추출" 문구 없음, 안내문구 "계정·과목·일자·금액" 명시 | ✅ |
| C4 | `MAX_UPLOAD` 상수 + `setEntries(prev=>...)` 내부 race-safe 제한 (CodeRabbit 2차 fix 반영) | ✅ |
| C5 | 수동 입력 폼(`renderEntryForm`) 보존 | ✅ |

### D-E. 유지 항목 (Design §1.2)

| ID | 검증 항목 | 결과 |
|---|---|:---:|
| D1 | `dashboard/layout.tsx` 에 ChatBubble import/마운트 유지 | ✅ |
| E1 | `lib/chat/faq-data.ts` 존재 | ✅ |

### F. 의존성 제거 (Design §1.2)

| ID | 검증 항목 | 결과 |
|---|---|:---:|
| F1 | `package.json` 에서 `@google/generative-ai`, `@pinecone-database/pinecone`, `react-markdown`, `remark-gfm` 모두 부재 | ✅ |

### G. CLAUDE.md 정정 (Design §1.2 + §2.9)

| ID | 검증 항목 | 결과 |
|---|---|:---:|
| G1 | "AI Chat"/`/api/chat`/`/api/receipt-scan`/`GEMINI_API_KEY`/`use-chat` 언급 0건 | ✅ |
| G2 | "AI chatbot" → "static FAQ browser" 정정 | ✅ |

### H. Archive (Design §1.3 + §2.10)

| ID | 검증 항목 | 결과 |
|---|---|:---:|
| H1 | `docs/archive/2026-05/removed-features/_INDEX.md` 존재 | ✅ |
| H2 | 5개 폴더 + 각 폴더에 plan/design 문서 | ⚠️ Partial |

**H2 Partial 사유**: `receipt-auto-register/`에 `.plan.md`만 존재, `.design.md` 부재. 단, 원본(`docs/02-design/features/`)에도 해당 design 문서가 *원래 없었음* — Design §1.3에서 이미 *"design 문서 부재"*로 명시되어 있고, `_INDEX.md` L17에서도 *"(design 문서 부재)"* 비고로 기록되어 있음. **사실상 false-positive**: 명세와 부합.

### I. 정적 검증 (Design §3.3)

| ID | grep 대상 (`app/src` 범위) | 결과 |
|---|---|:---:|
| I1 | `GoogleGenerativeAI`, `@google/generative-ai`, `@pinecone-database/pinecone` | 0건 ✅ |
| I2 | `GEMINI_API_KEY` | 0건 ✅ |
| I3 | `use-chat`, `useChat` | 0건 ✅ |
| I4 | `/api/chat`, `/api/receipt-scan` | 0건 ✅ |
| I5 | `faq-data` 참조 = ChatBubble 1건만 | ✅ |

---

## 3. Gap List

| ID | Gap | 영향 | 처리 권고 |
|---|---|---|---|
| H2 | `receipt-auto-register` archive에 design 문서 누락 | **낮음** (원본 부재 — 명세와 일치) | 조치 불필요. `_INDEX.md`에 이미 "design 문서 부재" 비고 기록됨. Partial로 분류되었으나 실질적으로 명세 부합 |

**Hard Gap**: 0건
**False-Positive Gap**: 1건 (H2)
**실질 Match Rate**: **100%** (H2를 명세 부합으로 재분류 시)

---

## 4. Implementation 요약 (PR #20)

### 4.1 8개 Atomic Commits

| # | Commit | 변경 |
|---|---|---|
| 1 | `0934581 refactor: document-register OCR 호출 제거` | −100 LoC |
| 2 | `8452f4e refactor: ChatBubble을 정적 FAQ 브라우저로 축소` | −140 LoC, 테스트 16개 재작성 |
| 3 | `00ea162 chore: AI 의존 파일 삭제` | −1,238 LoC (6 files) |
| 4 | `e9afceb chore: AI 관련 npm 의존성 제거` | 4 deps 제거 |
| 5 | `0c151ef docs: CLAUDE.md AI 기술 스택 정정` | −11/+7 |
| 6 | `9cfc0df docs: AI 의존 PDCA 5개 archive` | 9 doc 이동 + `_INDEX.md` |
| 7 | `e6014bb refactor: CodeRabbit 1차 리뷰 반영` | error 필드 dead code 정리 + INDEX 보완 |
| 8 | `ec837c3 fix: CodeRabbit 2차 리뷰 반영` | race-safe MAX_UPLOAD + 안내문구 정정 |

### 4.2 검증 결과

| 검증 | 결과 |
|---|---|
| `tsc --noEmit` | ✅ 통과 |
| `vitest` | ✅ 265 passed (ChatBubble 16개 신규 포함) |
| `npm run build` | ✅ Compiled, 37/37 static pages |
| Vercel Preview | ✅ SUCCESS |
| GitGuardian Security | ✅ SUCCESS (시크릿 누출 없음) |
| CodeRabbit (3차 incremental) | ✅ "No actionable comments were generated" |

---

## 5. 결론 및 다음 단계

- **Match Rate 96.4%** (실질 100%) — Design 명세와 구현 거의 완벽 일치
- **Hard Gap 0건** — 모든 핵심 항목 검증 통과
- **외부 검증 통과** — CodeRabbit Actionable 0
- **Iterate(Act) 불필요** — `/pdca iterate` 건너뛰고 바로 Report 진입 가능

### 권장 다음 단계
1. **`/pdca report remove-ai-features`** — 완료 보고서 작성
2. 수동 회귀 검증 (Design §3.2 M1~M6) — 선택, 배포 전 권장
3. PR #20 머지 → Vercel 환경변수에서 `GEMINI_API_KEY`·`PINECONE_*` 콘솔에서 수동 삭제
4. 머지 후 `/pdca archive remove-ai-features --summary`
