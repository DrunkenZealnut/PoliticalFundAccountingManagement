# reimbursement-claim-hwpx Gap 분석 보고서

**대상**: reimbursement-claim-hwpx (선거비용 보전청구서 서식 43 HWPX 데이터 채움)
**Design 문서**: `docs/02-design/features/reimbursement-claim-hwpx.design.md`
**구현 경로**: `app/src/lib/hwpx/`, `app/src/lib/accounting/`, `app/src/app/api/hwpx/reimbursement-claim/`, `app/src/components/submission-forms/`
**분석일**: 2026-06-10
**테스트**: 582 passed, lint 0 errors, build 성공

## 종합 점수

| 항목 | 점수 | 상태 |
|------|:----:|:----:|
| Design 일치 | 99% | ✅ |
| 아키텍처 준수 | 100% | ✅ |
| 컨벤션 준수 | 100% | ✅ |
| **종합 Match Rate** | **98%** | ✅ |

## 검증 결과 요약 (Design 핵심 요구사항)

| # | 요구사항 | Design 위치 | 구현 | 상태 |
|---|----------|------------|------|:----:|
| FR-01 | 자금원 3분류 집계 + 합계 | §3.1 | `buildReimbursementClaimModel` (후보자자산/후원회기부금/정당의지원금/합계) | ✅ |
| FR-02 | 필터: `incm=2 ∧ acc_print_ok='Y' ∧ 선거비용 ∧ amt>0` | §2.2 | builder L73-78 4중 필터 정확 일치 | ✅ |
| FR-03 | 텍스트 토큰 prefill | §4.3 | route: `선거명`(const), `후보자명`(organ rep_name→org_name fallback), 나머지 manual | ✅ |
| FR-04 | 제출서류 화면 데이터 채움 노출 | §5.1 | `DATA_FILL_ENDPOINT`/`DATA_FILL_TEXT`에 reimbursement 추가 | ✅ |
| FR-05 | 인증·org 멤버십 가드 | §4.2, §7 | route: `getUser` + `user_organ` maybeSingle 가드 | ✅ |
| FR-06 | 22-2/aggregator 합계 교차검증 | §8.1 | builder.test TC-6 (`정당의지원금 == 보조금+보조금외`) | ✅ |
| 빌더설계 | `ClaimFundingBreakdown`/옵션A/8토큰 | §3.1,§3.3 | 타입·`claimTableTokens`(8)·`claimTotalTokens`·`total=office` 일치 | ✅ |
| 한글금액 | `amountToKoreanWords` | §3.2 | `korean-amount.ts` 순수 함수, 만/억/조/경, 0→"영" | ✅ |
| 표 셀 | 4행×{사무소,합계}=8셀, 연락소 빈칸 | §3.3 | `make-form-43-fill.py` colAddr 1·6 토큰화, 2~5 `clear_cell` | ✅ |
| API | `POST /api/hwpx/reimbursement-claim` | §4 | route 존재, values 화이트리스트(7)+`MAX_LEN=200` 슬라이스 | ✅ |
| UI 하이브리드 | dataFill+fields 동시 노출 | §5.2 | `def.dataFill && def.fields.length>0` 분기, payload `values` 포함 | ✅ |
| 테스트 | 단위·integration·교차검증 | §8 | builder.test(6), korean-amount.test(6), integration.test(3), form-fields.test 분기 | ✅ |
| 보안 | 멤버십 가드, escapeXml, no-store | §7 | 가드 ✅, generateHwpx 내부 `escapeXml` ✅, `Cache-Control: no-store` ✅ | ✅ |

## 발견된 Gap

### 🔵 변경 (Design 가정 ≠ 구현, 의도적·개선)

| 항목 | Design | 구현 | 심각도 | 영향 |
|------|--------|------|:------:|------|
| 서식43 fields source | §5.3 주석 "(source: manual)" — 모든 fields 수동 가정 | `선거명`=const(자동), `후보자명`=organ(자동) + `required:true`로 REG에 등록 | 🟢 Info | 개선. const/organ prefill은 FR-03 의도와 부합. 단 design 주석과 표기 불일치 |
| 텍스트 토큰 수 | §4.3 표에 `선거명` 포함하나 route 처리는 §4 5단계에서 "고정값" 별도 언급 | route `TEXT_TOKENS` 화이트리스트에 `선거명` 포함 + L131 빈값 시 fallback | 🟢 Info | 동작 동일. 화이트리스트가 더 일관적 |

