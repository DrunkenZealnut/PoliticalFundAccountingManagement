# 수입·지출 거래 시각(분 단위) 입력 (acc-time-input) 완료 보고서

> **Project**: PoliticalFundAccountingManagement
> **Branch**: `feat/acc-time-input`
> **Date**: 2026-06-09
> **Status**: Completed (Match Rate 100%)
> **PDCA**: Plan → Design → Do → Check(100%) → Report

---

## Executive Summary

| 항목 | 내용 |
|---|---|
| Feature | acc-time-input |
| 기간 | 2026-06-09 (1세션) |
| Match Rate | **100%** (96% → 갭 1건 해소) |
| 변경 | 수정 5파일(+48/-5) · 신규 3파일(마이그레이션·헬퍼·테스트) |
| 테스트 | 558 통과(헬퍼 10 신규) · lint 0 · build 성공 |
| Iteration | 1 (삭제 backup acc_time 누락 해소) |

### 1.3 Value Delivered (4-Perspective)

| Perspective | 내용 | Metric |
|---|---|---|
| **Problem** | `acc_date CHAR(8)`(YYYYMMDD)는 날짜 단위만 기록 → 같은 날 다건의 거래 시각·순서·감사 추적 불가 | 시각 정밀도 0 → 분(分) |
| **Solution** | `acc_date` 불변 + `acc_time CHAR(4)`(HHmm, NULL) 별도 컬럼. 변환 헬퍼 단일화, 입력폼 3곳에 선택 시각 필드 | 신규 컬럼 1 · 헬퍼 2함수 · 입력폼 3 |
| **Function/UX Effect** | 날짜(필수)+시각(선택) 입력, 미입력 시 기존과 동일. 같은 날짜 내 `acc_date→acc_time→acc_sort_num` 시각순 정렬. 목록·Excel·export 무변경 | 회귀 0건 |
| **Core Value** | **선관위 PFund2/SQLite(ACC_DATE CHAR(8)) 호환을 깨지 않고** 거래 시각 차원 추가. additive·nullable로 롤백 안전 | 호환성 100% 유지 |

---

## 2. 구현 내역

| 파일 | 변경 | 종류 |
|---|---|---|
| `app/scripts/014_add_acc_time.sql` | acc_book·acc_book_bak에 `acc_time CHAR(4)` NULL + 롤백 SQL | 신규 |
| `app/src/lib/date-utils.ts` | `fmtTimeInput`(HHmm→HH:mm)·`toAccTime`(HH:mm→HHmm/null) | 신규 |
| `app/src/lib/date-utils.test.ts` | 헬퍼 테스트 10(경계·null·이상값·round-trip) | 신규 |
| `app/src/types/database.ts` | acc_book·acc_book_bak Row에 `acc_time: string \| null` | 수정 |
| `income/page.tsx` | AccBook타입·state·resetForm·selectRecord(fmtTimeInput)·payload(toAccTime)·backup(수정+삭제 2)·수입시각 입력 | 수정 |
| `expense/page.tsx` | 동일 + backup(수정+삭제 2)·지출시각 입력 | 수정 |
| `document-register/page.tsx` | ParsedEntry·초기값·payload·시각 입력 | 수정 |
| `api/acc-book/route.ts` | 정렬 `acc_date→acc_time(nullsFirst)→acc_sort_num` | 수정 |

---

## 3. PDCA 진행 요약

| Phase | 결과 |
|---|---|
| Plan | 설계 결정 3건 확정(별도 컬럼·수입지출 모두·선택 입력) — AskUserQuestion |
| Design | date+time 분리 UI, 변환 헬퍼 위치, 정렬 nullsFirst, 영향 파일 매핑 |
| Do | TDD(헬퍼 먼저) → 입력폼 3곳 → API 정렬. 빌드 중 로컬 AccBook 타입·resetForm 누락 발견·수정 |
| Check | gap-detector 96% → 삭제 backup 4곳 acc_time 누락(Minor) 해소 → **100%** |
| Report | 본 문서 |

---

## 4. 핵심 학습 / 주의점

1. **로컬 타입 이중 정의**: `income/expense`는 `types/database.ts`와 별개로 페이지 내 `interface AccBook`을 둠 → 컬럼 추가 시 양쪽 모두 갱신 필요(빌드가 검출).
2. **setForm 호출 다중 지점**: state init 외에 `resetForm`·`selectRecord`·`backup`까지 폼 필드를 나열하는 지점이 많아, 새 필드는 모든 setForm·payload·backup 경로에서 누락 점검 필요(삭제 backup이 마지막에 발견됨).
3. **별도 컬럼 전략의 가치**: `acc_date`를 건드리지 않아 선관위 export·목록·Excel·정렬 로직 회귀 0건. 호환성 제약(PFund2 시각 미보존)은 의도적 결정으로 문서화.

---

## 5. 잔여 / 후속 작업

| 항목 | 상태 |
|---|---|
| `scripts/014_add_acc_time.sql` Supabase 수동 적용 | ⏳ 배포 전 필수 |
| 실데이터 수동 QA(입력→저장→재편집→정렬) | ⏳ 권장 |
| PFund2 round-trip 시각 손실 | 알려진 제약(문서화 완료) |
| PR 생성 / 배포 | ⏳ `/ship` |

---

## 6. 검증 로그

- `vitest run`: **558 passed** (43 files, date-utils 10 신규 포함)
- `eslint`: 0 errors
- `next build`: ✓ Compiled + TypeScript 통과 (51 routes)
