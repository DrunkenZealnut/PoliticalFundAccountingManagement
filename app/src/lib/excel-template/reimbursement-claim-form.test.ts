import { describe, it, expect } from "vitest";
import {
  generateReimbursementClaimForm,
  type ReimbursementClaimFormData,
} from "./reimbursement-claim-form";

function makeData(
  overrides?: Partial<ReimbursementClaimFormData>,
): ReimbursementClaimFormData {
  return {
    formType: "form1",
    electionName: "제9회 전국동시지방선거",
    partyName: "○○당",
    electionDistrictName: "서울특별시 ○○구청장선거구",
    candidateName: "홍길동",
    rows: [
      {
        label: "선거사무소",
        amounts: {
          후보자자산: 3000000,
          후원회기부금: 5000000,
          보조금: 4000000,
          보조금외: 300000,
          합계: 12300000,
        },
      },
    ],
    totalAmount: 12300000,
    account: {
      holder: "홍길동",
      bankName: "○○은행",
      accountNumber: "123-456-789012",
    },
    claimants: {
      candidate: "홍길동",
      campaignManager: "김선거",
      accountant: "이회계",
    },
    submissionDate: "2026년 6월 10일",
    receivingCommittee: "○○선거관리위원회",
    ...overrides,
  };
}

describe("generateReimbursementClaimForm 서식 1", () => {
  it("Excel Workbook 생성 + worksheet 이름 확인", async () => {
    const wb = await generateReimbursementClaimForm(makeData());
    expect(wb.worksheets).toHaveLength(1);
    expect(wb.getWorksheet("선거비용 보전청구서")).toBeDefined();
  });

  it("제목/부제/식별항목 셀에 입력값 반영", async () => {
    const wb = await generateReimbursementClaimForm(makeData());
    const ws = wb.getWorksheet("선거비용 보전청구서")!;
    // 제목 (Row 2)
    expect(ws.getCell("A2").value).toBe("선거비용 보전청구서");
    // 부제 (Row 3)
    expect(ws.getCell("A3").value).toContain("지역구지방의원");
    // 1. 선거명 (Row 5)
    expect(String(ws.getCell("A5").value)).toContain("제9회 전국동시지방선거");
    expect(String(ws.getCell("A6").value)).toContain("○○당");
    expect(String(ws.getCell("A7").value)).toContain("서울특별시");
    expect(String(ws.getCell("A8").value)).toContain("홍길동");
  });

  it("청구내역 헤더 — 자금원 4개 컬럼 + 합계 + 비고", async () => {
    const wb = await generateReimbursementClaimForm(makeData());
    const ws = wb.getWorksheet("선거비용 보전청구서")!;
    // 헤더 1행: 구분 / 청구액(merge B-E) / 합계 / 비고
    // 헤더 2행: 후보자자산 / 후원회기부금 / 보조금 / 보조금외
    let foundFundingHeaders = 0;
    ws.eachRow((row) => {
      row.eachCell((c) => {
        const v = String(c.value ?? "");
        if (v.includes("후보자\n자산") || v.includes("후보자자산")) foundFundingHeaders++;
        if (v.includes("후원회\n기부금") || v.includes("후원회기부금")) foundFundingHeaders++;
      });
    });
    expect(foundFundingHeaders).toBeGreaterThanOrEqual(2);
  });

  it("청구내역 합계 행이 입력값과 일치", async () => {
    const data = makeData({
      rows: [
        {
          label: "선거사무소",
          amounts: {
            후보자자산: 1000000,
            후원회기부금: 2000000,
            보조금: 3000000,
            보조금외: 4000000,
            합계: 10000000,
          },
        },
      ],
      totalAmount: 10000000,
    });
    const wb = await generateReimbursementClaimForm(data);
    const ws = wb.getWorksheet("선거비용 보전청구서")!;
    let foundTotal = false;
    ws.eachRow((row) => {
      row.eachCell((c) => {
        if (String(c.value).includes("10,000,000")) foundTotal = true;
      });
    });
    expect(foundTotal).toBe(true);
  });

  it("보전청구 총액 — 한글 표기 포함", async () => {
    const wb = await generateReimbursementClaimForm(makeData({ totalAmount: 12300000 }));
    const ws = wb.getWorksheet("선거비용 보전청구서")!;
    let found = false;
    ws.eachRow((row) => {
      row.eachCell((c) => {
        const v = String(c.value);
        if (v.includes("보전청구 총액") && v.includes("일천이백삼십만")) found = true;
      });
    });
    expect(found).toBe(true);
  });

  it("수령계좌 데이터 셀 반영", async () => {
    const wb = await generateReimbursementClaimForm(makeData());
    const ws = wb.getWorksheet("선거비용 보전청구서")!;
    let foundAcc = false;
    ws.eachRow((row) => {
      row.eachCell((c) => {
        if (String(c.value) === "123-456-789012") foundAcc = true;
      });
    });
    expect(foundAcc).toBe(true);
  });

  it("청구인 3명 (후보자/선거사무장/회계책임자) 표기", async () => {
    const wb = await generateReimbursementClaimForm(makeData());
    const ws = wb.getWorksheet("선거비용 보전청구서")!;
    const labels = new Set<string>();
    ws.eachRow((row) => {
      row.eachCell((c) => {
        const v = String(c.value ?? "");
        if (v === "후 보 자" || v === "선거사무장" || v === "회계책임자") {
          labels.add(v);
        }
      });
    });
    expect(labels.size).toBe(3);
  });

  it("부속서류 4개 표기", async () => {
    const wb = await generateReimbursementClaimForm(makeData());
    const ws = wb.getWorksheet("선거비용 보전청구서")!;
    const found = { items: 0 };
    ws.eachRow((row) => {
      row.eachCell((c) => {
        const v = String(c.value);
        if (v.includes("정치자금 수입·지출부")) found.items++;
        if (v.includes("영수증 등 증빙서류")) found.items++;
        if (v.includes("선거연락소별")) found.items++;
        if (v.includes("정치자금 수입·지출 통장")) found.items++;
      });
    });
    expect(found.items).toBeGreaterThanOrEqual(4);
  });

  it("추가청구 모드 — 제목에 (추가) 표기", async () => {
    const wb = await generateReimbursementClaimForm(makeData({ isAdditional: true }));
    const ws = wb.getWorksheet("선거비용 보전청구서")!;
    expect(ws.getCell("A2").value).toBe("선거비용 보전청구서(추가)");
  });

  it("수신처 표기", async () => {
    const wb = await generateReimbursementClaimForm(
      makeData({ receivingCommittee: "송파구선거관리위원회" }),
    );
    const ws = wb.getWorksheet("선거비용 보전청구서")!;
    let found = false;
    ws.eachRow((row) => {
      row.eachCell((c) => {
        if (String(c.value).includes("송파구선거관리위원회 귀중")) found = true;
      });
    });
    expect(found).toBe(true);
  });
});

describe("generateReimbursementClaimForm 서식 2 (Phase 2 — 미구현)", () => {
  it("formType=form2는 throw", async () => {
    await expect(
      generateReimbursementClaimForm(makeData({ formType: "form2" })),
    ).rejects.toThrow("Phase 2");
  });
});
