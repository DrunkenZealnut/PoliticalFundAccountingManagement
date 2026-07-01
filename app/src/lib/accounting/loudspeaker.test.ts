import { describe, it, expect } from "vitest";
import { applyLoudspeakerAnchor, isLoudspeakerExpense } from "./loudspeaker";

interface Row {
  acc_book_id: number;
  incm_sec_cd: number;
  acc_sec_cd: number;
  item_sec_cd: number;
  acc_amt: number;
  content: string | null;
}
const row = (p: Partial<Row> & { acc_book_id: number }): Row => ({
  incm_sec_cd: 2, acc_sec_cd: 85, item_sec_cd: 87, acc_amt: 540000, content: "확성기 대여", ...p,
});

describe("applyLoudspeakerAnchor (Pass-L)", () => {
  it("LS1: 적요'확성기'+540,000 지출 → (84,86) 강제 + protectId", () => {
    const { rows, protectIds } = applyLoudspeakerAnchor([row({ acc_book_id: 1 })]);
    expect(rows[0].acc_sec_cd).toBe(84);
    expect(rows[0].item_sec_cd).toBe(86); // 원 87 → 86 교정
    expect(protectIds.has(1)).toBe(true);
  });

  it("LS2: 키워드만(금액 다름) → 비매칭", () => {
    const { rows, protectIds } = applyLoudspeakerAnchor([row({ acc_book_id: 1, acc_amt: 500000 })]);
    expect(rows[0].acc_sec_cd).toBe(85);
    expect(protectIds.size).toBe(0);
  });

  it("LS3: 금액만(키워드 없음) → 비매칭", () => {
    const { rows, protectIds } = applyLoudspeakerAnchor([row({ acc_book_id: 1, content: "현수막" })]);
    expect(rows[0].acc_sec_cd).toBe(85);
    expect(protectIds.size).toBe(0);
  });

  it("LS4: 수입(incm=1)이면 금액·키워드 맞아도 비매칭", () => {
    const { rows, protectIds } = applyLoudspeakerAnchor([row({ acc_book_id: 1, incm_sec_cd: 1 })]);
    expect(rows[0].acc_sec_cd).toBe(85);
    expect(protectIds.size).toBe(0);
  });

  it("LS5: content null 안전", () => {
    expect(isLoudspeakerExpense(row({ acc_book_id: 1, content: null }))).toBe(false);
  });
});
