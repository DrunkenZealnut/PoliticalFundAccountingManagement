# 선거비용 보전청구서(서식 43) HWPX 청구내역 표 축 전치 수정 (reimbursement-claim-table-transpose-fix)

## Executive Summary

| 항목 | 내용 |
|---|---|
| Feature | reimbursement-claim-table-transpose-fix |
| 시작일 | 2026-06-11 |
| 예상 기간 | 1~2일 (템플릿 OWPML 재구성 포함) |
| 영향 범위 | `public/hwpx-templates/form-43-fill.hwpx`(재생성), `lib/hwpx/reimbursement-claim-builder.ts`(재작성), `api/hwpx/reimbursement-claim/route.ts`, `scripts/make-form-43-fill.py`, 관련 테스트 |
| 근거 | 사용자 보고(가로·세로 전치) + 사용자 확정(세로=장소/가로=자금원) + Excel 구현(`reimbursement-claim-form.ts`)·`reimbursement-aggregator` SSOT 대조 |

### Value Delivered (4-Perspective)

| Perspective | 내용 |
|---|---|
| **Problem** | 「선거비용 보전청구서」(서식 43) HWPX의 청구내역 표가 공식 양식과 **행·열이 전치**되어 출력된다. 현재 HWPX는 **행=자금원(후보자자산/후원회기부금/정당의지원금), 열=장소(선거사무소/연락소/합계)** 인데, 공식 양식(=Excel 구현)은 **행=장소(선거사무소/연락소/합계), 열=자금원(후보자자산/후원회기부금/보조금/보조금외/합계)** 이다. 게다가 HWPX는 자금원을 3분류(보조금+보조금외를 "정당의지원금"으로 합산)로 잘못 묶어 공식 4열(보조금·보조금외 분리)과도 다르다. |
| **Solution** | 청구내역 표를 공식 축(행=장소, 열=자금원 4개)으로 재구성하고, HWPX 빌더를 **Excel과 동일한 `reimbursement-aggregator`(ClaimAmounts: 후보자자산/후원회기부금/보조금/보조금외) SSOT로 전환**한다. 별도 3분류 `reimbursement-claim-builder`를 폐기/재작성하여 Excel·HWPX가 같은 집계·같은 표 구조를 공유하게 한다. |
| **Function/UX Effect** | 보전청구서 HWPX가 선관위 공식 별지 서식과 동일한 표 레이아웃으로 출력되어 그대로 제출 가능. Excel본과 HWPX본의 숫자·구조가 일치(자금원 4분류 동일 집계). |
| **Core Value** | 선거비용 보전청구라는 **법정 제출 서류의 정확성** 확보. 잘못된 표로 제출 시 반려·재작성 리스크를 제거하고, Excel/HWPX 두 출력 경로의 SSOT 정합성을 회복. |

---

## 조사 결과 (확정 사실)

### 현재 구조 (잘못됨)
`form-43.hwpx` / `form-43-fill.hwpx` 청구내역 표 (실측):
```
구분(세로)        | 청구액(가로: 선거사무소 | ○○연락소×4 | 합계) | 비고
후보자 자산       | 15,000,000 | 10,000,000 | … | 25,000,000 |
후원회기부금      | …
정당의지원금      | …          (보조금+보조금외 합산)
합  계           | 15,000,000 | 10,000,000 | … | 25,000,000 |
```
- 행 = 자금원(3개), 열 = 장소
- `make-form-43-fill.py`: `ROW_PREFIX={2:후보자자산,3:후원회기부금,4:정당의지원금,5:합계}`, `CELL_SUFFIX={1:사무소,6:합계}`
- `reimbursement-claim-builder.ts`: 토큰 `{자금원}_{장소}` 8개, 3분류 집계(정당의지원금=보조금+보조금외+기타 흡수)

### 공식/목표 구조 (사용자 확정 — 세로=장소/가로=자금원)
```
구분(세로)        | 청구액(가로: 후보자자산 | 후원회기부금 | 보조금 | 보조금외) | 합계 | 비고
선거사무소        | …          | …            | …      | …        | …    |
○○선거연락소     | (수기 빈칸)
…(연락소 행)
합  계           | …          | …            | …      | …        | …    |
```
- 행 = 장소(선거사무소/연락소/합계), 열 = 자금원 **4개**(후보자자산/후원회기부금/보조금/보조금외) + 합계
- **Excel `reimbursement-claim-form.ts`가 이미 이 구조** (열 A 구분 / B 후보자자산 / C 후원회기부금 / D 보조금 / E 보조금외 / F 합계 / G 비고)
- **`reimbursement-aggregator.ts`가 SSOT** — `ClaimAmounts {후보자자산, 후원회기부금, 보조금, 보조금외}` 반환, Excel `claim-form/aggregate` route가 이미 사용 중

### 핵심: HWPX와 Excel이 별개 집계를 써서 불일치
- Excel: `aggregateReimbursementByFundingSource` → 4분류
- HWPX: `buildReimbursementClaimModel` → 3분류(정당의지원금 합산)
- 이번 수정으로 **HWPX도 4분류 aggregator SSOT로 통일** → 자연히 Excel과 동일 결과

---

## 해결 방향