### 🟡 Design 문서 갱신 권장 (구현이 정답)

| 항목 | 위치 | 설명 | 조치 |
|------|------|------|------|
| `claimTotalTokens` 함수명 | design §2.2 의사코드에 `totalAmountTokens`로 표기 | 실제 export는 `claimTotalTokens` | ✅ design §2.2 정정 완료 |
| 서식43 `required` 필드 | design §5.3 fields 목록에 required·source 표기 없음 | 구현은 `선거구명/후보자명/선관위명`을 `required:true`, `선거명`=const, `후보자명`=organ | ✅ design §5.3 정정 완료 |

### 🔴 미구현 (Design O, 구현 X)

없음. 모든 FR·설계 항목 구현 완료.

## 세부 검증

**아키텍처 (§9 Clean Architecture) — 100%**
- Domain(순수): `korean-amount.ts`, `reimbursement-claim-builder.ts` — 외부 IO 의존 없음, 입력 주입형. builder는 `funding-source`/`report-summary-builder`/`income-ledger-builder`(동일 Domain) + `korean-amount`(Domain)만 import. ✅
- Infrastructure(API): route가 supabase 조회 + builder 조립 + generateHwpx. Domain 역의존 없음. ✅
- Presentation: `FormInputPanel`이 route만 fetch, builder 직접 호출 없음. ✅
- SSOT 공유 준수: `classifyFundingSource` + `classifyExpenseCategory` + `formatAmount` 재사용, 신규 분류 로직 없음. ✅

**컨벤션 (§10) — 100%**
- 모듈명 `reimbursement-claim-*` kebab-case, 토큰 키 한글(`{{후보자자산_사무소}}`) 22-2 관례 일치. ✅
- `next.config.ts` outputFileTracingIncludes에 `/api/hwpx/reimbursement-claim` → `./public/hwpx-templates/**` 포함(글롭). ✅
- 매니페스트 `_token-manifest.json` 서식43 17토큰(표8+본문9) 정확. ✅
- 템플릿 스크립트 `make-form-43-fill.py`: 표2개 유지·XML 태그 균형·예시값 잔존0·토큰 17개 검증 assert 포함. ✅

**교차검증 정합성**
- builder.test TC-6: `model.total.정당의지원금 === agg.보조금 + agg.보조금외`, `model.total.합계 === agg.합계` — 보전체크 미체크행 양쪽 동일 제외 검증. ✅
- integration.test: 잔여 토큰 0(`expect(unresolved).toEqual([])` + 정규식 `\{\{...\}\}` 미매치), ZIP mimetype STORED 첫 엔트리, 한글 총액 "금이천오백만원", 빈 데이터 "금영원" 케이스. ✅

## 권장 조치

**즉시 (선택)**
1. ~~design §2.2의 `totalAmountTokens` → `claimTotalTokens` 명칭 정정~~ → 완료
2. ~~design §5.3에 fields의 `선거명`(const)·`후보자명`(organ) 자동 prefill 및 `required` 필드 명시~~ → 완료

**범위 외 확인 (ship 단계)**
- `app/VERSION`은 여전히 `0.8.0.0` — design §11.1 목표 `0.9.0.0` bump 미적용 (의도적 ship 단계 범위 외, 정상)
- 한글 수동 검수 미수행 (의도적 범위 외)

## 결론

**Match Rate 98%** — Design과 구현이 매우 잘 일치합니다 (≥90%, PDCA Check 통과). 실측 조정(§1.3)으로 도출된 신규 빌더·자금원 3분류·옵션 A·한글금액 유틸·하이브리드 UI가 모두 설계대로 구현되었고, SSOT 공유·교차검증·보안 가드까지 충족합니다. 발견된 Gap 2건은 모두 문서 표기 불일치(함수명·필드 메타)로 코드 수정 불필요하며 design 문서 갱신으로 해소했습니다. `/pdca report reimbursement-claim-hwpx`로 완료 보고서 진행 가능합니다.
