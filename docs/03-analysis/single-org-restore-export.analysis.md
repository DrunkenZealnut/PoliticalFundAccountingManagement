---
template: analysis
feature: single-org-restore-export
date: 2026-06-29
phase: check
project: 정치자금 회계관리 시스템
---

# single-org-restore-export Gap Analysis (Check)

> **Plan**: [../01-plan/features/single-org-restore-export.plan.md](../01-plan/features/single-org-restore-export.plan.md)
> **Design**: [../02-design/features/single-org-restore-export.design.md](../02-design/features/single-org-restore-export.design.md)
> **분석 방법**: gap-detector 에이전트(독립 컨텍스트) + 갭 1건 즉시 보완

## 종합

| Category | Score | Status |
|----------|:-----:|:------:|
| Design Match (FR 충족) | 95% → **100%** (갭 보완 후) | ✅ |
| Architecture (순수함수/레이어) | 100% | ✅ |
| Convention (SSOT 재사용·denylist·파일명) | 100% | ✅ |
| Test Coverage | 80% → **95%** (통합테스트 추가) | ✅ |
| **Overall Match Rate** | **~98%** | ✅ |

## FR별 판정

| FR | 요구사항 | 판정 | 근거 |
|----|----------|:----:|------|
| FR-01 | mode=restore 단일기관 .db | ✅ | route.ts mode 파싱, pfund2-constants Pfund2ExportMode |
| FR-02 | 페어 자동생성 우회(가짜 후보자 없음) | ✅ | organ-pair.ts singleOrgId early-return + organ-pair.test(596 ORG_SEC_CD=90 미생성) + restore-pipeline.test |
| FR-03 | 거래/종속표 선택 org 필터 | ✅ | route targetExportOrgId=restoreOrgId, filterByExportOrgId 전 종속표 적용 |
| FR-04 | reference 4종 풀세트 | ✅ | route reference insert는 mode 무관 항상 풀세트 |
| FR-05 | 보관자료 파일명 | ✅ | pfund2RestoreFilename + pfund2-constants.test |
| FR-06 | backup UI 옵션 + Data폴더 금지 안내 | ✅ | backup/page.tsx restore 옵션·경고 박스 |
| FR-07 | 복구는 ORG_ID 그대로 INSERT → 실제 ID 필요 | ✅ | route restoreOrgId 필수검증, organ-pair makeOrganRow(ORG_ID=singleOrgId) |
| FR-08 | 산출 .db FK orphan 0 | ✅ | selectReferencedCustomers(참조 cust_id) + **restore-pipeline.test(FK orphan 0 검증)** |
| FR-09 | master.db 업로드 → ORG_ID 자동매칭 | ✅ | backup/page.tsx(import-sqlite dryRun→matchProgramOrgId) + organ-match.test 8케이스. (정합노트: UI는 org_name 키만 사용, 드롭다운 보완) |
| FR-10 | 복구 사용법 안내 | ✅ | backup/page.tsx 경고문 |
| FR-11 | A안(복구)만 1차, B안 제외 | ✅ | 의도적 범위(plan Out of Scope·design 11.3 일치) |

## 발견된 갭 및 조치

### 🔴 High (보완 완료)
- **mode=restore FK 무결성 통합테스트 부재** (FR-08, design 8.x)
  - 문제: restore는 `targetExportOrgId`를 기존 1/2에서 **임의 N으로 일반화**한 분기. 해피패스 단위테스트만으론 거짓 안심 위험(메모리: parity-test-must-exercise-divergence-condition).
  - 조치: `restore-pipeline.test.ts` 추가 — **N=3(divergence)** 으로 ORGAN 1행@3, 거래 전부 org_id=3 remap·필터 누락 0, `selectReferencedCustomers` FK orphan 0(공유 cust_id 포함, 미참조 제외) 검증. ✅ 3 테스트 통과.

### 🔵 의도적 차이 (정당, 갭 아님)
- ts 전달: 클라 로컬시간 + 서버 fallback (design 허용 범위)
- FR-09 매칭: dryRun이 USERID 미반환 → org_name 단일키 매칭 + 드롭다운 보완 (design 11.3에 정합 노트 기록)
- FR-11 B안(Data폴더 교체) 제외 (의도)

### 미구현
- 없음 (FR-01~10 구현, FR-11 B안은 범위 외)

## 회귀 안전성

- restore는 `buildOrganExport` singleOrgId early-return(기존 분기 앞) + targetExportOrgId 일반화만 → full/master/data1/data2 경로 불변.
- 검증: 전체 **854 테스트 통과**(restore-pipeline 3 포함), eslint 0, 변경파일 tsc 0.

## 남은 검증 (코드 외)

- **사용자 윈도우 [자료 복구] 실기 검증**: master.db 업로드→ORG_ID 확인→restore 다운로드→해당 기관 로그인 [자료 복구]로 UNIQUE 충돌 없이 적재되는지. (FR-07 도출 최종 게이트 — 코드로는 검증 불가, 실기 필요.)

## 결론

Match Rate **~98%** (≥90% 통과). 유일한 실질 갭(통합테스트)을 보완 완료. 보고/배포 단계 진입 가능. 단, 윈도우 실기 검증은 배포 후 사용자 확인 필요.