### 1. 템플릿 재생성 (`make-form-43-fill.py` → `form-43-fill.hwpx`)
청구내역 표를 **행=장소 / 열=자금원 4개** 구조로 재구성. 옵션 A(사무소 단일 집계) 유지 시 표는 고정 구조 + 토큰으로 충분(동적 행 복제 불필요):
```
구분        | 후보자자산 | 후원회기부금 | 보조금 | 보조금외 | 합계 | 비고
선거사무소   | {{사무소_후보자자산}} | {{사무소_후원회기부금}} | {{사무소_보조금}} | {{사무소_보조금외}} | {{사무소_합계}} |
○○선거연락소 | (빈칸 수기) …×4 행
합  계       | {{합계_후보자자산}} | {{합계_후원회기부금}} | {{합계_보조금}} | {{합계_보조금외}} | {{합계_합계}} |
```
토큰 10개(사무소 5 + 합계 5). 본문 텍스트 토큰(선거명/선거구명/후보자명/보전청구총액/수령계좌/선관위명)은 현행 유지.

> **핵심 리스크 / 설계 결정**: 현 `form-43.hwpx` 표는 전치 구조라 단순 토큰 치환으로는 축을 못 바꾼다. **올바른 축의 베이스 HWPX 표**가 필요하다. 후보안:
> - (A) `make-form-43-fill.py`에서 표 OWPML을 **새 구조로 재구성**(셀 개수·rowAddr/colAddr 재계산) — owpml-table.ts 패턴 활용. 복잡하나 자기완결적.
> - (B) 사용자/공식 배포본에서 **올바른 축의 별지 서식 .hwpx** 확보 후 토큰화.
> - → design 단계에서 확정. 우선 (A)를 기본안으로, 베이스 표 OWPML 재작성 PoC 선행.

### 2. 빌더 전환 (`reimbursement-claim-builder.ts` 재작성)
- 3분류 `buildReimbursementClaimModel`/`claimTableTokens` 폐기
- `aggregateReimbursementByFundingSource`(SSOT) 재사용 → `ClaimAmounts` 4분류
- 옵션 A: 전액 사무소 행 = 합계 행. 토큰 빌더가 `사무소_*`/`합계_*` 10개 + 본문 `보전청구총액_*` 생성
- 선거비용 판별·보전 체크(acc_print_ok='Y') 규칙은 aggregator가 이미 담당(중복 제거)

### 3. 라우트 (`api/hwpx/reimbursement-claim/route.ts`)
- `buildReimbursementClaimModel` → aggregator 호출로 교체
- 토큰 조립부만 수정, 인증/조회/응답 구조 유지

### 4. 테스트
- `reimbursement-claim-builder.test.ts` 재작성(4분류·새 토큰)
- `reimbursement-claim-integration.test.ts` 갱신
- **교차 정합 테스트**: HWPX 토큰 합계 == Excel `claim-form/aggregate` 결과(동일 aggregator라 자동 보장, 명시적 단언 추가)
- `make-form-43-fill.py` 검증부(토큰 개수·예시값 잔존·표 2개·XML 균형) 갱신

## 검증 기준 (Acceptance)

1. 생성된 보전청구서 HWPX 청구내역 표가 **행=장소(선거사무소/연락소/합계), 열=자금원(후보자자산/후원회기부금/보조금/보조금외/합계)** 구조
2. 후보자자산·후원회기부금·보조금·보조금외 4열이 분리되어 각각 정확한 합계 표시(정당의지원금 합산 표기 제거)
3. 동일 org·동일 기간에서 HWPX 청구내역 합계 == Excel 보전청구서 합계 (aggregator SSOT 공유)
4. 옵션 A: 선거사무소 행 = 합계 행, 연락소 행은 빈칸(수기)
5. 본문 보전청구 총액(한글·숫자)·수령계좌·선관위명 토큰 정상 치환, 예시값 잔존 0, HWPX well-formed(STORED mimetype)
6. 신규/갱신 테스트 전부 통과 + lint 0 + build 성공

## 영향 범위 점검

- **Excel 경로 무변경**: `reimbursement-claim-form.ts`·`claim-form/aggregate` route는 이미 올바름 — 건드리지 않음(정답 기준)
- **`reimbursement-aggregator.ts` 무변경**: SSOT 재사용만, 로직 수정 없음
- **`form-fields.ts` 서식 43 정의**: dataFill="reimbursement" 유지, 토큰 레지스트리 영향 확인
- **`form-43.hwpx`(원본)**: 폐기 또는 보관 — 재생성 베이스로 쓸지 design에서 결정

## 리스크 / 함정

- **베이스 표 OWPML 재구성**(축 전치)이 최대 난관: 셀 개수가 행마다 달라지고 rowAddr/colAddr·cellSpan 재계산 필요. HWPX 표는 문단(hp:p>hp:run) 내장이라 마커 경계·태그 균형 주의([[hwpx-form-generator]] 교훈).
- 자금원 분류 **3→4 전환**: 기존 "정당의지원금" 흡수 로직 제거. funding-source SSOT가 보조금/보조금외를 별개로 분류하는지 확인(aggregator는 이미 분리하므로 OK).
- 옵션 A 정책 유지 여부: 연락소 자동 분리 불가(acc_book에 연락소 식별 컬럼 없음) — 현행대로 사무소 단일 집계 + 연락소 수기. design에서 재확인.
- form-43.hwpx가 "공식"으로 보이나 실제 공식과 전치 → **베이스 신뢰 불가**. Excel/aggregator를 정답 기준으로 삼는다(사용자 확정).

## 다음 단계

베이스 표 OWPML 재구성이 핵심 난관이므로 **`/pdca design reimbursement-claim-table-transpose-fix`** 권장 — 템플릿 표 구조(셀 주소·span·토큰 배치)와 빌더 토큰 계약을 먼저 확정한 뒤 구현.
