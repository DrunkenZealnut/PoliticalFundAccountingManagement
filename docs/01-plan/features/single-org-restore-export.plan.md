---
template: plan
version: 1.2
feature: single-org-restore-export
date: 2026-06-29
author: DrunkenZealnut
project: 정치자금 회계관리 시스템
version_project: 0.25.1.0
---

# single-org-restore-export Planning Document

> **Summary**: 선관위 윈도우 프로그램의 [자료 복구]로 바로 적재 가능한 "단일기관 보관자료" 백업 export 모드. 후보자·후원회를 각각 1개 기관 스냅샷으로 내보내 계정별로 복구한다.
>
> **Project**: 정치자금 회계관리 시스템
> **Version**: 0.25.1.0
> **Author**: DrunkenZealnut
> **Date**: 2026-06-29
> **Status**: Draft

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 사용자가 웹앱 자료백업(.db)을 윈도우 프로그램 Data 폴더에 직접 붙여넣다가 "자료전환" 차단·로그인 불가에 반복적으로 막힘. 현재 export는 후원회를 내보낼 때 가짜 후보자 페어를 자동 생성해, 후보자를 별도 기관으로 운영하는 사용자 환경(다중기관, ORG_ID 순차부여)과 충돌한다. |
| **Solution** | 프로그램 네이티브 백업(보관자료)과 동일한 **단일기관 20테이블 스냅샷**을 만드는 새 export 모드(`restore`)를 추가한다. 페어 자동생성 없음, 파일명은 프로그램이 [자료 복구] 목록에서 인식하는 `정치자금【기관명】보관자료_YYYY-MM-DD HH시MM분SS초.db` 형식으로 생성. |
| **Function/UX Effect** | 후보자 기관·후원회 기관을 각각 내보내 윈도우에서 계정별 [자료 복구]로 적재 → "Data 폴더 직접 교체" 혼동·유령 페어 충돌·자료전환 차단이 근본적으로 사라진다. |
| **Core Value** | 웹앱 ↔ 선관위 윈도우 프로그램의 **신뢰 가능한 단일 적재 경로** 확립. 데이터 무손실, 공식 절차(복구) 준수. |

---

## 1. Overview

### 1.1 Purpose

선관위 윈도우 프로그램([자료 복구] 기능)이 그대로 받아들이는 **단일기관 보관자료(.db) 스냅샷**을 웹앱에서 생성한다. 후보자·후원회처럼 별개 사용기관(별도 로그인)으로 운영되는 회계 책을 각각 1파일로 내보내, 윈도우에서 **계정별로 복구**할 수 있게 한다.

### 1.2 Background

- **확정된 사실(이번 조사, 2026-06-29):**
  - 윈도우 프로그램은 **계정(로그인)별로 백업/복구**한다. 한 파일로 두 계정 동시 업데이트 불가. (매뉴얼 Ⅳ "2개 이상 사용자는 각 아이디로 백업·복원" + 네이티브 백업이 단일기관 ORG_ID=3 스냅샷)
  - 프로그램은 기관마다 ORG_ID를 **순차 부여**(이 후원회=3, 타 기관 1·2·5 공존). 우리 export는 PFund2 규약(후원회=ORG_ID=2 + 후보자 페어=1) **고정**.
  - **Data 폴더 직접 교체는 다중기관 환경에서 동작 불가** → "자료전환" 강제·로그인 차단. (메모리: [[windows-load-needs-master-trio]])
  - 현재 `buildOrganExport`는 후원회(SUPPORTER_SEC_CDS) export 시 **가짜 후보자 페어를 자동 생성**한다(`organ-pair.ts`). 후보자를 진짜 별도 기관으로 운영하는 사용자에겐 **유령 후보자**가 끼어 충돌한다.
  - 데이터 무손실 확인: 네이티브 백업 ↔ 우리 export 거래 내용 diff=0(83건/2,086만원, ORG_ID만 상이).
- **사용자 환경:** 웹앱에 후보자·후원회가 **각각 별도 기관**으로 존재. 둘 다 윈도우 프로그램에 넣어야 함.

### 1.3 Related Documents

- 선행 조사/메모리: `windows-load-needs-master-trio`, `supporter-sec-cds-missing-local-election-codes`, `export-db-accbook-split-bak-raw`
- 공식 매뉴얼: `중앙선거관리위원회_정치자금회계관리2/Help/제9회_지방선거..._사용자_매뉴얼.pdf` (Ⅳ.2 자료 복구)
- 코드: `app/src/app/api/system/export-sqlite/route.ts`, `app/src/lib/accounting/organ-pair.ts`, `app/src/lib/accounting/pfund2-constants.ts`

---

## 2. Scope

### 2.1 In Scope

