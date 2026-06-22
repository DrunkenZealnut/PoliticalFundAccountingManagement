import { describe, it, expect } from "vitest";
import {
  reconstructRawRows,
  planAllocationPersist,
  applyPlanInMemory,
  type AllocTrackedRow,
} from "./persist-allocation";
import { compareAccDateTime } from "./acc-book-sort";

/** AllocTrackedRow 헬퍼(추적컬럼 전부 NULL = raw 상태). */
function row(p: Partial<AllocTrackedRow> & { acc_book_id: number }): AllocTrackedRow {
  return {
    incm_sec_cd: 1,
    acc_sec_cd: 85,
    item_sec_cd: 86,
    acc_amt: 0,
    acc_date: "20260501",
    cust_id: 1,
    content: "x",
    rcp_no: null,
    rcp_no2: null,
    bigo: null,
    customer: null,
    alloc_src_id: null,
    alloc_seq: null,
    raw_incm_sec_cd: null,
    raw_acc_sec_cd: null,
    raw_item_sec_cd: null,
    raw_acc_amt: null,
    alloc_gen: null,
    ...p,
  };
}
const inc = (id: number, item: number, date: string, amt: number, src = 85) =>
  row({ acc_book_id: id, incm_sec_cd: 1, acc_sec_cd: src, item_sec_cd: item, acc_date: date, acc_amt: amt });
const exp = (id: number, item: number, date: string, amt: number, src = 85) =>
  row({ acc_book_id: id, incm_sec_cd: 2, acc_sec_cd: src, item_sec_cd: item, acc_date: date, acc_amt: amt });

function balances(rows: AllocTrackedRow[]) {
  const sorted = [...rows].sort(
    (a, b) => compareAccDateTime(a, b) || a.incm_sec_cd - b.incm_sec_cd || a.acc_book_id - b.acc_book_id,
  );
  const bal = new Map<string, number>();
  for (const r of sorted) {
    const k = `${r.acc_sec_cd}:${r.item_sec_cd}`;
    bal.set(k, (bal.get(k) ?? 0) + (r.incm_sec_cd === 1 ? r.acc_amt : -r.acc_amt));
  }
  return bal;
}
/** (acc_sec_cd,item_sec_cd,incm,amt) 다중집합 — raw 동일성 비교용. */
function signature(rows: AllocTrackedRow[]) {
  return rows
    .map((r) => `${r.acc_book_id}|${r.incm_sec_cd}|${r.acc_sec_cd}|${r.item_sec_cd}|${r.acc_amt}`)
    .sort();
}

const GEN = "20260619";

