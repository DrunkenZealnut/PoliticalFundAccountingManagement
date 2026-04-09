# accounting-wizard Gap Analysis

## Match Rate: 95% (38/40)

## Matched Items (38건)

| # | Design | Implementation | Status |
|---|--------|---------------|--------|
| 1 | 지출 카드 10종 | `wizard-mappings.ts` EXPENSE_WIZARD_TYPES[10] | MATCH |
| 2 | 수입 카드 5종 | `wizard-mappings.ts` INCOME_WIZARD_TYPES[5] | MATCH |
| 3 | 영수증첨부 카드 → document-register 라우팅 | `route` 필드 + `router.push()` | MATCH |
| 4 | 수입 영수증첨부 → `?tab=income` | route: "/dashboard/document-register?tab=income" | MATCH |
| 5 | WizardType 인터페이스 | 모든 필드 + route 추가 | MATCH |
| 6-13 | 지출 매핑 8종 (계정/과목/지출유형) | 모든 매핑 정확 | MATCH |
| 14 | 후원금 계정 매핑 | "후원" 키워드 (기능 동일) | PARTIAL |
| 15-16 | 보조금/자산 매핑 | "보조금"/"자산" 키워드 | MATCH/PARTIAL |
| 17 | 파일 구조 (wizard-mappings + wizard/page) | 정확히 일치 | MATCH |
| 18-21 | 상태 설계 (mode, step, form, autoSet) | 정확히 일치 | MATCH |
| 22-27 | UI 컴포넌트 (카드그리드, 검색, Step1-3, 진행바, 모드토글) | 모두 구현 | MATCH |
| 28-29 | resolveCodeValues, searchWizardTypes | 구현 완료 | MATCH |
| 30 | 사이드바 메뉴 4개 기관 | 모두 추가 | MATCH |
| 31 | document-register useSearchParams | tab 파라미터 지원 | MATCH |
| 32-36 | 저장 흐름 (거래처/acc_book/evidence/rcp_no/성공다이얼로그) | 모두 구현 | MATCH |
| 37-40 | NOT in scope 항목 (AI분류/OCR/일괄/모바일) | 정확히 제외 | MATCH |

## Gaps (2건 — Low Severity)

| # | Design | Implementation | 영향도 |
|---|--------|---------------|--------|
| 1 | `accSecCdName: "후원회기부금"` | `"후원"` (짧은 키워드) | Low — includes() 매칭으로 기능 동일 |
| 2 | `accSecCdName: "후보자등자산"` | `"자산"` (짧은 키워드) | Low — includes() 매칭으로 기능 동일 |

## Extras (구현에만 있는 개선사항)

- `route` 필드 추가 (영수증 카드 라우팅 추상화)
- searchWizardTypes → Set<string> 반환 (카드 숨기기 대신 dim 처리)
- 추가 검색 키워드 9개 (검색 정확도 향상)
- 영수증 카드 dashed border 스타일 (시각적 구분)
- 코드 로딩 상태 처리
- Step 3 입력값 검증 가드
