import { describe, it, expect } from "vitest";
import { availableAsOf, previewDraft, type AsOfRow } from "./funding-balance-asof";

let _id = 0;
function r(p: Partial<AsOfRow>): AsOfRow {
  return {
    acc_book_id: ++_id,
    acc_sec_cd: 85,
    incm_sec_cd: 1,
    acc_date: "20260501",
    acc_time: null,
    acc_amt: 0,
    ...p,
  };
}
const inc = (src: number, date: string, amt: number, extra: Partial<AsOfRow> = {}) =>
  r({ incm_sec_cd: 1, acc_sec_cd: src, acc_date: date, acc_amt: amt, ...extra });
const exp = (src: number, date: string, amt: number, extra: Partial<AsOfRow> = {}) =>
  r({ incm_sec_cd: 2, acc_sec_cd: src, acc_date: date, acc_amt: amt, ...extra });

describe("availableAsOf", () => {
  it("A1: 입력일 이전 수입만 → 가용 = 수입합", () => {
    const rows = [inc(85, "20260501", 1000), inc(85, "20260503", 500)];
    expect(availableAsOf(rows, "20260505")[85]).toBe(1500);
  });

  it("A2: 입력일 이후 수입은 미반영(as-of)", () => {
    const rows = [inc(85, "20260501", 1000), inc(85, "20260601", 9999)];
    expect(availableAsOf(rows, "20260510")[85]).toBe(1000); // 6/1 입금 제외
  });

  it("A3: 환급(음수 지출) → 가용 복원", () => {
    const rows = [inc(85, "20260501", 1000), exp(85, "20260502", -300)]; // 환급 +300
    expect(availableAsOf(rows, "20260503")[85]).toBe(1300);
  });

  it("A4: excludeAccBookId(수정) → 자기 행 제외", () => {
    const rows = [inc(85, "20260501", 1000), exp(85, "20260502", 400, { acc_book_id: 777 })];
    expect(availableAsOf(rows, "20260503")[85]).toBe(600);
    expect(availableAsOf(rows, "20260503", { excludeAccBookId: 777 })[85]).toBe(1000);
  });

  it("A5: 같은 날짜 — asOfTime 미지정이면 그 날 전체 포함, 지정 시 시각 이하만", () => {
    const rows = [
      inc(85, "20260502", 1000, { acc_time: "0900" }),
      exp(85, "20260502", 200, { acc_time: "1500" }),
    ];
    expect(availableAsOf(rows, "20260502")[85]).toBe(800); // 전체
    expect(availableAsOf(rows, "20260502", { asOfTime: "1000" })[85]).toBe(1000); // 0900만
  });

  it("지출 일반 차감 + 자금원 분리", () => {
    const rows = [inc(84, "20260501", 5000), exp(84, "20260502", 2000), inc(85, "20260501", 300)];
    const a = availableAsOf(rows, "20260505");
    expect(a[84]).toBe(3000);
    expect(a[85]).toBe(300);
  });
});

describe("previewDraft", () => {
  const rows = [
    inc(84, "20260501", 1_000_000),
    inc(85, "20260501", 180_000),
    inc(83, "20260501", 3_000_000),
  ];

  it("P1: projected = current − amt", () => {
    const p = previewDraft(rows, { acc_sec_cd: 85, acc_amt: 50_000, acc_date: "20260502" });
    expect(p.current).toBe(180_000);
    expect(p.projected).toBe(130_000);
    expect(p.willGoNegative).toBe(false);
  });

  it("P2: projected < 0 → willGoNegative true", () => {
    const p = previewDraft(rows, { acc_sec_cd: 85, acc_amt: 265_000, acc_date: "20260502" });
    expect(p.projected).toBe(-85_000);
    expect(p.willGoNegative).toBe(true);
  });

  it("P3: 환급 입력(amt ≤ 0) → 차감 안 함", () => {
    const p = previewDraft(rows, { acc_sec_cd: 85, acc_amt: -100_000, acc_date: "20260502" });
    expect(p.projected).toBe(180_000); // current 그대로
    expect(p.willGoNegative).toBe(false);
  });

  it("P4: bySource 내림차순(여유 자금원 추천)", () => {
    const p = previewDraft(rows, { acc_sec_cd: 85, acc_amt: 10_000, acc_date: "20260502" });
    expect(p.bySource.map((s) => s.accSecCd)).toEqual([83, 84, 85]); // 3M > 1M > 180k
  });

  it("P5: 자금원 미존재(82 거래 없음) → current 0, willGoNegative true", () => {
    const p = previewDraft(rows, { acc_sec_cd: 82, acc_amt: 1, acc_date: "20260502" });
    expect(p.current).toBe(0);
    expect(p.willGoNegative).toBe(true);
    expect(p.bySource.some((s) => s.accSecCd === 82)).toBe(true);
  });

  it("수정 중 자기 행 제외 후 미리보기", () => {
    const withSelf = [...rows, exp(85, "20260502", 100_000, { acc_book_id: 999 })];
    const p = previewDraft(withSelf, {
      acc_sec_cd: 85,
      acc_amt: 120_000,
      acc_date: "20260502",
      excludeAccBookId: 999,
    });
    expect(p.current).toBe(180_000); // 자기 100k 제외
    expect(p.projected).toBe(60_000);
  });
});
