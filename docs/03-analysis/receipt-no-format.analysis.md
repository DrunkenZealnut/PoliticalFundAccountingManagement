# receipt-no-format Gap 분석 (PDCA Check)

> 설계: `docs/02-design/features/receipt-no-format.design.md`
> 계획: `docs/01-plan/features/receipt-no-format.plan.md`
> 분석일: 2026-06-16 | 분석: bkit:gap-detector

## Match Rate: 100% (7/7 요구사항 충족)

| 분류 | 매치 | 누락설계 | 미구현 |
|---|:--:|:--:|:--:|
| 요구사항 7건 | 7 | 0 | 0 |

## 요구사항별 충족 표

| # | 요구사항 (설계 §) | 구현 위치 | 상태 |
|---|---|---|:--:|
| 1 | 스킴 A: 선거비용(86)→`{약자}(비)`, 선거비용외(87)→`{약자}` 괄호 완전 제거 | `receipt-no.ts` formatKey (`it.includes("선거비용외") return a`) | ✅ |
| 2 | 스킴 B: 후원회 지출(acc=2)→`{과목약자}`, 매핑 기/모/인/사/그 (모금 포함→모, 그 외 첫 글자) | `supporterExpenseAbbr` + formatKey | ✅ |
| 3 | 스킴 C: 후원회 수입(acc=1)·기타→`{accountAbbr}({itemAbbr})` 폴백 유지 | formatKey 말미 | ✅ |
| 4 | 판정 기준 `acc_sec_cd` 단일 분기 (incm_sec_cd 불필요) | formatKey가 `acc_sec_cd`만 분기, `ReceiptTarget` 타입 불변 | ✅ |
| 5 | 소비처 무변경 (시그니처·호출부 불변) | `assignReceiptNumbers`/`fillExportReceiptNumbers` 시그니처 동일; acc-book·export-sqlite 호출부 무변경 | ✅ |
| 6 | 테스트 매트릭스 (설계 §5) | T-9 수정(`자-1`), A-1/A-2/A-3, B-1/B-2, B-3=T-10(supporterExpenseAbbr), C-1, 회귀 T-1·T-2·T-6·T-7·T-8·TC-1~7 전부 존재 | ✅ |
| 7 | YAGNI: 소급 재채번·후원회 수입 규칙·income-expense-book.ts·formatReceiptNo 무변경 | `formatReceiptNo` 유지, `income-expense-book.ts` `formatRcpNo` 선거비용 전용 `(비)` 무변경 | ✅ |

## Gap 목록

**차단·중대 Gap 없음.** 정보성 관찰(점수 영향 없음):

| 심각도 | 위치 | 내용 |
|:--:|---|---|
| 🟢 Info | plan §B vs design §1 | 계획은 후원회 지출 판정을 `ORG_SEC_CD=109 + incm_sec_cd`로 서술했으나, 설계가 실데이터 검증 후 **`acc_sec_cd===2` 단일 판정**으로 정련(의도적 결정). 구현은 설계 준수. |
| 🟢 Info | `itemAbbr` "비외" 분기 | 스킴 A 선거비용외가 `return a`로 먼저 처리돼 "비외"는 키 생성 미사용. 설계 §3.3 명시(공개 export·테스트 호환 위해 무해 유지). T-3 단위 커버. |
| 🟢 Info | TC-7 | 미정의 acc_sec_cd=100 폴백 `(비)-1`(계정약자 빈문자) — 방어 폴백 정상. |

## 키 충돌 검증 (설계 §6)
- 후보 선거비용외 키 `자/후/보/외` vs 후원회 지출 `기/모/인/사/그` — 문자 불중복. A-3·B-1 테스트로 조합별 독립 순번 고정. ✅
- 스킴 A 계정 약자 키(82~85)가 `funding-source.ts` SSOT 키 공유. ✅

## 테스트 실행 결과
- `receipt-no.test.ts`: **25 passed**
- 전체 회귀: **702 passed (55 files)**
- ESLint(변경 파일): clean

## 종합 의견

Match Rate **100% (≥90%)** — Design ↔ Implementation 완전 일치. 스킴 A/B/C, `acc_sec_cd` 단일 판정, 소비처 무변경, 테스트 매트릭스, YAGNI 범위 모두 빠짐없이 구현. 차단 Gap 없음.

→ **iterate 불필요. `/pdca report receipt-no-format` 진행 가능.**
