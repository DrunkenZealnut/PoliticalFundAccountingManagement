/** acc_book 테이블에서 조회한 레코드의 최소 필드 */
interface AccRecord {
  incm_sec_cd: number; // 1=수입, 2=지출
  acc_sec_cd: number; // 계정코드
  item_sec_cd: number; // 과목코드
  acc_amt: number; // 금액
}

/**
 * 마이너스 수입 레코드를 양수 지출 레코드로 전환한다.
 *
 * 선관위 정치자금 회계관리 프로그램은 incm_sec_cd=1(수입)이면서
 * acc_amt < 0인 레코드를 지출(incm_sec_cd=2)로 분류한다.
 * 이 함수는 동일한 보정을 적용하여 선관위 보고서와의 정합성을 보장한다.
 *
 * 변환 규칙:
 *   - 조건: incm_sec_cd === 1 AND acc_amt < 0
 *   - 변환: incm_sec_cd → 2, acc_amt → Math.abs(acc_amt)
 *   - acc_sec_cd, item_sec_cd는 원본 유지
 */
export function adjustNegativeIncome<T extends AccRecord>(records: T[]): T[] {
  return records.map((r) => {
    if (r.incm_sec_cd === 1 && r.acc_amt < 0) {
      return { ...r, incm_sec_cd: 2, acc_amt: Math.abs(r.acc_amt) };
    }
    return r;
  });
}
