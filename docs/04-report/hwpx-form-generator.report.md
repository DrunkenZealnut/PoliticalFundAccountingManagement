# 완료 보고서: 선관위 제출서류 HWPX 생성 페이지

> **Feature**: hwpx-form-generator
> **Period**: 2026-06-06 (Plan→Design→Do→Check 단일 세션)
> **Status**: ✅ Completed (Phase 1)
> **Match Rate**: 99% (gap-detector)

---

## Executive Summary

### 1.1 개요

| 항목 | 내용 |
|---|---|
| 기능 | 사이드메뉴에서 선관위 제출서식 선택 → DB 자동채움 + 수동입력 → `.hwpx` 다운로드 |
| 방식 | 사전 제작 HWPX 템플릿의 `{{토큰}}`을 JSZip으로 치환(구조 불변, 공식 레이아웃 보존) |
| 범위 | Phase 1 — 고정 레이아웃 핵심 서식 6종(후보자 4 + 후원회 2) |
| 레벨 | Dynamic (Next.js 16 + Supabase, 신규 인프라 없음) |

### 1.2 결과 요약

| 지표 | 값 |
|---|---|
| 설계-구현 일치율 | **99%** |
| 단위 테스트 | **18개 전부 통과** (escape 3 · generate 5 · 정합성 10) |
| Lint / Type | **0 오류** |
| E2E (dev 런타임) | form-2-1·27 `200 application/hwp+zip`, 잔여토큰 0, mimetype STORED |
| 구현 규모 | 소스 713줄(8파일) + 테스트 139줄(3파일) + 템플릿 6종 |
| 신규 의존성 | `jszip` 1개 |

### 1.3 Value Delivered (4관점)

| 관점 | 전달 가치 (정량) |
|---|---|
| **Problem** | 회계책임자가 56종 한글서식을 수기 작성하던 부담 — 이미 DB에 있는 조직·계좌·인적 정보를 재입력해야 했고 항목 누락·서식 불일치로 반려 위험 |
| **Solution** | 6종 서식에 대해 organ DB 자동 prefill + 수동 보완 → 1클릭 `.hwpx` 생성. 통합본(11섹션·56서식)에서 서식 분리·토큰화·배경제거를 자동 파이프라인으로 처리 |
| **Function/UX효과** | 서식당 5~13개 입력항목 중 DB 자동채움분 제외하고 빈칸만 입력 → 한글에서 바로 인쇄·날인. 템플릿 208KB(배경제거로 1.07MB→5배 슬림) |
| **Core Value** | 시스템 DB ↔ 공식 제출서식을 직접 연결해 회계보고 워크플로우의 최종 출력 단계를 완성. Phase 2/3 확장 가능한 선언적 구조(필드정의 + 템플릿 추가만으로 서식 증설) |

---

## 2. PDCA 사이클 요약

| 단계 | 산출물 | 핵심 |
|---|---|---|
| **Plan** | `01-plan/.../hwpx-form-generator.plan.md` | 작성예시 `.hwpx` 실물분석으로 서식 53종/예시 69개 확정, 토큰 치환 방식 결정(부록 A) |
| **Design** | `02-design/.../hwpx-form-generator.design.md` | 생성 파이프라인·HwpxFormDef/PrefillSource·API·UI·토큰 prefill 매핑·테스트 설계 |
| **Do** | 소스 8 + 테스트 3 + 템플릿 6 + 메뉴/설정 | JSZip 치환 코어·API·동적 폼·사이드메뉴, 실런타임 E2E 검증 |
| **Check** | `03-analysis/.../hwpx-form-generator.analysis.md` | gap-detector 97%→99%, 실질 Gap 1건(입력 길이 제한) 즉시 보완 |

---

## 3. 구현 산출물

### 3.1 신규 파일

