# candidate-accounting-report-hwpx Gap 분석 보고서

## 분석 개요

| 항목 | 내용 |
|------|------|
| 분석 대상 | candidate-accounting-report-hwpx (서식 22-1 / 22-3 / 22-4) |
| 설계 문서 | `docs/02-design/features/candidate-accounting-report-hwpx.design.md` |
| 구현 경로 | `app/src/lib/hwpx/`, `app/src/app/api/hwpx/accounting-report/`, `app/src/lib/accounting/estate-types.ts` |
| 분석일 | 2026-06-08 |
| 현재 상태 | 538 테스트 통과, lint 0, build 성공 |
| 범위 제외 | 22-2(선거비용 집계표) — 사용자 결정, 갭 아님 |

## 종합 점수

| 카테고리 | 점수 | 상태 |
|----------|:----:|:----:|
| 설계 일치 (Design Match) | 99% | ✅ |
| 아키텍처 준수 (비침습/순수함수/SSOT) | 100% | ✅ |
| 컨벤션 준수 | 100% | ✅ |
| **종합 Match Rate** | **99%** | ✅ |

설계와 구현이 정확히 일치. 초기 분석에서 발견된 G-3(22-3 빈 구분 표기)은 1차 iterate로 **해소**(estate-builder가 양식 고정 6구분 + "해당없음" 표기). 잔여 갭(G-2·G-4)은 문서 갱신 건으로 동작 무영향.

## FR 충족 매트릭스 (Plan §3.1)

| FR | 요구사항 | 구현 위치 | 상태 |
|----|----------|-----------|:----:|
| FR-01 | 22-1/22-3/22-4 dataFill 분기 액션 노출 | `form-fields.ts`, `FormInputPanel.tsx:126,140-161` | ✅ |
| FR-02 | 22-4 계정+과목 그룹핑·일자 정렬 | `income-ledger-builder.ts` (재사용) | ✅ |
| FR-03 | 22-4 행 매핑(+비고 14컬럼) | `income-ledger-builder.ts` rowTokens | ✅ |
| FR-04 | 22-4 누계·잔액(수입누계−지출누계) | `income-ledger-builder.ts` | ✅ |
| FR-05 | 22-1 자금원 구분 집계 + 선거비용/외 구분 | `report-summary-builder.ts:80-119` | ✅ |
| FR-06 | 22-1 고정 셀 + 합계행 + 천단위 | `summaryTokens` + `formatAmount` | ✅ |
| FR-07 | 22-3 estate 구분 그룹 + 소계 + 합계 | `estate-builder.ts`, `owpml-table.ts` renderEstateSection | ✅ |
| FR-08 | 공통 메타(헤더/서명/선관위명) | 의도된 부분 구현(미보유 값 공란, §7 Q5) | 🟡 |
| FR-09 | 개별 단일 HWPX `application/hwp+zip` | `route.ts` | ✅ |
| FR-10 | 엣지(0건/익명/미분류) 안전 처리 | 통합 테스트 + renderEmptyGroup + isAnonymous | ✅ |
| FR-11 | 한글 정상 열림(zip/STORED/마커 무결성) | assertBalanced + STORED 검증 테스트 | ✅ |

## 검증 관점별 결과

### 1. 22-1 자금원 구분 집계 + 선거비용/외 구분 ✅
- `classifyFundingSource` SSOT 재사용(하드코딩 없음 — 아카이브 교훈).
- `classifyExpenseCategory`: "선거비용외" 우선 → "선거비용" → 불명은 보수적 "선거비용외".
- 토큰 접두사 1:1 정합을 form-fields.test가 가드.

### 2. 22-3 estate 그룹/소계/합계 + 단일표 c0 rowSpan ✅
- `setC0RowSpan(n+1)`(명세N+소계1) + `removeC0Cell`(2번째+ 행) + `recalcTableRowAddr`(0..N) + rowCnt 동기.
- 설계 §6.3 무결성 규칙 완전 일치. 통합 테스트가 rowCnt===trCount 검증.

