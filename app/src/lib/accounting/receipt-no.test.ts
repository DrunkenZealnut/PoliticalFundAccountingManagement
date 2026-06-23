import { describe, it, expect } from "vitest";
import {
  accountAbbr,
  itemAbbr,
  supporterExpenseAbbr,
  formatReceiptNo,
  assignReceiptNumbers,
  fillExportReceiptNumbers,
  type ReceiptTarget,
  type ReceiptCodeNames,
} from "./receipt-no";

const NAMES: ReceiptCodeNames = {
  acc: {
    1: "수입", // 후원회 수입 계정
    2: "지출", // 후원회 지출 계정
    84: "후보자등자산", 85: "후원회기부금", 82: "보조금", 83: "보조금외지원금", 99: "기타계정",
  },
  item: {
    86: "선거비용", 87: "선거비용외정치자금", 50: "후원회기부금",
    // 후원회 수입 과목(cs_id=12)
    94: "기명후원금", 95: "익명후원금", 96: "그밖의수입",
    // 후원회 지출 과목(cs_id=12) — 실코드명(99/100은 "_기본경비" 접미사)
    97: "기부금", 98: "후원금모금경비", 99: "인건비_기본경비",
    100: "사무소설치운영비_기본경비", 101: "그밖의경비",
  },
};

describe("receipt-no 약자", () => {
  it("T-1 계정 약자 84/85/82/83 → 자/후/보/외", () => {
    expect(accountAbbr(84)).toBe("자");
    expect(accountAbbr(85)).toBe("후");
    expect(accountAbbr(82)).toBe("보");
    expect(accountAbbr(83)).toBe("외");
  });

  it("T-2 미정의 계정 → 코드명 첫 글자 폴백", () => {
    expect(accountAbbr(99, "기타계정")).toBe("기");
    expect(accountAbbr(100)).toBe(""); // 이름도 없으면 빈칸
  });

  it("T-3 과목 약자 선거비용/선거비용외 → 비/비외 (실코드명 '선거비용외정치자금' 포함)", () => {
    expect(itemAbbr("선거비용")).toBe("비");
    expect(itemAbbr("선거비용외")).toBe("비외");
    expect(itemAbbr("선거비용외정치자금")).toBe("비외"); // 실제 codevalue 87 코드명
  });

  it("T-4 미정의 과목 → 첫 글자 폴백", () => {
    expect(itemAbbr("후원회기부금")).toBe("후");
    expect(itemAbbr(null)).toBe("");
  });

  it("T-5 formatReceiptNo", () => {
    expect(formatReceiptNo("자", "비", 1)).toBe("자(비)-1");
  });

  it("T-10 supporterExpenseAbbr — 후원회 지출 과목 약자(모금→모, 그 외 첫 글자)", () => {
    expect(supporterExpenseAbbr("기부금")).toBe("기");
    expect(supporterExpenseAbbr("후원금모금경비")).toBe("모"); // 첫글자 '후' 아님
    expect(supporterExpenseAbbr("인건비_기본경비")).toBe("인");
    expect(supporterExpenseAbbr("사무소설치운영비_기본경비")).toBe("사");
    expect(supporterExpenseAbbr("그밖의경비")).toBe("그");
    expect(supporterExpenseAbbr(null)).toBe("");
  });
});

describe("assignReceiptNumbers", () => {
  const t = (id: number, acc: number, item: number): ReceiptTarget => ({ acc_book_id: id, acc_sec_cd: acc, item_sec_cd: item });

  it("T-6 조합별 순번 1부터 (자(비)-1·2 / 후(비)-1)", () => {
    const out = assignReceiptNumbers(
      [t(1, 84, 86), t(2, 84, 86), t(3, 85, 86)],
      NAMES,
      [],
    );
    expect(out[0].rcp_no).toBe("자(비)-1");
    expect(out[1].rcp_no).toBe("자(비)-2");
    expect(out[2].rcp_no).toBe("후(비)-1");
  });

  it("T-7 기존 조합 max+1 이어서", () => {
    const out = assignReceiptNumbers(
      [t(10, 84, 86)],
      NAMES,
      [{ rcp_no: "자(비)-3", rcp_no2: 3 }, { rcp_no: "후(비)-1", rcp_no2: 1 }],
    );
    expect(out[0].rcp_no).toBe("자(비)-4");
  });

  it("T-8 rcp_no2 전체 순번(기존 max+1부터, 중복 없음)", () => {
    const out = assignReceiptNumbers(
      [t(1, 84, 86), t(2, 85, 86)],
      NAMES,
      [{ rcp_no: "자(비)-5", rcp_no2: 5 }],
    );
    expect(out.map((r) => r.rcp_no2)).toEqual([6, 7]);
  });

  it("T-9 [스킴 A] 후보 선거비용외 → 자-1 (괄호 제거)", () => {
    const out = assignReceiptNumbers([t(1, 84, 87)], NAMES, []);
    expect(out[0].rcp_no).toBe("자-1");
  });

  it("수입 과목(첫 글자 폴백) 조합", () => {
    const out = assignReceiptNumbers([t(1, 85, 50)], NAMES, []);
    expect(out[0].rcp_no).toBe("후(후)-1"); // 후원회기부금 계정(후) + 후원회기부금 과목(후)
  });
});

