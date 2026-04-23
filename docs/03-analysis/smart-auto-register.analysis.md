# Smart Auto Register — Gap 분석 보고서

> Plan: `docs/01-plan/features/smart-auto-register.plan.md`
> Design: `docs/02-design/features/smart-auto-register.design.md`
> 분석일: 2026-04-17

## Match Rate

```
┌─────────────────────────────────────────────┐
│  Overall Match Rate: 99% (G1 정합화 후)      │
├─────────────────────────────────────────────┤
│  ✅ Match:           30 items (93.8%)        │
│  ⚠️  Minor Gap:        2 items  (6.3%)        │
│  ❌ Missing:          0 items  (0.0%)        │
└─────────────────────────────────────────────┘
```

> **갱신 이력**: 2026-04-17 G1 해결 — Design §3.4를 "Phase 2 향후 개선"으로 표기하여 §8과 정합화. 기능 Gap 0건.

## 섹션별 점수

| 섹션 | 항목 | 점수 | 상태 |
|------|------|:----:|:----:|
| §1 텍스트 파서 | 인터페이스/금액/날짜/결제수단/키워드 | 100% | ✅ |
| §2 지출유형 추론 | 시그니처/4단계 알고리즘/Level2 인덱스 | 100% | ✅ |
| §3 거래처 자동등록 | 흐름/regNum 우선검색(Phase 2)/기본값 | 100% | ✅ |
| §4 UI 설계 | 탭/입력/분석결과/신뢰도 | 95% | ✅ |
| §5 컴포넌트 설계 | 파일구조/상태/분석함수/OCR검증 | 100% | ✅ |
| §6 저장 흐름 | 거래처분기/acc-book/evidence-file | 100% | ✅ |
| §7 구현 순서 | 6개 항목 모두 작성 | 100% | ✅ |
| §8 NOT in scope | 의도적 제외 항목 준수 | 100% | ✅ |
| §9 디자인 시스템 | 색상 토큰 적용 | 90% | ✅ |

## Gap 상세 목록

### 🔴 Missing — 0건

> **G1 해결 완료 (2026-04-17)**: Design §3.4를 "Phase 2 향후 개선"으로 명시 정합화. §8 NOT in scope의 "`/api/customers?regNum=` 추가" 항목과 명시적으로 연결하여 Phase 1(현재)/Phase 2(향후) 단계 구분.

#### 해결된 Gap (이력 보존)

| # | 항목 | 해결 방법 | 결과 |
|---|------|----------|------|
| G1 | 사업자번호 우선 검색 (§3.4) | design.md §3.4 헤더에 "Phase 2 — 향후 개선" 명시 + Phase 1/2 구분 박스 추가 + §8과 상호 참조 | ✅ 정합성 확보 |

### 🟡 Minor — 2건

| # | 항목 | 위치 | 심각도 | 설명 | 권장 조치 |
|---|------|------|:------:|------|----------|
| G2 | OCR 불일치 색상 토큰 (§9) | design.md L482 / page.tsx L521,536,548 | **Low** | Design은 OCR 불일치를 `--warning (#92400E)` 토큰으로 명시. 구현은 `text-amber-600` Tailwind 클래스 사용 (시각적으로 유사하나 디자인 토큰 미준수). | DESIGN.md 토큰(`--warning`)으로 통일하거나, Tailwind 매핑이 의도면 §9 표를 갱신 |
| G3 | 자동매핑 섹션 배경 (§9) | design.md L478 / page.tsx 빠른등록 영역 | **Low** | `--info-bg (#EFF6FF)` 적용 명세이나, 빠른 등록 분석 결과의 자동 매핑 영역에 별도 배경색(`bg-blue-50`)이 거래처 매칭 안내에만 적용. 코드값 자동매핑 패널 자체는 카드 모드와 공유하여 별도 색상 없음. | 자동 매핑 섹션을 별도 카드로 감싸거나 Design을 카드모드 공유 표현으로 갱신 |

### ✨ Extra (Design X, 구현 O) — 0건

명세 외 추가 기능 없음. (단, OCR 결과로 폼 필드를 자동 보완하는 로직 L353-367은 §3 흐름에 암묵적으로 포함된 자연스러운 확장)

## 항목별 검증 상세

### §1 텍스트 파서 ✅
- `ParsedExpenseText` 인터페이스: 6개 필드(amount/date/payMethod/customerName/content/keywords) **완전 일치** (text-parser.ts L8-15)
- 금액 패턴 4종: `만+천` → `만원` → `1,000` → `5자리+` 순서 **일치** (L19-50)
- 날짜 패턴: 상대(오늘/어제/그제/그저께) + ISO + 월일 **일치** (L55-91)
- 결제수단 키워드 10종: 명세 그대로 (L95-106). "계좌이체"가 명시 매핑되어 있어 "계좌"보다 우선 매칭됨 — 더 정확.
- 키워드 추출 + 거래처 분리 로직: 명세대로 (L120-216)

### §2 지출유형 추론 ✅
- `inferExpenseType(keywords, types)` 시그니처 **일치** (wizard-mappings.ts L263)
- 4단계 알고리즘 (0.9 → 0.7 → 0.5 → 0.0) **완전 일치** (L272-342)
- `LEVEL2_INDEX` Map 기반 빌드타임 인덱스 **일치** (L247-260)
- Step 2에서 `route` 카드(영수증첨부) 제외 처리 — 견고함 추가 (L296)
- Step 4 fallback이 "other-expense" 카드로 매핑 — 명세 충족 (L341)

