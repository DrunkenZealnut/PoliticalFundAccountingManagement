# PFund2 자금출처 충당 재배분 알고리즘 분석 노트

> **목적**: `fund-source-redistribution` PDCA Phase 1 (reverse-engineering)
> **데이터**: `중앙선거관리위원회_정치자금회계관리2/Data/{Fund_Data_1.db, Fund_Data_2.db}`
> **검증 기준**: `docs/01-plan/features/settlement-report-correction.plan.md` §1.2, §3.3 (이미 수동 검증된 수치)
> **분석일**: 2026-05-15

---

## 1. 데이터 인벤토리

### Fund_Data_1.db (후보자, ORG_ID=1, 오준석후보)

| 항목 | 값 |
|---|---|
| ORG_SEC_CD | 90 ((예비)후보자) |
| 회계기간 | 2022-04-19 ~ 2022-06-21 |
| ACC_BOOK | 41건 |
| ACC_BOOK_BAK | 1건 (취소 거래 복구) |
| ESTATE | 1건 (예금 2,902,930원) |
| OPINION | **없음** (사용자 미입력) |

### Fund_Data_2.db (후원회, ORG_ID=2)

| 항목 | 값 |
|---|---|
| ORG_SEC_CD | 109 ((예비)후보자후원회(대선제외)) |
| 회계기간 | 2022-04-20 ~ 2022-06-21 |
| ACC_BOOK | 55건 |
| OPINION | IN_AMT=5,290,000 / CM_AMT=5,290,000 / BALANCE=0 / ESTATE=0 |

---

## 2. 코드 매핑 확정

### 후보자 측 (CS_ID=10 후보자계정, CS_ID=11 후보자과목)

| CV_ID | CS_ID | 의미 |
|---|---|---|
| 82 | 10 | 보조금 |
| 83 | 10 | 보조금 외 지원금 |
| 84 | 10 | 후보자등 자산 |
| 85 | 10 | 후원회기부금 |
| 86 | 11 | 선거비용 |
| 87 | 11 | 선거비용외 정치자금 |

### 후원회 측 (CS_ID=12 후원회과목)

| CV_ID | CS_ID | 의미 |
|---|---|---|
| 94 | 12 | 기명후원금 |
| 95 | 12 | 익명후원금 |
| 97 | 12 | 기부금 |
| 101 | 12 | 그 밖의 경비 |

---

## 3. Fund_Data_1 원시 데이터 표

### 수입 (ACC_BOOK INCM_SEC_CD=1)

| 자금출처 (84/82/85) | 과목 (86/87) | 합계 (원) | 건수 |
|---|---|---:|---:|
| 보조금 (82) | 선거비용 (86) | 4,415,000 | 1 |
| 자산 (84) | 선거비용 (86) | 3,000,000 | 2 |
| 자산 (84) | 선거비용외 (87) | **5,000,055**¹ | 6 |
| 후원회기부금 (85) | 선거비용 (86) | 3,948,700 | 3 |
| 후원회기부금 (85) | 선거비용외 (87) | 1,335,300 | 1 |
| **합계** | | **17,699,055** | 13 |

¹ 마이너스 수입 포함. id=47 +500,000 + id=48 -500,000 + id=42 55 + 3건 자산 5,000,000 = 5,000,055

### 지출 (ACC_BOOK INCM_SEC_CD=2)

| 자금출처 | 과목 | 합계 (원) | 건수 |
|---|---|---:|---:|
| 보조금 (82) | 선거비용 (86) | 4,415,000 | 7 |
| 자산 (84) | 선거비용 (86) | 99,325 | 2 |
| 자산 (84) | 선거비용외 (87) | 4,997,800 | 4 |
| 후원회기부금 (85) | 선거비용 (86) | 3,948,700 | 9 |
| 후원회기부금 (85) | 선거비용외 (87) | 1,335,300 | 6 |
| **합계** | | **14,796,125** | 28 |

### 잔액

- 수입 - 지출 = 17,699,055 - 14,796,125 = **2,902,930**
- ESTATE 예금: 2,902,930 ✓ (잔액 검증 통과)

---

## 4. 마이너스 수입 보정 (Rule 1) 검증

### 발견된 마이너스 수입

```
id=48: 수입(INCM=1) / 자산(84) / 선거비용외(87) / -500,000원
       "계좌입금오류반환처리" / 2022-04-21
```

