import { describe, it, expect } from "vitest";
import { isAccDateInOrgPeriod, orgValidRange, electionCycleOf } from "./acc-period";

// 2022 후보자 org 기간(실제 org 9): 이월 2021 ~ 회계 2022
const p2022 = { pre_acc_from: "20210101", acc_from: "20220419", acc_to: "20220621" };
// 2026 후원회 org(실제 org 10)
const p2026 = { pre_acc_from: "20250101", acc_from: "20260101", acc_to: "20261231" };

describe("isAccDateInOrgPeriod", () => {
  it("기간 내 → ok", () => {
    expect(isAccDateInOrgPeriod("20220501", p2022).ok).toBe(true);
  });
  it("실제 혼입 케이스: 2026 거래가 2022 org 기간 밖 → ok:false(after)", () => {
    const r = isAccDateInOrgPeriod("20260602", p2022);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("after");
    expect(r.hi).toBe("20220621");
  });
  it("하한 이전 → before", () => {
    expect(isAccDateInOrgPeriod("20200101", p2022)).toMatchObject({ ok: false, reason: "before" });
  });
  it("경계일(=acc_to) 포함 → ok", () => {
    expect(isAccDateInOrgPeriod("20220621", p2022).ok).toBe(true);
  });
  it("이월기간(pre_acc) 내 거래 허용 → ok", () => {
    expect(isAccDateInOrgPeriod("20211215", p2022).ok).toBe(true);
  });
  it("기간 정보 없으면 검증 skip(통과)", () => {
    expect(isAccDateInOrgPeriod("20990101", { acc_from: null, acc_to: null }).ok).toBe(true);
  });
  it("거래일 형식 이상이면 skip(통과 — 다른 검증에 위임)", () => {
    expect(isAccDateInOrgPeriod("2026-06-02", p2026).ok).toBe(true);
    expect(isAccDateInOrgPeriod("", p2026).ok).toBe(true);
  });
  it("2026 거래는 2026 org 기간 내 → ok", () => {
    expect(isAccDateInOrgPeriod("20260602", p2026).ok).toBe(true);
  });
});

describe("orgValidRange", () => {
  it("pre_acc_from 우선 하한", () => {
    expect(orgValidRange(p2022)).toEqual({ lo: "20210101", hi: "20220621" });
  });
  it("pre_acc 없으면 acc_from 하한", () => {
    expect(orgValidRange({ acc_from: "20260101", acc_to: "20261231" })).toEqual({
      lo: "20260101",
      hi: "20261231",
    });
  });
  it("기간 불완전 → null", () => {
    expect(orgValidRange({ acc_from: "20260101" })).toBeNull();
  });
});

describe("electionCycleOf", () => {
  it("acc_from 연도 파생", () => {
    expect(electionCycleOf(p2022)).toBe("2022");
    expect(electionCycleOf(p2026)).toBe("2026");
  });
  it("없으면 null", () => {
    expect(electionCycleOf({ acc_to: "20261231" })).toBeNull();
  });
});
