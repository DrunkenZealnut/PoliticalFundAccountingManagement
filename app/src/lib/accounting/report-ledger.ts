/* ------------------------------------------------------------------ */
/*  보고서(과목별 수입·지출부) 재조정 + 영수증 채번 SSOT 어댑터          */
/*                                                                    */
/*  dashboard/reports(보고서·과목별 수입지출부 출력 Excel)가 후보자       */
/*  보고자료를 만들 때 쓰는 단일 진입점. 재조정 빌더(buildAdjustedAccBook)  */
/*  와 영수증 채번(fillExportReceiptNumbers)을 income-expense-book 뷰어·   */
/*  api/system/export-sqlite 와 "동일 순서·동일 함수"로 묶는다.            */
/*                                                                    */
/*  ─ 왜 필요한가 ─                                                     */
/*  과거 reports는 자체 allocateReportRecords(=buildLedgerRows 직접)를     */
/*  써서 분할/이동 조각이 원본 acc_book_id·rcp_no를 공유했다. 그러면      */
/*  fillExportReceiptNumbers(acc_book_id 키 매핑)가 충돌해 한 영수증번호가  */
/*  여러 자금원 시트에 중복·접두사 stale로 출력됐다. buildAdjustedAccBook   */
/*  은 이동분에 신규 고유 id를 부여하므로(=뷰어·export가 v0.19부터 쓰는     */
/*  방식) 조각별 1:1 채번이 가능하다 → 화면·Excel·.db 영수증번호 일치.     */
/*                                                                    */
/*  원본 acc_book 은 불변(메모리 전용 계산, DB write 0).                  */
/* ------------------------------------------------------------------ */
import { buildAdjustedAccBook } from "./adjusted-ledger";
import { fillExportReceiptNumbers, type ReceiptCodeNames } from "./receipt-no";

/**
 * 보고서용 재조정 장부 행을 만든다(순수).
 *  - `isCandidate` 가 아니면 입력을 그대로 반환(비후보자는 재배분·재채번 없음 — 기존 동작 보존).
 *  - 후보자면 buildAdjustedAccBook 으로 (계정×과목) 분할(이동분 신규 id) 후
 *    fillExportReceiptNumbers 로 영수증번호를 재홈잉(이동조각 stale 접두사 교정)·중복 제거.
 *
 * @param records 원본 acc_book 행(snake_case). 메타(customer·rcp_no·content 등)는 spread 보존.
 * @param getName codevalue.cv_id → 표시명 (영수증 접두사 판정용 acc/item 이름맵 구성에 사용).
 * @param isCandidate 후보자 기관 여부(orgType === "candidate").
 */
export function buildReportLedgerRecords(
  records: Record<string, unknown>[],
  getName: (id: number) => string,
  isCandidate: boolean,
): Record<string, unknown>[] {
  if (!isCandidate) return records;
  const adjusted = buildAdjustedAccBook(records);
  const codeNames: ReceiptCodeNames = { acc: {}, item: {} };
  for (const r of adjusted) {
    const a = Number(r.acc_sec_cd);
    const it = Number(r.item_sec_cd);
    codeNames.acc[a] = getName(a);
    codeNames.item[it] = getName(it);
  }
  return fillExportReceiptNumbers(adjusted, codeNames);
}
