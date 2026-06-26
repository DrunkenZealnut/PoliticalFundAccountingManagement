/* ------------------------------------------------------------------ */
/*  영수증 일련번호 채번 규칙 SSOT                                       */
/*                                                                    */
/*  영수증번호(rcp_no, 표시값)를 계정 계열별 3-스킴으로 생성한다.        */
/*  스킴 판정은 acc_sec_cd 하나로 한다(실데이터 검증: 후보=82~85,        */
/*  후원회 수입=1·지출=2). incm_sec_cd 불필요.                          */
/*                                                                    */
/*  ┌ 스킴 A — 후보 자금원 계정(acc_sec_cd ∈ {82,83,84,85})            */
/*  │   선거비용(86)   → "{계정약자}(비)-n"   예: 자(비)-1             */
/*  │   선거비용외(87) → "{계정약자}-n"       예: 자-1 (괄호 없음)      */
/*  │   계정약자: 84자/85후/82보/83외.                                 */
/*  ├ 스킴 B — 후원회 지출 계정(acc_sec_cd === 2)                       */
/*  │   "{과목약자}-n"  예: 기-1/모-1/인-1/사-1/그-1                    */
/*  │   과목약자(97~101): 기부금기·후원금모금경비모·인건비인·          */
/*  │   사무소설치운영비사·그밖의경비그 (모금 포함→모, 그 외 첫 글자).  */
/*  └ 스킴 C — 후원회 수입(acc_sec_cd === 1)·기타 → 현행 폴백 유지       */
/*      "{계정약자}({과목약자})-n"  예: 수(기)-1                        */
/*                                                                    */
/*  - 순번: 동일 키(prefix) 조합별 1부터(기존 조합 max+1 이어서).       */
/*  rcp_no2(정수)는 정렬·중복방지·maxRcpNo 호환용 전체 순번으로 유지.    */
/*                                                                    */
/*  소비처: api/acc-book batch_receipt(지출만), system/export-sqlite,   */
/*  expense 일괄생성. (acc_sec_cd 기반 분기라 소비처 무변경.)           */
/*                                                                    */
/*  ※ 수입은 영수증번호 생략: 공식 양식·Fund_Data_*.db 검증상 수입       */
/*  (incm_sec_cd=1)은 번호를 부여하지 않고 "생략"으로 표기한다           */
/*  (RECEIPT_OMITTED_LABEL). 채번 제외는 fillExportReceiptNumbers(보고/  */
/*  내보내기)·api/acc-book batch_receipt(입력)에서 강제하고, formatKey   */
/*  스킴 C(후원회 수입 폴백)는 기록용으로만 남는다.                      */
/* ------------------------------------------------------------------ */

/** 수입·지출부 영수증 일련번호 표시값 — 수입은 "생략"으로 표기한다.
 *  공식 선관위 양식·Fund_Data_*.db 검증: 수입(incm_sec_cd=1)은 영수증번호를 부여하지 않고
 *  RCP_NO 빈값·RCP_YN='N'으로 기록되며, 수입·지출부 인쇄 시 "생략"으로 찍힌다.
 *  우리가 직접 렌더하는 화면·엑셀·HWPX는 이 라벨로 표기하고, .db export는 빈값으로 둔다
 *  (윈도우 프로그램이 자체적으로 "생략" 인쇄). */
export const RECEIPT_OMITTED_LABEL = "생략";

/** 수입·지출부 영수증 일련번호 표시값 — 수입(incm_sec_cd=1)은 "생략", 지출은 부여된 rcp_no(없으면 빈칸).
 *  화면 뷰어·HWPX 회계장부·과목별 수입지출부 Excel 등 "직접 렌더" 사이트 공용(income→생략 결정 SSOT).
 *  지출에 결제방법 등 추가 포맷이 필요한 엑셀 빌더는 formatRcpNo를 쓰므로 이 헬퍼 대신
 *  RECEIPT_OMITTED_LABEL만 사용하고, 데이터 export(.db·제출 TSV)는 수입을 빈값으로 둔다(생략 라벨 아님). */
export function displayReceiptNo(
  incmSecCd: number | string | null | undefined,
  rcpNo: string | null | undefined,
): string {
  return Number(incmSecCd) === 1 ? RECEIPT_OMITTED_LABEL : (rcpNo ?? "");
}

/** 계정(자금원) 약자 — 후보자계정(cs_id=10) 4분류 + 코드명 첫 글자 폴백. */
const ACC_ABBR: Record<number, string> = { 84: "자", 85: "후", 82: "보", 83: "외" };

/** 후보 자금원 계정(cs_id=10) — 스킴 A 판정. funding-source SSOT와 동일 키. */
const CANDIDATE_FUND_ACC = new Set([82, 83, 84, 85]);

export function accountAbbr(accSecCd: number, accName?: string): string {
  return ACC_ABBR[accSecCd] ?? (accName?.trim()?.[0] ?? "");
}

