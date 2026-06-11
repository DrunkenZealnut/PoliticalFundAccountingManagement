# Design: 점자형 선거공보 등 부담비용 지급청구서(서식 7) HWPX 생성

> **Feature**: burden-cost-claim-hwpx
> **Created**: 2026-06-11
> **Status**: Design
> **Plan**: [[burden-cost-claim-hwpx]] (docs/01-plan/features/burden-cost-claim-hwpx.plan.md)
> **선례**: 서식 43 보전청구서(`reimbursement-claim`), 서식 1-x 토큰 폼
> **템플릿 분석 기준**: `RAG/점자형 선거공보 등 부담비용 지급청구서.hwpx` (표 4개 추출 완료)

---

## 1. 설계 개요

서식 7은 **순수 토큰-채움 폼**(dataFill 없음). 공식 .hwpx의 고정 셀에 `{{토큰}}`을 삽입한 템플릿을 만들고, 기존 generic 생성 경로(`POST /api/hwpx/generate`)가 토큰을 사용자 입력/organ prefill 값으로 치환한다. 전용 API 라우트·빌더·표 동적복제(owpml-table) **불필요**.

```
[submission-forms 페이지]
   서식 "7B" 선택
   → useHwpxPrefill: organ 유래 토큰 자동 채움(후보자명 등)
   → FormInputPanel: 수기 토큰(수량·금액·수령계좌·선관위명) 입력
   → POST /api/hwpx/generate { formId:"7B", values }
        → getFormDef("7B") → required/length 검증
        → generateHwpx(form-7b-fill.hwpx, values)  // replaceTokens + stripUnresolvedTokens
        → .hwpx 바이트 응답
   → 브라우저 다운로드
```

설계 결정은 Plan §2 확정(순수 토큰 / 평면 필드 MVP / 별도 id). 본 문서는 **토큰 전수 + 셀 매핑 + 검증 + 테스트**를 확정한다.

---

## 2. 공식 양식 표 구조 (추출 결과)

| 표 | 행×열 | 내용 |
|----|------|------|
| 표0 작성·제출수량 | 3×7 | R0 머리(공보 3 / 공약서 3 / 저장매체 rowspan2), R1 소머리(부수A/매수B/총매수C ×2), **R2 데이터 7셀** |
| 표1 청구금액 | 6×6 | R0 머리(구분/계/점자인쇄비/한글인쇄료/운반비/수당실비), **R1~R5 데이터 5행×5열=25셀**(공보/공약서/저장매체/활동보조인/계) |
| 표2 수령계좌 | 2×4 | R0 머리(예금주/금융기관명/계좌번호/비고), **R1 데이터 4셀** |
| 표3 청구인 직인란 | 6×n | 청구인 후보자/선거사무장/회계책임자 성명 + 직인 |

---

## 3. 토큰 레지스트리 (전수)

> 명명: 수량 `점자공보_부수` / 금액 `금액_<행>_<열>` / 수령 기존 `수령_*` 재사용. type 기본 `text`(금액·수량은 숫자 문자열, MVP는 천단위 포맷 미적용). source 미표기 = `manual`.

### 3.1 머리 (3)
| 토큰 | 라벨 | source | required |
|------|------|--------|:--------:|
| `선거명_상세` | 선거명(구체 선거명 — 예: ○○구의회 의원선거) | manual *(신규 — 공유 `선거명` const 총선거명을 쓰면 무의미한 값이 자동 주입되므로 분리. 총선거명은 푸터 고정문구에 존재)* | ✔ |
| `소속정당명` | 소속정당명 | manual *(신규)* | |
| `후보자명` | 후보자명 | organ `rep_name`(기존) | ✔ |

### 3.2 표0 작성·제출수량 (7, 신규·manual)
| 토큰 | 셀(표0 R2) |
|------|-----------|
| `점자공보_부수` | 작성·제출 부수(A) |
| `점자공보_매수` | 1부당 매수(B) |
| `점자공보_총매수` | 총매수(C=A×B) |
| `점자공약서_부수` | 작성·발송 부수(A) |
| `점자공약서_매수` | 1부당 매수(B) |
| `점자공약서_총매수` | 총매수(C=A×B) |
| `저장매체_개수` | 저장매체(개) |

### 3.3 표1 청구금액 (25, 신규·manual)
행 = {공보, 공약서, 저장매체, 활동보조인, 계}, 열 = {계, 점자인쇄비, 한글인쇄료, 운반비, 수당}(라벨="수당·실비·산재보험료").
토큰: `금액_<행>_<열>` (예: `금액_공보_점자인쇄비`, `금액_저장매체_운반비`, `금액_활동보조인_수당`, `금액_계_계`).

