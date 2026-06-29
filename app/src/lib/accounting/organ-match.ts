/**
 * 사용자가 업로드한 프로그램 Fund_Master.db의 ORGAN 행에서, 현재 웹앱 기관에
 * 해당하는 **실제 프로그램 ORG_ID**를 찾는다.
 *
 * 배경: 선관위 윈도우 프로그램 [자료 복구]는 백업 ORGAN을 그 ORG_ID 그대로 INSERT한다
 * (재배정 없음). 기존 ORG_ID와 충돌하면 `UNIQUE constraint failed: ORGAN.ORG_ID`.
 * 프로그램은 기관마다 ORG_ID를 순차 부여(예: 후원회=3)하므로, restore export는 그
 * 실제 번호를 써야 한다. 우리는 원본 ORG_ID를 저장하지 않으므로 사용자의 master에서 읽는다.
 *
 * 순수 함수 — sql.js 파싱 결과(행 배열)만 받는다. (DB/IO 없음)
 */

export interface MasterOrganRow {
  ORG_ID: number;
  ORG_SEC_CD?: number | null;
  ORG_NAME?: string | null;
  REG_NUM?: string | null;
  USERID?: string | null;
}

export interface OrgMatchTarget {
  userid?: string | null;
  reg_num?: string | null;
  org_name?: string | null;
}

export type OrgMatchReason = "userid" | "reg_num" | "name" | "none" | "ambiguous";

export interface OrgMatchResult {
  /** 확정된 프로그램 ORG_ID. 매칭 실패/모호 시 null */
  orgId: number | null;
  reason: OrgMatchReason;
  /** ambiguous일 때 후보 행들(사용자 선택용) */
  candidates?: MasterOrganRow[];
}

/** 공백 제거 + 소문자(대소문자/공백 무시 비교용) */
function normLoose(s: string | null | undefined): string {
  return (s ?? "").toString().trim().replace(/\s+/g, "").toLowerCase();
}

/** 숫자만 남김(사업자/등록번호 하이픈 무시) */
function digitsOnly(s: string | null | undefined): string {
  return (s ?? "").toString().replace(/\D+/g, "");
}

/**
 * USERID → REG_NUM → ORG_NAME 순으로 매칭. 각 단계에서:
 *  - 정확히 1건 → 그 ORG_ID 반환(reason=해당 키)
 *  - 2건+ → ambiguous(후보 반환), 다음 키로 넘어가지 않고 즉시 반환
 *  - 0건 → 다음 키 시도
 * 모든 키 0건 → none.
 */
export function matchProgramOrgId(
  masterOrgans: readonly MasterOrganRow[],
  target: OrgMatchTarget,
): OrgMatchResult {
  const tUser = normLoose(target.userid);
  const tReg = digitsOnly(target.reg_num);
  const tName = normLoose(target.org_name);

  const tryKey = (
    reason: Exclude<OrgMatchReason, "none" | "ambiguous">,
    predicate: (r: MasterOrganRow) => boolean,
    enabled: boolean,
  ): OrgMatchResult | null => {
    if (!enabled) return null;
    const hits = masterOrgans.filter(predicate);
    if (hits.length === 1) return { orgId: hits[0].ORG_ID, reason };
    if (hits.length > 1) return { orgId: null, reason: "ambiguous", candidates: hits };
    return null;
  };

  const byUser = tryKey("userid", (r) => !!tUser && normLoose(r.USERID) === tUser, !!tUser);
  if (byUser) return byUser;

  const byReg = tryKey("reg_num", (r) => !!tReg && digitsOnly(r.REG_NUM) === tReg, !!tReg);
  if (byReg) return byReg;

  const byName = tryKey("name", (r) => !!tName && normLoose(r.ORG_NAME) === tName, !!tName);
  if (byName) return byName;

  return { orgId: null, reason: "none" };
}
