# acc-time-input 갭 분석 (PDCA Check)

> **Design**: `docs/02-design/features/acc-time-input.design.md`
> **Date**: 2026-06-09
> **Branch**: `feat/acc-time-input`
> **Analyzer**: gap-detector + 후속 수정

---

## 결과 요약

| 항목 | 값 |
|---|---|
| 초기 Match Rate | 96% (gap-detector) |
| 수정 후 Match Rate | **100%** |
| Critical / Major | 0 / 0 |
| Minor | 1건 (해소 완료) |
| 검증 | vitest 558 통과 · eslint 0 · next build 성공 |

---

## FR별 충족 여부 (수정 후)

| FR | 요구사항 | 상태 | 근거 |
|---|---|:---:|---|
| FR-01 | acc_book `acc_time CHAR(4)` NULL | ✅ | `scripts/014_add_acc_time.sql` (acc_book + acc_book_bak) |
| FR-02 | 수입폼 시각 입력 + round-trip | ✅ | income: state·reset·selectRecord(fmtTimeInput)·payload(toAccTime)·입력필드 |
| FR-03 | 지출폼 시각 입력 + round-trip | ✅ | expense: 동일 |
| FR-04 | 수기입력 시각 입력 | ✅ | document-register: ParsedEntry·초기값·payload·입력필드 |
| FR-05 | 목록 날짜만 표시(무변경) | ✅ | 목록 렌더에 acc_time 미노출, `formatDate(r.acc_date)` 그대로 |
| FR-06 | 정렬 acc_date→acc_time(nullsFirst)→acc_sort_num | ✅ | `api/acc-book/route.ts` |
| FR-07 | 미입력 NULL, 기존 데이터 정상 | ✅ | `toAccTime` 빈값→null, `fmtTimeInput` null→"" |
| FR-08 | acc_book_bak 동기 + backup payload(수정·삭제) | ✅ | 수정 backup + **삭제 backup 4곳** acc_time 추가 완료 |

---

## 발견·해소한 Gap

### 🔵 Minor — 삭제 backup 경로 acc_time 누락 → 해소

- **현상**: 수정 backup(work_kind:1)은 `acc_time`을 보존했으나, 삭제 backup(work_kind:2) 4경로(income 단건·일괄, expense 단건·일괄)에 누락 → 삭제 행 복구(undo) 시 시각 유실 + 수정/삭제 백업 간 불일치.
- **조치**: 4곳에 `acc_time: selected.acc_time` / `acc_time: r.acc_time` 추가.
  - `income/page.tsx` 단건/일괄 삭제 backup
  - `expense/page.tsx` 단건/일괄 삭제 backup
- **검증**: build·lint·test 재통과.

### 설계 명세 외 정합 관찰 (Gap 아님)

- `fmtTimeInput`이 Design 스니펫의 `padStart` 대신 `trim()`+`/^\d{4}$/` 방어 방식 채택 → Design §7.1·§9 "비정상값 방어적 빈문자열" 권고에 부합하는 의도적 개선(테스트로 검증).
- API insert/update/batch는 payload 통과 방식이라 코드 변경 없음(Design §5.2 일치).

---

## 잔여 / 후속

- **DB 마이그레이션 미적용**: `scripts/014_add_acc_time.sql`을 Supabase SQL 에디터에서 수동 실행해야 실데이터 동작. (배포 전 필수)
- **PFund2 round-trip 시각 손실**: 알려진 제약(Design §9). 선관위 호환 우선 결정으로 문서화됨.
- 실데이터 수동 QA(입력→저장→재편집→정렬) 권장.

**판정**: Match Rate 100% → `/pdca report acc-time-input` 진행 가능.