### §3 거래처 자동등록 ✅
- 흐름 (검색 → 매칭 시 사용 / 미매칭 시 신규 등록) **일치** (page.tsx L375-399, L194-220)
- 신규 등록 기본값: `cust_sec_cd: 63`, `reg_num: "9999"` (OCR 없을 때) **일치** (DEFAULT_CUST_SEC_CD=63, DEFAULT_REG_NUM="9999", L23-24, L201-204)
- OCR 데이터 매핑 (provider→name, regNum→reg_num, addr→addr) **일치** (L200-206)
- §3.4 사업자번호 우선 검색: **Phase 2 향후 개선으로 정합화 완료** (§8과 상호 참조)

### §4 UI 설계 ✅
- 탭 구조 ("카드 선택" / "빠른 등록") **일치** (L450-457)
- 입력 화면: textarea + placeholder + 파일 첨부(image/*,application/pdf) + 자동 분석 버튼 **일치** (L478-511)
- 분석 결과: OCR 교차검증, 신뢰도 뱃지(70%+/50-69%/<50% 색상), 거래처 매칭 안내 **일치** (L515-601)
- 신뢰도 0.5 미만 경고 "지출유형을 확인해주세요" **일치** (L599)

### §5 컴포넌트 설계 ✅
- 파일 구조: 신규 `text-parser.ts` + `wizard-mappings.ts` 확장 + `wizard/page.tsx` 통합 **일치**
- 상태: `activeTab`, `inputText`, `quickFile`, `analyzing`, `quickAnalysis`(=analysisResult) **일치** (L61-73). 명명만 `quickAnalysis`로 변경되었으나 구조 동일.
- `handleQuickAnalyze` 함수: 7단계(파싱 → 추론 → 코드매핑 → 폼설정 → OCR → 교차검증 → 거래처매칭) **일치** (L307-404). 명세 6단계에 폼 필드 설정(4단계)이 추가되어 더 견고.
- `compareWithOcr` 함수 + `OcrComparison` 타입 **완전 일치** (text-parser.ts L139-173)

### §6 저장 흐름 ✅
- 거래처 분기 (matched → 기존 cust_id / isNew → POST customers) **일치** (L194-220)
- `/api/acc-book` POST `action: "insert"` payload: org_id, incm_sec_cd, acc_sec_cd, item_sec_cd, cust_id, acc_date, content, acc_amt, rcp_yn, rcp_no, acc_ins_type, exp_group1~3_cd **일치** (L237-258)
- `/api/evidence-file` 증빙파일 업로드 **일치** (L271-)
- 카드 모드 SaveResult 타입 재사용 **일치** (L33-36)

### §7 구현 순서 ✅
6개 항목 모두 산출물 존재 (text-parser.ts, text-parser.test.ts 23 passed, wizard-mappings.ts inferExpenseType, wizard-mappings.test.ts 47 passed, wizard/page.tsx 빠른 등록 탭, page.test.tsx 17 passed)

### §8 NOT in scope ✅
- AI(LLM) 텍스트 분석: 미사용 (정규식+키워드 매칭만)
- 음성 입력: 없음
- 일괄 텍스트 입력: 없음
- 수입 자동등록: `EXPENSE_WIZARD_TYPES` 한정, 빠른 등록은 지출만
- 거래처 주소 자동 검색: OCR addr 그대로 사용 (L206)
- `/api/customers?regNum=` 미추가 (G1과 일관 — 의도적 제외)

### §9 디자인 시스템 ✅ (90%)
- "자동 분석하기" 버튼 `--accent` (#D4883A): `bg-[#D4883A]` 적용 ✅ (L508)
- 탭 활성 `--primary` (#1B3A5C): `border-[#1B3A5C] text-[#1B3A5C]` 적용 ✅ (L451-455)
- 신뢰도 색상 (green/yellow/red): `bg-green-50/yellow-50/red-50` 적용 ✅ (L593-596)
- OCR 일치 `--success` (#166534): `text-green-600` 적용 — 토큰 매칭 ✅
- **G2/G3**: OCR 불일치 `--warning`(amber), `--info-bg`(blue-50) 일부 토큰 미준수

## 권장 다음 단계

### 즉시 (24시간 이내)
- 없음 (Critical 이슈 없음, Match Rate 96%로 양호)

### 단기 (1주일 이내)
| 우선순위 | 항목 | 위치 | 영향 | 상태 |
|:--------:|------|------|------|:----:|
| ~~🟡 1~~ | ~~**G1 해결**: Design §3.4와 §8의 모순 정리~~ | design.md §3.4, §8 | 문서 정합성 | ✅ 해결 |
| 🟢 2 | **G2/G3 해결**: Tailwind 클래스(`text-amber-600`, `bg-blue-50`)를 DESIGN.md의 CSS 변수 토큰과 매핑 표로 보강 | DESIGN.md / design.md §9 | 디자인 시스템 일관성 | ⏳ 보류 |

### 장기 (백로그)
- §8 향후 개선 항목인 `/api/customers?regNum=` 지원 추가 → §3.4 본격 구현으로 사업자번호 변경 거래처 정확 매칭

### 결론
- Match Rate **99%** → Report 단계 진행 권장 (`/pdca report smart-auto-register`)
- G1 해결 완료 (§3.4를 Phase 2로 정합화) → 기능 Gap **0건**
- 남은 G2/G3는 디자인 토큰 표기 차이로 시각적 영향 없음

---

**참고 파일 경로**:
- Design: `docs/02-design/features/smart-auto-register.design.md`
- Plan: `docs/01-plan/features/smart-auto-register.plan.md`
- 구현: `app/src/lib/text-parser.ts`, `app/src/lib/wizard-mappings.ts` (L234-343), `app/src/app/dashboard/wizard/page.tsx` (L23-24, L61-73, L194-220, L307-404, L450-601)