### ACC_BOOK_BAK 데이터

```
BAK_ID=1, WORK_KIND=3, ACC_BOOK_ID=48
→ 백업본은 INCM_SEC_CD=2(지출) ACC_AMT=500,000 으로 저장
```

**중요한 발견**: PFund2 내부에서도 마이너스 수입은 양수 지출로 변환되어 백업됨. 우리 `applyCorrections`의 동작이 PFund2와 동일함을 직접 확인.

### Rule 1 적용 후 합계 (PFund2 보고서 일치)

| 항목 | 원시 | Rule 1 보정 후 | 변화 |
|---|---:|---:|---:|
| 수입 합계 | 17,699,055 | 18,199,055 | +500,000 (+ id=48 절대값) |
| 지출 합계 | 14,796,125 | 15,296,125 | +500,000 (-500k → +500k 지출) |
| 자산 선거비용외 수입 | 5,000,055 | **5,500,055** ✓ | id=48 제거 |
| 자산 선거비용외 지출 | 4,997,800 | **5,497,800** ✓ | +500k 추가 |
| 자산 수입 (소계) | 8,000,055 | **8,500,055** ✓ | |
| 잔액 | 2,902,930 | 2,902,930 | 동일 |

→ `settlement-report-correction.plan` §3.3의 모든 수치가 정확히 일치. **Rule 1 알고리즘 검증 완료** (우리 코드 `applyCorrections`가 PFund2와 동일하게 동작).

---

## 5. Rule 2 (자금출처 충당 재배분) 알고리즘 도출

### 기지 결과 (`settlement-report-correction.plan` §1.2 — PFund2 출력)

```
재배분:
- 보조금 → 자산 (선거비용): +1,866,665
- 후원회기부금 → 자산 (선거비용): +4,010
- 보조금 보전 인정액: 2,548,335 (외부 입력값)

PFund2 결산 결과 자산 선거비용 지출:
99,325 (원시) + 1,866,665 (보조금 비인정) + 4,010 (후원회 잔액) = 1,970,000
```

### 알고리즘 가설 (v1)

```python
def applyFundSourceRedistribution(rows, reimbursementCaps):
    """
    reimbursementCaps: { acc_sec_cd: 보전인정액(원) }  # 사용자 입력
    """
    redistributions = []

    # 5.1 보조금 비인정분 → 자산 (선거비용)
    for subsidyCd in 보조금_계정코드:  # 82(보조금), 83(보조금외지원금)
        subsidyExpense = sum(r.acc_amt for r in rows
                             if r.incm_sec_cd == 2 and r.acc_sec_cd == subsidyCd)
        cap = reimbursementCaps.get(subsidyCd, 0)
        nonReimbursable = max(0, subsidyExpense - cap)
        if nonReimbursable > 0:
            redistributions.append({
                rule: "subsidy_overflow_to_asset",
                from: subsidyCd,
                to: 자산_계정코드 (84),
                category: 선거비용 (86),
                amount: nonReimbursable,
            })

    # 5.2 후원회기부금 잔액 → 자산
    # supporterIncome - supporterExpense의 양수 차이만 이전
    supporterIncome = sum(...85, INCM=1)
    supporterExpense = sum(...85, INCM=2)
    supporterRemainder = supporterIncome - supporterExpense
    if supporterRemainder > 0:
        redistributions.append({
            rule: "supporter_remainder_to_asset",
            from: 85,
            to: 84,
            category: 선거비용 (86),
            amount: supporterRemainder,
        })

    return redistributions
```

### 검증 (Fund_Data_1 데이터로 가설 적용)

**가설 입력값 (선관위 보전 인정액)**: 보조금 4,415,000 중 2,548,335 인정

```
Step 5.1:
  보조금(82) 지출: 4,415,000
  인정: 2,548,335
  비인정: 4,415,000 - 2,548,335 = 1,866,665
  → 자산 선거비용 +1,866,665 ✓

Step 5.2:
  후원회기부금(85) 수입: 5,284,000
  후원회기부금(85) 지출: 5,284,000
  잔액: 0
  → 재배분 없음 ❌ (plan §1.2은 +4,010 이전)
```

**미해결: 후원회기부금 +4,010원의 출처**

