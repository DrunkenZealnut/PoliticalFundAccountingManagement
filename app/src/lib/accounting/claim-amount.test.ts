import { describe, it, expect } from "vitest";
import { claimAmount } from "./claim-amount";

describe("claimAmount — 보전청구액 SSOT", () => {
  it("claim_amt 가 있으면 그 값(실지출과 달라도)", () => {
    expect(claimAmount({ claim_amt: 252323, acc_amt: 546700 })).toBe(252323);
  });
  it("claim_amt 가 NULL 이면 acc_amt fallback", () => {
    expect(claimAmount({ claim_amt: null, acc_amt: 313885 })).toBe(313885);
  });
  it("claim_amt 미지정(undefined)이면 acc_amt fallback", () => {
    expect(claimAmount({ acc_amt: 100000 })).toBe(100000);
  });
  it("claim_amt 0 은 청구 0원으로 존중(fallback 아님)", () => {
    expect(claimAmount({ claim_amt: 0, acc_amt: 50000 })).toBe(0);
  });
});
