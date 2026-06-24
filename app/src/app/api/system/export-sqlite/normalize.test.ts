import { describe, it, expect, vi } from "vitest";

// route.ts는 모듈 로드 시 createClient(url,...)를 실행하므로 import 이전에 유효 URL 주입
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
});

import { normalizeOfficialExpenseRow, stripAppOnlyAccBookColumns, stripAppOnlyOpinionColumns, selectReferencedCustomers } from "./route";

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
 * 원인 패턴: export의 SELECT *가 공식 PFund2 DDL(ACC_BOOK)에 없는 앱 전용 컬럼을 가져옴 →
 *   insertRows가 toUpper로 그 컬럼을 INSERT → "table ACC_BOOK has no column named X"로
 *   export 전체 실패. 현재 앱 전용 컬럼: claim_amt(scripts/015)·alloc_ 및 raw_ 추적(scripts/016).
 *   (과거 acc_time[scripts/014]이 이 함정을 일으켰고, acc-time-removal/scripts/019로 컬럼 자체를 DROP해 제거.)
 * 수정: export 직전 앱 전용 컬럼을 제거(공식 포맷 정렬).
 */
describe("stripAppOnlyAccBookColumns", () => {
  it("claim_amt 컬럼을 제거한다 (공식 ACC_BOOK 포맷엔 없음, scripts/015)", () => {
    const out = stripAppOnlyAccBookColumns({
      acc_book_id: 1,
      acc_date: "20260101",
      acc_amt: 100000,
      claim_amt: 50000,
      content: "현수막",
    });
    expect("claim_amt" in out).toBe(false);
    // 나머지 공식 컬럼은 보존
    expect(out.acc_book_id).toBe(1);
    expect(out.acc_date).toBe("20260101");
    expect(out.acc_amt).toBe(100000); // 실지출 acc_amt 는 보존(공식 컬럼)
    expect(out.content).toBe("현수막");
  });

  it("claim_amt가 null이어도 키 자체를 제거한다 (INSERT 컬럼 목록에서 빠져야 함)", () => {
    const out = stripAppOnlyAccBookColumns({ acc_book_id: 2, claim_amt: null });
    expect("claim_amt" in out).toBe(false);
  });

  it("claim_amt·alloc 추적 둘 다 제거한다", () => {
    const out = stripAppOnlyAccBookColumns({ acc_book_id: 3, claim_amt: 999, alloc_src_id: 130, acc_amt: 1000 });
    expect("claim_amt" in out).toBe(false);
    expect("alloc_src_id" in out).toBe(false);
    expect(out.acc_amt).toBe(1000); // 실지출 acc_amt 는 보존(공식 컬럼)
  });

  it("앱 전용 키가 없는 행은 동일 참조로 그대로 둔다", () => {
    const row = { acc_book_id: 4, content: "기부금" };
    expect(stripAppOnlyAccBookColumns(row)).toBe(row);
  });

  it("원본 행을 변형하지 않는다 (불변)", () => {
    const row = { acc_book_id: 4, claim_amt: 5000 };
    stripAppOnlyAccBookColumns(row);
    expect(row.claim_amt).toBe(5000); // 원본 유지
  });

  // scripts/016 과목 배분 추적 컬럼(앱 전용) — 공식 ACC_BOOK 포맷엔 없음
  it("alloc_* / raw_* 추적 컬럼을 제거한다 (scripts/016, 과목 배분)", () => {
    const out = stripAppOnlyAccBookColumns({
      acc_book_id: 1, acc_sec_cd: 85, item_sec_cd: 87, acc_amt: 528000,
      alloc_src_id: 130, alloc_seq: 1, raw_incm_sec_cd: 1, raw_acc_sec_cd: 85, raw_item_sec_cd: 86,
      raw_acc_amt: 3830000, alloc_gen: "20260619",
    });
    for (const k of ["alloc_src_id", "alloc_seq", "raw_incm_sec_cd", "raw_acc_sec_cd", "raw_item_sec_cd", "raw_acc_amt", "alloc_gen"]) {
      expect(k in out).toBe(false);
    }
    // 공식 컬럼은 보존
    expect(out.acc_sec_cd).toBe(85);
    expect(out.item_sec_cd).toBe(87);
    expect(out.acc_amt).toBe(528000);
  });

  it("alloc 컬럼만 있고 claim_amt 없는 행도 제거한다 (early-return 가드)", () => {
    // 이동분 신규행: claim_amt 없이 alloc_src_id만 있어도 INSERT 컬럼서 빠져야 함
    const out = stripAppOnlyAccBookColumns({ acc_book_id: 5, alloc_src_id: 130, alloc_seq: 1 });
    expect("alloc_src_id" in out).toBe(false);
    expect("alloc_seq" in out).toBe(false);
  });
});

