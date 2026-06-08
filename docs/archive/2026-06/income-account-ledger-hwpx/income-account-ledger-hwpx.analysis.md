# income-account-ledger-hwpx Gap Analysis Report

> **Analysis Type**: PDCA Check (Design ↔ Implementation Gap)
>
> **Project**: 정치자금 회계관리 시스템 (political-fund-accounting)
> **Analyst**: gap-detector (bkit) + 검증 정정
> **Date**: 2026-06-08
> **Design Doc**: `docs/02-design/features/income-account-ledger-hwpx.design.md`
> **Plan Doc**: `docs/01-plan/features/income-account-ledger-hwpx.plan.md`

---

## 1. Overall Match Rate

| Category | Score | Status |
|----------|:-----:|:------:|
| Design Match (§3~§9) | 99% | ✅ |
| Architecture Compliance (비침습/순수함수 분리) | 100% | ✅ |
| Convention Compliance (날짜·org스코프·service-role) | 100% | ✅ |
| **Overall (자동화 가능 범위)** | **99%** | ✅ |

> 코드 차원의 미구현/불일치 **0건**. 유일한 미완은 FR-10의 **한글 실오픈(수동)** 1건 — 사전 합의된 수동 단계이며 XML 무결성은 통합테스트로 자동 대체 검증됨.
> 빌드/품질 게이트: **전체 511 테스트 통과**, lint 0 error, build 성공.

```
[Plan] ✅ → [Design] ✅ → [Do] ✅ → [Check] ✅ (99%) → [Act/Report] ⏳
```

---

## 2. Plan FR-01 ~ FR-10 충족도

| FR | 요구사항 | 구현 위치 | 상태 |
|----|----------|-----------|:----:|
| FR-01 | 서식 7 선택 시 "수입 데이터로 회계장부 생성" 액션 | `FormInputPanel.tsx` (`def.dataFill` 분기) + `form-fields.ts` (`dataFill:"income-ledger"`) | ✅ |
| FR-02 | 계정+과목 그룹핑 + 그룹 내 연월일 ASC | `income-ledger-builder.ts` (groupMap·sortedKeys·localeCompare) | ✅ |
| FR-03 | form-7 표 레이아웃 (계정/과목 헤더 + 데이터행 N) | `owpml-table.ts` renderGroup + 템플릿 마커 | ✅ |
| FR-04 | 13셀 매핑 (연월일/내역/수입금회·누계/잔액/제공자5/영수증) | `income-ledger-builder.ts` rowTokens | ✅ |
| FR-05 | 누계·잔액 그룹 내 일자순 누적 (잔액=수입누계) | builder `cum += acc_amt`, balance=cum | ✅ |
| FR-06 | customer 조인 확장 (reg_num·job·tel·addr·addr_detail) | `route.ts` select 확장 | ✅ |
| FR-07 | 계정별 단일 HWPX, application/hwp+zip attachment | `route.ts` 응답 헤더 | ✅ |
| FR-08 | 레이아웃 보존 `<hp:tr>` 블록 복제·치환 | `owpml-table.ts` buildDataRow (borderFill/cellSz 복제) | ✅ |
| FR-09 | 엣지케이스 (0건/그룹0/미등록/익명-999) 무손상 | builder isAnonymous, renderEmptyGroup, 빈그룹 미생성 | ✅ |
| FR-10 | 한글 실오픈 정상 (zip/mimetype/ID 무결성) | XML 무결성·잔여토큰0·mimetype STORED 통합테스트 자동검증 / **실오픈 수동** | ⚠️ |

**FR: 9/10 완전, 1/10 수동 검증 대기**

---

## 3. Design §3~§9 충족도

