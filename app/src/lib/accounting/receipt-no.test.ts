import { describe, it, expect } from "vitest";
import {
  accountAbbr,
  itemAbbr,
  formatReceiptNo,
  assignReceiptNumbers,
  fillExportReceiptNumbers,
  type ReceiptTarget,
  type ReceiptCodeNames,
} from "./receipt-no";

const NAMES: ReceiptCodeNames = {
  acc: { 84: "후보자등자산", 85: "후원회기부금", 82: "보조금", 83: "보조금외지원금", 99: "기타계정" },
  item: { 86: "선거비용", 87: "선거비용외정치자금", 50: "후원회기부금" },
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

  it("T-9 선거비용외 → 자(비외)-1", () => {
    const out = assignReceiptNumbers([t(1, 84, 87)], NAMES, []);
    expect(out[0].rcp_no).toBe("자(비외)-1");
  });

  it("수입 과목(첫 글자 폴백) 조합", () => {
    const out = assignReceiptNumbers([t(1, 85, 50)], NAMES, []);
    expect(out[0].rcp_no).toBe("후(후)-1"); // 후원회기부금 계정(후) + 후원회기부금 과목(후)
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

  // Fund_Data_1(송파) 재현: 11건 지출(자(비외)×1·보(비)×5·보(비외)×1·자(비)×4).
  it("TC-1 재현: 4조합 혼합 지출 → 조합별 순번", () => {
    const rows = [
      row(2, 2, 84, 87, "Y"), // 자(비외)
      row(5, 2, 82, 86, "Y"), // 보(비)
      row(6, 2, 82, 86, "Y"), // 보(비)
      row(10, 2, 82, 87, "Y"), // 보(비외)
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
    expect(byId[2]).toBe("자(비외)-1");
    expect([byId[5], byId[6], byId[12], byId[18], byId[19]]).toEqual([
      "보(비)-1", "보(비)-2", "보(비)-3", "보(비)-4", "보(비)-5",
    ]);
    expect(byId[10]).toBe("보(비외)-1");
    expect([byId[13], byId[15], byId[17], byId[20]]).toEqual([
      "자(비)-1", "자(비)-2", "자(비)-3", "자(비)-4",
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

  it("TC-3 incm 스코프 분리 — 수입/지출 독립 채번·rcp_no2 스코프별", () => {
    const rows = [
      row(1, 1, 85, 50, "Y"), // 수입 후(후)-1
      row(2, 1, 85, 50, "Y"), // 수입 후(후)-2
      row(3, 2, 84, 86, "Y"), // 지출 자(비)-1
    ];
    const out = fillExportReceiptNumbers(rows, NAMES);
    const inc = out.filter((r) => r.incm_sec_cd === 1);
    const exp = out.filter((r) => r.incm_sec_cd === 2);
    expect(inc.map((r) => r.rcp_no)).toEqual(["후(후)-1", "후(후)-2"]);
    expect(inc.map((r) => r.rcp_no2)).toEqual([1, 2]);
    expect(exp.map((r) => r.rcp_no)).toEqual(["자(비)-1"]);
    expect(exp.map((r) => r.rcp_no2)).toEqual([1]); // 스코프별 독립 순번
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