describe("스킴별 키 생성 (assignReceiptNumbers)", () => {
  const t = (id: number, acc: number, item: number): ReceiptTarget => ({ acc_book_id: id, acc_sec_cd: acc, item_sec_cd: item });

  it("A-1 후보 선거비용 84/85/82/83 → 자(비)/후(비)/보(비)/외(비)", () => {
    const out = assignReceiptNumbers(
      [t(1, 84, 86), t(2, 85, 86), t(3, 82, 86), t(4, 83, 86)],
      NAMES,
      [],
    );
    expect(out.map((r) => r.rcp_no)).toEqual(["자(비)-1", "후(비)-1", "보(비)-1", "외(비)-1"]);
  });

  it("A-2 후보 선거비용외 84/85/82/83 → 자/후/보/외 (괄호 없음)", () => {
    const out = assignReceiptNumbers(
      [t(1, 84, 87), t(2, 85, 87), t(3, 82, 87), t(4, 83, 87)],
      NAMES,
      [],
    );
    expect(out.map((r) => r.rcp_no)).toEqual(["자-1", "후-1", "보-1", "외-1"]);
  });

  it("A-3 선거비용/외 혼합 → 키 분리·조합별 독립 순번", () => {
    const out = assignReceiptNumbers(
      [t(1, 84, 86), t(2, 84, 87), t(3, 84, 86), t(4, 84, 87)],
      NAMES,
      [],
    );
    // 자(비): 1·2 / 자: 1·2 (키가 달라 순번 독립)
    expect(out.map((r) => r.rcp_no)).toEqual(["자(비)-1", "자-1", "자(비)-2", "자-2"]);
  });

  it("B-1 후원회 지출 97/98/99/100/101 → 기/모/인/사/그", () => {
    const out = assignReceiptNumbers(
      [t(1, 2, 97), t(2, 2, 98), t(3, 2, 99), t(4, 2, 100), t(5, 2, 101)],
      NAMES,
      [],
    );
    expect(out.map((r) => r.rcp_no)).toEqual(["기-1", "모-1", "인-1", "사-1", "그-1"]);
  });

  it("B-2 후원금모금경비(98) → 모-1 (첫글자 '후' 회귀가드)", () => {
    const out = assignReceiptNumbers([t(1, 2, 98), t(2, 2, 98)], NAMES, []);
    expect(out.map((r) => r.rcp_no)).toEqual(["모-1", "모-2"]);
  });

  it("C-1 후원회 수입(acc=1) 94/95 → 현행 폴백 유지 수(기)/수(익)", () => {
    const out = assignReceiptNumbers([t(1, 1, 94), t(2, 1, 95)], NAMES, []);
    expect(out.map((r) => r.rcp_no)).toEqual(["수(기)-1", "수(익)-1"]);
  });
});

