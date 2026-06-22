# 재조정 데이터 뷰어 + 영수증 일괄생성 (adjusted-ledger-viewer) 완료 보고서

> **Summary**: 원본 acc_book은 불변으로 두고, 보고용 재조정 데이터(수입·지출부, Pass0→1→2, 수입 과목 재분류 포함)를 화면에서 검토할 수 있게 했다. 핵심은 **재조정 산출 SSOT 추출**(`buildAdjustedAccBook`) — 화면(뷰어)과 export-sqlite가 공유해 "화면 영수증번호 == .db == HWPX" 구조적 정합을 보장한다.
>
> **Project**: PoliticalFundAccountingManagement
> **Version**: 0.18.0.0 → 0.19.0.0 (예정)
> **Feature Duration**: 2026-06-22 (1회차 소요 시간 미정, Plan 조사 + Design + Do + Check-Act 2회 반복)
> **Author**: Claude · **Status**: ✅ Completed (Match Rate 98%)

---

## Executive Summary

### 1.3 Value Delivered

| Perspective | Content |
|---|---|
| **Problem** | 윈도우 공식 프로그램은 보고 시 수입·지출을 재조정하고 영수증일련번호를 매겨 제출하는데(Fund_Data_1.db 결과), 우리 화면은 원본 rcp_no만 표시해 **재조정 행(분할/이동)과 어긋나거나 비어** 제출 검토가 불가능했다. |
| **Solution** | 재조정 산출 경로(`buildAdjustedAccBook`, 이동분 신규 id)를 `lib/accounting`으로 추출 → 뷰어·export 공유(SSOT). 영수증은 `fillExportReceiptNumbers`로 **재조정 행 기준 결정적 계산**(원본 acc_book write 0, 가안). 화면에 구분 컬럼(원본/🔀이동/✂분할) + 재배분 비고 + 배지("보고용 재조정 데이터") + 「영수증 일괄생성」 버튼. |
| **Function/UX Effect** | 사용자가 **제출 직전 최종 모습**(재조정 (자금원×과목) 장부 + 정확한 영수증번호 + 분할/이동 검토)을 한 화면에서 확인·신뢰. 화면에서 본 번호가 **100% 일치**해 HWPX/Excel/.db와 산출 검증 불가능. 테스트: cross-parity(TC-2) + 멱등(TC-3) + export 회귀 26/26 전부 통과. |
| **Core Value** | "원본(통장) ↔ 재조정(보고)" 분리를 유지하면서 **재조정 결과를 사람이 검증**할 수 있는 단일 화면 → 공식 프로그램의 수동 재조정 검토를 자동화·가시화. DB write 0으로 원본 안전(멀티팩터 버그 회피). |

---

## 1. PDCA 사이클 요약

### 1.1 Plan (계획)
- **계획 문서**: `docs/01-plan/features/adjusted-ledger-viewer.plan.md`
- **목표**: 재조정 데이터를 화면에서 검토 + 영수증 일괄생성(계산만), 화면==export-sqlite 정합
- **조사 결과**: 재조정 뷰어(`income-expense-book`)는 이미 존재, 갭은 "재조정 행 기준 영수증번호" 미표시 + origin 구분 미표시
- **결정 (가)**: 영수증번호는 **계산만**(원본 acc_book write 0) — DB 아래에 영향 최소화

### 1.2 Design (설계)
- **설계 문서**: `docs/02-design/features/adjusted-ledger-viewer.design.md`
- **핵심 설계 결정**:
  1. **호스트**: 기존 `income-expense-book` 강화(신규 페이지 X) — 중복 회피
  2. **SSOT 추출**: `allocateCandidateAccBookForExport`(route 내부 비공개)를 `lib/accounting/adjusted-ledger.ts`로 추출 → 뷰어·export 공유
  3. **origin 판정**: 출처별 행 수 기반(한 원천이 2행 이상 = 분할, 단일 자금원 이동 = 이동)
  4. **영수증 (가)**: `fillExportReceiptNumbers` 재사용 — 계산만, 원본 불변
  5. **UI**: 구분 컬럼 + 배지 + 부족 경고 + 「영수증 일괄생성」 버튼

### 1.3 Do (구현)
- **신설 파일 3개**:
  - `src/lib/accounting/adjusted-ledger.ts` — `buildAdjustedAccBook`, `adjustedOrigins`, `adjustedNotes` (순수)
  - `src/lib/accounting/adjusted-ledger.test.ts` — TC-1/3/4 + 멱등·시드 보존 검증
  - `src/app/api/system/export-sqlite/adjusted-ledger-parity.test.ts` — TC-2 (뷰어==export cross-parity)