- [ ] 새 export 모드 `restore`(가칭): 선택된 **단일 기관**만 담는 20테이블 스냅샷
- [ ] **페어 자동생성 미적용** — 후원회 export 시 가짜 후보자 행/거래를 만들지 않음
- [ ] 단일 기관 ORGAN 1행 + 그 기관 거래(ACC_BOOK/ACC_BOOK_BAK) + 전체 reference(CODESET/CODEVALUE/ACC_REL/ACC_REL2) + 종속표(ESTATE/OPINION/SUM_REPT/COL_ORGAN/ALARM) 필터
- [ ] 파일명 자동 생성: `정치자금【{org_name}】보관자료_{YYYY-MM-DD HH시MM분SS초}.db`
- [ ] backup 페이지 UI: "윈도우 [자료 복구]용 (단일기관)" 옵션 + Data 폴더 직접 교체 경고 안내
- [ ] 후보자·후원회 각각 export 가능(현재 선택된 기관 기준; 기관 전환 후 재export)
- [ ] 회귀 테스트(단일기관 ORGAN, 페어 미생성, 파일명 포맷, FK 무결성)

### 2.2 Out of Scope

- 실시간/자동 동기화(프로그램은 오프라인 단독 실행 — 불가)
- 기존 `full`/`master`/`data1`/`data2` 모드 제거(유지 — 용도 다름)
- 윈도우 프로그램의 [자료 복구] 내부 ORG_ID 재배정 동작 변경(우리 통제 밖)
- 후보자↔후원회 한 파일 통합 복구(프로그램이 계정별 복구라 불가)

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | `mode=restore`(가칭) 추가 — 선택 org 1개만 담는 단일기관 .db 생성 | High | Pending |
| FR-02 | 페어 자동생성 우회 — ORGAN 단일행, 가짜 후보자/후원회 행·거래 미포함 | High | Pending |
| FR-03 | 거래/종속표를 선택 org 기준으로 필터(ACC_BOOK·BAK·ESTATE·OPINION·SUM_REPT·COL_ORGAN·ALARM) | High | Pending |
| FR-04 | reference 4종(CODESET/CODEVALUE/ACC_REL/ACC_REL2) 풀세트 포함(복구 호환) | High | Pending |
| FR-05 | 파일명 `정치자금【{org_name}】보관자료_{YYYY-MM-DD HH시MM분SS초}.db` 자동 생성 | High | Pending |
| FR-06 | backup 페이지에 단일기관 복구용 다운로드 옵션 + "Data 폴더 직접 교체 금지/[자료 복구] 사용" 안내 | Medium | Pending |
| FR-07 | **[해결됨, 2026-06-29 실기검증]** 복구는 ORG_ID 재배정 안 함 — 파일 ORGAN을 그 ORG_ID 그대로 INSERT → 기존 기관과 충돌 시 `UNIQUE constraint failed: ORGAN.ORG_ID`. 따라서 파일 ORG_ID = **프로그램의 그 기관 실제 ID**여야 하고, 그 org 로그인 상태에서 복구해야 함. 우리는 원본 ID 미보존 → **사용자 입력 "프로그램 기관번호" 필드 필요** | High | Resolved |
| FR-08 | 산출 .db FK 무결성 0 orphan (ACC_BOOK.cust_id → CUSTOMER, acc_sec_cd 등) | High | Pending |
| FR-09 | **(사용자 제안 채택) master.db 업로드 → ORG_ID 자동 매칭**: 사용자가 프로그램의 `Fund_Master.db`(또는 네이티브 보관자료)를 업로드하면, ORGAN을 읽어 USERID/REG_NUM/org_name으로 현재 웹앱 기관을 매칭 → 그 기관의 **실제 프로그램 ORG_ID**를 추출해 export에 사용. (수동 입력은 fallback) | High | Pending |
| FR-10 | 복구 사용법 안내: "해당 기관으로 로그인한 상태에서 그 기관 파일만 복구"(타 기관 로그인 시 충돌) | Medium | Pending |
| FR-11 | 적재 방식 2종 지원 검토 — A) 단일기관 복구파일([자료 복구]) / B) 사용자 실제 master 유지 + Fund_Data만 일치 ORG_ID로 교체. 둘 다 master를 1/2로 덮지 않음 | Medium | Pending |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| 호환성 | 프로그램 [자료 복구] 목록에 인식·복구 성공 | 윈도우 실기 1회 검증(사용자) |
| 정합성 | 거래 내용이 원본(Supabase)·기존 뷰어/Excel과 일치 | vitest 단위테스트 + 집계 비교 |
| 무결성 | sql.js 산출 .db FK orphan 0 | export 테스트에서 cust_id 참조 검증 |
| 안전성 | 기존 full/master/data1/data2 회귀 없음 | export-sqlite 기존 스위트 통과 |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] FR-01~08 구현
- [ ] 단위 테스트(단일기관 ORGAN/페어 미생성/파일명/FK) 작성·통과
- [ ] 기존 export-sqlite 스위트 회귀 0
- [ ] backup UI 안내 반영
- [ ] (사용자) 윈도우 [자료 복구] 실기 검증 1회 — 후보자·후원회 각각 적재 성공

