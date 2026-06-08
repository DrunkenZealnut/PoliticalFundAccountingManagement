import { describe, it, expect } from "vitest";
import {
  buildEstateModel,
  estateGroupTokens,
  estateRowTokens,
  type EstateInputRow,
} from "./estate-builder";

function row(p: Partial<EstateInputRow>): EstateInputRow {
  return { estate_sec_cd: 47, kind: "예금", qty: 1, content: "농협123", amt: 1000000, remark: "", ...p };
}

describe("buildEstateModel", () => {
  it("빈 입력도 양식 고정 6구분을 '해당없음'으로 표기한다", () => {
    const model = buildEstateModel([]);
    expect(model.groups.map((g) => g.secCd)).toEqual([43, 44, 45, 46, 47, 48]);
    expect(model.groups.map((g) => g.label)).toEqual([
      "토지", "건물", "주식 또는 유가증권", "비품", "현금 및 예금", "그 밖의 재산",
    ]);
    // 모든 구분이 '해당없음' 1행 + 소계 0
    for (const g of model.groups) {
      expect(g.rows).toHaveLength(1);
      expect(g.rows[0].content).toBe("해당없음");
      expect(g.subtotal).toBe("0");
    }
    expect(model.total).toBe("0");
  });

  it("데이터 있는 구분은 명세행, 0건 구분은 '해당없음' (고정 6구분 순서)", () => {
    const model = buildEstateModel([
      row({ estate_sec_cd: 46, kind: "복사기", amt: 500000 }),
      row({ estate_sec_cd: 47, kind: "예금", amt: 3000000 }),
    ]);
    expect(model.groups.map((g) => g.secCd)).toEqual([43, 44, 45, 46, 47, 48]);
    const 비품 = model.groups.find((g) => g.secCd === 46)!;
    const 현금 = model.groups.find((g) => g.secCd === 47)!;
    const 토지 = model.groups.find((g) => g.secCd === 43)!;
    expect(비품.rows[0].kind).toBe("복사기");
    expect(현금.rows[0].kind).toBe("예금");
    expect(토지.rows[0].content).toBe("해당없음"); // 0건
  });

  it("구분 소계(가액 합)와 전체 합계를 계산", () => {
    const model = buildEstateModel([
      row({ estate_sec_cd: 46, kind: "복사기", amt: 500000 }),
      row({ estate_sec_cd: 46, kind: "노트북", amt: 1500000 }),
      row({ estate_sec_cd: 47, kind: "예금", amt: 3000000 }),
    ]);
    expect(model.groups.find((g) => g.secCd === 46)!.subtotal).toBe("2,000,000");
    expect(model.groups.find((g) => g.secCd === 47)!.subtotal).toBe("3,000,000");
    expect(model.total).toBe("5,000,000");
  });

  it("한 구분에 재산 N개면 명세행 N개, 입력 순서 유지", () => {
    const model = buildEstateModel([
      row({ estate_sec_cd: 46, kind: "B" }),
      row({ estate_sec_cd: 46, kind: "A" }),
    ]);
    expect(model.groups.find((g) => g.secCd === 46)!.rows.map((r) => r.kind)).toEqual(["B", "A"]);
  });

  it("수량 0/음수는 공란, 가액은 콤마(음수 허용 - 차입금)", () => {
    const model = buildEstateModel([row({ estate_sec_cd: 49, kind: "차입금", qty: 0, amt: -2000000 })]);
    // 차입금(49)은 고정 6구분이 아니라 데이터 있을 때만 추가 → 마지막 그룹
    const 차입금 = model.groups.find((g) => g.secCd === 49)!;
    expect(차입금.rows[0].qty).toBe("");
    expect(차입금.rows[0].amt).toBe("-2,000,000");
  });

  it("차입금(49) 등 비고정 구분은 데이터 있을 때만 6구분 뒤에 추가된다", () => {
    const model = buildEstateModel([row({ estate_sec_cd: 49, kind: "차입금", amt: -1000000 })]);
    expect(model.groups.map((g) => g.secCd)).toEqual([43, 44, 45, 46, 47, 48, 49]);
  });
});

describe("토큰 매핑", () => {
  it("estateRowTokens 는 종류·수량·내용·가액·비고 5개", () => {
    const model = buildEstateModel([row({ estate_sec_cd: 46, kind: "예금", qty: 2, content: "농협", amt: 1000000, remark: "메모" })]);
    const tok = estateRowTokens(model.groups.find((g) => g.secCd === 46)!.rows[0]);
    expect(tok).toEqual({ 종류: "예금", 수량: "2", 내용: "농협", 가액: "1,000,000", 비고: "메모" });
  });

  it("estateGroupTokens 는 구분·소계", () => {
    const model = buildEstateModel([row({ estate_sec_cd: 43, kind: "부지", amt: 5000000 })]);
    expect(estateGroupTokens(model.groups.find((g) => g.secCd === 43)!)).toEqual({ 구분: "토지", 소계: "5,000,000" });
  });
});