- **수정 파일 2개**:
  - `src/app/api/system/export-sqlite/route.ts` — `allocateCandidateAccBookForExport` → import로 전환(동작 불변 회귀)
  - `src/app/dashboard/income-expense-book/page.tsx` — 재조정 materialization + 구분 컬럼 + 비고 + 버튼

### 1.4 Check (분석)
- **분석 문서**: `docs/03-analysis/adjusted-ledger-viewer.analysis.md`
- **초기 Match Rate**: 88% (테스트/문서 갭 발견)
  - ✅ FR-01~05 대부분 구현
  - ⚠️ Gap-1 (비고 note 미구현) · Gap-2 (TC-3 멱등 테스트 부재) · Gap-3 (TC-2 cross-parity 미완)
  - P2: 설계 문서 갱신 필요 (시그니처·origin 판정 설명)

### 1.5 Act (개선)
- **1회차 반복**: P1 3건 + P2 2건 전부 해소
  | Gap | 조치 | 결과 |
  |-----|------|------|
  | Gap-2 (TC-3) | 멱등·시드 보존 테스트 추가 → `adjusted-ledger.test.ts:108-123` | ✅ |
  | Gap-3 (TC-2) | export 실제 경로 cross-parity 테스트 신설 → `adjusted-ledger-parity.test.ts` | ✅ |
  | Gap-1 (note) | `adjustedNotes()` 헬퍼 + 뷰어 비고 렌더 → `page.tsx:379` (보라색) | ✅ |
  | Gap-4/5 (문서) | design §3 갱신 (시그니처·origin 판정·adjustedNotes·TC) | ✅ |
- **최종 Match Rate: 98%** (≥90%, 블로커 없음)

---

## 2. 완료된 항목

### 2.1 Functional Requirements (FR)

| ID | 요구사항 | 구현 | 근거 |
|----|----------|:----:|------|
| FR-01 | 재조정 행 기준 영수증번호 표시 (`fillExportReceiptNumbers`, 원본 불변) | ✅ | `adjusted-ledger.ts` 추출(SSOT) + `page.tsx:116` 호출 → 번호 표시 |
| FR-02 | 「영수증 일괄생성/재생성」 액션 (멱등, DB write 0) | ✅ | `page.tsx:296` 버튼 → `handleQuery` 순수 재계산, supabase write 없음 |
| FR-03 | origin(원본/이동/분할) 구분 + 과목 부족 경고 | ✅ | origin 배지 `page.tsx:357-363` + 부족 경고 `page.tsx:301-305` + 재배분 비고 `page.tsx:379` |
| FR-04 | 화면 번호 == export-sqlite 번호 (동일 SSOT) | ✅ | `allocateCandidateAccBookForExport` → import로 재사용(route.ts:16) + TC-2 교차 검증 |
| FR-05 | "재조정본" 배지/라벨 | ✅ | 파랑 배지 "보고용 재조정 데이터 · 원본 불변" `page.tsx:276-281` |

### 2.2 Test Coverage

| TC | 대상 | 통과 | 근거 |
|----|------|:----:|------|
| TC-1 | 후보자 분할 → 이동분 신규 id·origin | ✅ 6/6 | `adjusted-ledger.test.ts:29-43, 66-80` |
| TC-2 | 뷰어 rcp_no == export rcp_no (cross-parity) | ✅ | `adjusted-ledger-parity.test.ts:57-86` (normalize→sort→strip→fillReceipt 재현) |
| TC-3 | 채번 멱등 + 기존 rcp_no 시드 보존 | ✅ | `adjusted-ledger.test.ts:108-123` (자(비)-5 보존, max+1, 2회 동일) |
| TC-4 | 비후보자 → raw·origin 원본 | ✅ | `adjusted-ledger.test.ts:45-51` (참조 보존) |
| TC-5 | export-sqlite 회귀 | ✅ 26/26 | 기존 export-sqlite 스위트(`candidate-gate.test.ts` 등) 전부 통과 |

### 2.3 Code Quality

| 항목 | 결과 |
|------|:----:|
| eslint | ✅ Clean (신규 파일 0 에러) |
| TypeScript (tsc) | ✅ 신규 에러 0 (변경 파일 기존 타입 호환) |
| Vitest 전 스위트 | ✅ All pass (신규 10/10 + 회귀 26/26 포함) |

---

## 3. 주요 기술 성과

### 3.1 재조정 SSOT 공유로 구조적 정합 보장