- **자연 공란 셀**(미해당)은 토큰을 두되 사용자가 비워두면 `""`로 출력: 저장매체행×수당실비, 활동보조인행×{점자인쇄비·한글인쇄료·운반비}.
- **계 행/열**(`금액_*_계`, `금액_계_*`, `금액_계_계`)도 MVP는 **수기 토큰**(Plan §6 — 합계 자동계산은 Phase 2). 입력값 그대로 출력.

### 3.4 표2 수령계좌 (4)
| 토큰 | 셀 | source |
|------|----|--------|
| `수령_예금주` | 예금주 | manual(기존 재사용) |
| `수령_금융기관` | 금융기관명 | manual(기존) |
| `수령_계좌번호` | 계좌번호 | manual(기존, type account) |
| `수령_비고` | 비고 | manual *(신규 — 수령계좌 표의 비고 칸이므로 `수령_*` 네임스페이스로 등록, 전역명 `비고` 충돌 회피)* |

### 3.5 표3 청구인 + 푸터 (3)
| 토큰 | 셀 | source |
|------|----|--------|
| `후보자명` | (후보자) 직인 옆 성명 | organ(재사용) |
| `선거사무장명` | 선거사무장 직인 옆 | manual(기존 REG에 존재) |
| `회계책임자명` | 회계책임자 직인 옆 | organ `acct_name`(기존) |
| `선관위명` | ○○선거관리위원회 귀중 | manual(기존), required ✔ |

> 푸터의 "2026년 6월 3일 실시한 제9회…청구합니다" 문장, 붙임 1~4, "2026년 월 일"의 연도는 **템플릿 고정**(토큰 없음). 청구 월·일은 손기입 칸 유지(공란).

**신규 REG 토큰**: `선거명_상세`, `소속정당명`, `수령_비고` + 수량 7 + 금액 25 = **총 35 신규 토큰**. 나머지(후보자명·선관위명·수령_*)는 기존 REG 재사용. (직인란은 손기입 유지 → 선거사무장명·회계책임자명 토큰 미사용)

---

## 4. 템플릿 토큰화 스펙 (`make-form-7b-fill.py`)

기존 `make-form-*-fill.py` 패턴. 입력=공식 RAG .hwpx, 출력=`public/hwpx-templates/form-7b-fill.hwpx`.

1. zip 해제 → `Contents/section0.xml` 로드.
2. 머리 문단의 값 자리(선거명/정당명/후보자명 콜론 뒤)에 토큰 텍스트 삽입.
3. 표0 R2의 7개 `<hp:tc>` 데이터 셀 본문(`<hp:t>`)을 각 토큰으로 치환(샘플값 "40","8" 제거).
4. 표1 R1~R5 × C1~C5 = 25개 데이터 셀에 `금액_<행>_<열>` 토큰 삽입.
5. 표2 R1 4개 셀, 표3 직인 옆 성명 셀, 푸터 선관위명 셀에 토큰 삽입.
6. **셀 내 표는 문단(`<hp:p><hp:run><hp:t>`) 안에 내장** → 토큰 삽입 시 run/t 태그 균형 유지(CLAUDE.md 회계장부 gotcha: `</hp:run>` 이중 닫힘 주의). 기존 빈 셀은 `<hp:t></hp:t>` 또는 `<hp:t>{{토큰}}</hp:t>`로 1:1 치환.
7. STORED mimetype 유지하여 재패키징(JSZip 규약, 기존 generate.repackage 패턴과 동일 zip 규칙).

> 검증: 산출 템플릿을 한글에서 열어 레이아웃 깨짐 없음 + 토큰 위치 정확 확인(수기 1회).

---

## 5. 코드 변경 명세

### 5.1 `app/src/lib/hwpx/form-fields.ts`
- **REG 추가**: `선거명_상세`(manual·required), `소속정당명`(manual), `수령_비고`(manual·text — 1줄 셀이라 textarea 금지, 개행이 hp:t에서 뭉개짐), 수량 7종(manual), 금액 25종(manual·text).
  - 헬퍼 고려: 25개 금액 토큰을 `금액토큰(행, 열)` 루프로 생성하거나 명시 나열(가독성 위해 명시 권장).
