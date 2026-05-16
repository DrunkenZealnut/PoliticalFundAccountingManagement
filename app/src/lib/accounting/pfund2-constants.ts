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

/** PFund2 export 모드 — Fund_Master.db / Fund_Data_N.db 호환 구분 */
export type Pfund2ExportMode = "full" | "master" | "data1" | "data2";

/** 모드별 다운로드 파일명. full 모드는 자체분(-YYYY).db 형식 별도. */
export function pfund2DownloadFilename(
  mode: Pfund2ExportMode,
  orgName: string,
  year?: string,
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
  }
}