describe("persist-allocation", () => {
  it("P1: 1차 배분 — 적용 후 (계정×과목) 균형, slice0는 원 id 재사용·이동분은 alloc_src_id", () => {
    const current = [
      inc(1, 86, "20260430", 1000), // 86 수입 1000
      exp(2, 87, "20260501", 600), // 87 지출 → 86서 600 끌어옴(이동분 발생)
      exp(3, 86, "20260502", 300),
    ];
    const plan = planAllocationPersist(current, GEN);
    const applied = applyPlanInMemory(current, plan);
    const bal = balances(applied);
    expect(bal.get("85:87")).toBe(0);
    expect(bal.get("85:86")).toBe(100);
    // 수입 id=1이 분할: slice0(원 id=1, 86 잔류) + 이동분(신규, 87)
    expect(applied.some((r) => r.acc_book_id === 1 && r.item_sec_cd === 86)).toBe(true);
    const moved = applied.filter((r) => r.alloc_src_id === 1);
    expect(moved).toHaveLength(1);
    expect(moved[0].item_sec_cd).toBe(87);
    expect(moved[0].alloc_gen).toBe(GEN);
  });

  it("P2: 라운드트립 — 적용 후 reconstructRawRows가 원본 raw와 동일(가역)", () => {
    const current = [inc(1, 86, "20260430", 1000), exp(2, 87, "20260501", 600), exp(3, 86, "20260502", 300)];
    const before = signature(current);
    const applied = applyPlanInMemory(current, planAllocationPersist(current, GEN));
    const restored = reconstructRawRows(applied);
    expect(signature(restored)).toEqual(before);
  });

  it("P3: 멱등 — 2회 적용해도 (계정×과목) 잔액·raw 동일(이중 분할 없음)", () => {
    const current = [inc(1, 86, "20260430", 1000), exp(2, 87, "20260501", 600), exp(3, 86, "20260502", 300)];
    const applied1 = applyPlanInMemory(current, planAllocationPersist(current, GEN));
    const applied2 = applyPlanInMemory(applied1, planAllocationPersist(applied1, "20260620"));
    expect([...balances(applied2).entries()].sort()).toEqual([...balances(applied1).entries()].sort());
    expect(signature(reconstructRawRows(applied2))).toEqual(signature(reconstructRawRows(applied1)));
  });

  it("P4: 미변경 행은 추적컬럼 NULL(raw_* 미기록)", () => {
    const current = [inc(1, 86, "20260430", 1000), exp(2, 86, "20260501", 300)]; // 분할 없음
    const applied = applyPlanInMemory(current, planAllocationPersist(current, GEN));
    expect(applied.every((r) => r.raw_acc_amt == null && r.alloc_src_id == null)).toBe(true);
  });

  it("P5: 분할 시 slice0가 원 acc_book_id 보존(증빙 FK), 이동분은 rcp_no 상속", () => {
    const current = [
      row({ acc_book_id: 7, incm_sec_cd: 1, item_sec_cd: 86, acc_date: "20260430", acc_amt: 1000, rcp_no: "자-3", rcp_no2: 3 }),
      exp(8, 87, "20260501", 600),
    ];
    const applied = applyPlanInMemory(current, planAllocationPersist(current, GEN));
    const slice0 = applied.find((r) => r.acc_book_id === 7)!;
    expect(slice0.rcp_no).toBe("자-3"); // 원행 증빙·영수증 보존
    const moved = applied.find((r) => r.alloc_src_id === 7)!;
    expect(moved.rcp_no).toBe("자-3"); // 같은 물리 영수증 상속
    expect(moved.rcp_no2).toBe(3);
  });

  it("P6: Pass0 음수수입 — slice0가 지출로 정규화되고 raw_incm_sec_cd로 복원", () => {
    const current = [
      inc(1, 86, "20260501", 1000),
      row({ acc_book_id: 2, incm_sec_cd: 1, item_sec_cd: 86, acc_date: "20260502", acc_amt: -300 }), // 음수 수입
      exp(3, 86, "20260503", 200),
    ];
    const applied = applyPlanInMemory(current, planAllocationPersist(current, GEN));
    const flipped = applied.find((r) => r.acc_book_id === 2)!;
    expect(flipped.incm_sec_cd).toBe(2); // 지출로 정규화
    expect(flipped.acc_amt).toBe(300);
    expect(flipped.raw_incm_sec_cd).toBe(1); // 복원 정보
    expect(flipped.raw_acc_amt).toBe(-300);
    // 라운드트립 복원
    const restored = reconstructRawRows(applied).find((r) => r.acc_book_id === 2)!;
    expect(restored.incm_sec_cd).toBe(1);
    expect(restored.acc_amt).toBe(-300);
  });

  it("P7: 롤백(deleteMoved + slice0 복원)으로 raw 완전 복귀", () => {
    const current = [inc(1, 86, "20260430", 1000), exp(2, 87, "20260501", 600), exp(3, 86, "20260502", 300)];
    const before = signature(current);
    const applied = applyPlanInMemory(current, planAllocationPersist(current, GEN));
    // 롤백 = reconstructRawRows (이동분 제거 + slice0 복원)
    expect(signature(reconstructRawRows(applied))).toEqual(before);
  });

});