가능성:
1. **Fund_Data_1.db는 plan §1.2 작성 시점(2026-03-29) 데이터와 다른 버전** — 데이터가 미세하게 갱신됐을 수 있음
2. **후원회 측 잔액 흐름이 후보자에 영향** — Fund_Data_2 (후원회)의 자체 잔액 처리에서 4,010원이 발생할 수 있음
   - 후원회 수입 5,290,000 - 모금경비 6,000 - 기부 5,284,000 = 0 (현재)
3. **다른 미세 조정 규칙 존재** — 우리가 모르는 추가 보정 규칙

→ design 단계에서 사용자에게 확인하거나 추가 케이스 수집 필요.

---

## 6. 결정 사항 / Open Questions

### 확정 (가설 v1으로 코딩 가능)

✅ 보조금 비인정분의 자산 이전 공식: `max(0, subsidyExpense - cap)`
✅ 후원회기부금 잔액의 자산 이전 공식: `max(0, supporterIncome - supporterExpense)`
✅ 재배분 대상 과목: 선거비용 (item_sec_cd=86)
✅ 원본 ACC_BOOK은 mutate 안 함, 결산 시점에만 가상 변환

### Open (design 단계에서 해결)

1. **보조금 종류별 처리**: 보조금(82), 보조금외 지원금(83), 경상보조금(4), 선거보조금(5) 등 — 모두 합산? 각각 cap? 현 데이터엔 82만 있어 검증 불가.
2. **후원회기부금 4,010 미스터리**: 추가 데이터 케이스 수집 후 결정.
3. **자산 부족 케이스**: 자산이 비인정분을 흡수 못 하면? (보전 비인정 > 자산 잔액)
4. **보전 인정액의 입력 단위**: 자금출처(acc_sec_cd) 단위? 항목(item_sec_cd) 단위? 후보자 명세 단위?
5. **UI 흐름**: 사용자가 보전 인정액을 매 결산마다 입력? 또는 OPINION 테이블에 보존?

---

## 7. 검증 픽스처 (테스트용)

### Case A: Fund_Data_1 (이미 확보)

```
입력:
  보조금(82): 수입 4,415,000 / 지출 4,415,000
  자산(84): 수입 8,500,055 (보정 후) / 지출 5,597,125 (99,325 + 5,497,800)
  후원회기부금(85): 수입 5,284,000 / 지출 5,284,000
  보전 인정액: 2,548,335 (외부 입력)

기대 출력:
  보조금 비인정분 자산 이전: 1,866,665
  자산 선거비용 지출 (재배분 후): 1,970,000 (가설: 99,325 + 1,866,665 + 4,010)
  자산 선거비용외 지출 (재배분 후): 5,497,800
```

⚠️ +4,010 부분은 가설 v1으로는 재현 안 됨. 추가 케이스 필요.

### Case B / C (추가 수집 필요)

사용자에게 요청:
- 후원회가 없는 후보자 .db 1개
- 보조금이 없는 정당 .db 1개
- 자산이 부족해서 보조금 비인정분을 다 못 흡수하는 케이스 1개

---

## 8. 다음 단계

1. ✅ Phase 1 분석 노트 작성 완료 (본 문서)
2. **사용자 결정 필요**: +4,010 미스터리를 해결하기 위해 추가 데이터를 수집할지, 아니면 가설 v1으로 진행할지
3. `/pdca design fund-source-redistribution` — 알고리즘 의사코드 + UI 와이어프레임 + 보전인정액 입력 UX 확정
4. Phase 2 (구현): settlement-calc.ts의 placeholder를 실제 동작으로 교체

---

## 부록: SQL 분석 명령

```sql
-- 자금출처 × 항목별 매트릭스
SELECT INCM_SEC_CD, ACC_SEC_CD, ITEM_SEC_CD,
       COUNT(*), SUM(ACC_AMT)
FROM ACC_BOOK
GROUP BY INCM_SEC_CD, ACC_SEC_CD, ITEM_SEC_CD
ORDER BY INCM_SEC_CD, ACC_SEC_CD, ITEM_SEC_CD;

-- 마이너스 행 검색
SELECT * FROM ACC_BOOK WHERE ACC_AMT < 0;

-- 코드 매핑 확인
SELECT cv.CV_ID, cs.CS_NAME, cv.CV_NAME
FROM CODEVALUE cv JOIN CODESET cs ON cv.CS_ID = cs.CS_ID
WHERE cv.CV_ID IN (82, 83, 84, 85, 86, 87);
```
