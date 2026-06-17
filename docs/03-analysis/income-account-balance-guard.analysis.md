# Gap 분석 (Check) — income-account-balance-guard

> **Date**: 2026-06-17 · **Phase**: Check
> **Design**: [02-design](../02-design/features/income-account-balance-guard.design.md) · **Plan(v0.2)**: [01-plan](../01-plan/features/income-account-balance-guard.plan.md)
> **Agent**: bkit:gap-detector

## Match Rate: 96% → 98% (Check 중 FR-09 보강 반영)

차단 Gap 0건. Report 진행 가능(≥90%).

| Category | Score |
|----------|:-----:|
| Design Match (§2~§5) | 96% |
| FR 충족 (Plan §3.1) | 95% → 100%(FR-09 보강) |
| Convention/SSOT | 100% |
| **Overall** | **~98%** |

## 점검 결과 (설계 spec ↔ 구현)

| # | 관점 | 판정 | 근거 |
|---|------|:----:|------|
| 1 | 타입 (§2) | ✅ | `funding-balance-asof.ts:13-41` 4개 타입 일치 |
| 2 | availableAsOf (§3.1) | ✅ | `:59-73` 시간순 누계·환급 부호보존·excludeAccBookId·as-of 경계 |
| 3 | previewDraft (§3.2) | ✅ | `:80-104` current/projected/willGoNegative/bySource 내림차순 |
| 4 | UI (§4) | ✅ | `FundingDraftPreview.tsx` 미니패널·미리보기·non-blocking 경고(FR-10)·추천 |
| 5 | 통합 (§4.4) | ✅ | expense·document-register 후보자 게이트, allRows 쿼리 확장, org rows 로드 |
| 6 | 테스트 (§5 A1~P5) | ✅ | `funding-balance-asof.test.ts` 12케이스(A1~A5·P1~P5 + 보강 2) |
| 7 | FR 충족 | ✅ | 아래 |
| 8 | cross-entry 한계 | ✅(한계대로) | document-register entry별 독립 preview |

### FR 충족
- FR-01·03·04·05·06·07·08·10: ✅ 충족 (근거 gap-detector 리포트)
- **FR-09 도움말**: Check 중 **보강 완료** — `help-texts.ts`에 `expense.balance-guard` 문구 등록(미등록 시 HelpTooltip은 children만 렌더해 무해했으나, 문구 추가로 FR-09 충족).
- FR-02 드롭다운 인라인 병기: **미니패널로 대체**(설계 §4.1·§8에서 optional/To-Verify로 명시) — 핵심 가치(자금원별 as-of 가용 표시)는 미니패널로 충족.

## §3.1 설계 의도 부합 확인 (atOrBefore vs compareAccDateTime)
설계 §3.1은 `compareAccDateTime(row, asOf) <= 0` 명세였으나 구현은 `atOrBefore`(date/time 직접 비교, `:49-53`). **이것이 설계 §8/§4.1 의도("acc_time 미입력 시 그 날짜 전체 포함")에 부합** — compareAccDateTime을 직접 쓰면 asOfTime=null일 때 같은 날 시각 입력 행이 제외되어 가용 과소계상 버그가 됨. 테스트 A5(`:43-50`)가 이 분기 검증.

## 잔여 (사소·문서)
- 🔵 FR-02: 드롭다운 라벨 인라인 병기는 미채택(미니패널 대체) — design.md에 확정 기록 권장.
- ⚪ design.md §8에 document-register cross-entry 누적 미반영을 한계로 명시 추가 권장(Plan §1.2.1엔 있음).
- (참고) 실제 인증 게이트 페이지 end-to-end는 /verify에서 임시 하니스+실데이터(org 11)로 컴포넌트·로직 런타임 확인, 페이지 폼→props 배선은 정적(tsc/lint) 검증.

## 검증 신호
- 전체 테스트 729 통과(신규 12 포함)·lint 0·변경 파일 tsc 0.
- /verify: org 11 실데이터로 5/22 음수(−78,960→−343,960)·경고·추천 정확, happy path·무거래 자금원 probe 통과.

## 결론
Match Rate ~98%, 차단 Gap 0 → **Report 진행 가능**. 잔여는 문서 보강 2건(선택).
