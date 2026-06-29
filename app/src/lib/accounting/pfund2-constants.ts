/**
 * 선관위 정치자금회계관리 프로그램(PFund2) 호환에 필요한 reserved 상수.
 *
 * 출처: 실제 PFund2 v5의 Fund_Master.db / Fund_Data_*.db 분석 + 사용자 환경 실증.
 *
 * 본 파일은 export-sqlite / import-sqlite / 양식 생성 등 PFund2 호환 경로에서
 * 공통 참조한다. 매직 넘버를 코드에 흩뿌리지 않기 위함.
 */

/**
 * PFund2의 익명 후원자/지출처 reserved CUST_ID.
 *
 * - PFund2는 익명 후원금/익명 지출 처리 시 ACC_BOOK.CUST_ID = -999 행을 참조.
 * - CUSTOMER 테이블에 (CUST_ID=-999, NAME="익명") 행이 반드시 존재해야 함.
 * - 누락 시 PFund2 [자료 복구] 또는 직접 교체 후 화면에 customer/거래가 표시되지 않음.
 *
 * 사용처:
 *   - export-sqlite/route.ts: CUSTOMER insert 후 강제 보장
 *   - import-sqlite/route.ts: PFund2 .db의 -999 행은 우리 supabase에 별도 매핑
 */
export const PFUND2_ANONYMOUS_CUSTOMER_ID = -999 as const;

/** PFund2 표준 익명 customer 행. export 시 INSERT OR IGNORE로 보장. */
export const PFUND2_ANONYMOUS_CUSTOMER_ROW = {
  CUST_ID: PFUND2_ANONYMOUS_CUSTOMER_ID,
  CUST_SEC_CD: 63, // "기타" 또는 "익명" 분류 (PFund2 CODEVALUE 기준)
  NAME: "익명",
} as const;

/**
 * PFund2 호환 SQL: 익명 customer 강제 보장.
 *
 * INSERT OR IGNORE를 사용해 supabase에 이미 -999가 있어도 충돌 없음.
 * NOT NULL 컬럼만 명시 (CUST_ID, CUST_SEC_CD, NAME).
 */
export const PFUND2_ENSURE_ANONYMOUS_CUSTOMER_SQL =
  `INSERT OR IGNORE INTO CUSTOMER (CUST_ID, CUST_SEC_CD, NAME) ` +
  `VALUES (${PFUND2_ANONYMOUS_CUSTOMER_ID}, ${PFUND2_ANONYMOUS_CUSTOMER_ROW.CUST_SEC_CD}, '${PFUND2_ANONYMOUS_CUSTOMER_ROW.NAME}')`;

/**
 * PFund2 export ORG_ID 매핑 (organ-pair.ts와 일관).
 *
 * - 후보자(ORG_SEC_CD ∈ CANDIDATE_SEC_CDS): ORG_ID = 1
 * - 후원회(ORG_SEC_CD ∈ SUPPORTER_SEC_CDS): ORG_ID = 2
 * - 그 외(정당 등): ORG_ID = 1 (단일)
 */
export const PFUND2_CANDIDATE_ORG_ID = 1 as const;
export const PFUND2_SUPPORTER_ORG_ID = 2 as const;

/**
 * PFund2 export 모드 — Fund_Master.db / Fund_Data_N.db 호환 구분.
 * - restore: 단일기관 보관자료 스냅샷. 프로그램 [자료 복구]로 적재(Data 폴더 직접 교체 아님).
 */
export type Pfund2ExportMode = "full" | "master" | "data1" | "data2" | "restore";

/** 프로그램 보관자료 파일명용 타임스탬프(로컬시간 분해). */
export interface RestoreTimestamp {
  y: number;
  mo: number;
  d: number;
  h: number;
  mi: number;
  s: number;
}

const pad2 = (n: number): string => String(n).padStart(2, "0");

/**
 * 선관위 프로그램 네이티브 보관자료 파일명 모사 (순수).
 * 형식: `정치자금【 {기관명} 】보관자료_YYYY-MM-DD HH시MM분SS초.db`
 * - 대괄호 안 공백 포함(프로그램 [자료 복구] 목록 인식 위해).
 * - ts는 호출부가 명시(테스트 결정성). 라우트는 클라이언트/서버 로컬시간 전달.
 */
export function pfund2RestoreFilename(orgName: string, ts: RestoreTimestamp): string {
  return `정치자금【 ${orgName} 】보관자료_${ts.y}-${pad2(ts.mo)}-${pad2(ts.d)} ${pad2(ts.h)}시${pad2(ts.mi)}분${pad2(ts.s)}초.db`;
}

/** 현재 로컬시간 → RestoreTimestamp (라우트/클라이언트 전용; 순수함수 테스트에선 미사용). */
export function nowRestoreTimestamp(d: Date = new Date()): RestoreTimestamp {
  return {
    y: d.getFullYear(),
    mo: d.getMonth() + 1,
    d: d.getDate(),
    h: d.getHours(),
    mi: d.getMinutes(),
    s: d.getSeconds(),
  };
}

/** 모드별 다운로드 파일명. full=자체분(-YYYY).db, restore=보관자료 형식(타임스탬프). */
export function pfund2DownloadFilename(
  mode: Pfund2ExportMode,
  orgName: string,
  year?: string,
  ts?: RestoreTimestamp,
): string {
  switch (mode) {
    case "master":
      return "Fund_Master.db";
    case "data1":
      return "Fund_Data_1.db";
    case "data2":
      return "Fund_Data_2.db";
    case "full":
      return year ? `${orgName}(자체분-${year}).db` : `${orgName}(자체분).db`;
    case "restore":
      return pfund2RestoreFilename(orgName, ts ?? nowRestoreTimestamp());
  }
}