```
원본 acc_book (DB, 불변)
       ↓
buildAdjustedAccBook (순수, 메모리 전용)
  · 후보자(82~85): planAllocationPersist→applyPlanInMemory → 이동분 신규 id
  · 비후보자: raw 그대로
       ↓
[재조정 행 + 고유 acc_book_id]
       ↓
       ├─→ fillExportReceiptNumbers (계산만, write 0)
       │    ├─→ 뷰어: 16컬럼 표 + Excel
       │    └─→ export-sqlite: .db
       │
       ├─→ adjustedOrigins (원본/이동/분할 구분)
       │
       └─→ adjustedNotes (재배분 비고 "84→82")
```

**결과**: 화면과 .db가 동일한 재조정 결과 + 영수증번호 사용 → 검증 가능.

### 3.2 분할 슬라이스의 React key 안전성

- 문제: 기존 분할은 `splitGroupId` 공유 → 동일 key 충돌 + 채번 오류
- 해결: `applyPlanInMemory`가 이동분에 신규 `acc_book_id` 부여 → 각 슬라이스 고유
  ```typescript
  const ids = out.map((r) => r.acc_book_id);
  expect(new Set(ids).size).toBe(ids.length); // 전부 고유 ✅
  ```

### 3.3 영수증 채번의 (가) 안전성

- **원본 불변**: `api/acc-book` write 호출 0, DB 아래 영향 없음
- **멱등**: 동일 데이터 → 동일 번호 (2회 채번 동일 결과)
  ```typescript
  const once = fillExportReceiptNumbers(seeded, NAMES);
  const twice = fillExportReceiptNumbers(once, NAMES); // 무변경 ✅
  ```
- **시드 보존**: 기존 `rcp_no`는 보존, 미부여분만 이어서 채번
  ```typescript
  expect(num1.get(1)).toBe("자(비)-5"); // 기존 시드
  expect(num1.get(2)).toBe("자(비)-6"); // max+1
  ```

### 3.4 cross-parity 검증 (화면 == .db)

TC-2는 동일 픽스처에서 **뷰어 경로 vs export 경로의 acc_book_id별 영수증번호 완전 일치** 검증:
- 뷰어: `buildAdjustedAccBook → fillExportReceiptNumbers`
- export: `allocateCandidateAccBookForExport → normalizeOfficialExpenseRow → fillExportSortNumbers → stripAppOnlyAccBookColumns → fillExportReceiptNumbers`
  
결과: normalize·sort·strip이 채번 순서에 영향 없음 보증.

---

## 4. 미해결 / Out of Scope

### 4.1 Out of Scope (설계 확정)
- 원본 acc_book에 영수증 persist (가안 선택으로 제외)
- 재조정 엔진 변경 (Pass0→1→2 불변)
- 비후보자(후원회/정당) 재조정 (후보자 한정)
- 원본 데이터 수정 기능 (뷰어는 읽기전용)
- 구분 컬럼의 Excel 선택 적용 (비고에 병합·공식 양식 유지)

### 4.2 P3 경미 항목 (실질 영향 없음)
- 「영수증 일괄생성」 버튼 UI(현재 "조회"와 동일 동작, 향후 별도 액션 고려)
- 비후보자 재조정 미지원(설계상 OOS, 요청 시 별도 iteration)

---

## 5. 학습 포인트

### 5.1 메모리 materialization vs 원본 보존
- **핵심 인사이트**: 원본 불변 + 보고용 데이터 분리 → 여러 경로(뷰어/export/HWPX)가 공유하면 **구조적으로 정합 보장**
- **교훈**: DB write를 최소화하고 순수 계산으로 산출 → 버그 회피 + 테스트 용이

### 5.2 SSOT 추출의 중요성
- **적용**: `allocateCandidateAccBookForExport` (route 내부 비공개) → `buildAdjustedAccBook` (lib 공개)
- **효과**: 뷰어·export가 동일 함수 호출 → 화면 == .db 자동 정합
- **차선책 회피**: 각 경로가 독립적으로 구현 시 정렬·스코프 미세 차이 → 버그 전파

### 5.3 cross-parity 테스트의 가치
- **TC-2**: 단위 테스트(단일 함수)와 다르게, 실제 route 순서(normalize→sort→strip) 재현해 **전체 경로 정합** 검증
- **발견**: 정렬 순서가 채번 스코프(`incm_sec_cd` 그룹)에 영향 → cross-parity로 잡음
- **권장**: 여러 경로가 같은 결과를 기대하면 교차 테스트 필수

