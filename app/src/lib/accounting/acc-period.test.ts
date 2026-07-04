import { describe, it, expect } from "vitest";
import {
  isAccDateInOrgPeriod,
  orgValidRange,
  electionCycleOf,
  currentCycleOf,
  isOldCycle,
  countOutOfPeriodRows,
} from "./acc-period";

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

describe("currentCycleOf", () => {
  it("최신 주기 반환 (2022·2026 → 2026)", () => {
    expect(currentCycleOf(["2022", "2026"])).toBe("2026");
  });
  it("null/빈값 무시", () => {
    expect(currentCycleOf([null, "2022", "", undefined, "2026"])).toBe("2026");
  });
  it("전부 없으면 null", () => {
    expect(currentCycleOf([null, "", undefined])).toBeNull();
    expect(currentCycleOf([])).toBeNull();
  });
  it("단일 주기", () => {
    expect(currentCycleOf(["2026"])).toBe("2026");
  });
});

describe("isOldCycle", () => {
  it("2022 < 2026 → 옛 주기", () => {
    expect(isOldCycle("2022", "2026")).toBe(true);
  });
  it("현 주기 = 최신이면 옛 주기 아님", () => {
    expect(isOldCycle("2026", "2026")).toBe(false);
  });
  it("하나라도 없으면 false(보수적 — 잠그지 않음)", () => {
    expect(isOldCycle(null, "2026")).toBe(false);
    expect(isOldCycle("2022", null)).toBe(false);
    expect(isOldCycle("", "")).toBe(false);
  });
});

describe("countOutOfPeriodRows (FR-07 산출물 주기 외 경고)", () => {
  // 2026 org: 이월 2025 ~ 회계 2026
  const p = { pre_acc_from: "20250101", acc_from: "20260101", acc_to: "20261231" };

  it("기간 내 거래만 있으면 count 0", () => {
    const r = countOutOfPeriodRows(
      [{ acc_date: "20260601" }, { acc_date: "20251215" }],
      p,
    );
    expect(r.count).toBe(0);
    expect(r.range).toEqual({ lo: "20250101", hi: "20261231" });
  });

  it("기간 밖(before/after) 거래를 세고 샘플을 담는다", () => {
    const r = countOutOfPeriodRows(
      [
        { acc_date: "20260601" }, // 내
        { acc_date: "20221231" }, // before(오연도 혼입)
        { acc_date: "20270101" }, // after
      ],
      p,
    );
    expect(r.count).toBe(2);
    expect(r.samples).toEqual([
      { acc_date: "20221231", reason: "before" },
      { acc_date: "20270101", reason: "after" },
    ]);
  });

  it("샘플은 sampleLimit 로 제한", () => {
    const rows = Array.from({ length: 10 }, () => ({ acc_date: "20221231" }));
    const r = countOutOfPeriodRows(rows, p, 3);
    expect(r.count).toBe(10);
    expect(r.samples).toHaveLength(3);
  });

  it("기간 정보 없으면 count 0(검증 skip)", () => {
    const r = countOutOfPeriodRows([{ acc_date: "20221231" }], { acc_from: null, acc_to: null });
    expect(r.count).toBe(0);
    expect(r.range).toBeNull();
  });

  it("형식 이상 거래일은 세지 않는다", () => {
    const r = countOutOfPeriodRows([{ acc_date: "2026-06-01" }, { acc_date: null }], p);
    expect(r.count).toBe(0);
  });
});