### 4.2 Quality Criteria

- [ ] 신규 코드 경로 테스트 커버리지 확보
- [ ] eslint 0
- [ ] build 성공

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| ~~[자료 복구] ORG_ID 동작 불명확~~ → **해결**: 그대로 INSERT(재배정 X), 충돌 시 UNIQUE 실패 | High | — | 파일 ORG_ID=프로그램 기관 ID로 맞춤(사용자 입력) + 해당 org 로그인 후 복구 |
| 사용자가 자기 기관의 프로그램 ORG_ID를 모름 | High | Medium | 네이티브 백업(보관자료)에서 ORG_ID 확인 방법 안내 / export UI에 입력+도움말 / 기본값 제시 |
| 파일명 패턴 불일치로 복구 목록에 안 뜸 | Medium | Medium | 네이티브 백업 파일명 정확 모사(대괄호 공백·`HH시MM분SS초`), 브라우저 접미사 `(1)` 회피 안내 |
| 페어 우회가 기존 data1/data2·full 로직과 분기 충돌 | Medium | Low | buildOrganExport에 single-org 옵션 추가(기존 분기 불변), 회귀 테스트 고정 |
| 사용자가 여전히 Data 폴더 직접 교체 시도 | Medium | Medium | backup UI 경고 + 문서화, 복구 경로 단일화 안내 |
| reference 코드셋 버전 차이로 복구 거부 | Low | Low | 현행 seed 유지(2026 코드 포함), 네이티브 백업과 코드셋 비교 |

---

## 6. Architecture Considerations

### 6.1 Project Level

Dynamic(기존). 신규 인프라 없음 — 기존 `export-sqlite` 라우트 + `organ-pair`/`pfund2-constants` 확장.

### 6.2 Key Decisions (설계 단계 확정 대상)

| Decision | Options | Lean | Rationale |
|----------|---------|------|-----------|
| 모드 추가 위치 | export-sqlite route `mode` 분기 / 신규 route | route `mode=restore` | 기존 reference/거래/종속표 빌드 재사용 |
| 페어 우회 방식 | buildOrganExport 옵션 `singleOrg` / 신규 함수 | 옵션 추가 | 기존 페어 분기 불변, 테스트 격리 |
| ORG_ID 값 | 1 고정 / 사용자 입력 / **master.db에서 읽기** | **master.db에서 읽기** | 실기검증: 복구는 ID 그대로 INSERT(충돌 시 UNIQUE 실패) → 프로그램 실제 ID 필수. master가 SSOT(사용자 제안) |
| 파일명 생성 | pfund2DownloadFilename 확장 / 신규 헬퍼 | 헬퍼 확장 | 단일 SSOT |
| data1/data2와 관계 | 통합 / 별도 | 별도 모드 | data1/2=Data폴더 split(Fund_Data_N), restore=복구 스냅샷(보관자료) |

### 6.3 기존 export 모드와의 차이 (핵심 정리)

```
full   : 후보자+후원회 페어 + 전체 거래 (우리 통합본, Data폴더 아님)
master : 페어 + reference, 거래 0 (Fund_Master.db 호환, Data폴더 split)
data1  : 후보자 단행 + 거래 (Fund_Data_1.db, Data폴더 split — 붙여넣기용)
data2  : 후원회 단행 + 거래 (Fund_Data_2.db, Data폴더 split — 붙여넣기용)
─────────────────────────────────────────────────────────────
restore(신규): 선택 기관 1개 단행 + 그 거래 + 풀 reference,
              가짜 페어 없음, 파일명=보관자료 형식 → [자료 복구] 전용
```

---

## 7. Convention Prerequisites

- [x] `CLAUDE.md` 코딩 컨벤션/아키텍처 섹션 존재
- [x] export-sqlite gotcha 문서화(ACC_INS_TYPE CHAR(2)·컬럼 누출·FK orphan) — 신규 모드도 동일 방어 준수
- [x] 릴리스 버전 SSOT=`app/VERSION`(메모리 [[release-version-ssot]])
- 신규 env 불필요

---

## 8. Next Steps

1. [ ] **(우선) 윈도우 실기 검증 게이트** — 현재 full 파일을 보관자료 형식 파일명으로 바꿔 [자료 복구] 시도 → 단일기관 스냅샷 수용 여부·ORG_ID 재배정 동작 확인(FR-07 입력)
2. [ ] 설계 문서 작성 (`/pdca design single-org-restore-export`) — ORG_ID 규칙·페어 우회 API·파일명 헬퍼 확정
3. [ ] 구현 → 테스트 → `/ship`
4. [ ] 사용자 실기 재검증(후보자·후원회 각각 복구)

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-06-29 | Initial draft | DrunkenZealnut |
