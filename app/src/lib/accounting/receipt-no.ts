/* ------------------------------------------------------------------ */
/*  영수증 일련번호 채번 규칙 SSOT                                       */
/*                                                                    */
/*  영수증번호(rcp_no, 표시값)를 계정(자금원)·과목 약자 + 조합별 순번    */
/*  으로 생성한다. 예: "자(비)-1"(후보자자산·선거비용 1번).             */
/*  - 계정 약자: 84자/85후/82보/83외, 그 외 코드명 첫 글자 폴백.        */
/*  - 과목 약자: 선거비용→비, 선거비용외→비외, 그 외 첫 글자 폴백.       */
/*  - 순번: 동일 (계정약자,과목약자) 조합별 1부터(기존 조합 max+1 이어서).*/
/*  rcp_no2(정수)는 정렬·중복방지·maxRcpNo 호환용 전체 순번으로 유지.    */
/*                                                                    */
/*  소비처: api/acc-book batch_receipt, expense/income 일괄생성.        */
/* ------------------------------------------------------------------ */

/** 계정(자금원) 약자 — 후보자계정(cs_id=10) 4분류 + 코드명 첫 글자 폴백. */
const ACC_ABBR: Record<number, string> = { 84: "자", 85: "후", 82: "보", 83: "외" };

export function accountAbbr(accSecCd: number, accName?: string): string {
  return ACC_ABBR[accSecCd] ?? (accName?.trim()?.[0] ?? "");
}

/** 과목 약자 — 선거비용→비, 선거비용외(정치자금)→비외, 그 외 코드명 첫 글자 폴백.
 *  실제 코드명이 "선거비용외정치자금"(87)이라 includes로 매칭하되 "선거비용외"를 먼저 검사. */
export function itemAbbr(itemName: string | undefined | null): string {
  const n = (itemName ?? "").trim();
  if (n.includes("선거비용외")) return "비외";
  if (n.includes("선거비용")) return "비";
  return n ? n[0] : "";
}

/** 영수증번호 = "{계정약자}({과목약자})-{순번}". */
export function formatReceiptNo(accAbbr: string, itAbbr: string, seq: number): string {
  return `${accAbbr}(${itAbbr})-${seq}`;
}

export interface ReceiptTarget {
  acc_book_id: number;
  acc_sec_cd: number;
  item_sec_cd: number;
}

export interface ReceiptCodeNames {
  /** acc_sec_cd → 계정명 */
  acc: Record<number, string>;
  /** item_sec_cd → 과목명 */
  item: Record<number, string>;
}

export interface ReceiptAssignment {
  acc_book_id: number;
  rcp_no: string;
  rcp_no2: number;
}

/**
 * 미부여 대상에 조합별 순번 영수증번호를 부여(순수).
 *
 * @param targets 채번 대상(rcp_yn='Y' ∧ rcp_no 없음). 호출자가 날짜/정렬순으로 전달.
 * @param codeNames acc_sec_cd/item_sec_cd → 코드명.
 * @param existing 기존 부여분(rcp_no, rcp_no2) — 조합별 max seq·전체 max rcp_no2 산출용.
 * @returns 각 target의 {acc_book_id, rcp_no, rcp_no2}.
 */
export function assignReceiptNumbers(
  targets: ReceiptTarget[],
  codeNames: ReceiptCodeNames,
  existing: { rcp_no: string | null; rcp_no2: number | null }[],
): ReceiptAssignment[] {
  // 기존: 조합(key="자(비)")별 max 순번 + 전체 max rcp_no2
  const comboSeq = new Map<string, number>();
  let globalMax = 0;
  for (const e of existing) {
    if (typeof e.rcp_no2 === "number" && e.rcp_no2 > globalMax) globalMax = e.rcp_no2;
    const m = (e.rcp_no ?? "").match(/^(.+)-(\d+)$/);
    if (m) {
      const key = m[1];
      const n = parseInt(m[2], 10);
      if (!Number.isNaN(n)) comboSeq.set(key, Math.max(comboSeq.get(key) ?? 0, n));
    }
  }

  const result: ReceiptAssignment[] = [];
  let g = globalMax;
  for (const t of targets) {
    const key = formatKey(t, codeNames);
    const next = (comboSeq.get(key) ?? 0) + 1;
    comboSeq.set(key, next);
    g += 1;
    result.push({ acc_book_id: t.acc_book_id, rcp_no: `${key}-${next}`, rcp_no2: g });
  }
  return result;
}

