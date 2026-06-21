# 갭 분석 — expense-funding-allocation-review (Check 단계)

> **Match Rate: 100%** · **Date**: 2026-06-21 · **방식**: gap-detector(Read·Grep 독립 추적) + 전체 게이트 실행
> **기준**: [design](./expense-funding-allocation-review.design.md) · [plan](./expense-funding-allocation-review.plan.md)

---

## 1. 종합 점수

| Category | Score | Status |
|----------|:-----:|:------:|
| Design Match (FR 5건) | 100% | ✅ |
| Architecture Compliance (§9 Domain 순수 / API·Presentation→Domain) | 100% | ✅ |
| Convention Compliance (§10 camelCase·SSOT 상수·테스트 패턴) | 100% | ✅ |
| **Overall** | **100%** | ✅ |

산정: FR 5건 × 20% = 100% (전부 ✅), 갭 0 / 불일치 0 → 감점 없음.

---

## 2. FR별 검증 결과

| FR | 상태 | 근거 (파일:라인 / grep) |
|----|:----:|------|
| **FR-01** 데드 라우트 제거 | ✅ | `api/excel/report/**`·`excel-template/{index,data-query,types,cell-binder,row-binder,template-loader}.ts`·`mappings/**` 전부 삭제(Glob 0); `grep generateReport\|queryReportData\|excel/report\|excel-template/index\|excel-template/types` → **0 matches**; 보존 4파일(burden-cost-form·reimbursement-claim-form·income-expense-book·report-combos) 존재 |
| **FR-02** export-sqlite 게이트 SSOT 통합 | ✅ | 로컬 `CANDIDATE_ACC_SEC_CDS` **완전 제거(0건)**; route.ts `FUNDING_SOURCE_BY_ACC_SEC_CD[Number(r.acc_sec_cd)] !== undefined` 판정; `export function allocateCandidateAccBookForExport`; `candidate-gate.test.ts` 3건 |
| **FR-03** Shortfall 표면화 | ✅ | 헬퍼 `detectCandidateShortfalls`(income-expense-report-summary.ts): Number+Pass0+게이트→`reallocateFundSources(...).shortfalls`(순수·멱등, 설계 §2.2 일치); 3소비처 — page.tsx 배너, accounting-report·income-ledger `console.warn`+`X-Allocation-Shortfall`. §7 보안: 헤더=건수만, 상세=서버 로그만 |
| **FR-04** 교차검증 가드 | ✅ | income-expense-report-summary.test.ts `describe("교차검증 가드 (FR-04…)")` — SSOT==export 셀 동일 + 모델 정합 + degenerate 방지 + 합 보존 |
| **FR-05** 권위 문서 | ✅ | `docs/05-reference/자금원배정방식.md` 신설(SSOT 진입점·소비처 맵·결정 기록); 선행 Draft 3종 상단 `⚠️ SUPERSEDED (2026-06-21)` 배너 + 흡수표 |

---

## 3. Test Plan §8.2 (TC-1~6) 커버리지

| TC | 의도 | 실제 테스트 | 커버 |
|----|------|------------|:----:|
| TC-1 | 정상 → shortfalls `[]` | summary.test.ts "정상…(TC-1)" | ✅ |
| TC-2 | 통장 부족 → 비어있지않음+shortAmt>0 | "통장 전체 부족…(TC-2)" (합 20,000·잔류 82) | ✅ |
| TC-3 | 비후보자 → `[]` | "비후보자…(TC-3)" | ✅ |
| TC-4 | 세 경로 동일 배분 | FR-04 describe (SSOT==export==모델) | ✅ |
| TC-5 | V3 게이트 후보자분할/후원회무변경 | candidate-gate.test.ts 3건 | ✅ |
| TC-6 | report 제거 후 잔여 importer 0 | grep 가드(0 확인) | ✅ |

**추가 강건성(설계 초과)**: 빈 입력 경계·멱등성·82~85 각 코드 게이트·degenerate 무분할 방지.

---

## 4. 품질 게이트 (전체 실행 — 2026-06-21)

| 게이트 | 결과 |
|--------|------|
| `vitest run` 전체 | ✅ **791 passed** (64 파일) |
| `eslint` (변경 7파일) | ✅ clean |
| `tsc --noEmit` (변경 파일) | ✅ 0 에러 |

---

## 5. 갭 / 불일치

**없음.** 설계의 신설·수정·삭제 항목이 전부 코드에 반영됐고, 구현이 설계와 다른 점 없음. 구현 주석이 §7 보안 결정을 명문화하여 의도-구현 일치가 자기문서화됨.

## 6. 잔여 (설계가 의도적으로 범위 밖 처리)

- **§6 Open Question** — Excel `/api/excel/export`(11컬럼, 재배분 미적용) vs HWPX 22-4(14컬럼, 재배분 적용)의 "수입·지출부" 명칭 공유 수치 차이. 설계 명시적 out-of-scope → 별도 의사결정. **갭 아님.**
- 비후보자 자금원 배정·영구화 재도입·새 배정 규칙 — Out of Scope(plan §2.2).

---

## 7. 결론

Match Rate **100% (≥ 90%)** → Act(iterate) 불필요. **`/pdca report expense-funding-allocation-review`** 로 완료 보고 진행 가능.