describe("fillExportReceiptNumbers (export 자동 채번)", () => {
  // export 직전 acc_book 행(snake_case). rcp_no 미부여 = "".
  const row = (
    id: number,
    incm: number,
    acc: number,
    item: number,
    rcpYn: string,
    rcpNo = "",
    extra: Record<string, unknown> = {},
  ): Record<string, unknown> => ({
    acc_book_id: id,
    incm_sec_cd: incm,
    acc_sec_cd: acc,
    item_sec_cd: item,
    rcp_yn: rcpYn,
    rcp_no: rcpNo,
    rcp_no2: 0,
    acc_date: extra.acc_date ?? "20260101", // 실제 acc_date는 항상 8자리 YYYYMMDD
    acc_sort_num: extra.acc_sort_num ?? id,
  });

  // Fund_Data_1(송파) 재현: 11건 지출(자[선거비용외]×1·보(비)×5·보[선거비용외]×1·자(비)×4).
  it("TC-1 재현: 4조합 혼합 지출 → 조합별 순번 (선거비용외 괄호 제거)", () => {
    const rows = [
      row(2, 2, 84, 87, "Y"), // 자 (선거비용외)
      row(5, 2, 82, 86, "Y"), // 보(비)
      row(6, 2, 82, 86, "Y"), // 보(비)
      row(10, 2, 82, 87, "Y"), // 보 (선거비용외)
      row(12, 2, 82, 86, "Y"), // 보(비)
      row(13, 2, 84, 86, "Y"), // 자(비)
      row(15, 2, 84, 86, "Y"), // 자(비)
      row(17, 2, 84, 86, "Y"), // 자(비)
      row(18, 2, 82, 86, "Y"), // 보(비)
      row(19, 2, 82, 86, "Y"), // 보(비)
      row(20, 2, 84, 86, "Y"), // 자(비)
    ];
    const out = fillExportReceiptNumbers(rows, NAMES);
    const byId = Object.fromEntries(out.map((r) => [r.acc_book_id, r.rcp_no]));
    expect(byId[2]).toBe("자-1"); // 선거비용외 괄호 제거
    expect([byId[5], byId[6], byId[12], byId[18], byId[19]]).toEqual([
      "보(비)-1", "보(비)-2", "보(비)-3", "보(비)-4", "보(비)-5",
    ]);
    expect(byId[10]).toBe("보-1"); // 선거비용외 괄호 제거
    expect([byId[13], byId[15], byId[17], byId[20]]).toEqual([
      "자(비)-1", "자(비)-2", "자(비)-3", "자(비)-4",
    ]);
  });

  it("TC-8 후원회 지출(acc=2) export 채번 → 기/모/인/사/그", () => {
    const rows = [
      row(1, 2, 2, 97, "Y"), // 기부금
      row(2, 2, 2, 98, "Y"), // 후원금모금경비 → 모
      row(3, 2, 2, 99, "Y"), // 인건비
      row(4, 2, 2, 100, "Y"), // 사무소설치운영비
      row(5, 2, 2, 101, "Y"), // 그밖의경비
    ];
    const out = fillExportReceiptNumbers(rows, NAMES);
    const byId = Object.fromEntries(out.map((r) => [r.acc_book_id, r.rcp_no]));
    expect([byId[1], byId[2], byId[3], byId[4], byId[5]]).toEqual([
      "기-1", "모-1", "인-1", "사-1", "그-1",
    ]);
  });

  it("TC-2 미부여분만 — 기존 조합 max+1부터", () => {
    const rows = [
      row(1, 2, 82, 86, "Y", "보(비)-1"),
      row(2, 2, 82, 86, "Y", "보(비)-2"),
      row(3, 2, 82, 86, "Y"), // 미부여 → 보(비)-3
    ];
    const out = fillExportReceiptNumbers(rows, NAMES);
    expect(out.find((r) => r.acc_book_id === 1)?.rcp_no).toBe("보(비)-1"); // 보존
    expect(out.find((r) => r.acc_book_id === 2)?.rcp_no).toBe("보(비)-2"); // 보존
    expect(out.find((r) => r.acc_book_id === 3)?.rcp_no).toBe("보(비)-3");
  });

  it("TC-3 통합 스코프 — 수입/지출 공통 채번·rcp_no2 전체 순번", () => {
    const rows = [
      row(1, 1, 85, 50, "Y"), // 수입 후(후)-1
      row(2, 1, 85, 50, "Y"), // 수입 후(후)-2
      row(3, 2, 84, 86, "Y"), // 지출 자(비)-1
    ];
    const out = fillExportReceiptNumbers(rows, NAMES);
    const inc = out.filter((r) => r.incm_sec_cd === 1);
    const exp = out.filter((r) => r.incm_sec_cd === 2);
    // 접두사가 다르면 rcp_no는 그대로지만, rcp_no2(정수)는 통합 전체 순번
    expect(inc.map((r) => r.rcp_no)).toEqual(["후(후)-1", "후(후)-2"]);
    expect(inc.map((r) => r.rcp_no2)).toEqual([1, 2]);
    expect(exp.map((r) => r.rcp_no)).toEqual(["자(비)-1"]);
    expect(exp.map((r) => r.rcp_no2)).toEqual([3]); // 통합 스코프 — 수입 뒤를 이어 3
  });

  it("TC-9 통합 스코프 — 수입이 지출 수기번호와 충돌하지 않음", () => {
    // 지출엔 수기번호(자(비)-1·2), 수입(자산이 선거비용으로 재분류된 행)은 번호 없음.
    const rows = [
      row(1, 2, 84, 86, "Y", "자(비)-1"), // 지출 수기(보존)
      row(2, 2, 84, 86, "Y", "자(비)-2"), // 지출 수기(보존)
      row(3, 1, 84, 86, "Y"), // 수입 자산(선거비용) 미부여 → 자(비)-3
    ];
    const out = fillExportReceiptNumbers(rows, NAMES);
    const byId = Object.fromEntries(out.map((r) => [r.acc_book_id, r.rcp_no]));
    expect(byId[1]).toBe("자(비)-1"); // 보존
    expect(byId[2]).toBe("자(비)-2"); // 보존
    expect(byId[3]).toBe("자(비)-3"); // 수입이 지출 max 이어서 — 충돌 0 (구: 자(비)-1 중복)
  });

  it("TC-10 stale 이동조각 — 접두사가 현재 계정과 다르면 현재 계정으로 재채번", () => {
    // Pass1 재배분: 후원회기부금(85) 인형탈대여가 후보자자산(84)·보조금외(83)로 이동.
    // 이동조각이 원본 영수증번호 '후(비)-10'을 그대로 물려받음 → 현재 계정 접두사로 교정.
    const rows = [
      row(1, 2, 85, 86, "Y", "후(비)-10"), // slice0(후원회기부금, 접두사 정합) 보존
      row(2, 2, 84, 86, "Y", "후(비)-10"), // 이동조각: 현재 84(자(비)) → 재채번
      row(3, 2, 83, 86, "Y", "후(비)-10"), // 이동조각: 현재 83(외(비)) → 재채번
    ];
    const out = fillExportReceiptNumbers(rows, NAMES);
    const byId = Object.fromEntries(out.map((r) => [r.acc_book_id, r.rcp_no]));
    expect(byId[1]).toBe("후(비)-10"); // 접두사 정합 → 보존
    expect(byId[2]).toBe("자(비)-1"); // 84 계정 접두사로 재채번
    expect(byId[3]).toBe("외(비)-1"); // 83 계정 접두사로 재채번
    // 중복 0 — 세 행 모두 고유
    expect(new Set(out.map((r) => r.rcp_no)).size).toBe(3);
  });

  it("TC-11 공백 포함 수기번호도 접두사 정합이면 보존(재채번 안 함)", () => {
    // "자(비)-1 " 후행 공백 — trim 없이 파싱하면 stale 오인 → 잘못 재채번되던 회귀(CodeRabbit)
    const rows = [
      row(1, 2, 84, 86, "Y", "자(비)-1 "), // 후행 공백 수기 → 보존
      row(2, 2, 84, 86, "Y"), // 미부여 → max(1)+1 = 자(비)-2
    ];
    const out = fillExportReceiptNumbers(rows, NAMES);
    const byId = Object.fromEntries(out.map((r) => [r.acc_book_id, r.rcp_no]));
    expect(byId[1]).toBe("자(비)-1 "); // 원본 보존(재채번 안 됨)
    expect(byId[2]).toBe("자(비)-2"); // 공백 번호도 max 산출에 반영
  });

  it("TC-4 no-op — rcp_yn='N' 또는 이미 채워짐 → 입력==출력", () => {
    const rows = [
      row(1, 2, 84, 86, "N"), // 영수증 아님
      row(2, 2, 84, 86, "Y", "자(비)-1"), // 이미 부여
    ];
    const out = fillExportReceiptNumbers(rows, NAMES);
    expect(out).toBe(rows); // 동일 참조 반환(변경 없음)
  });

  it("TC-5 immutability — 입력 배열/객체 미변형", () => {
    const rows = [row(1, 2, 84, 86, "Y")];
    const snapshot = { ...rows[0] };
    const out = fillExportReceiptNumbers(rows, NAMES);
    expect(rows[0]).toEqual(snapshot); // 원본 rcp_no="" 유지
    expect(out[0]).not.toBe(rows[0]); // 새 객체
    expect(out[0].rcp_no).toBe("자(비)-1");
  });

  it("TC-6 정렬 — acc_date·acc_sort_num 역순 입력도 날짜순 순번", () => {
    const rows = [
      row(1, 2, 84, 86, "Y", "", { acc_date: "20260103", acc_sort_num: 3 }),
      row(2, 2, 84, 86, "Y", "", { acc_date: "20260101", acc_sort_num: 1 }),
      row(3, 2, 84, 86, "Y", "", { acc_date: "20260102", acc_sort_num: 2 }),
    ];
    const out = fillExportReceiptNumbers(rows, NAMES);
    const byId = Object.fromEntries(out.map((r) => [r.acc_book_id, r.rcp_no]));
    expect(byId[2]).toBe("자(비)-1"); // 0101
    expect(byId[3]).toBe("자(비)-2"); // 0102
    expect(byId[1]).toBe("자(비)-3"); // 0103
  });

  it("TC-7 코드명 폴백 — 미정의 acc_sec_cd도 throw 없이 동작", () => {
    const rows = [row(1, 2, 100, 86, "Y")]; // 100=미정의 계정, 이름도 없음
    expect(() => fillExportReceiptNumbers(rows, NAMES)).not.toThrow();
    const out = fillExportReceiptNumbers(rows, NAMES);
    expect(out[0].rcp_no).toBe("(비)-1"); // 계정 약자 빈문자 + 과목 비
  });
});
