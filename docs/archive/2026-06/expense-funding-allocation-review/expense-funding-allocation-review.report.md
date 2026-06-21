# 지출항목 수입계정(자금원) 배정 방식 점검 및 개선 — 완료 보고서

> **Feature**: expense-funding-allocation-review
> **Period**: 2026-06-20 (Plan/Design) → 2026-06-21 (Do/Check/Report) · **Duration**: 2일
> **Final Match Rate**: **100%** · **Phase**: completed
> **PDCA**: [plan](./expense-funding-allocation-review.plan.md) · [design](./expense-funding-allocation-review.design.md) · [analysis](./expense-funding-allocation-review.analysis.md)

---

## Executive Summary

### 1.1 개요

| 항목 | 내용 |
|------|------|
| Feature | 지출항목 수입계정(자금원) 배정 방식 점검 및 개선 |
| 시작 | 2026-06-20 |
| 완료 | 2026-06-21 |
| 기간 | 2일 |
| Match Rate | 100% (gap-detector 독립 검증) |

### 1.2 결과 요약

| 지표 | 값 |
|------|-----|
| FR 완료 | 5 / 5 (FR-01~05) |
| 코드 변경 | +233 / **−1,063** (순삭 830줄 — 데드코드 대거 제거) |
| 삭제 파일 | 13 (데드 V2 Excel 체인) |
| 신규 모듈 | 2 (`shortfall-surface.ts` + 진단 헬퍼) |
| 신규 문서 | 1 권위 문서 + 선행 Draft 3종 superseded |
| 테스트 | 780 → **795** (+15) |
| 품질 게이트 | vitest 795/795 · eslint clean · tsc 0 |

### 1.3 Value Delivered (4-Perspective)

| Perspective | 내용 | Metric |
|-------------|------|--------|
| **Problem** | 자금원 배정 규칙은 옳으나 ① SSOT 우회 데드 경로(V2 `/api/excel/report`), ② export-sqlite 로컬 자금원 상수 중복(V3), ③ 통장 부족(데이터 오류)이 0/음수로 조용히 묻힘, ④ 신규 소비처가 SSOT를 빠뜨리는 표류 위험이 잔존 | 우회/중복/은폐 4개 결함 |
| **Solution** | 배정 알고리즘은 불변. 데드 경로 **제거**, 자금원 게이트 **SSOT 통합**, 폐기되던 Shortfall 신호 **표면화**, 모든 경로 동일 배분을 **회귀 가드로 강제**, 흩어진 결정을 **단일 권위 문서**로 정리 | 제거 1·통합 1·진단 1·가드 1·문서 1 |
| **Function/UX Effect** | 어느 출력물(page·HWPX·SQLite)에서 뽑아도 동일 자금원 배정. 통장 부족은 빨강 배너/경고 헤더로 즉시 노출(은폐 금지). 신규 출력물은 배정 규칙 자동 상속 | 표류 차단 가드 + 부족 표면화 3소비처 |
| **Core Value** | 정치자금 회계의 **단일 진실원 보장** — 화면마다 수치가 달라지거나 데이터 오류가 묻히는 일을 구조적으로 제거. 공격 표면(데드 라우트)·유지보수 부담(중복 코드) 동시 감소 | 순삭 830줄 + Match 100% |

---

## 2. PDCA 단계별 요약

| Phase | 결과 |
|-------|------|
| **Plan** | V2(데드)/V3(중복)/가정 가시화/표류 가드/문서 통합 5개 FR 도출. "새 규칙이 아니라 옳은 규칙을 전 경로에 강제" |
| **Design** | 데드 경로는 수리 아닌 **제거**, Shortfall은 순수 진단 헬퍼로 재노출, 교차검증 가드, 권위 문서. blast radius 최소(SSOT 시그니처 불변) |
| **Do** | FR-01~05 순차 구현. 헬퍼는 TDD(RED→GREEN→REFACTOR), 가드는 일시 교란으로 포착력 검증 |
| **Check** | gap-detector 독립 검증 → **Match Rate 100%**, 갭 0 / 불일치 0 |
| **Act(+/simplify)** | 품질 정리 4건 적용(공유 표면화 모듈·predicate SSOT·전처리 추출·날짜 헬퍼), 과최적화 5건 근거 기록 후 스킵 |

