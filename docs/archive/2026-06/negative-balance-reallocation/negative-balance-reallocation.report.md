# 자금원 음수잔액 해소 재배분 완료 리포트

> **Feature**: negative-balance-reallocation
> **Project**: PoliticalFundAccountingManagement
> **Date**: 2026-06-16
> **Phase**: Completed
> **Plan**: [01-plan](../01-plan/features/negative-balance-reallocation.plan.md) · **Design**: [02-design](../02-design/features/negative-balance-reallocation.design.md)
> **대상 데이터**: 2026 오준석후보 (org_id=11), acc_book 73행

---

## Executive Summary

### 프로젝트 개요

| 항목 | 내용 |
|------|------|
| Feature | negative-balance-reallocation |
| 기간 | 2026-06-16 (Plan→Design→Do 1세션) |
| 산출물 | `오준석_정치자금수입지출부_계정별_재배분.xlsx` (계정별 4시트) + `lib/accounting/fund-realloc.ts`(+테스트) + read-only 스크립트 3종 |
| 데이터 처리 | report-only (acc_book·앱 코드 무변경) |

### 1.3 Value Delivered (4-Perspective)

| Perspective | 내용 (실측 메트릭) |
|-------------|------|
| **Problem** | 오준석 후보 수입지출부에서 후원회기부금(85) 잔액이 거래 중간에 **최저 −873,960원**까지 음수(5건). 자금원 태깅이 입금일·잔액을 못 따라간 결과. |
| **Solution** | 은행 거래내역서로 **단일 통합계좌가 한 번도 음수 아님(태깅 아티팩트)**을 확인 → 단일 현금풀 **캐스케이드 재배분(Option B)**으로 부족분을 우선순위(84→83→82) 자금원으로 연쇄 이동(분할 포함). 통장 ≥ 0 → **음수 0 수학적 보장**. |
| **Function/UX Effect** | 계정별 정치자금 수입지출부 .xlsx 산출: **재배분 후 전 자금원 최저잔액 0**, 재배분 12건, 진짜부족 0건, **총지출 34,400,079원 보존**, 재배분 후 자금원 잔액 합(132,500) = 실제 통장 최종잔액 일치. |
| **Core Value** | 입금일 기반 현실 충당 순서를 반영한, **검증 가능한**(은행 대사·총액보존·음수0) 수입지출부. 원본 보존(report-only)으로 안전. |

---

## 2. PDCA 사이클 요약

### Plan
- 후원금(85) 시간순 잔액 음수 문제. 입금일·잔액 기반 시간순 재배분(분할 허용), 계정별 수입지출부 엑셀 산출. 정책 초안: report-only / 84↔85 / 부족시 음수유지+경고.

### Design
- 순수 함수 `reallocateFundSources` + 계정별 엑셀(15컬럼) + 재배분 리포트 시트. 시간순 정렬 SSOT(`acc-book-sort.ts`) 재사용.
- **은행 거래내역서 검증 후 Option B로 확장**: 단일 통합계좌가 항상 양수 → 83(진보당지원금) 포함 N-source 캐스케이드. 음수 0 보장(Σ가용=통장잔액≥0). 진보당→자산 이동분 투명 표기.

### Do
- `lib/accounting/fund-realloc.ts`(순수, 캐스케이드) + `fund-realloc.test.ts`(8케이스, T1~T13 커버) 작성·통과.
- `scripts/realloc-negative-balance.mjs`(read-only 조회 + 재배분 + ExcelJS, 런타임 음수0·총액보존 assert).
- 진단 스크립트 2종(`diagnose-negative-balance.mjs`, `diagnose-timeline.mjs`) — read-only.

### Check (실증 검증)
> 별도 gap-detector(형식적 Check)는 미실행. 대신 다층 실증 검증으로 대체:
- **단위 테스트**: fund-realloc 8/8 통과. 전체 **717 passed** (기존 709 + 신규 8), 무회귀.
- **lint 0**, 변경 TS 타입 에러 0.
- **런타임 assert**: 재배분 후 전 자금원 최저잔액 0(음수 0), 총지출 34,400,079 보존(차이 0).
- **은행 대사**: 입금 누락 0건, 재배분 후 자금원 잔액 합 132,500 = 통장 최종잔액(PDF) 일치.
- → 설계(Option B) 대비 구현 일치도 사실상 100%.

---

## 3. 핵심 발견 (은행 거래내역서)

- **단일 통합계좌**(카카오뱅크 3333-29-6581292)가 한 번도 음수 아님(최저 4/6 0원, 이후 5/31 31,227원). 85 음수는 **순수 태깅 아티팩트**, 실제 자금 부족 아님.
- **입금 누락 없음**: 후원금 9,430,000·진보당 3,000,000·후보자자산 모두 통장↔acc_book 일치.
- 후보자자산(84)은 5월 내내 빔(3/30 6.5M 4/6 전액소진, 다음 5/26 1M, 큰 입금 6월). 5/22 ~79k는 그때 통장에 있던 진보당(83) 3M이 실질 충당 → 84↔85만으론 해소 불가였기에 **Option B(83 포함)**로 전환.

---

## 4. 재배분 결과 (12건)

대표 흐름(예측대로 실행):
- 5/22 인형탈대여 → 85에서 58(자산)+78,902(진보당83) 분산
- 5/26 공식공보물 → 진보당 78,902 부족분 83→84(자산) 캐스케이드
- 5/26~31 큰 음수(440,000·265,000·90,000) → 자산
- 6월 자산 지출 일부(562,100 등) → 후원금(입금 타이밍상 84 일시부족 회피)

**총액 보존**: 자산 21,976,062→22,102,579(+126,517), 후원금 9,424,017→9,297,500(−126,517), 보조금외 3,000,000(불변). 총계 34,400,079 불변.

---

## 5. 산출 파일

| 파일 | 비고 |
|------|------|
| `app/src/lib/accounting/fund-realloc.ts` | 순수 함수(캐스케이드 재배분) |
| `app/src/lib/accounting/fund-realloc.test.ts` | 단위 테스트 8케이스 |
| `app/scripts/realloc-negative-balance.mjs` | read-only 조회 + 엑셀 생성 |
| `app/scripts/diagnose-{negative-balance,timeline}.mjs` | read-only 진단 |
| `오준석_정치자금수입지출부_계정별_재배분.xlsx` | 산출물(프로젝트 루트 + 윈도우공유폴더 복사) |

> **미커밋**: 모든 스크립트·산출물은 read-only 분석 결과로 커밋하지 않음. acc_book DB·앱 코드 무변경.

---

## 6. 후속 / 유의사항

- **제출 전 검토**: 「재배분 리포트」 시트의 12건(특히 진보당 공식공보물 78,902원→후보자자산, 6월 자산↔후원금 이동) 회계책임자 검토 필요 — 자금원 designation 변경분.
- **정책 옵션**: 6월 84↔85 역방향 이동을 줄이려면 "후보자 자산 지출은 84 유지"식으로 입금일 제약·우선순위 조정 후 재생성 가능.
- **연관 작업**: 입력 시점 예방 [[income-account-balance-guard]](Plan 단계)과 짝. 추후 통합 검토.
- 다음: `/pdca archive negative-balance-reallocation`로 문서 아카이브.

---

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-06-16 | Claude | 완료 리포트 (Option B, 음수0·총액보존·은행대사 검증) |