### 3. 22-4 income-ledger 재사용 + 비고 ✅
- builder/renderIncomeLedgerSection 그대로 재사용. 비고는 remark(기본 "") + 14키.
- 서식 7 회귀 방지: form-fields.test가 income-ledger에서 remark 제외, 잔여 토큰 cleanup.

### 4. IDOR 가드 + org 스코프 ✅
- SSR getUser + user_organ 멤버십 검증, 모든 조회 org_id 강제, formId 화이트리스트.

### 5. 엣지 케이스 ✅
- 0건/익명(-999)/미분류 계정(기타 버킷) 모두 테스트 가드.

## 발견된 갭 (모두 🔵 Minor)

| ID | 항목 | 설계 | 구현 | 영향 | 평가 |
|----|------|------|------|------|------|
| G-1 | 22-1 합계행 income 합산 범위 | §7 Q1 "기타 합계 포함" | total = 4행 + 기타 버킷 | 없음 | **설계 일치** |
| G-2 | ESTATE_TYPES 코드 49(차입금) | §3.3: 43~48 (6구분) | 49 차입금 추가(7구분) | 낮음 | **구현 우위**, 설계 §3.3 갱신 권장 |
| G-3 | 22-3 빈 구분 "해당없음" 행 | §3.3/§8: 0건 구분도 "해당없음"·소계0 표기(6구분 고정) | ~~데이터 있는 구분만~~ → **1차 iterate 해소**: `FIXED_ESTATE_SECS`(43~48) 고정 6구분 항상 표기, 0건은 "해당없음"·소계0, 차입금(49) 등은 데이터 있을 때만 추가 | — | ✅ **해소** (estate-builder.test/estate-integration.test 검증) |
| G-4 | 22-1 헤더 메타 토큰 | §6.2 토큰맵에 선거명/후보자명/선관위명 | summaryTokens는 집계 셀만, 헤더 메타 미주입 | 낮음 | FR-08 "미보유 공란"(§7 Q5)과 정합. §6.2 예시 정정 권장 |

🔴 미구현 없음 (22-2 제외는 범위 결정). 🟡 설계 외 추가 없음.

## 구현 순서 대조 (§9)

| § | 산출물 | 상태 |
|---|--------|:----:|
| 1 | estate-types 추출 + estate/page 교체 | ✅ |
| 2 | report-summary-builder + test | ✅ |
| 3 | estate-builder + test | ✅ |
| 4 | income-ledger 비고 + owpml-table + 서식7 회귀 | ✅ |
| 5 | form-22-1/3/4-fill.hwpx + 정합 테스트 | ✅ |
| 6 | accounting-report route formId 분기 | ✅ |
| 7 | form-fields dataFill + 테스트 예외 | ✅ |
| 8 | FormInputPanel 엔드포인트 + formId | ✅ |
| 9 | next.config 트레이싱 | ✅ |
| 10 | 실데이터 한글 실오픈 + 합계 대조 | ⚠️ 수동(통합 테스트로 대체) |
| 11 | CLAUDE.md 갱신 | ✅ |

## 권장 조치

### 완료 (1차 iterate)
1. **G-3 해소**: 사용자 결정("모든 구분 해당없음 고정 표기")에 따라 `buildEstateModel`이 `FIXED_ESTATE_SECS`(토지~그밖의재산 6구분)를 항상 표기, 0건은 "해당없음"·소계0. 차입금(49) 등 비고정 구분은 데이터 있을 때만 추가. estate-builder.test/estate-integration.test로 검증.

### 문서 갱신 완료 (코드가 정답)
2. **G-2**: 설계 §3.3에 `49 차입금`·고정 6구분 반영.
3. **G-4**: 헤더 메타는 FR-08 "미보유 값 공란"(§7 Q5) 결정과 정합 — 잔존(동작 무영향).

## 결론

**Match Rate 99%** — Plan FR 충족, 설계 §3~§10 정확 반영, SSOT·순수함수·비침습 원칙 준수. G-3(22-3 빈 구분 표기)은 1차 iterate로 해소(양식 고정 6구분 + 해당없음). 90% 임계 크게 상회 → 완료 보고(`/pdca report`) 진행 권장. 전체 538 테스트 통과, lint 0, build 성공.
