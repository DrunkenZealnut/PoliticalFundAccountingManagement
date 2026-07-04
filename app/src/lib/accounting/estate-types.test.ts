import { describe, it, expect } from "vitest";
import { estateAmount, sumEstateAmount, estateLabel } from "./estate-types";

describe("estateAmount / sumEstateAmount (재산 금액 SSOT = amt×qty)", () => {
  it("qty 미지정은 1로 간주", () => {
    expect(estateAmount({ amt: 1000 })).toBe(1000);
    expect(estateAmount({ amt: 1000, qty: null })).toBe(1000);
    expect(estateAmount({ amt: 1000, qty: undefined })).toBe(1000);
  });

  it("qty 반영 — settlement/recompute/export 가 동일 값을 내도록", () => {
    expect(estateAmount({ amt: 500, qty: 3 })).toBe(1500);
  });

  it("amt null/undefined 은 0", () => {
    expect(estateAmount({ amt: null })).toBe(0);
    expect(estateAmount({ amt: undefined, qty: 5 })).toBe(0);
  });

  it("합계는 각 행 amt×qty 의 합", () => {
    expect(
      sumEstateAmount([
        { amt: 1000, qty: 2 }, // 2000
        { amt: 500 }, // 500
        { amt: 300, qty: 3 }, // 900
      ]),
    ).toBe(3400);
  });

  it("빈 목록은 0", () => {
    expect(sumEstateAmount([])).toBe(0);
  });
});

describe("estateLabel", () => {
  it("정의된 코드는 구분명", () => {
    expect(estateLabel(47)).toBe("현금 및 예금");
    expect(estateLabel(49)).toBe("차입금");
  });
  it("미정의 코드는 코드값 문자열", () => {
    expect(estateLabel(999)).toBe("999");
  });
});