function formatKey(t: ReceiptTarget, codeNames: ReceiptCodeNames): string {
  const a = accountAbbr(t.acc_sec_cd, codeNames.acc[t.acc_sec_cd]);
  const i = itemAbbr(codeNames.item[t.item_sec_cd]);
  return `${a}(${i})`;
}

/** rcp_no가 미부여(null/undefined/공백)인지. */
function isMissingRcpNo(v: unknown): boolean {
  return v == null || String(v).trim() === "";
}

/**
 * export용 — RCP_NO 미부여(rcp_yn='Y' ∧ rcp_no 빈) acc_book 행에 조합별 영수증번호를 채운다(순수).
 *
 * 자료백업(export-sqlite)이 「영수증 일괄생성」 실행 여부와 무관하게 항상 올바른 조합별
 * 영수증번호를 담도록, insert 직전 행 집합에 적용한다. 빈 RCP_NO로 export되면 윈도우 선관위
 * 프로그램이 수입지출부 영수증일련번호를 단일 버킷으로 폴백 생성하는 문제를 회피한다.
 *
 * - `incm_sec_cd`별 스코프 분리(앱 batch_receipt와 동일 — 수입 1 / 지출 2 순번 독립).
 * - 정렬 `acc_date → acc_sort_num → acc_book_id`(batch_receipt와 동일).
 * - **미부여분만** 채번 — 기존(수기/사전) rcp_no는 보존, 조합별 max+1부터 이어서.
 * - 입력 rows는 변경하지 않고 새 배열을 반환(immutable). 미매칭 행은 원본 그대로 통과.
 *
 * @param rows export 직전 acc_book 행(snake_case 키: incm_sec_cd, acc_sec_cd, item_sec_cd,
 *             rcp_yn, rcp_no, rcp_no2, acc_book_id, acc_date, acc_sort_num).
 * @param codeNames acc_sec_cd/item_sec_cd → 코드명(약자 매핑용).
 */
export function fillExportReceiptNumbers(
  rows: Record<string, unknown>[],
  codeNames: ReceiptCodeNames,
): Record<string, unknown>[] {
  // incm_sec_cd별 그룹
  const byIncm = new Map<number, Record<string, unknown>[]>();
  for (const r of rows) {
    const incm = Number(r.incm_sec_cd);
    const list = byIncm.get(incm) ?? [];
    list.push(r);
    byIncm.set(incm, list);
  }

  // acc_book_id → 부여값
  const assignmentById = new Map<number, ReceiptAssignment>();
  for (const group of byIncm.values()) {
    const existing = group
      .filter((r) => !isMissingRcpNo(r.rcp_no))
      .map((r) => ({ rcp_no: String(r.rcp_no), rcp_no2: Number(r.rcp_no2) || 0 }));

    const targets: ReceiptTarget[] = group
      .filter((r) => String(r.rcp_yn ?? "") === "Y" && isMissingRcpNo(r.rcp_no))
      .sort(
        (a, b) =>
          String(a.acc_date ?? "").localeCompare(String(b.acc_date ?? "")) ||
          (Number(a.acc_sort_num ?? 0) - Number(b.acc_sort_num ?? 0)) ||
          (Number(a.acc_book_id ?? 0) - Number(b.acc_book_id ?? 0)),
      )
      .map((r) => ({
        acc_book_id: Number(r.acc_book_id),
        acc_sec_cd: Number(r.acc_sec_cd),
        item_sec_cd: Number(r.item_sec_cd),
      }));

    if (targets.length === 0) continue;
    for (const a of assignReceiptNumbers(targets, codeNames, existing)) {
      assignmentById.set(a.acc_book_id, a);
    }
  }

  if (assignmentById.size === 0) return rows;
  return rows.map((r) => {
    const a = assignmentById.get(Number(r.acc_book_id));
    return a ? { ...r, rcp_no: a.rcp_no, rcp_no2: a.rcp_no2 } : r;
  });
}
