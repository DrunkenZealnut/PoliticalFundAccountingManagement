# Gap Analysis: reimbursement-claim-mismatch

> Check 단계 (gap-detector) · 2026-06-14
> 설계: `docs/02-design/features/reimbursement-claim-mismatch.design.md`

## 전체 Match Rate: **98%** ✅ (90% 통과 → Report 진행 가능)

| Category | Score | Status |
|----------|:-----:|:------:|
| Design Match (§2~§5 기능) | 100% | ✅ |
| Test Coverage (§4 T-1~T-5) | 100% | ✅ |
| 구현 순서·검증 기준 (§6~§7) | 95% | ✅ |
| **Overall** | **98%** | ✅ |

## 검증 포인트별 결과

| # | 검증 포인트 | 결과 | 근거 |
|---|------------|:----:|------|
| 1 | aggregator `otherFundingCount`/`otherFundingAmt` + 기타 합계 제외·별도 누적 (silent drop 제거) | ✅ | `reimbursement-aggregator.ts` 인터페이스 필드 + 기타 분기(`continue`로 합계 제외, 카운트/금액 누적) + 반환 |
| 1b | 4분류 합계 불변 | ✅ | 기타만 분리, 4분류 로직 그대로. 회귀 테스트(불변식) 존재 |
| 2 | aggregate route 새 필드 반환 + 타입 동기화 | ✅ | 결과 그대로 `NextResponse.json`, `page.tsx` `AggregateResult` 동기화 |
| 3 | HWPX route `byFundingSource` 불변 | ✅ | `byFundingSource`만 구조분해, 신규 필드 무시. 동일 aggregator |
| 4a | 보전 탭 "보전 금액(청구 기준)" 표시 | ✅ | `claimAgg` state + `fetchClaimAggregate` + 주 지표 카드 |
| 4b | 저장 직후 재집계 | ✅ | `handleSave` 완료 후 `await refreshClaimAgg()` |
| 4c | 보전 탭 기타 경고 | ✅ | `otherFundingCount > 0` amber 경고 |
| 4d | 요약 바 "현재 조회분" 명확화 | ✅ | "현재 조회분 체크/금액"으로 변경 |
| 5 | 청구서 탭 기타 경고 | ✅ | `uncheckedCount` 경고와 동일 패턴 추가 |
| 6 | 테스트 T-1~T-5 | ✅ | 기타 분리/claim_amt 기준/0건 회귀/불변식 + 기존 회귀 단언 |
| 7a | §6 구현 순서 | ✅ | 전 단계 반영 |
| 7b | §7 검증 기준 (탭==청구서==HWPX SSOT) | ✅ | 세 출력 동일 aggregator·동일 모집단. **lint 0·652 테스트·build 성공(Do 단계 실측)** |

## Gap 목록

| Gap | 심각도 | 상태 |
|-----|:------:|------|
| G-1: lint·build·test 검증 | 정보 | ✅ **해소** — Do 단계에서 vitest 652건 통과·eslint 0·`next build` 성공 실측 완료 |
| G-2: HWPX 경고 메타 미노출 | 없음 | 설계 §2.3 의도(byFundingSource 정합만 보장) — 조치 불필요 |
| G-3: 실데이터 "탭==청구서==HWPX" 수동 확인 | 정보 | 머지 전 1회 수동 확인 권장(잔여) |

> 실질 미충족(❌) 없음.

## 설계 초과 구현 (무해·긍정)

| 항목 | 평가 |
|------|------|
| `withExpCum` 헬퍼 (react-hooks/immutability 선재 lint 정리) | 본 버그 무관, 긍정 |
| `fetchClaimAggregate` 공용 헬퍼 추출 | 설계 §2.4 권장 실현, 중복 제거 |
| useEffect cleanup(`active` flag) race 방지 | 견고성 향상 |

## 결론
설계와 구현이 거의 완전 일치(98%). lint/build/test 실측 통과로 G-1 해소. 잔여는 실데이터 수동 확인(G-3)뿐 → **Report 단계 진행 가능**.