/** 과목 약자 — 선거비용→비, 선거비용외(정치자금)→비외, 그 외 코드명 첫 글자 폴백.
 *  실제 코드명이 "선거비용외정치자금"(87)이라 includes로 매칭하되 "선거비용외"를 먼저 검사.
 *  스킴 A 선거비용("비")·스킴 C 폴백에서 사용. (선거비용외는 formatKey가 괄호 없이 처리.) */
export function itemAbbr(itemName: string | undefined | null): string {
  const n = (itemName ?? "").trim();
  if (n.includes("선거비용외")) return "비외";
  if (n.includes("선거비용")) return "비";
  return n ? n[0] : "";
}

/** 후원회 지출 과목 약자(스킴 B) — 후원금모금경비만 '모'(첫글자 '후' 아님), 그 외 첫 글자.
 *  실코드명 99/100은 "_기본경비" 접미사가 붙으나 첫 글자(인/사)는 동일. */
export function supporterExpenseAbbr(itemName: string | undefined | null): string {
  const n = (itemName ?? "").trim();
  if (!n) return "";
  if (n.includes("모금")) return "모";
  return n[0];
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
    const parsed = parseRcpNo(e.rcp_no);
    if (parsed) comboSeq.set(parsed.prefix, Math.max(comboSeq.get(parsed.prefix) ?? 0, parsed.seq));
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
  const accName = codeNames.acc[t.acc_sec_cd];
  const itemName = codeNames.item[t.item_sec_cd];

  // 스킴 A — 후보 자금원 계정(82/83/84/85)
  if (CANDIDATE_FUND_ACC.has(t.acc_sec_cd)) {
    const a = accountAbbr(t.acc_sec_cd, accName); // 자/후/보/외
    const it = itemName ?? "";
    if (it.includes("선거비용외")) return a; // 선거비용외 → 괄호 제거 (자-)
    if (it.includes("선거비용")) return `${a}(비)`; // 선거비용 → 자(비)-
    return `${a}(${itemAbbr(itemName)})`; // 방어 폴백(후보 기타 과목)
  }

  // 스킴 B — 후원회 지출 계정(acc_sec_cd=2 '지출')
  if (t.acc_sec_cd === 2) {
    return supporterExpenseAbbr(itemName); // 기/모/인/사/그
  }

  // 스킴 C — 후원회 수입(1)·기타 → 현행 폴백 유지
  return `${accountAbbr(t.acc_sec_cd, accName)}(${itemAbbr(itemName)})`;
}

/** rcp_no가 미부여(null/undefined/공백)인지. */
function isMissingRcpNo(v: unknown): boolean {
  return v == null || String(v).trim() === "";
}

/** rcp_no("자(비)-12") → {prefix:"자(비)", seq:12}. 형식 불일치면 null. 채번 파싱 SSOT.
 *  공백 정규화: 수기 입력의 앞뒤 공백("자(비)-1 ")이 파싱 실패→stale 오인→재채번되는 것을 방지. */
export function parseRcpNo(rcpNo: string | null | undefined): { prefix: string; seq: number } | null {
  const m = String(rcpNo ?? "").trim().match(/^(.+)-(\d+)$/);
  if (!m) return null;
  const seq = parseInt(m[2], 10);
  const prefix = m[1].trim();
  return !prefix || Number.isNaN(seq) ? null : { prefix, seq };
}

/** 행을 ReceiptTarget(채번 입력)으로 변환. */
function toReceiptTarget(r: Record<string, unknown>): ReceiptTarget {
  return {
    acc_book_id: Number(r.acc_book_id),
    acc_sec_cd: Number(r.acc_sec_cd),
    item_sec_cd: Number(r.item_sec_cd),
  };
}

