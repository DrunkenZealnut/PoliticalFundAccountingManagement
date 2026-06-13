import { describe, it, expect } from "vitest";
import {
  buildReceiptPrefix,
  assignReceiptNumbers,
  type EtcLookup,
  type ReceiptTarget,
} from "./receipt-no";

// codevalue.cv_etc 발췌 (실데이터)
const ETC: Record<number, string> = {
  84: "자", // 후보자등 자산 (cs_id=10)
  85: "후", // 후원회기부금
  86: "(비)-", // 선거비용 (cs_id=11)
  87: "-", // 선거비용외 정치자금
  3: "", // 보조금외 (계정, 약자 없음)
  4: "경상-", // 경상보조금 (cs_id=2)
  19: "비-", // 선거비용 (cs_id=3)
  26: "상-", // 상급당부보조금
  28: "상-", // 상급당부보조금외 (← 26과 동일 약자, 충돌)
};
const getEtc: EtcLookup = (id) => (id in ETC ? ETC[id] : null);

// 테스트 헬퍼: (acc, item) 쌍 배열 → ReceiptTarget[]
function targets(pairs: [number, number][]): ReceiptTarget[] {
  return pairs.map(([acc_sec_cd, item_sec_cd], i) => ({
    acc_book_id: i + 1,
    acc_sec_cd,
    item_sec_cd,
  }));
}
const nos = (t: ReceiptTarget[]) =>
  assignReceiptNumbers(t, getEtc).map((a) => a.rcp_no);

describe("buildReceiptPrefix", () => {
  it("후보자: 계정약자 + 과목약자 → 자(비)-", () => {
    expect(buildReceiptPrefix(84, 86, getEtc)).toBe("자(비)-");
    expect(buildReceiptPrefix(85, 86, getEtc)).toBe("후(비)-");
    expect(buildReceiptPrefix(84, 87, getEtc)).toBe("자-");
  });

  it("T5: 계정약자 없음 → 과목약자만", () => {
    expect(buildReceiptPrefix(3, 19, getEtc)).toBe("비-");
  });

  it("T4: 정당 보조금 → 경상-비-", () => {
    expect(buildReceiptPrefix(4, 19, getEtc)).toBe("경상-비-");
  });

  it("T9: 말미 하이픈 보장 (과목약자 없고 계정약자만)", () => {
    // 계정 84="자"(하이픈 없음), 과목 없음 → "자-"
    expect(buildReceiptPrefix(84, 999, getEtc)).toBe("자-");
  });

  it("T6: 약자 둘 다 없음 → 빈 접두사", () => {
    expect(buildReceiptPrefix(999, 998, getEtc)).toBe("");
  });
});

describe("assignReceiptNumbers", () => {
  it("T1: 후보자 동일 조합 → 자(비)-01,02,03", () => {
    expect(nos(targets([[84, 86], [84, 86], [84, 86]]))).toEqual([
      "자(비)-01",
      "자(비)-02",
      "자(비)-03",
    ]);
  });

  it("T2: 조합 전환 시 순번 리셋", () => {
    expect(
      nos(targets([[84, 86], [84, 86], [85, 86], [84, 87]])),
    ).toEqual(["자(비)-01", "자(비)-02", "후(비)-01", "자-01"]);
  });

  it("T3: prefix 충돌(상-) 시 한 시퀀스로 병합 — 번호 중복 없음", () => {
    // item 26/28 둘 다 "상-". 교차해도 상-01,02,03,04 연속.
    const out = nos(targets([[3, 26], [3, 28], [3, 26], [3, 28]]));
    expect(out).toEqual(["상-01", "상-02", "상-03", "상-04"]);
    expect(new Set(out).size).toBe(4); // 유일성
  });

  it("T5: 계정약자 없는 조합 → 비-01", () => {
    expect(nos(targets([[3, 19]]))).toEqual(["비-01"]);
  });

  it("T6: 약자 둘 다 없으면 접두사 없이 순번만", () => {
    expect(nos(targets([[999, 998], [999, 998]]))).toEqual(["01", "02"]);
  });

  it("T7: 100건↑ 자연 증가 (-99, -100)", () => {
    const t = targets(Array.from({ length: 101 }, () => [84, 86] as [number, number]));
    const out = assignReceiptNumbers(t, getEtc).map((a) => a.rcp_no);
    expect(out[98]).toBe("자(비)-99");
    expect(out[99]).toBe("자(비)-100");
    expect(out[100]).toBe("자(비)-101");
  });

  it("T8: rcp_no2 = 전역 처리순번 1..N", () => {
    const t = targets([[84, 86], [85, 86], [84, 87], [84, 86]]);
    const out = assignReceiptNumbers(t, getEtc);
    expect(out.map((a) => a.rcp_no2)).toEqual([1, 2, 3, 4]);
    // 같은 acc_book_id 유지
    expect(out.map((a) => a.acc_book_id)).toEqual([1, 2, 3, 4]);
  });

  it("빈 입력 → 빈 배열", () => {
    expect(assignReceiptNumbers([], getEtc)).toEqual([]);
  });
});