- **HWPX_FORM_DEFS 항목 추가**:
  ```ts
  { id: "7B", label: "점자형 선거공보 등 부담비용 지급청구서(서식 7)",
    category: "보전·청구", template: "form-7b-fill.hwpx", orgScope: "candidate",
    fields: fields("선거명","소속정당명","후보자명",
      "점자공보_부수","점자공보_매수","점자공보_총매수",
      "점자공약서_부수","점자공약서_매수","점자공약서_총매수","저장매체_개수",
      /* 금액 25종 */ ...,
      "수령_예금주","수령_금융기관","수령_계좌번호","비고",
      "선거사무장명","회계책임자명","선관위명") }
  ```
  - **dataFill 없음** → form-fields.test 의 dataFill 예외 목록 무관(추가 불필요).
  - id `"7B"`로 기존 `"7"`(회계장부) 충돌 회피.

### 5.2 `app/next.config.*`
- `/api/hwpx/generate` 의 `outputFileTracingIncludes`에 **이미 `./public/hwpx-templates/**` 포함** → 변경 불필요(확인만).

### 5.3 무변경(재사용)
- `app/src/app/api/hwpx/generate/route.ts` — formId 분기 불필요, 그대로 동작.
- `app/src/lib/hwpx/generate.ts` — `replaceTokens`/`stripUnresolvedTokens`/`repackage` 재사용.
- `app/src/app/dashboard/submission-forms/page.tsx` + `FormInputPanel` — `formsForOrgType("candidate")`에 자동 노출, 필드 자동 렌더.
- `app/src/hooks/use-hwpx-prefill.ts` — organ 토큰 자동 prefill.

---

## 6. 검증 규칙

| 항목 | 규칙 |
|------|------|
| required | `선거명`, `후보자명`, `선관위명` 미입력 시 `VALIDATION` 에러(기존 route 로직) |
| length | 기존 `maxLenFor(type)` 적용. 금액/수량 text → 일반 한도 |
| 미치환 토큰 | `stripUnresolvedTokens`가 빈 입력 `{{}}` 제거 → 공란 셀 정상(미해당 금액칸) |
| 숫자 포맷 | MVP 미적용(입력 그대로). Phase 2에서 천단위 콤마·합계 자동계산 |

---

## 7. 테스트 계획

| 테스트 | 파일 | 내용 |
|--------|------|------|
| 서식 등록 | `form-fields.test.ts`(수정) | id "7B" 존재, fields 토큰 수, candidate orgScope, dataFill 없음 |
| 토큰 치환 통합 | `form-7b-integration.test.ts`(신규) | 샘플 values로 generateHwpx → 결과 XML에 미치환 `{{}}` 0개, 주요 값(후보자명·금액_계_계 등) 포함 |
| 빈 입력 처리 | 동상 | 미해당 금액칸 빈값 → 셀 공란, 레이아웃 토큰 잔존 없음 |
| 전체 회귀 | `node node_modules/vitest/vitest.mjs run` | 기존 586 + 신규 그린 |

> 템플릿 산출물(form-7b-fill.hwpx)은 바이너리라 단위테스트는 토큰 치환 결과(XML 문자열) 기준. 한글 실제 열림은 수기 QA 1회(DoD).

---

## 8. 위험 / 엣지

| 위험 | 대응 |
|------|------|
| 표 내장 토큰 삽입 시 run/t 태그 균형 붕괴 | make 스크립트에서 셀 본문 1:1 치환, 추출 파서로 사전 검증(§4.6) |
| 금액 35셀 수기 입력 부담·오타 | MVP 평면 필드. Phase 2: 격자 UI + 합계 자동계산 + 천단위 포맷 |
| 미해당 셀 토큰이 0/공백 혼동 | 공란="" 출력으로 통일, 안내문(라벨)으로 미해당 표기 |
| 선거명 const("제9회…")와 양식 머리 불일치(예 동대문구의회) | 머리 `선거명`은 manual 편집 허용(const 기본값) — Do 단계에서 const→manual 전환 검토 |

---

## 9. 구현 순서 (Do 단계용)

1. `make-form-7b-fill.py` 작성 → `form-7b-fill.hwpx` 산출 + 한글 수기 확인
2. `form-fields.ts` REG 35 토큰 추가 + `"7B"` 서식 등록
3. 토큰 치환 통합 테스트 작성·통과
4. `submission-forms`에서 노출·prefill·다운로드 동작 확인(dev)
5. `form-fields.test.ts` 보강 + 전체 vitest 그린
6. (확인) next.config 트레이싱