| 파일 | 책임 |
|---|---|
| `app/src/lib/hwpx/escape.ts` | XML escape · 한글 날짜 포맷 |
| `app/src/lib/hwpx/generate.ts` | 생성 코어 — 토큰 치환 + mimetype-first(STORED) 재패키징 |
| `app/src/lib/hwpx/form-fields.ts` | `HWPX_FORM_DEFS` 6서식 + PrefillSource + 조직타입 필터 |
| `app/src/app/api/hwpx/generate/route.ts` | `POST` — 검증(필수·길이) → fs 템플릿 로드 → 생성 → `.hwpx` |
| `app/src/hooks/use-hwpx-prefill.ts` | organ DB(org 스코프) → 필드 자동채움 |
| `app/src/components/submission-forms/{FormCatalog,FormInputPanel}.tsx` | 카탈로그 · 동적 입력폼+다운로드 |
| `app/src/app/dashboard/submission-forms/page.tsx` | 페이지 |
| `app/src/lib/hwpx/{escape,generate,form-fields}.test.ts` | 테스트 18개 |
| `app/public/hwpx-templates/*` | 템플릿 6종 + `_token-manifest.json` + `README.md` |

### 3.2 수정 파일
- `app/src/app/dashboard/layout.tsx` — 4개 조직타입 보고관리에 "선관위 제출서류(HWPX)" 메뉴
- `app/next.config.ts` — `outputFileTracingIncludes`(Vercel 템플릿 번들링)

### 3.3 포함 서식

| 파일 | 서식 | 대상 |
|---|---|---|
| form-1-1 | 정치자금 수입·지출 인계·인수서 | 후보자 |
| form-2-1 | 회계책임자 선임신고서 | 공통 |
| form-2-2 | 취임동의서(회계책임자) | 공통 |
| form-4 | 예금계좌 신고서 | 공통 |
| form-27 | 후원회 등록신청서 | 후원회 |
| form-29 | 취임동의서(후원회 대표자) | 후원회 |

---

## 4. 핵심 기술 결정 (회고)

| 결정 | 내용 | 결과 |
|---|---|---|
| 토큰 치환 방식 | Python/lxml 대신 JSZip 문자열 치환 | Vercel/Node 호환, 구조 미파싱으로 레이아웃 100% 보존 |
| mimetype STORED 보장 | 새 zip 재구성(옵션 B) | 한글 호환 검증, 테스트로 첫엔트리·STORED 자동확인 |
| 템플릿 로드 | fetch→**fs.readFile** 전환 | 인증 미들웨어(proxy.ts)의 `/login` 리다이렉트 회피 |
| 배경 제거 | secPr masterPage/pageBorderFill 제거 + 미참조 이미지 제거 | 208KB(5배 슬림), 포맷만 |
| 입력 길이 제한 | route MAX_LEN + Input maxLength | 쪽수 드리프트 + DoS 완화(Check Gap 보완) |

---

## 5. 미해결 / 후속 (Phase 2·3)

| 항목 | 상태 |
|---|---|
| 한글 레이아웃 육안 검수 | ⏳ 사용자 수동 (구조검증·E2E는 통과) |
| Vercel 배포 후 템플릿 번들링 확인 | ⏳ 배포 시 |
| 계좌(예금주/금융기관/번호) DB 소스 | manual 유지 — 계좌신고 테이블 도입 시 source 교체 |
| 미리보기(FR-07) | §12 유보 |
| 고정 레이아웃 서식 확장(3·5·6-1·18·24~26 등) | Phase 2 |
| 표 가변 서식(회계장부 7·8, 내역서 10~14 등) | Phase 3 — `<hp:tr>` 행 복제 별도 설계 필요 |

---

## 6. 교훈 (Lessons Learned)

1. **레퍼런스 실물 분석이 범위를 확정** — `.hwp`를 `.hwpx`로 받아 분석하니 "56종" 추정이 목차 53종/예시 69개로 명확해지고, 채워진 값이 깨끗한 `<hp:t>` 노드라 토큰 치환 타당성이 PoC로 입증됨.
2. **정적 자산 fetch는 인증 미들웨어에 막힌다** — 서버 라우트에서 public 자산을 origin fetch하면 `/login` 리다이렉트로 HTML을 받음. fs 직접 읽기 + 번들 트레이싱이 정답.
3. **설계 체크박스 ≠ 구현** — 설계 §8이 `[x]`였으나 길이제한 미구현. gap-detector가 이를 포착, 보완으로 설계-구현 일치 회복.

---

## 7. 다음 단계
- 한글 검수 → 이상 없으면 `/pdca archive hwpx-form-generator` 로 문서 아카이브
- 또는 `/ship` 으로 PR 생성(메뉴·라우트·템플릿 포함)
