# Gap Analysis: receipt-no-account-item-rule

> Check 단계 (gap-detector) · 2026-06-15
> 설계: `docs/02-design/features/receipt-no-account-item-rule.design.md`

## 전체 Match Rate: **99%** ✅ (90% 통과 → Report 진행 가능)

## 검증 포인트별 결과

| # | 검증 포인트 | 결과 | 근거 |
|---|------------|:----:|------|
| 1 | 순수 함수 SSOT 4종 export | ✅ | receipt-no.ts accountAbbr/itemAbbr/formatReceiptNo/assignReceiptNumbers |
| 2 | 계정 약자 84자/85후/82보/83외 + 첫글자 폴백 | ✅ | ACC_ABBR + `?? accName[0]` |
| 3 | 과목 약자 비/비외 + 87 "선거비용외정치자금" includes 매칭 | ✅ | `includes("선거비용외")` 선검사 → 정확일치 버그 회피 |
| 4 | 포맷·조합별 순번·기존 max+1·미부여분만·rcp_no2 전체순번 | ✅ | assignReceiptNumbers 조합 max·globalMax 파싱 |
| 5 | 3경로 통합(API·expense 전환·income 자동) | ✅ | route.ts batch_receipt + expense API 호출 + income 기존 |
| 6 | rcp_no2/정렬·maxRcpNo 회귀 없음 | ✅ | 전체 순번 유지, 정렬 order 유지 |
| 7 | 테스트 T-1~T-9 + 폴백/조합/기존max+1 | ✅ | receipt-no.test.ts 10건 |

## Gap (전부 Low — 문서 정밀도, 코드 무영향)
| 심각도 | 항목 | 상태 |
|:------:|------|------|
| 🔵 | 설계 §2.2 itemAbbr 스니펫 정확일치 표기 | ✅ **해소** (includes 버전으로 동기화) |
| 🔵 | 설계 §3 일괄제거 시 rcp_no2=0 미명시 | ✅ **해소** (1줄 추가) |

## 설계 초과 구현 (긍정)
- itemAbbr `null` 허용(DB 조회 방어), 수입 과목 폴백 통합 테스트(`후(후)-1`)

## 실측 검증 (Gap 아님)
- 테스트 **676 통과**(receipt-no 10건) · lint 0 · build 성공
- 실코드명 DB 확인: 84 후보자등자산/85 후원회기부금/82 보조금/83 보조금외지원금/86 선거비용/**87 선거비용외정치자금** → 87 매칭 버그 사전 수정(includes)

## 결론
설계-구현 99% 일치, Low Gap 2건 즉시 해소(문서 동기화). 핵심 버그(87 코드명 정확일치 폴백)는 실데이터 검증으로 do 단계에서 선차단. **Report 진행 가능.**
