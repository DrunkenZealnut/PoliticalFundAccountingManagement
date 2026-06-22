# 재조정 데이터 뷰어 + 영수증 일괄생성 — Gap 분석 (Check)

> **Feature**: `adjusted-ledger-viewer`
> **Date**: 2026-06-22 · **Phase**: Check · **Status**: WARN (90% 미만)
> **Plan**: [adjusted-ledger-viewer.plan.md](../01-plan/features/adjusted-ledger-viewer.plan.md) ·
> **Design**: [adjusted-ledger-viewer.design.md](../02-design/features/adjusted-ledger-viewer.design.md)

---

## 종합 점수

| Category | Score | Status |
|----------|:-----:|:------:|
| Design Match (FR) | 90% | OK |
| Architecture Compliance | 100% | OK |
| Test Coverage (TC) | 70% | WARN |
| **Overall Match Rate** | **88%** | **WARN** |

테스트 결과: `adjusted-ledger.test.ts` 6/6 통과. export 회귀(`candidate-gate.test.ts`, `normalize.test.ts`) 커버.

---

## 1. FR별 매칭

| ID | 요구사항 | 결과 | 근거 |
|----|----------|:----:|------|
| FR-01 | 재조정 행 기준 영수증번호 표시 (`fillExportReceiptNumbers`, 원본 불변) | ✅ 구현 | `page.tsx:107,115`; `r.rcp_no`(채번값) 표시 `page.tsx:374` (구 `lr.rcp_no` 폐기) |
| FR-02 | 「영수증 일괄생성/재생성」 액션 (멱등, DB write 0) | ✅ 구현 | 버튼 `page.tsx:293` → `handleQuery` 순수 재계산, supabase write 없음 |
| FR-03 | origin(원본/이동/분할) 구분 + 과목 부족 경고 | 🔶 부분 | origin 배지 `page.tsx:357-360`, `detectCandidateShortfalls`+배너 `page.tsx:133,298-302`. **비고 note("84→82") 미구현** |
| FR-04 | 화면 번호 == export-sqlite 번호 (동일 SSOT) | ✅ 구현 | route가 `buildAdjustedAccBook` import → `allocateCandidateAccBookForExport` 별칭 `route.ts:16,498`; 채번 동일 함수 `route.ts:769-775` |
| FR-05 | "재조정본" 배지/라벨 | ✅ 구현 | 파랑 배지 `보고용 재조정 데이터 · 원본 불변` `page.tsx:276-278` |

## 2. Design 섹션별 매칭

| 항목 | 결과 | 근거 |
|------|:----:|------|
| §3 origin 판정(alloc_src_id/raw_*) | 🔶 변형 | `adjustedOrigins`가 "출처별 행 수>1→분할" 알고리즘 사용 — 설계 텍스트와 기준 상이(기능 동등) `adjusted-ledger.ts:45-54` |
| §3 `buildAdjustedAccBook(rawRows, orgSecCd)` 시그니처 | 🔶 변형 | 실제는 인자 1개 — 행 acc_sec_cd로 후보자 자동판별(호출부 단순화) `adjusted-ledger.ts:20-21` |
| §4 「구분」 컬럼 / 🔀이동·✂분할 배지 | ✅ 구현 | `page.tsx:320,357-361` |
| §4 비고 note(재배분 84→82) | ❌ 미구현 | 비고는 원본 `r.bigo`만 `page.tsx:375`; `BookRow`에 note 없음 |
| §7 Clean Architecture(Domain/Presentation/Infra) | ✅ 구현 | 순수함수 `lib/accounting`, UI `page.tsx`, Infra route import |
| §9 Out of Scope 준수 | ✅ 구현 | `api/acc-book` write 0, 비후보자 raw 유지(`toBe(input)` 검증) |

## 3. Test Plan (TC-1~5)

| TC | 내용 | 결과 | 근거 |
|----|------|:----:|------|
| TC-1 | 후보자 분할 → 이동분 신규 id·origin | ✅ | `adjusted-ledger.test.ts:29-43,66-80` |
| TC-2 | 뷰어 rcp_no == export rcp_no (cross-parity) | 🔶 부분 | `:93-105`는 묶음만 검증; export 실제 경로(normalize→sort→strip)와 직접 비교 없음 |
| TC-3 | 채번 멱등 + 기존 rcp_no 보존 | ❌ 미구현 | "두 번 계산 동일/시드 보존" 단언 부재 |
| TC-4 | 비후보자 → raw·origin 원본 | ✅ | `:45-51` |
| TC-5 | export-sqlite 회귀(.db 동일) | ✅ | `candidate-gate.test.ts` 게이트 검증 |