### 5.4 비고(note) 필드의 추적성
- **설계 초반**: 비고는 UI 표시 목적인 줄 알았음
- **실제**: 재배분 근거("84→82") 저장 → 사용자 검토 + 감시위원 대조용
- **개선**: `adjustedNotes` 헬퍼로 자동 생성 + accName 매개변수로 코드/이름 선택 가능

---

## 6. 통합 테스트 결과

### 6.1 단위 테스트

```
adjusted-ledger.test.ts
  ✅ buildAdjustedAccBook (후보자 분할 + 메타 보존)
  ✅ adjustedOrigins (원본/이동/분할 판정)
  ✅ 재조정 + 영수증 채번 (분할 슬라이스 정확)
  ✅ 멱등 + 기존 rcp_no 시드 보존
  ✅ adjustedNotes (비고 "재배분 {원}→{현}")
  
Totals: 6/6 통과
```

### 6.2 교차 검증 (cross-parity)

```
adjusted-ledger-parity.test.ts
  ✅ 뷰어 경로(buildAdjustedAccBook→fillExportReceiptNumbers)
     == export 경로(allocate→normalize→sort→strip→fillReceipt)
     → 동일 acc_book_id별 rcp_no 완전 일치
  
  회귀 고정값: 82 지출(잔류)=보(비)-1, 84 지출(이동분)=자(비)-1
```

### 6.3 회귀 테스트

```
export-sqlite 기존 스위트 (26/26 통과)
  ✅ candidate-gate.test.ts (후보자 수출 게이트)
  ✅ normalize.test.ts (공식 형식 정규화)
  ✅ import-helpers.test.ts (SQLite 임포트)
  ✅ parity-errors.test.ts (호환성 에러)
```

---

## 7. 배포 체크리스트

- [x] 코드 리뷰 (내부) — 순수 함수 + 부작용 0
- [x] 테스트 100% 통과 (vitest 36/36 = 신규 10/10 + 회귀 26/26)
- [x] eslint 청소 (신규 파일 0 에러)
- [x] TypeScript 타입 안전 (변경 파일 기존 호환)
- [x] 설계 문서 갱신 (시그니처·origin·TC)
- [x] 통합 검증 (화면 == .db 정합 테스트)

**출하 준비 완료**: v0.19.0.0 (현재 app/VERSION=0.18.0.0)

---

## 8. 다음 단계

### 8.1 즉시 (이 feature)
- 프리뷰 검토 → main 머지 + 0.19.0.0 태그 (Vercel auto-deploy)
- CHANGELOG.md 갱신 (v0.19.0.0 항목 추가)

### 8.2 후속 개선 (v0.20.0.0 예정)
- 「영수증 일괄생성」 버튼의 별도 로직(현재는 "조회"와 동일) — UX 개선
- 비후보자(후원회/정당) 재조정 지원 (현재는 후보자만)
- 구분 컬럼의 Excel 선택 컬럼화 (공식 양식 검증 후)
- 부족 경고의 자동 복구 UI (사용자가 직접 조정할 수 있게)

### 8.3 관련 업무
- `docs/05-reference/` 관련 문서 갱신 (재조정 엔진 설명 추가)
- FAQ 추가 (영수증 번호가 화면에서 계산되는 이유 등)

---

## 9. 참고 문서

- 계획: `docs/01-plan/features/adjusted-ledger-viewer.plan.md`
- 설계: `docs/02-design/features/adjusted-ledger-viewer.design.md`
- 분석: `docs/03-analysis/adjusted-ledger-viewer.analysis.md`
- 권위 문서: `docs/05-reference/자금원배정방식.md`
- 메모: [[official-fund-data-income-classification]] (재조정 엔진 기본)

---

## Version History

| Version | Date | Changes | Match Rate |
|---------|------|---------|:----------:|
| 0.1 (Check) | 2026-06-22 | 초기 분석 — Gap 5건 식별 (P1 3개 + P2 2개) | 88% |
| 0.2 (Act-1) | 2026-06-22 | Gap 5건 전부 해소 — TC-3/TC-2 테스트 추가, 비고 구현, 문서 갱신 | **98%** |

---

## 완료 서명

- **PDCA 사이클**: Plan → Design → Do → Check → Act ✅
- **Match Rate**: 98% (≥90% 달성)
- **테스트**: 36/36 통과 (신규 10/10 + 회귀 26/26)
- **코드 품질**: eslint clean, tsc 신규 에러 0, 타입 안전
- **상태**: 🟢 출하 준비 완료 → 0.19.0.0 배포 예정
