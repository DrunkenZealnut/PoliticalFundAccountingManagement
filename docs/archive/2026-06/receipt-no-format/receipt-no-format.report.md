# 완료 리포트 — 영수증번호 채번 규칙 개정 (receipt-no-format)

## Executive Summary

| 항목 | 내용 |
|---|---|
| Feature | receipt-no-format |
| 기간 | 2026-06-16 (1일, Plan→Design→Do→Check 일괄) |
| Match Rate | **100%** (gap-detector 7/7) |
| 변경 규모 | 2파일 / +148 −20 (소스 1 + 테스트 1) |
| 테스트 | receipt-no 25 passed · 전체 702 passed (55 files) · lint clean |
| 차기 버전(예정) | 0.14.5.0 (현재 0.14.4.0, ship 시 MINOR bump) |

### 1.3 Value Delivered (4-Perspective, 실측 반영)

| Perspective | 내용 |
|---|---|
| **Problem** | 영수증 일련번호(`rcp_no`)가 선관위 공식 예시와 불일치 — 후보 선거비용외가 `자(비외)-1`(예시 `자-1`), 후원회 지출은 전용 규칙 없이 계정 첫글자 폴백으로 `후(후)-1`·`기(기)-1` 등 비표준 생성. 잘못된 번호로 백업 시 선관위 프로그램 수입·지출부 일련번호 불일치. |
| **Solution** | 채번 SSOT(`receipt-no.ts`)에 **`acc_sec_cd` 단일 판정 3-스킴** 도입 — A(후보 82~85): 선거비용 `{약자}(비)` 유지·선거비용외 `{약자}` 괄호 제거 / B(후원회 지출 acc=2): `{과목약자}`(기/모/인/사/그) / C(후원회 수입 acc=1·기타): 현행 유지. 실데이터 `.db` 검증으로 후원회 수입=1·지출=2 구조 확정 → incm_sec_cd 불필요·소비처 무변경. |
| **Function/UX Effect** | 「영수증 일괄생성」·자료백업(export-sqlite) 모두에서 후보 선거비용외 `자-1`, 후원회 지출 `기-1`처럼 공식 예시와 1:1 일치하는 번호 부여. 출력·제출 수입·지출부의 영수증일련번호가 선관위 양식과 정합. |
| **Core Value** | 영수증 일련번호가 **선관위 공식 표기 규칙** 준수 → 회계장부·백업·제출서류 전반의 표기 신뢰성 확보. |

---

## 2. 구현 내역

### 변경 파일
| 파일 | 변경 |
|---|---|
| `app/src/lib/accounting/receipt-no.ts` | 헤더 주석(3-스킴) 갱신, `CANDIDATE_FUND_ACC` 상수, `supporterExpenseAbbr()` 헬퍼 추가, `formatKey()` 3-스킴 분기 교체 |
| `app/src/lib/accounting/receipt-no.test.ts` | `NAMES` 픽스처 확장(후원회 1/2·94~101), T-9 수정(`자-1`), T-10·A-1~3·B-1~2·C-1·TC-8 신규 |

### 핵심 로직 (`formatKey`)
- **스킴 A** `acc_sec_cd ∈ {82,83,84,85}`: 과목명 `선거비용외` 포함 → `{계정약자}`(괄호 제거), `선거비용` 포함 → `{계정약자}(비)`
- **스킴 B** `acc_sec_cd === 2`: `supporterExpenseAbbr(과목명)` → `모금` 포함 시 `모`, 그 외 첫 글자(기/인/사/그)
- **스킴 C** 그 외(후원회 수입 1·기타): 현행 `{accountAbbr}({itemAbbr})` 폴백 유지

### 소비처 영향
`assignReceiptNumbers`/`fillExportReceiptNumbers` 시그니처 불변 → `api/acc-book`(batch_receipt)·`api/system/export-sqlite` **무변경**. 변경이 SSOT 1파일에 격리됨.

## 3. 검증

| 항목 | 결과 |
|---|---|
| receipt-no 단위 테스트 | ✅ 25 passed |
| 전체 회귀 | ✅ 702 passed (55 files) |
| ESLint(변경 파일) | ✅ clean |
| gap-detector Match Rate | ✅ 100% (7/7) |

### 동작 확인
- 후보 선거비용 `자(비)/후(비)/보(비)/외(비)-1` (불변) ✅
- 후보 선거비용외 `자/후/보/외-1` (괄호 제거) ✅
- 후원회 지출 `기/모/인/사/그-1` (신규) ✅ — 후원금모금경비→`모` 회귀가드 포함
- 후원회 수입 `수(기)-1` (현행 유지) ✅

## 4. 핵심 학습 / 결정

- **실데이터 검증의 가치**: 계획 단계의 "ORG_SEC_CD=109 + incm_sec_cd" 가설을 실제 `.db`(`오준석후원회_보관자료`) 조사로 검증 → 후원회는 `acc_sec_cd`가 수입(1)/지출(2)을 직접 인코딩함을 발견. 덕분에 판정 기준을 `acc_sec_cd` 단일로 단순화하고 소비처 변경을 0으로 만듦.
- **SSOT 단일 격리**: 채번 규칙을 `formatKey` 한 곳에 모아 소비처(2곳) 시그니처 불변 유지 → 저위험·고회귀안전.
- **코드명 기반 약자 매핑**: cv_id 하드코딩 대신 `모금` 키워드 매칭으로 코드셋 변동 내구성 확보(donation-code-fix 교훈 계승).
- **범위 절제(YAGNI)**: 과거 데이터 소급 재채번·후원회 수입 규칙·`income-expense-book.ts`(선거비용 전용)·`formatReceiptNo`는 변경하지 않음.

## 5. 남은 작업

- **수동 검증(선택)**: export-sqlite로 후원회 `.db` 생성 → 지출 `기-1`·후보 선거비용외 `자-1`·FK orphan 0 육안 확인.
- **Ship**: 요청 시 VERSION MINOR bump(0.14.5.0) + CHANGELOG + 커밋·PR. (현재 미수행 — 사용자 요청 대기)
