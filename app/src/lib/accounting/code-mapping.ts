/**
 * 계정/과목 한글명을 SQLite CV_ID로 변환하는 매핑 유틸.
 *
 * 일괄등록 시 사용자가 입력한 한글 계정명("수입")/과목명("기명후원금")을
 * acc_book.acc_sec_cd / item_sec_cd / exp_sec_cd 정수 코드로 변환한다.
 *
 * 변환은 codevalue + acc_rel 테이블 데이터를 사용하며, 클라이언트/서버 양쪽에서 호출 가능.
 */

export interface CodeValueLike {
  cv_id: number;
  cs_id: number;
  cv_name: string;
}

export interface AccRelLike {
  org_sec_cd: number;
  incm_sec_cd: number;
  acc_sec_cd: number;
  item_sec_cd: number;
  exp_sec_cd: number;
  input_yn: string;
  acc_order: number;
}

export interface AccountCodes {
  acc_sec_cd: number;
  item_sec_cd: number;
  exp_sec_cd: number;
}

export interface CodeMappingContext {
  orgSecCd: number;
  incmSecCd: number;
}

export class CodeMappingError extends Error {
  readonly account: string;
  readonly subject: string;
  readonly context: CodeMappingContext;
  readonly reason: "account_not_found" | "subject_not_found" | "rel_not_found";

  constructor(
    account: string,
    subject: string,
    context: CodeMappingContext,
    reason: "account_not_found" | "subject_not_found" | "rel_not_found",
  ) {
    super(
      `코드 매핑 실패 [${reason}]: 계정="${account}", 과목="${subject}", ` +
        `orgSec=${context.orgSecCd}, incm=${context.incmSecCd}`,
    );
    this.name = "CodeMappingError";
    this.account = account;
    this.subject = subject;
    this.context = context;
    this.reason = reason;
  }
}

import { SUPPORTER_SEC_CDS, CANDIDATE_SEC_CDS } from "./organ-pair";

/**
 * CS_ID 의미:
 * - 1: 총괄계정 (수입/지출/이월)
 * - 2: 계정구분
 * - 3: 계정과목 (일반)
 * - 10: 후보자계정
 * - 11: 후보자과목
 * - 12: 후원회과목 (후원회 전용)
 */
const ACC_CS_PRIORITY = [1, 2, 10] as const;

function pickItemCsIds(orgSecCd: number): readonly number[] {
  if (SUPPORTER_SEC_CDS.has(orgSecCd)) return [12, 3] as const;
  if (CANDIDATE_SEC_CDS.has(orgSecCd)) return [11, 3] as const;
  return [3] as const;
}

/**
 * 한글 이름으로 CV_ID 찾기. CS_ID 우선순위 적용.
 */
function findCvIdByName(
  name: string,
  csIdPriority: readonly number[],
  codeValues: CodeValueLike[],
): number | null {
  for (const csId of csIdPriority) {
    const found = codeValues.find(
      (cv) => cv.cs_id === csId && cv.cv_name === name,
    );
    if (found) return found.cv_id;
  }
  return null;
}

/**
 * (orgSec, incm, account, subject) → SQLite 코드 ID 매핑.
 *
 * 1) account 이름 → CV_ID (총괄계정/후보자계정 우선)
 * 2) subject 이름 → CV_ID (후원회과목/후보자과목/일반과목 우선순위)
 * 3) acc_rel 조회: 정확히 1건 매칭되면 그 exp_sec_cd 사용
 * 4) 매칭 실패 시 CodeMappingError throw
 *
 * @throws CodeMappingError
 */
export function resolveAccountCodes(
  accountName: string,
  subjectName: string,
  context: CodeMappingContext,
  codeValues: CodeValueLike[],
  accRel: AccRelLike[],
): AccountCodes {
  // 1. account name → acc_sec_cd
  const accSecCd = findCvIdByName(accountName, ACC_CS_PRIORITY, codeValues);
  if (accSecCd == null) {
    throw new CodeMappingError(accountName, subjectName, context, "account_not_found");
  }

  // 2. subject name → item_sec_cd
  const itemCsIds = pickItemCsIds(context.orgSecCd);
  const itemSecCd = findCvIdByName(subjectName, itemCsIds, codeValues);
  if (itemSecCd == null) {
    throw new CodeMappingError(accountName, subjectName, context, "subject_not_found");
  }

  // 3. acc_rel lookup
  const matches = accRel
    .filter(
      (r) =>
        r.org_sec_cd === context.orgSecCd &&
        r.incm_sec_cd === context.incmSecCd &&
        r.acc_sec_cd === accSecCd &&
        r.item_sec_cd === itemSecCd &&
        r.input_yn === "Y",
    )
    .sort((a, b) => a.acc_order - b.acc_order);

  if (matches.length === 0) {
    throw new CodeMappingError(accountName, subjectName, context, "rel_not_found");
  }

  return {
    acc_sec_cd: accSecCd,
    item_sec_cd: itemSecCd,
    exp_sec_cd: matches[0].exp_sec_cd,
  };
}

/**
 * 안전한 매핑 시도. 실패 시 null 반환 (예외를 throw하지 않음).
 * 서버 안전망에서 사용.
 */
export function tryResolveAccountCodes(
  accountName: string,
  subjectName: string,
  context: CodeMappingContext,
  codeValues: CodeValueLike[],
  accRel: AccRelLike[],
): AccountCodes | null {
  try {
    return resolveAccountCodes(accountName, subjectName, context, codeValues, accRel);
  } catch {
    return null;
  }
}

export interface ReverseLookupResult {
  accountName: string | null;
  subjectName: string | null;
  expenseName: string | null;
}

/**
 * 역방향 매핑: (acc_sec_cd, item_sec_cd, exp_sec_cd) → 표시용 한글 이름.
 *
 * import 시점에 .db의 코드 ID를 화면 표시용 이름으로 변환할 때 사용.
 * 없는 코드는 null. 모든 필드가 null이어도 예외를 throw하지 않음 (UI 친화).
 */
export function reverseLookupNames(
  codes: { acc_sec_cd: number; item_sec_cd: number; exp_sec_cd: number },
  codeValues: CodeValueLike[],
): ReverseLookupResult {
  const findName = (cvId: number): string | null => {
    if (cvId === 0) return null;
    const found = codeValues.find((cv) => cv.cv_id === cvId);
    return found ? found.cv_name : null;
  };

  return {
    accountName: findName(codes.acc_sec_cd),
    subjectName: findName(codes.item_sec_cd),
    expenseName: findName(codes.exp_sec_cd),
  };
}
