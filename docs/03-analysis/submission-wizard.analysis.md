# Gap 분석 — 제출 산출물 마법사 (submission-wizard)

- 기능: `submission-wizard`
- 단계: Check (Gap Analysis)
- 분석일: 2026-07-07
- 설계: [Design](../02-design/features/submission-wizard.design.md) · [Plan](../01-plan/features/submission-wizard.plan.md)
- **Match Rate: 96% → 98%** (G1·G2 medium 2건 해소 반영, high 0 · medium 0 · low 4[G3 의도됨·G4~G6 선택])

## 1. 요약

설계 의도(오케스트레이션 전용 · 생성 SSOT 100% 재사용 · 은폐 금지 · 확정 OQ 5건)를 구현이 충실히 반영했다. 핵심 조항(생성 로직 신규 0, §3 판정표 9체크 1:1, OQ-4 옛 주기 생성 차단, OQ-5 배너 전용 진입, FormInputPanel·reports 동작 불변, jszip 선언)은 전부 충족. 감점은 방어 보강(데이터 로드 취소 가드, 미리보기↔Excel 교차-parity 테스트)과 low 개선 항목에서만 발생.

## 2. 조항별 매칭 표

| 설계 조항 | 구현 위치 | 판정 | 비고 |
|-----------|-----------|:----:|------|
| §0.1 생성 로직 신규 0 | `submission-readiness.ts` | ✅ | SSOT 4종 조합만, 신규 수치 계산 없음 |
| §0.2 정직한 "모두" | `wizard-forms.ts`·`TrackSelectStep`·`GenerateStep`·`PreviewStep` | ✅ | dataFill 로 "데이터 자동 채움/빈 양식" 구분 표시 |
| §0.3 은폐 금지 | `submission-readiness.ts` finalize | ✅ | block=거래0·기간미설정·보전0만, 나머지 warn |
| §1 아키텍처·파일 배치 | 전 파일 | ✅ | 설계 트리 1:1 |
| §1.1/§1.2 데이터 흐름·로드 경로 | `submission-wizard/page.tsx:53-95` | ✅ | acc-book+estate+organ+codevalue 병렬 로드 |
| §2.1 셸(진행바·OQ-4 차단) | `page.tsx` | ⚠️ | OQ-4 unlock 무관 차단 ✅. 단 서식43 payload 상태는 GenerateStep 로컬(G4) |
| §2.2 ReadinessStep 표시/판정 분리 | `ReadinessStep.tsx` | ✅ | 판정은 순수함수, 컴포넌트는 표시만 |
| §2.3 PreviewStep SSOT 수치 | `PreviewStep.tsx` | ✅ | settlement-summary·aggregator, 과목명 분류 |
| §2.4 GenerateStep zip | `GenerateStep.tsx` | ✅ | JSZip 동적 import·부분 성공·진행표시·서식43 폼 |
| §2.5 배너(OQ-5) | `SubmissionWizardBanner.tsx` | ⚠️ | candidate 분기·옛 주기 비활성 ✅. 두 버튼 동일 href(G5) |
| §3 판정표 9체크 | `submission-readiness.ts` | ✅ | id·level·fixHref·비후보자 분기·claim-total 조건부 생성 1:1 |
| §4 파일 변경 목록 | 전 파일 | ✅ | 신규 9 + 리팩터 + 소폭 전부 반영 |
| §6 테스트 계획 | 33 tests (readiness 15·forms 7·generate 11) | ⚠️ | 판정표 경계·서식집합·엔드포인트 커버. 교차-parity 테스트 부재(G2) |
| §7 jszip·동작 불변 2종 | `package.json`·`FormInputPanel`·`reports/page` | ✅ | 엔드포인트·payload·검증·에러처리 보존, workbook 구성 불변 |

## 3. Gap 목록

### 🟡 G1 — 마법사 데이터 로드 레이스 (medium) — ✅ 해소(2026-07-07)
`loadData`에 취소 가드가 없어 org 전환/빠른 재선택 시 이전 org의 in-flight 응답이 늦게 resolve 하면 `setData`로 덮어쓸 수 있었다.
→ **조치 완료**: `loadSeqRef` 시퀀스 토큰 도입 — 호출마다 증가, org 전환 effect 에서도 증가시켜 stale 응답의 `setData`/`setLoadError`/`setLoading` 을 전부 폐기(`submission-wizard/page.tsx`).

### 🟡 G2 — 미리보기↔생성 Excel 교차-parity 테스트 부재 (medium) — ✅ 해소(2026-07-07)
Preview 는 `buildSettlementSummary`, Excel 총괄표는 `buildReportLedgerRecords`+`aggregateSummaryByAccount` — 같은 `buildLedgerRows` 코어의 다른 진입점인데 직접 대조 테스트가 없었다.
→ **조치 완료**: `submission-wizard-parity.test.ts` 3건 추가 — 재배분 발동 픽스처(84 부족→이동, Pass0 음수수입, 환급 음수지출; 해피패스 방지 가드 단언 포함)로 계정별 수입/지출 합·총계·잔액 불변을 두 진입점에서 교차 단언.

### 🔵 G3 — 마법사 Excel 레코드 범위 (low)
reports 는 사용자 기간 필터, 마법사는 org 전건. 연도분리상 org=주기라 정상 데이터는 동일하며, 주기 외 거래는 readiness warn 으로 표면화(은폐 금지 부합). → 의도된 동작으로 유지, 설계 문서에 명시.

### 🔵 G4 — 서식43 payload 상태 소재 (low)
설계는 셸 상태, 구현은 GenerateStep 로컬. 기능 동일. → 설계 문구 정정으로 해소.

### 🔵 G5 — 배너 두 버튼 동일 진입 (low)
보전 버튼도 트랙 선택 화면부터 시작. → `?track=reimburse` 쿼리 선점 진입 고려(초보자 동선).

### 🔵 G6 — readiness 이중 캐스팅 (low)
`as unknown as` 2곳 — `WizardAccRow`가 필드 상위집합이라 런타임 안전하나 컴파일 검증 우회. → extends 선언 또는 명시 매핑.

## 4. Match Rate 산정

아래 표는 G1·G2 해소 **전** 최초 산정값(96.1%)이다. G1(medium)·G2(medium)는 위 §3에서 해소 완료로 표시했으므로 하위 항목은 low 4건(G3·G4·G5·G6)만 해당한다.

| 그룹 | 가중 | 평균 충족 | 기여 |
|------|:----:|:--------:|:----:|
| 핵심 10조항(§0 원칙·판정표·FR-5·OQ-4/5·동작불변 2종·jszip) | ×3 | 0.98 | 29.4/30 |
| 중간 4조항(§1·§2·§4·§6) | ×2 | 0.95 | 7.6/8 |
| 하위 4항(G3·G4·G5·G6) | ×1 | 0.84 | 3.35/4 |
| **합계(해소 전 참고값)** | | | **96.1%** |

G1·G2 해소 후 실측치는 96%→**98%**(§0 상단·§5 결론 참조) — 위 표는 최초 판정 근거로 보존한다.

## 5. 결론 · 다음 단계

- **≥90% 기준 통과** — high 불일치 0건. iterate(자동 개선) 불필요.
- ✅ G1(로드 레이스 가드)·G2(교차-parity 테스트 3건) 반영 완료 — 981 vitest 전부 green. 잔여는 low 4건(G3 의도된 동작, G4~G6 선택 개선).
- 잔여 수동 항목: 실데이터 QA(오준석 2트랙 zip — 인증 필요), VERSION/CHANGELOG(ship 시).
- 다음: `/pdca report submission-wizard`.