---

## 3. FR별 산출물

| FR | 산출물 | 핵심 |
|----|--------|------|
| **FR-01** 데드 라우트 제거 | `/api/excel/report` + excel-template 데드 체인 **13파일 삭제** | 전체 의존성 추적으로 살아있는 4모듈 보존 확인, 잔여 importer 0 |
| **FR-02** 게이트 SSOT 통합 | export-sqlite 로컬 `CANDIDATE_ACC_SEC_CDS` 제거 → `isFundingSourceAccSecCd` | TDD RED→GREEN→REFACTOR 동작 보존, TC-5 3건 |
| **FR-03** Shortfall 표면화 | `detectCandidateShortfalls` 헬퍼 + page 배너 + HWPX 2route 경고 | 은폐 금지, 헤더=건수만/상세=서버 로그(§7 보안) |
| **FR-04** 교차검증 가드 | SSOT==export==모델 동일 배분 단언 | 일시 교란으로 드리프트 포착력 검증 후 복원 |
| **FR-05** 권위 문서 | `docs/05-reference/자금원배정방식.md` + 선행 3종 superseded | 결정·SSOT맵·소비처맵 단일화 |

---

## 4. 품질 지표

- **테스트**: 780 → 795 (+15) — FR-03 진단 5, FR-04 가드 3, FR-02 게이트 3, shortfall-surface 계약 4
- **vitest**: 795/795 통과 (65 파일)
- **eslint**: clean · **tsc(변경 파일)**: 0 에러
- **순 코드 감소**: −830줄 (데드코드 제거가 신규 추가를 크게 상회)

---

## 5. 배운 점 / 결정 기록

- **죽은 우회는 수리하지 않고 제거한다** — V2를 SSOT로 교체하는 대신 삭제(데드 증거: 참조 템플릿 파일조차 부재). 공격 표면·유지보수 동시 감소.
- **숨은 가정은 신호로 드러낸다** — "통장≥0" 전제 위반을 0/음수로 묻지 않고 Shortfall 표면화. SSOT 시그니처는 불변, 폐기되던 신호만 재노출(blast radius 최소).
- **표류는 테스트로 구조적 차단** — 보고 시점 계산 방식의 표류 위험("소비처 누락")을 경로 화이트리스트가 아닌 **행위 기반 교차검증**으로 막음.
- **과최적화 경계** — Pass0/1 이중 실행은 데이터 규모·I/O 지배 고려 시 YAGNI로 의식적 보류(근거 기록).

---

## 6. 후속 / 미해결 (의도적 범위 밖)

- **§6 Open Question** — Excel `/api/excel/export`(11컬럼, 재배분 미적용) vs HWPX 22-4(14컬럼, 재배분 적용)의 "수입·지출부" 명칭 공유 수치 차이. 사용자 의사결정 필요(별도).
- **비후보자(후원회/정당/국회의원) 자금원 배정** — 구조 상이, 별도 대형 PDCA.
- **scripts 016/017 사장 코드 DROP** — 018 마이그레이션으로 정리 권고.
- **입력 시점 실시간 가용잔액 UI** (구 balance-guard) — 미구현 보류.

---

## 7. 결론

5개 FR 전부 완료, Match Rate 100%, 전 품질 게이트 통과. 자금원 배정의 단일 진실원이 전 소비처에 강제되고, 데이터 오류는 더 이상 묵음 처리되지 않으며, 흩어진 지식이 단일 권위 문서로 정리됨. 커밋·배포는 사용자 요청 시 진행.
