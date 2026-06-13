/**
 * 영수증(증빙서) 번호 생성 — 계정·과목 약자 접두사 + 2자리 순번.
 *
 * 예) 후보자등 자산(cv_etc="자") + 선거비용(cv_etc="(비)-") → "자(비)-01"
 *
 * 약자는 codevalue.cv_etc(SSOT)에서 온다. 클라이언트는 useCodeValues,
 * 서버는 codevalue 조회로 EtcLookup 을 구성해 주입한다(동일 로직 공유).
 * 설계: docs/02-design/features/receipt-no-format.design.md
 */

/** cv_id → cv_etc(약자) 조회. 없으면 null */
export type EtcLookup = (cvId: number) => string | null;

export interface ReceiptTarget {
  acc_book_id: number;
  acc_sec_cd: number;
  item_sec_cd: number;
}

export interface ReceiptAssignment {
  acc_book_id: number;
  rcp_no: string; // "자(비)-01"
  rcp_no2: number; // 1..N 전역 순번
}

/**
 * 계정 약자 + 과목 약자 접두사. 말미 하이픈 1개를 보장한다.
 * 둘 다 약자가 없으면 "" 반환(접두사 생략, 순번만 부여 — fallback).
 *
 * cv_etc 는 PFund2 영수증 약자 체계를 그대로 담은 SSOT 이므로 가공하지 않는다.
 * (지출 과목 약자는 모두 "-"로 끝나 자연히 "자(비)-" 처럼 완성됨)
 */
export function buildReceiptPrefix(
  accSecCd: number,
  itemSecCd: number,
  getEtc: EtcLookup,
): string {
  const acc = getEtc(accSecCd) ?? "";
  const item = getEtc(itemSecCd) ?? "";
  const raw = acc + item;
  if (raw === "") return "";
  return raw.endsWith("-") ? raw : `${raw}-`;
}

/**
 * acc_date·acc_sort_num 으로 정렬된 targets 에 prefix 그룹별 순번을 부여한다.
 * - 그룹 키 = prefix 문자열(같은 약자 과목은 한 시퀀스로 묶어 번호 중복 방지)
 * - 순번은 그룹별 1부터, 2자리 zero-pad(100↑은 자연 증가)
 * - rcp_no2 = 전역 처리순번 1..N (목록 정렬 안정성용)
 *
 * 순수 함수: 입력 순서를 그대로 처리순서로 사용한다(정렬은 호출측 책임).
 */
export function assignReceiptNumbers(
  targets: ReceiptTarget[],
  getEtc: EtcLookup,
): ReceiptAssignment[] {
  const counters = new Map<string, number>();
  return targets.map((t, idx) => {
    const prefix = buildReceiptPrefix(t.acc_sec_cd, t.item_sec_cd, getEtc);
    const n = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, n);
    const seq = String(n).padStart(2, "0");
    return {
      acc_book_id: t.acc_book_id,
      rcp_no: `${prefix}${seq}`,
      rcp_no2: idx + 1,
    };
  });
}
