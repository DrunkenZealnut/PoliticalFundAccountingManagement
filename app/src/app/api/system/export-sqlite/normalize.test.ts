import { describe, it, expect, vi } from "vitest";

// route.ts는 모듈 로드 시 createClient(url,...)를 실행하므로 import 이전에 유효 URL 주입
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
});

import { normalizeOfficialExpenseRow, stripAppOnlyAccBookColumns } from "./route";

/**
 * 지출부 미표시 버그 회귀 테스트.
 * 원인: 앱이 지출방법 코드("118")를 acc_ins_type(문자열)에 저장 → export 시 공식
 * ACC_INS_TYPE CHAR(2)에 3자리가 들어가 선관위 프로그램이 지출부 로드를 거부.
 * 수정: 지출방법 코드를 EXP_TYPE_CD(정수)로 이동하고 ACC_INS_TYPE을 비운다.
 */
describe("normalizeOfficialExpenseRow", () => {
  it("앱 지출행(acc_ins_type='118', exp_type_cd=-1)을 공식 포맷으로 변환한다", () => {
    const out = normalizeOfficialExpenseRow({
      incm_sec_cd: 2,
      acc_ins_type: "118",
      exp_type_cd: -1,
      content: "유세물품",
    });
    expect(out.acc_ins_type).toBeNull(); // CHAR(2) 초과 제거
    expect(out.exp_type_cd).toBe(118); // 지출방법 코드 이동(정수)
  });

  it("체크카드(585) 등 다른 3자리 지출방법도 이동한다", () => {
    const out = normalizeOfficialExpenseRow({ acc_ins_type: "585", exp_type_cd: -1 });
    expect(out.acc_ins_type).toBeNull();
    expect(out.exp_type_cd).toBe(585);
  });

  it("이미 공식 포맷(acc_ins_type 빈값, exp_type_cd=118)인 행은 그대로 둔다", () => {
    const row = { incm_sec_cd: 2, acc_ins_type: "", exp_type_cd: 118 };
    const out = normalizeOfficialExpenseRow(row);
    expect(out).toBe(row); // 동일 참조(무변경)
  });

  it("수입행(acc_ins_type 빈값)은 변경하지 않는다", () => {
    const row = { incm_sec_cd: 1, acc_ins_type: "", exp_type_cd: -1 };
    expect(normalizeOfficialExpenseRow(row)).toBe(row);
  });

  it("acc_ins_type이 null이면 변경하지 않는다", () => {
    const row = { incm_sec_cd: 2, acc_ins_type: null, exp_type_cd: -1 };
    expect(normalizeOfficialExpenseRow(row)).toBe(row);
  });

  it("2자리 이하 acc_ins_type은 CHAR(2)에 맞으므로 그대로 둔다", () => {
    const row = { acc_ins_type: "01", exp_type_cd: -1 };
    expect(normalizeOfficialExpenseRow(row)).toBe(row);
  });

  it("exp_type_cd가 이미 유효 코드면 acc_ins_type만 비우고 덮어쓰지 않는다", () => {
    const out = normalizeOfficialExpenseRow({ acc_ins_type: "118", exp_type_cd: 125 });
    expect(out.acc_ins_type).toBeNull();
    expect(out.exp_type_cd).toBe(125); // 기존 지출유형 보존
  });
});

/**
 * 제출파일(SQLite) 생성 실패 회귀 테스트.
 * 원인: scripts/014가 Supabase acc_book/acc_book_bak에 acc_time(CHAR(4)) 추가 →
 *   export의 SELECT *가 가져옴 → insertRows가 toUpper로 ACC_TIME 컬럼을 INSERT →
 *   공식 PFund2 DDL의 ACC_BOOK엔 ACC_TIME이 없어 "table ACC_BOOK has no column
 *   named ACC_TIME"로 export 전체 실패.
 * 수정: export 직전 앱 전용 acc_time 컬럼을 제거(공식 포맷 정렬).
 */
describe("stripAppOnlyAccBookColumns", () => {
  it("acc_time 컬럼을 제거한다 (공식 ACC_BOOK 포맷엔 없음)", () => {
    const out = stripAppOnlyAccBookColumns({
      acc_book_id: 1,
      acc_date: "20260101",
      acc_time: "1430",
      content: "유세물품",
    });
    expect("acc_time" in out).toBe(false);
    // 나머지 공식 컬럼은 보존
    expect(out.acc_book_id).toBe(1);
    expect(out.acc_date).toBe("20260101");
    expect(out.content).toBe("유세물품");
  });

  it("acc_time이 null이어도 키 자체를 제거한다 (INSERT 컬럼 목록에서 빠져야 함)", () => {
    const out = stripAppOnlyAccBookColumns({ acc_book_id: 2, acc_time: null });
    expect("acc_time" in out).toBe(false);
  });

  it("acc_time 키가 없는 행은 동일 참조로 그대로 둔다", () => {
    const row = { acc_book_id: 3, content: "기부금" };
    expect(stripAppOnlyAccBookColumns(row)).toBe(row);
  });

  it("원본 행을 변형하지 않는다 (불변)", () => {
    const row = { acc_book_id: 4, acc_time: "0900" };
    stripAppOnlyAccBookColumns(row);
    expect(row.acc_time).toBe("0900"); // 원본 유지
  });
});
