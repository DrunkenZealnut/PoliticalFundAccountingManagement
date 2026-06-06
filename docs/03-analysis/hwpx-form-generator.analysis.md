# Gap 분석: 선관위 제출서류 HWPX 생성 페이지

> **Feature**: hwpx-form-generator
> **Phase**: Check (Gap Analysis)
> **Analyzed**: 2026-06-06
> **Agent**: bkit:gap-detector
> **설계**: [hwpx-form-generator.design.md](../02-design/features/hwpx-form-generator.design.md)

---

## 종합 결과

| 항목 | 값 |
|---|---|
| 설계 일치 (발견 시점) | **97%** |
| 실질 Gap 보완 후 | **~99%** |
| 아키텍처 준수 | 100% |
| 컨벤션 준수 | 100% |
| 실질 Gap | 1건 (Medium, **보완 완료**) |

대조 항목 26개 중 ✅Match 23 · ⚠️Partial 2 · ❌Missing 1. 의도된 설계상 생략 6건은 분모 제외.

---

## 섹션별 대조

| 설계 섹션 | 상태 | 근거 |
|---|:---:|---|
| §2.2 생성 시퀀스(로드→escape+치환→STORED 재패키징→Buffer) | ✅ | `generate.ts` + `route.ts` |
| §3.1 타입(PrefillSource/HwpxFormField/HwpxFormDef) | ✅(확장) | `OrgScope/category/orgScope` 추가 |
| §3.3 토큰↔prefill 매핑(26토큰, 계좌 manual) | ✅ | `form-fields.ts` REG |
| §4.2 POST generate | ✅ | 처리 1~4단계 일치 |
| §4.2 에러코드 5종 + HTTP | ✅ | 400/404/422/500/500 |
| §5.1 2-pane 레이아웃 | ✅ | `page.tsx` grid 260px+1fr |
| §5.3 사이드메뉴(4 조직타입 보고관리) | ✅ | `layout.tsx` 4곳 |
| §6.1 escape(& 먼저)+한글날짜 | ✅ | `fmtDate`→`fmtKoreanDate`(YYYYMMDD도 허용) |
| §6.2 생성 코어 순수함수 | ✅(개선) | `replaceAll`→`split/join`, `unresolved` 반환 |
| §6.3 mimetype-first STORED | ✅ | **옵션 B**(새 zip 재구성, mimetype만 STORE 첫 추가) |
| §7 에러처리 `{error:{code,message,fields?}}` | ✅ | `errorResponse` |
| §8 보안: XML escape | ✅ | `escapeXml` + 테스트 |
| §8 보안: org 스코프 필터 | ✅ | `use-hwpx-prefill` `.eq("org_id")` |
| §8 보안: 템플릿 경로 화이트리스트 | ✅ | `def.template`만 사용 |
| §8 보안: 입력 길이 제한 | ⚠️→✅ | **발견 시 미구현 → 보완 완료**(route MAX_LEN + Input maxLength) |
| §9 테스트(escape/generate/정합성) | ✅ | 18개 통과 |
| §9.2 토큰↔필드 정합성 | ⚠️ Partial | 템플릿↔DEFS 검증, manifest 3자대조는 미포함(템플릿이 SSOT라 실질 보장) |
| §10 클린아키텍처 계층 | ✅ | Domain/Infra/App/Presentation 정확, 코어 직접호출 없음 |
| §11.1 파일구조 | ✅ | 7파일 + 6템플릿 + manifest + README |

---

## 발견 Gap 및 조치

### 🔴 Medium — §8 입력 길이 제한 미구현 → ✅ 보완 완료
- **현상**: 설계 §8 보안 체크리스트가 `[x]`(완료)로 표기됐으나 실제 코드에 길이 제한 없음 → 셀 폭 초과 쪽수 드리프트 + DoS 완화 미달성.
- **조치**: `route.ts`에 타입별 상한(`tel/account 40 · date 20 · text 200 · textarea 1000`) 검증 추가(초과 시 `422 INVALID_LENGTH`), `FormInputPanel`의 Input/Textarea에 `maxLength` 병행. lint/test/tsc 재검증 통과.

### 🔵 Low — 설계↔구현 명명/표현 불일치 → ✅ 문서 동기화
- `fmtDate`→`fmtKoreanDate`, `replaceAll`→`split/join`(구현이 우수), §5.1 `[미리보기]` 버튼 → §12 유보 표기로 설계 문서 갱신.

### 🟡 Low — manifest 3자 정합 가드 (유보)
- 현 `form-fields.test.ts`는 **템플릿 section0.xml ↔ HWPX_FORM_DEFS** 2자 대조(실질 정합 보장). 설계가 언급한 `_token-manifest.json` 파일까지의 3자 대조는 미포함. 템플릿이 SSOT이므로 기능 영향 없음 — Phase 2에서 manifest를 보조문서로 강등하거나 가드 추가 결정.

---

## 의도된 설계상 생략 (Gap 아님 — 설계 정합)

| 항목 | 설계 근거 | 대체 구현 |
|---|---|---|
| `GET /api/hwpx/forms` | §4.1 "클라 직접 조회 대체 가능" | `formsForOrgType()` |
| `GET /api/hwpx/prefill` | §4.1 동일 | `use-hwpx-prefill` 훅(Supabase 브라우저) |
| 계좌 3종 manual | §3.3·§12 "데이터 소스 부재" | REG `from:"manual"` |
| 템플릿 public 저장 | §12 "Phase 1 public" | `fs.readFile` + `outputFileTracingIncludes` |
| 미리보기 | §12 "입력값 요약 유보" | 미구현(유보) |
| 표 가변 서식 | §11.3 "별도 설계" | Phase 3 |

---

## 구현이 설계를 초과한 부분 (긍정)
- `split/join` 치환(정규식 특수문자 안전), `unresolved` 토큰 반환(검증/디버깅), `fmtKoreanDate` YYYYMMDD 허용, `OrgScope` 조직타입 필터.

## 실런타임 검증 결과 (Do 단계)
- 단위 18개 통과 · lint 0 · tsc 0 · dev E2E: form-2-1/27 `200 application/hwp+zip`, 잔여토큰 0, mimetype STORED 첫엔트리, 단일 섹션, 에러경로 422/404.

---

## 남은 수동 검증 (코드 외)
- [ ] 한글(Hancom)에서 다운로드 `.hwpx` 열어 레이아웃 육안 확인
- [ ] Vercel 배포 후 `outputFileTracingIncludes` 로 템플릿 번들링 동작 확인

---

## 판정 및 다음 단계
설계-구현 일치 **97%(보완 후 ~99%)**, 90% 기준 충족. 유일 실질 Gap(입력 길이 제한)은 보완 완료.
→ `/pdca report hwpx-form-generator` 로 완료 보고서 작성 가능. (선택: `/simplify` 로 코드 정리 후 보고)