/**
 * export/보고용 — 영수증번호 미부여·접두사 불일치 행에 **수입·지출 통합 스코프**로 채번(순수).
 *
 * 자료백업(export-sqlite)·재조정 뷰어가 「영수증 일괄생성」 실행 여부와 무관하게 항상 올바른
 * 영수증번호를 담도록, (계정×과목) 분할·정렬 후 행 집합에 적용한다. 빈 RCP_NO로 export되면
 * 윈도우 선관위 프로그램이 수입지출부 영수증일련번호를 단일 버킷으로 폴백 생성하는 문제를 회피한다.
 *
 * - **수입(incm_sec_cd=1)은 영수증번호 생략**(공식 선관위 양식·Fund_Data_*.db: 수입은 RCP_NO
 *   빈값으로 기록, 수입·지출부에 "생략" 표기 — [[RECEIPT_OMITTED_LABEL]]). 채번/보존 대상에서
 *   전면 제외하고 기존에 부여된 번호가 있으면 빈값으로 되돌린다. → 지출만 채번된다.
 *   (수입 표시 라벨 "생략"은 렌더 측[뷰어·엑셀·HWPX] 책임; 여기선 빈값으로만 둬 .db export가
 *   ground truth[수입 RCP_NO 빈값]와 일치하게 한다.)
 * - **(지출) 단일 스코프**. 접두사(키)는 각 행의 현재 (계정×과목) `formatKey` 기준.
 * - **보존(채번 안 함)**: rcp_no가 있고 접두사가 현재 행 `formatKey`와 일치(이동 안 한 수기·기존
 *   번호). 소급 재채번 금지 — 기존 rcp_no는 그대로 두고 접두사별 max+1부터 이어 부여.
 * - **채번 대상**: 지출(incm_sec_cd≠1) ∧ rcp_yn='Y' ∧ (rcp_no 없음 ∨ 접두사가 현재 계정과
 *   불일치[Pass1 재배분 이동조각이 원본 접두사를 물려받아 stale]). → 현재 계정 접두사로 max+1부터 재부여.
 *   (export-sqlite는 채번 전 추적컬럼[alloc_src_id]을 strip하므로, 이동조각 식별은 접두사 비교로 한다.)
 *   ⚠️ 보존/stale 판정은 `formatKey` 규칙이 시간에 불변임을 전제한다 — 스킴·약자 매핑을 바꾸면
 *   과거 정상 번호가 stale로 오판돼 보고 시점마다 재채번될 수 있다(규칙 변경 시 이 전제 재검토).
 * - 정렬 `acc_date → acc_sort_num → incm(수입 먼저) → acc_book_id`. rcp_no2(정수)는 전체 고유 순번.
 * - 입력 rows는 변경하지 않고 새 배열을 반환(immutable). 채번 대상 없으면 동일 참조 반환.
 *
 * @param rows 분할·정렬 후 acc_book 행(snake_case 키: incm_sec_cd, acc_sec_cd, item_sec_cd,
 *             rcp_yn, rcp_no, rcp_no2, acc_book_id, acc_date, acc_sort_num).
 * @param codeNames acc_sec_cd/item_sec_cd → 코드명(약자 매핑용).
 */
export function fillExportReceiptNumbers(
  rows: Record<string, unknown>[],
  codeNames: ReceiptCodeNames,
): Record<string, unknown>[] {
  // 보존(existing)·채번(targetRows) 분류. 수입(incm_sec_cd=1)은 영수증번호 생략 → 채번/보존 제외.
  const existing: { rcp_no: string | null; rcp_no2: number | null }[] = [];
  const targetRows: Record<string, unknown>[] = [];
  let incomeHasNumber = false; // 비울 기존 수입 번호 존재 여부(불변 최적화 판정용)
  for (const r of rows) {
    if (Number(r.incm_sec_cd) === 1) {
      // 수입: 채번/보존 제외. 기존 번호가 있으면 아래 map에서 비운다.
      if (!isMissingRcpNo(r.rcp_no)) incomeHasNumber = true;
      continue;
    }
    const wantNumber = String(r.rcp_yn ?? "") === "Y";
    if (!isMissingRcpNo(r.rcp_no)) {
      const cur = String(r.rcp_no);
      // 접두사가 현재 (계정×과목)과 일치하거나, 애초에 영수증 대상이 아니면 보존.
      if (!wantNumber || parseRcpNo(cur)?.prefix === formatKey(toReceiptTarget(r), codeNames)) {
        existing.push({ rcp_no: cur, rcp_no2: Number(r.rcp_no2) || 0 });
        continue;
      }
      // 접두사 불일치 + 영수증 대상 → 재채번(재배분 이동조각 stale).
      targetRows.push(r);
      continue;
    }
    if (wantNumber) targetRows.push(r);
  }

  // 채번 대상도, 비울 수입 번호도 없으면 원본 그대로 반환(불변 최적화).
  if (targetRows.length === 0 && !incomeHasNumber) return rows;

  // targetRows는 함수-로컬 신규 배열 → in-place 정렬 안전(입력 rows 불변은 아래 map이 보장).
  targetRows.sort(
    (a, b) =>
      String(a.acc_date ?? "").localeCompare(String(b.acc_date ?? "")) ||
      Number(a.acc_sort_num ?? 0) - Number(b.acc_sort_num ?? 0) ||
      Number(a.incm_sec_cd ?? 0) - Number(b.incm_sec_cd ?? 0) ||
      Number(a.acc_book_id ?? 0) - Number(b.acc_book_id ?? 0),
  );

  const assignmentById = new Map<number, ReceiptAssignment>();
  for (const a of assignReceiptNumbers(targetRows.map(toReceiptTarget), codeNames, existing)) {
    assignmentById.set(a.acc_book_id, a);
  }

  return rows.map((r) => {
    if (Number(r.incm_sec_cd) === 1) {
      // 수입: 영수증번호 생략 → 빈값으로(이미 빈값이면 원본 유지). 표시 "생략"은 렌더 측 책임.
      return isMissingRcpNo(r.rcp_no) ? r : { ...r, rcp_no: "", rcp_no2: 0 };
    }
    const a = assignmentById.get(Number(r.acc_book_id));
    return a ? { ...r, rcp_no: a.rcp_no, rcp_no2: a.rcp_no2 } : r;
  });
}
