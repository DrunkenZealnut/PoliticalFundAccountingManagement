import { describe, it, expect } from "vitest";
import { generateBurdenCostForm, type BurdenCostFormData } from "./burden-cost-form";

const SAMPLE_DATA: BurdenCostFormData = {
  electionName: "제9회 전국동시지방선거",
  partyName: "테스트당",
  candidateName: "홍길동",
  braillePublic: { count: 100, pagesPerCopy: 4 },
  braillePledge: { count: 50, pagesPerCopy: 8 },
  storageMedia: { count: 30 },
  amounts: {
    점자형선거공보: 1200000,
    점자형선거공약서: 800000,
    저장매체: 300000,
    활동보조인: 450000,
    total: 2750000,
  },
  account: { holder: "홍길동", bankName: "국민은행", accountNumber: "123-456-789012" },
};

describe("burden-cost-form (서식7)", () => {
  it("워크북을 생성하고 시트명이 올바르다", async () => {
    const wb = await generateBurdenCostForm(SAMPLE_DATA);
    const ws = wb.getWorksheet("부담비용 지급청구서");
    expect(ws).toBeDefined();
  });

  it("서식 7 라벨이 A1에 있다", async () => {
    const wb = await generateBurdenCostForm(SAMPLE_DATA);
    const ws = wb.getWorksheet("부담비용 지급청구서")!;
    expect(String(ws.getCell(1, 1).value)).toContain("서식 7");
  });

  it("제목이 올바르다", async () => {
    const wb = await generateBurdenCostForm(SAMPLE_DATA);
    const ws = wb.getWorksheet("부담비용 지급청구서")!;
    expect(String(ws.getCell(2, 1).value)).toBe("점자형 선거공보 등 부담비용 지급청구서");
  });

  it("선거명, 소속정당명, 후보자명이 포함된다", async () => {
    const wb = await generateBurdenCostForm(SAMPLE_DATA);
    const ws = wb.getWorksheet("부담비용 지급청구서")!;
    // 4~6행에 기본 정보
    const texts = [4, 5, 6].map((r) => String(ws.getCell(r, 1).value));
    expect(texts[0]).toContain("제9회 전국동시지방선거");
    expect(texts[1]).toContain("테스트당");
    expect(texts[2]).toContain("홍길동");
  });

  it("수량표에 점자형 선거공보 총매수(A×B)가 계산된다", async () => {
    const wb = await generateBurdenCostForm(SAMPLE_DATA);
    const ws = wb.getWorksheet("부담비용 지급청구서")!;
    // 수량 데이터행 찾기: col1=100(공보 부수)인 행
    let dataRow = 0;
    for (let r = 1; r <= 20; r++) {
      if (ws.getCell(r, 1).value === 100) { dataRow = r; break; }
    }
    expect(dataRow).toBeGreaterThan(0);
    expect(ws.getCell(dataRow, 2).value).toBe(4);    // 공보 매수(B)
    expect(ws.getCell(dataRow, 3).value).toBe(400);  // 공보 총매수(C=A×B)
    expect(ws.getCell(dataRow, 4).value).toBe(50);   // 공약서 부수(A)
    expect(ws.getCell(dataRow, 5).value).toBe(8);     // 공약서 매수(B)
    expect(ws.getCell(dataRow, 6).value).toBe(400);   // 공약서 총매수(C=A×B)
    expect(ws.getCell(dataRow, 7).value).toBe(30);    // 저장매체 개수
  });

  it("수량이 0이면 falsy 값으로 처리된다", async () => {
    const emptyData = { ...SAMPLE_DATA, braillePublic: { count: 0, pagesPerCopy: 0 }, storageMedia: { count: 0 } };
    const wb = await generateBurdenCostForm(emptyData);
    const ws = wb.getWorksheet("부담비용 지급청구서")!;
    // 공약서 부수(50)가 있는 행 찾기
    let dataRow = 0;
    for (let r = 1; r <= 20; r++) {
      if (ws.getCell(r, 4).value === 50) { dataRow = r; break; }
    }
    expect(dataRow).toBeGreaterThan(0);
    // 공보(col1~3)와 저장매체(col7)는 0이므로 falsy
    expect(ws.getCell(dataRow, 1).value).toBeFalsy();  // 공보 부수 0
    expect(ws.getCell(dataRow, 3).value).toBeFalsy();  // 총매수 계산 불가
    expect(ws.getCell(dataRow, 7).value).toBeFalsy();  // 저장매체 0
  });

  it("청구금액 표에 항목별 금액이 포함된다", async () => {
    const wb = await generateBurdenCostForm(SAMPLE_DATA);
    const ws = wb.getWorksheet("부담비용 지급청구서")!;
    // 청구금액 헤더(r=14) → 데이터는 r=15~19
    // 구분(col1)과 계(col2) 확인
    const findAmountRow = (label: string) => {
      for (let r = 14; r <= 25; r++) {
        const v = String(ws.getCell(r, 1).value || "");
        if (v.includes(label)) return ws.getCell(r, 2).value;
      }
      return null;
    };
    expect(findAmountRow("점자형 선거공보")).toBe("1,200,000");
    expect(findAmountRow("점자형 선거공약서")).toBe("800,000");
    expect(findAmountRow("저장매체")).toBe("300,000");
    expect(findAmountRow("활동보조인")).toBe("450,000");
    expect(findAmountRow("계")).toBe("2,750,000");
  });

  it("활동보조인 금액은 수당·실비 열(col6)에도 표시된다", async () => {
    const wb = await generateBurdenCostForm(SAMPLE_DATA);
    const ws = wb.getWorksheet("부담비용 지급청구서")!;
    for (let r = 14; r <= 25; r++) {
      const v = String(ws.getCell(r, 1).value || "");
      if (v.includes("활동보조인")) {
        expect(ws.getCell(r, 6).value).toBe("450,000");
        break;
      }
    }
  });

  it("금액이 0이면 빈 문자열로 표시된다", async () => {
    const zeroData = {
      ...SAMPLE_DATA,
      amounts: { 점자형선거공보: 0, 점자형선거공약서: 0, 저장매체: 0, 활동보조인: 0, total: 0 },
    };
    const wb = await generateBurdenCostForm(zeroData);
    const ws = wb.getWorksheet("부담비용 지급청구서")!;
    for (let r = 14; r <= 25; r++) {
      const v = String(ws.getCell(r, 1).value || "");
      if (v.includes("점자형 선거공보")) {
        expect(ws.getCell(r, 2).value).toBe("");
        break;
      }
    }
  });

  it("봉투제작비 주석이 포함된다", async () => {
    const wb = await generateBurdenCostForm(SAMPLE_DATA);
    const ws = wb.getWorksheet("부담비용 지급청구서")!;
    let found = false;
    for (let r = 1; r <= 50; r++) {
      const v = String(ws.getCell(r, 1).value || "");
      if (v.includes("봉투제작비") && v.includes("보전대상")) { found = true; break; }
    }
    expect(found).toBe(true);
  });

  it("수령계좌 정보가 포함된다", async () => {
    const wb = await generateBurdenCostForm(SAMPLE_DATA);
    const ws = wb.getWorksheet("부담비용 지급청구서")!;
    let found = false;
    for (let r = 1; r <= 50; r++) {
      if (ws.getCell(r, 1).value === "홍길동" && ws.getCell(r, 2).value === "국민은행") {
        expect(ws.getCell(r, 3).value).toBe("123-456-789012");
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  it("청구 문구에 선거명이 포함된다", async () => {
    const wb = await generateBurdenCostForm(SAMPLE_DATA);
    const ws = wb.getWorksheet("부담비용 지급청구서")!;
    let found = false;
    for (let r = 1; r <= 60; r++) {
      const v = String(ws.getCell(r, 1).value || "");
      if (v.includes("부담비용을 위와 같이 청구합니다")) {
        expect(v).toContain("제9회 전국동시지방선거");
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  it("첨부서류 4건이 포함된다", async () => {
    const wb = await generateBurdenCostForm(SAMPLE_DATA);
    const ws = wb.getWorksheet("부담비용 지급청구서")!;
    const allText: string[] = [];
    for (let r = 1; r <= 60; r++) allText.push(String(ws.getCell(r, 1).value || ""));
    const joined = allText.join("\n");
    expect(joined).toContain("수입·지출부 사본");
    expect(joined).toContain("활동보조인 수당·실비 지급 명세서");
    expect(joined).toContain("증빙서류 사본");
    expect(joined).toContain("수령계좌 통장");
  });

  it("청구인 서명란(대표자, 후보자, 사무장, 회계책임자)이 포함된다", async () => {
    const wb = await generateBurdenCostForm(SAMPLE_DATA);
    const ws = wb.getWorksheet("부담비용 지급청구서")!;
    const allText: string[] = [];
    for (let r = 1; r <= 60; r++) {
      for (let c = 1; c <= 7; c++) allText.push(String(ws.getCell(r, c).value || ""));
    }
    const joined = allText.join(" ");
    expect(joined).toContain("대표자");
    expect(joined).toContain("후 보 자");
    expect(joined).toContain("선 거 사 무 장");
    expect(joined).toContain("회 계 책 임 자");
    expect(joined).toContain("청구인");
  });

  it("선거관리위원회 귀중이 포함된다", async () => {
    const wb = await generateBurdenCostForm(SAMPLE_DATA);
    const ws = wb.getWorksheet("부담비용 지급청구서")!;
    let found = false;
    for (let r = 1; r <= 60; r++) {
      if (String(ws.getCell(r, 1).value || "").includes("선거관리위원회 귀중")) { found = true; break; }
    }
    expect(found).toBe(true);
  });
});
