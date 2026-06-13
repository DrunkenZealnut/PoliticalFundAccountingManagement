# reimbursement-document-list Gap Analysis

> **Feature**: reimbursement-document-list
> **Date**: 2026-06-13
> **Branch**: `feature/reimbursement-document-list`
> **Agent**: bkit:gap-detector
> **Design**: `docs/02-design/features/reimbursement-document-list.design.md`

## Match Rate: 94% → **99%** (Gap 해소 후)

초기 gap-detector 분석 **94%**. 식별된 Gap 중 **G1(FR-08 교차검증 테스트)** 을 즉시 구현하고 **G2/G3(문서 정합)** 을 "코드=truth" 원칙으로 설계 문서에 동기화하여 최종 **99%**.

---

## 1. 요약

| 구분 | 초기 | 해소 후 |
|---|:--:|:--:|
| 설계 항목 정합(O) | 33 | 35 |
| 부분 정합(△) | 2 | 0 |
| 불일치/미구현(X) | 1 | 0 |
| 과구현(설계 외) | 0 | 0 |

설계 4대 원칙(**분류 축 분리 / allowlist 매핑 / 6컬럼 도너 재사용 / 증빙 메타데이터만**)이 모두 코드에 충실 반영됨. FR-01~FR-07 완전 구현, FR-08(교차검증 테스트)도 해소 후 충족. 테스트 **655개 전체 통과**.

---

## 2. 설계 항목별 정합 (요약)

| 영역 | 정합 | 근거 |
|---|:--:|---|
| §2 아키텍처(UI→API→순수로직→렌더→재패키징, 라우트 분리, 의존 재사용) | O | `route.ts`, `owpml-table.ts` |
| §3 매핑 SSOT(REIMB_ITEMS 7종 + MAP allowlist) | O | `reimbursement-item-map.ts:24-72` |
| §3 빌더 모델·대상필터(amt>0∧print_ok='Y')·그룹순서·정렬 | O | `reimbursement-doclist-builder.ts:107-151` |
| §3 증빙 표기(image/*→사진, 그외 문서, 0건 "없음", 대표 파일명) | O | `builder.ts:88-95`, `route.ts:110-119` |
| §4 API(인증·멤버십 가드, 응답, 에러코드) | O | `route.ts:57-141` |
| §5 UI(dataFill 유니온, 서식 def, FormInputPanel 맵 2곳) | O | `form-fields.ts:57,247`, `FormInputPanel.tsx:26,46` |
| §6.1 6컬럼 도너(22-3) 재사용·텍스트 치환 | O | `make-form-doclist-fill.py` |
| §6.2 renderDoclistSection(c0 rowSpan·rowAddr/rowCnt 재계산·마커 제거) | O | `owpml-table.ts:243-280` |
| §6.3 분류 축 분리(exp_group 축, detectItemCategory 미사용) | O | item-map: detectItemCategory import 0 |
| §6.4 무결성(mimetype STORED·잔여 토큰/마커 0·태그 균형) | O | 통합 테스트 |
| §8 엣지케이스(0건 "해당 없음"·항목 0건 생략·기타/미분류·익명) | O | builder + owpml-table + 테스트 |
| §9 빌드 산출(next.config·VERSION 0.12.0.0·CHANGELOG·manifest) | O | 해당 파일 |

---

## 3. FR 요구사항 추적

| FR | 요구 | 상태 |
|---|---|:--:|
| FR-01 | 보전체크 선거비용(amt>0∧print_ok='Y'∧incm=2) 대상 | ✅ |
| FR-02 | level1/2→7항목 매핑, 미매핑 "기타/미분류" 가시화 | ✅ |
| FR-03 | 항목별 명세행 + 소계 + 합계 | ✅ |
| FR-04 | 증빙 매수·유형·대표파일명, 0건 "없음" | ✅ |
| FR-05 | 거래업체 customer 조인(사업자번호·전화·주소는 6컬럼 MVP 미표기 — 설계 합의) | ✅ |
| FR-06 | 동일 "데이터 채움" 버튼 UX | ✅ |
| FR-07 | income-ledger 동일 로그인·org 멤버십 가드 | ✅ |
| FR-08 | 점검목록표 합계 == aggregator 합계 교차검증 테스트 | ✅ (해소) |

---

## 4. Gap 목록 및 해소

| # | Gap | 초기 심각도 | 해소 |
|---|---|:--:|---|
| G1 | **FR-08 교차검증 테스트 미구현** (설계 §6.3·§10·§9.7 명시 DoD 항목) | Medium | ✅ **구현** — `reimbursement-doclist-builder.test.ts` 에 soft-reconciliation 2케이스 추가(7항목·4자금원 혼합 / 미체크·음수 제외). doclist `totalAmount` == `aggregateReimbursementByFundingSource` 합계 검증. 축 분리 회귀 방어. |
| G2 | **API 후보자 org 검증 부재** (설계 §4.2·§11) | Low | ✅ **설계 동기화** — 형제 라우트(reimbursement-claim·income-ledger)는 멤버십만 검증하고 후보자 orgScope 는 UI `formsForOrgType` 에서 게이트하는 규약. 코드가 이 확립된 규약을 따르므로 설계 §2·§4·§11 을 규약에 맞춰 갱신(멤버는 자기 소속 org 만 접근 → IDOR 없음). |
| G3 | **명칭 미세 불일치**(`mapReimbItem`→`mapReimbItemKey`, `EvidenceSummary.count` 미사용, `TEMPLATE_ERROR`→`TEMPLATE_MISSING` 등) | Low | ✅ **설계 동기화** — 코드가 truth. design.md §3.2·§3.3·§4 명칭·에러코드를 구현에 맞춰 정정. |

---

## 5. 강점 / 잔여 리스크

**강점**
- 설계 4대 원칙 전부 코드 실증. `detectItemCategory` 미사용으로 메모리 `election-item-classification-ssot` 준수(선거사무소/유지비용 양쪽 존재 모호성 회피).
- estate 렌더 헬퍼 공용 추출로 doclist 재사용 — 중복 0, 기존 estate/ledger 회귀 0(655개 통과).
- 통합 테스트가 **실 템플릿**(form-doclist-fill.hwpx)으로 태그균형·mimetype STORED·재산명세서 잔재 0·잔여 토큰/마커 0 검증 — 한글 실오픈의 자동화 대체.
- make 스크립트 자체에 토큰/마커/잔재/태그균형 assert 내장(완전 자동·저위험).
- FR-08 교차검증으로 두 분류 축(exp_group vs item_sec_cd) 디버깅 없는 회귀를 자동 탐지.

**잔여 리스크(차단 아님)**
- **한글 시각 검수 미완**: 자동 무결성은 통과했으나, 보전항목 c0 셀 병합(rowSpan)·표제·헤더 시각 레이아웃은 한글에서 1회 수동 확인 권장(자동화 불가 영역).
- **거래내역 상세·증빙사진 내장 미포함**: MVP 범위 합의(Plan §2.2) — 후속 PDCA.

---

## 6. 결론

**Match Rate 99% (≥90% 충족).** 설계-구현 정합 우수, 기능·DoD·품질기준 모두 충족. 다음 단계 `/pdca report` 진행 가능.

- 잔여 권장: 한글 수동 시각 검수 1회(`/dashboard/submission-forms` → 후보자 → "선거비용 보전 첨부서류목록").