describe("stripAppOnlyOpinionColumns", () => {
  it("감사자 2~5번 컬럼(position02~05/addr02~05/name02~05)을 제거한다 (공식 OPINION 포맷엔 1명뿐, scripts/020)", () => {
    const out = stripAppOnlyOpinionColumns({
      org_id: 1,
      position: "감사", addr: "서울시", name: "홍길동",
      position02: "감사", addr02: "부산시", name02: "이순신",
      name05: "강감찬",
    });
    // 1번 감사자(공식 컬럼)는 보존
    expect(out.position).toBe("감사");
    expect(out.addr).toBe("서울시");
    expect(out.name).toBe("홍길동");
    // 2~5번 감사자(앱 전용)는 제거 — 살아있으면 OPINION DDL에 POSITION02 없어 INSERT abort
    for (const k of ["position02", "addr02", "name02", "name05"]) {
      expect(k in out).toBe(false);
    }
  });

  it("값이 null이어도 키 자체를 제거한다 (INSERT 컬럼 목록에서 빠져야 함)", () => {
    const out = stripAppOnlyOpinionColumns({ org_id: 2, position02: null, addr02: null, name02: null });
    expect("position02" in out).toBe(false);
    expect("addr02" in out).toBe(false);
    expect("name02" in out).toBe(false);
  });

  it("감사자 2~5번 키가 없는 행은 동일 참조로 그대로 둔다 (불변, 1명 기관)", () => {
    const row = { org_id: 3, position: "감사", addr: "대구시", name: "유관순" };
    expect(stripAppOnlyOpinionColumns(row)).toBe(row);
  });

  it("원본 행을 변형하지 않는다 (불변)", () => {
    const row = { org_id: 4, name02: "이순신" };
    stripAppOnlyOpinionColumns(row);
    expect(row.name02).toBe("이순신"); // 원본 유지
  });
});

/**
 * 수입·지출 누락 회귀 테스트 (data1/data2 export 거래처 FK 고아).
 * 원인: CUSTOMER를 org_id로 필터 → 거래가 참조하는 org_id=NULL(공유)·타 org 거래처가
 *   빠져 ACC_BOOK이 FK 고아 → 윈도우 PFund2가 수입지출부 거래처 join 시 그 행 드롭
 *   → 계정별 수입/지출 누락.
 * 수정: 거래(ACC_BOOK/ACC_BOOK_BAK)가 참조하는 cust_id 기준으로 CUSTOMER 선정.
 */
describe("selectReferencedCustomers", () => {
  const customers = [
    { cust_id: 11, org_id: 11, name: "org11 거래처" },
    { cust_id: 42, org_id: 9, name: "오준석(타org)" },
    { cust_id: 182, org_id: null, name: "양지기획(공유 NULL)" },
    { cust_id: 999, org_id: 11, name: "미참조 거래처" },
  ];

  it("T-1 거래가 참조하는 cust_id만 포함한다", () => {
    const out = selectReferencedCustomers(customers, [{ cust_id: 11 }]);
    expect(out.map((c) => c.cust_id)).toEqual([11]);
  });

  it("T-2 org_id 무관(NULL·타org) 참조 거래처도 포함한다", () => {
    const out = selectReferencedCustomers(customers, [{ cust_id: 42 }, { cust_id: 182 }]);
    expect(out.map((c) => c.cust_id).sort((a, b) => a - b)).toEqual([42, 182]);
  });

  it("T-3 어떤 거래도 참조 안 한 거래처는 제외한다", () => {
    const out = selectReferencedCustomers(customers, [{ cust_id: 11 }, { cust_id: 42 }]);
    expect(out.some((c) => c.cust_id === 999)).toBe(false);
  });

  it("T-4 acc_book + acc_book_bak 참조 합집합", () => {
    const out = selectReferencedCustomers(customers, [{ cust_id: 11 }], [{ cust_id: 182 }]);
    expect(out.map((c) => c.cust_id).sort((a, b) => a - b)).toEqual([11, 182]);
  });

  it("T-5 빈 거래 → 빈 결과", () => {
    expect(selectReferencedCustomers(customers, [], [])).toEqual([]);
  });

  it("T-6 cust_id 누락/비숫자(NaN)는 매칭 제외 (export 무결성 가드)", () => {
    const custs = [
      { cust_id: 11, name: "정상" },
      { cust_id: null, name: "cust_id 없음" },
      { cust_id: "abc", name: "비숫자" },
    ];
    // 거래에도 cust_id 누락 행이 섞여 있음 → NaN 키가 생기면 안 됨
    const out = selectReferencedCustomers(custs, [{ cust_id: 11 }, { cust_id: undefined }, {}]);
    expect(out.map((c) => c.cust_id)).toEqual([11]); // null·"abc" 거래처는 NaN 오매칭 없이 제외
  });
});