| 설계 항목 | 구현 | 상태 |
|----------|------|:----:|
| §3.1 IncomeLedgerInputRow | 필드 일치 | ✅ |
| §3.2 뷰모델 (LedgerCellRow/Group/Model, 빈그룹 없음) | 동일 | ✅ |
| §3.3 codevalue 직접 조회 | route 코드명 맵 | ✅ |
| §3.3 자금원 보조 정렬키 | 미적용 (설계가 "적용 가능"=선택) | 🔵 |
| §4.1 Endpoint (POST, service-role) | 일치 | ✅ |
| §4.2 에러코드 | 404 NO_DATA→0건도 200 빈양식(§7 자체확정) | 🔵 |
| §5 dataFill 메타·UI 분기·버튼 | 일치 | ✅ |
| §6.1 템플릿 전략 (form-7-fill, Option A) | 스크립트+템플릿 존재 | ✅ |
| §6.2 렌더 알고리즘 | 일치 | ✅ |
| §6.3 ID 무결성 (tbl id 오프셋·rowAddr·p id=0) | 일치, 통합테스트 검증 | ✅ |
| §6.4 셀 값 매핑 11규칙 | 전부 구현 | ✅ |
| §7 Edge Cases 6건 | 전부 처리 | ✅ |
| §8 구현 순서 8단계 | 7/8 완료 (8=실데이터 수동) | ⚠️ |
| §9 Test Strategy (단위/정합/통합/수동) | 4종 테스트 존재 | ✅ |

---

## 4. 추가 보강 (설계 X, 구현 O — 긍정적)

| 항목 | 위치 | 설명 |
|------|------|------|
| `QUERY_FAILED` 에러코드 분리 | route.ts | 조회 실패 견고성↑ |
| `_token-manifest.json` drift 가드 | form-fields.test.ts | manifest↔정의 양방향 정합성 자동검증 |
| 익명 판정 이중화 | builder isAnonymous | cust_id=-999 또는 reg_num=9999 |
| `next.config` 번들 포함 | next.config.ts | Vercel 서버리스 템플릿 fs 접근 보장(배포 회귀 방지) |
| `repackageSection` 헬퍼 분리 | generate.ts | generateHwpx와 DRY 공유 |
| 구현 중 버그 2건 사전 차단 | make-form-7-fill.py | ① 표 wrapping 문단 경계 ② 텍스트 셀 `</hp:run>` 이중 닫힘 |

---

## 5. Gap 목록 & 정정

### 🔴 Missing (코드 미구현) — **없음**

### ⚠️ 수동 검증 대기 (1건)
- **FR-10 한글 실오픈**: 실데이터(org 9, 수입 18,099,055원)로 생성한 .hwpx를 한글에서 실제 오픈 + 합계 대조. 자동화 불가(합의됨). XML 태그균형·잔여토큰0·mimetype STORED는 `income-ledger-integration.test.ts`로 자동 대체 검증 완료.

### 📝 gap-detector 오판 정정 (1건)
- gap-detector는 "CLAUDE.md `lib/hwpx/` 미갱신"으로 보고했으나, **Do 단계에서 이미 갱신 완료** (루트 `CLAUDE.md` L51 api 라인 `hwpx/{generate,income-ledger}`, L63 `lib/hwpx/`에 income-ledger-builder·owpml-table·form-7-fill 설명 추가). → **Plan DoD 문서 항목 충족.**

### 🔵 설계 문서 표현 정정 권고 (구현은 정합, 문서만)
1. §4.2 `404 NO_DATA` ↔ §7 "0건도 빈 양식 반환" 표현 충돌 → §4.2를 "0건도 200 빈 양식"으로 통일 권장.
2. §3.3 자금원 보조 정렬 "적용 가능"(선택) → "현 버전 미적용(코드순으로 충분)" 명시 또는 백로그화.

---

## 6. 종합 판단 & 다음 단계

- **Match Rate 99% (≥90%)** → 설계와 구현이 매우 잘 일치. 코드 미구현/불일치 0건.
- 비침습 원칙(generateHwpx 불변·별도 빌더/라우트/템플릿) 완전 준수 → Plan/Design 핵심 위험(기존 서식 회귀) 차단.
- 잔여: FR-10 수동 한글 검증 1건 + 설계 문서 표현 정정 2건(선택).

**권고 순서**:
1. (선택) `/simplify` — Check ≥90% 후 코드 정리
2. FR-10 수동 검증 (dev 서버 → 서식 7 → 한글 오픈 + 합계 대조)
3. `/pdca report income-account-ledger-hwpx` — 완료 보고서 (FR-10 결과 첨부)