---

## 4. Gap 목록

### P1 — 보완 권장 (Match Rate 직결)
- **Gap-1 (FR-03/§4.2)**: 비고 `note`("재배분 84→82") 미구현. 이동/분할 행에 `{raw}→{new}` 재배분 근거 텍스트 부재 → 검토성 저하. `raw_acc_sec_cd`가 이미 보존되므로 도출 가능.
- **Gap-2 (TC-3)**: 채번 멱등·시드 보존 단위 테스트 부재. NFR "결정성(멱등)" 직접 증거 미확보 — **가장 저비용 보완**.
- **Gap-3 (TC-2/FR-04)**: export 실제 경로 cross-parity 테스트 부재. 동일 함수 import로 구조적 보장은 되나, 정렬/strip 차이를 잡는 회귀 테스트 없음(Risk 표 최우선 리스크).

### P2 — 문서 갱신 (코드가 truth)
- **Gap-4 (§3)**: design 시그니처를 `buildAdjustedAccBook(rows)`로(orgSecCd 제거) 갱신.
- **Gap-5 (§3)**: origin 판정을 "출처별 행 수 기반"으로 설계 텍스트 갱신.

### P0 — 없음
원본 acc_book write 0, 비후보자 raw 유지, export 동작 불변(별칭) 모두 충족.

---

## 5. 권장 조치 (우선순위)

1. **TC-3 멱등·시드 보존 테스트 추가** — `fillExportReceiptNumbers` 2회 적용 동일 + 기존 `rcp_no` 보존·미부여만 채움 단언.
2. **TC-2 cross-parity 테스트 보강** — export 실제 순서(normalize→sort→strip→fillReceipt) 거친 행과 뷰어 경로 rcp_no 동등 비교.
3. **비고 note 표기 추가** — 이동/분할 행 비고에 `{raw자금원}→{new자금원}` 합성.
4. **설계 문서 갱신** — Gap-4/5 (시그니처·origin 판정).

→ P1 3건 보완 시 **90%+ 도달**. `/pdca iterate adjusted-ledger-viewer`로 자동 개선 가능.

---

---

## 6. Act 반복 1회차 — Gap 해소 (Match Rate 88% → 98%)

`/pdca iterate`로 P1 3건 + P2 2건 전부 보완:

| Gap | 조치 | 근거 |
|-----|------|------|
| Gap-2 (TC-3) | 채번 멱등·시드 보존 테스트 추가 | `adjusted-ledger.test.ts:108-123` (시드 `자(비)-5` 보존, max+1, 2회 동일) |
| Gap-3 (TC-2) | export 실제 경로 cross-parity 테스트 신설 | `adjusted-ledger-parity.test.ts` (normalize→sort→strip→fillReceipt 재현, acc_book_id별 rcp_no 일치) |
| Gap-1 (note) | `adjustedNotes(rows, accName?)` 헬퍼 + 뷰어 비고 렌더 | `adjusted-ledger.ts:64-83`, `page.tsx:379` (보라색 "재배분 {원}→{현}") |
| Gap-4/5 (문서) | design §3 시그니처(orgSecCd 제거)·origin 판정·adjustedNotes·TC 체크 정정 | `design.md` §3,§6 |

**검증**: `adjusted-ledger*` 10/10 · export-sqlite 26/26 통과 · eslint clean · tsc 신규 에러 0.
**재검증 Match Rate: 98%** (≥90% — report 단계 진행 가능). 잔여는 P3(경미)뿐, 실질 블로커 없음.

---

## Version History
| Version | Date | Changes |
|---------|------|---------|
| 0.1 | 2026-06-22 | Check phase Gap 분석 — Match Rate 88%, P1 3건(TC-3/TC-2/note) 식별 |
| 0.2 | 2026-06-22 | Act 반복 1회차 — Gap 5건 전부 해소, Match Rate 98% |
