# Gap Analysis: burden-cost-claim-hwpx (서식 44 점자형 선거공보 부담비용 지급청구서 HWPX)

> **Feature**: burden-cost-claim-hwpx
> **Analyzed**: 2026-06-11
> **Agent**: bkit:gap-detector
> **Design**: docs/02-design/features/burden-cost-claim-hwpx.design.md
> **Match Rate**: **100%** (gap-detector 97% → 설계 문서 명명 동기화 후 100%)

---

## 요약

| 항목 | 값 |
|------|-----|
| Match Rate (초기) | 97% |
| Match Rate (문서 동기화 후) | **100%** |
| MISSING | 0 |
| PARTIAL | 0 (유일 gap = 문서 명명 불일치, 해소됨) |
| CHANGED (정당한 변경) | 2 |
| 자동 테스트 | 47 files / 590 통과, eslint OK |
| 수동 QA 잔여 | 5항목 (DoD 검증, 자동검증 불가) |

gap-detector가 식별한 유일한 실제 gap은 설계 §3.3의 금액 열 표기 `수당실비` ↔ 구현 `수당`(코드 5곳 일관: def/template/manifest/test/python)의 **문서-코드 명명 불일치**였다. 코드가 진실이므로 설계 문서를 `수당`으로 동기화하여 해소 → Match Rate 100%.

---

## 항목별 매칭

| 설계 요구 | 상태 | 근거 |
|----------|:----:|------|
| FR-01 서식 등록(id, candidate, dataFill 없음) | DONE | `form-fields.ts` id="44" def |
| FR-02 토큰 정의(머리/수량/금액/수령/비고) | DONE | REG 9 신규 + burdenAmountMetas 25 |
| FR-03 토큰화 스크립트+산출물 | DONE | `make-form-44-fill.py` → `form-44-fill.hwpx` |
| FR-04 organ prefill 재사용 | DONE | `use-hwpx-prefill.ts` |
| FR-05 generic 생성경로 + required 검증 | DONE | `/api/hwpx/generate` route |
| FR-06 candidate 노출 | DONE | `formsForOrgType` |
| 토큰 40개 3-way 정합성 | DONE | def=template=manifest (form-fields.test) |
| §5 코드 변경/무변경 재사용 | DONE | route/UI/next.config 무변경 |
| §7 테스트(등록·치환·빈입력) | DONE | form-44-integration.test 4건 |

## CHANGED (정당한 설계 변경, 누락 아님)

1. **서식 id "7B" → "44"**: 설계 §2.3은 "7B" 제안(회계장부 "7" 충돌 회피). 구현은 공식 서식번호(44=부담비용청구) + 기존 등록 슬롯 활용. **사용자 결정**. id 충돌도 회피됨.
2. **표3 직인란 미변경**: 설계 §3.5는 직인란 푸터 성명 토큰(선거사무장명/회계책임자명) 열거. 구현은 서식 43 선례대로 직인란을 **손기입 boilerplate 유지**(날인·서명 영역). 토큰 총수 40개로 확정.

## 해소된 Gap

| Gap | 조치 |
|-----|------|
| 설계 §3.3 금액 열 `수당실비` ↔ 코드 `수당` | **설계 문서 동기화**(design.md §3.3 → `수당`, 라벨="수당·실비·산재보험료"). 코드 무변경(이미 일관) |

## 수동 QA 잔여 (DoD, 릴리스 전 1회)

- [ ] 다운로드 .hwpx 한글에서 정상 열림(표 4개·토큰 치환 위치)
- [ ] candidate org 제출서류 목록 노출(dev UI)
- [ ] organ 유래 필드 자동 prefill 화면 동작
- [ ] "채워 받기" → 다운로드 end-to-end + 파일 무결성
- [ ] required 미입력 시 검증 에러 노출(UI)

## 결론

Match Rate **100%** (≥90%) → Act(iterate) 불필요. **`/pdca report` 진행 권장**. 단, 릴리스 전 수동 QA 5항목 수행 필요.
