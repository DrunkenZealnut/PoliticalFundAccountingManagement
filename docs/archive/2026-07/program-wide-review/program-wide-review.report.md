# Report — 전체 프로그램 기능수행과정 리뷰 (program-wide-review)

- 기능: `program-wide-review`
- PDCA 단계: **Completed**
- 기간: 2026-07-03(Plan·Check) → 2026-07-04(Do·Ship)
- 릴리스: v0.32.0.0 (PR #115), v0.32.1.0 (PR #116) — 둘 다 main 머지·프로덕션 배포
- 관련 문서: [플랜](../01-plan/features/program-wide-review.plan.md) · [진단](../03-analysis/program-wide-review.analysis.md)

## Executive Summary

### 1.1 개요

| 항목 | 값 |
|------|----|
| 기능 | program-wide-review (전체 프로그램 리뷰·효율화·기능개선·버그수정) |
| 시작→완료 | 2026-07-03 → 2026-07-04 (2일) |
| 기준→최종 버전 | v0.31.0.0 → **v0.32.1.0** |
| 진단 발견 | **44건** (P1 8 / P2 20 / P3 16) |
| 테스트 | 900 → **945** (+45) |
| 신규 마이그레이션 | `022`~`025` (수동 적용 대기) |
| PR | #115(9개 라우트 보안+버그+효율+스키마), #116(후속) |

### 1.2 진행 경로

`[Plan] ✅ → [Check/진단] ✅ → [Do: B·C·D·스키마·성능·기능·데이터] ✅ → [Ship] ✅ → [Report] ✅`

진단형 사이클이라 Design을 생략하고, 병렬 조사 6개로 44건을 발굴한 뒤(Check 선행) 심각도 순으로 실행(Do)했다.

### 1.3 Value Delivered (4관점 + 지표)

| 관점 | 내용 (지표) |
|------|-------------|
| **Problem** | 기능이 빠르게 쌓이며 부채 누적 — 대부분 API가 service_role로 RLS를 우회하며 인증·소속검증이 없어 **로그인 없이 타 기관 재무데이터·거래처 PII·선관위 자격증명 접근(IDOR)** 가능. 지출 저장 FK 오류·가짜 비번 게이트·감사 덮어쓰기 등 알려진 버그, 무제한 fetch truncation, FR-07 미구현 |
| **Solution** | 플로우 7개 + 횡단 축 4개를 병렬 진단(44건)한 뒤 **보안(B)→버그(C)→효율(D)→스키마→성능→기능(E)→데이터** 순 실행. `requireOrgMembership` 공통 가드 SSOT, 재배분/집계 SSOT 정합, 마이그레이션 023~025 |
| **Function/UX** | 타 기관 데이터 접근 **차단**(9개 라우트), 지출 거래처 미선택 저장 **가능**, 자료초기화 **실제 비번 검증**, 감사 열람 시 결산값 **보존**, 익명 기부 **정상 집계**, 대량 임포트·요약 **속도 개선**, 결산확정 후 수정·주기 외 거래 **경고**, 자료복구 다기관 **안전** |
| **Core Value** | "빨리 쌓은 기능"을 "믿고 제출할 수 있는 시스템"으로 — **P1 8건 전부 + 주요 P2 소진**, 회귀 방어 +45 테스트, 산출물 정합성(화면==Excel==HWPX==.db) 유지, 원본 acc_book 불변 원칙 준수 |

## 2. Plan 대비 실행 결과

플랜 인벤토리 15건 + 진단 신규 29건 = 44건. 처리 현황:

| 분류 | 완료 | 방식 |
|------|------|------|
| **보안(S1~S9)** | ✅ | 9개 service_role 라우트에 `requireOrgMembership` 가드, customers PII 유출 분기 제거, import overwrite 전역삭제 스코프화(S4) |
| **버그(B1·B2·BX1~BX9)** | ✅ | 지출 API 경유(BX1), reset 비번 검증(BX5), audit dryRun(BX6), org-metrics 익명 판정(B2), prefill race(B1), 잠금 우회(BX3), estate 합계 SSOT(BX9), 결산확정 가드(BX7/BX8) |
| **효율(P-1~P-4)** | ✅ | truncation 방지(P-1), batch_insert 일괄화(P-2), 요약 RPC(P-3), N+1 쓰기(P-4) |
| **정합(A2·A3·R1)** | 부분 | A2·A3는 이미 해소(문서 stale였음), R1(HWPX 채번)·개별 Excel은 잔여 |
| **기능(F1/FR-07)** | ✅ | export·backup·결산·reports 주기 외 거래 경고 |
| **데이터(B3)** | ✅ | 익명 중복 정본 통합(실행 완료), 유니크 인덱스(024) |

## 3. 산출물

- **코드**: 공통 가드 `lib/api/require-org-membership.ts`, `acc-period.countOutOfPeriodRows`, `estate-types.sumEstateAmount` SSOT 등. 데드 복제본 2개 삭제.
- **마이그레이션**: `023`(결산확정 플래그+RPC), `024`(익명 유니크), `025`(요약 RPC). — **Supabase 수동 적용 대기**.
- **스크립트**: `diagnose/cleanup-anon-customers.mjs`(실행 완료).
- **테스트**: require-org-membership·acc-book authz+settled+batch·evidence-file 인가·estate-types·org-metrics 익명·acc-period FR-07 (+45).
- **문서**: 진단 보고서(44건 태깅), 플랜, 이 리포트. CLAUDE.md·TODOS 동기화.

## 4. 검증

- 각 Phase: eslint 클린 + `next build` 성공 + vitest green.
- 최종: **80파일 945 테스트 통과**, 빌드 성공.
- 배포: PR #115·#116 Vercel 게이트 통과 후 main 머지, 프로덕션 자동배포.

## 5. 잔여 / 후속

**의도적 보류(가치 낮음/중복)**: HWPX 서식 FR-07(export·reports·결산이 이미 경고), income 일괄삭제 N+1(API 경유), D-5/D-6/X3/X4 정리(순수 정리), R1(HWPX 영수증 채번)·개별 Excel 재배분 parity.

**필수 후속(운영)**: Supabase SQL 에디터에 `023`·`024`·`025` 적용, `022` 적용 여부 확인. 코드는 미적용 상태에서도 안전(폴백/no-op).

## 6. 교훈

- **진단 선행이 유효**: 병렬 조사 6개로 인벤토리 15건이 44건으로 확장 — 특히 IDOR 범위(9라우트)·자격증명 노출은 문서화된 부채보다 실제 범위가 컸다.
- **SSOT 공유가 정합의 근본**: 재배분·estate·영수증·기간검증을 SSOT로 모으니 소비처 정합이 구조적으로 보장됐다.
- **은폐 금지 방침 일관**: 결산확정·주기 외 거래를 차단이 아닌 경고로 표면화해 실무 유연성과 무결성을 모두 확보.
- **프로덕션 데이터 신중**: 익명 정리는 read-only 진단 → dry-run → 사용자 확인 후 --confirm 실행(백업 자동)으로 안전하게 처리.
