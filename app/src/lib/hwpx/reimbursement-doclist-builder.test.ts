import { describe, it, expect } from "vitest";
import {
  buildDoclistModel,
  formatEvidence,
  type DoclistInputRow,
  type EvidenceSummary,
} from "./reimbursement-doclist-builder";
import { formatAmount } from "./income-ledger-builder";
import {
  aggregateReimbursementByFundingSource,
  type AccBookRow,
} from "@/lib/accounting/reimbursement-aggregator";

function row(p: Partial<DoclistInputRow>): DoclistInputRow {
  return {
    acc_book_id: 1,
    acc_date: "20260410",
    content: "내용",
    acc_amt: 100000,
    acc_print_ok: "Y",
    cust_id: 10,
    exp_group1_cd: "선거사무소",
    exp_group2_cd: "간판",
    customer: { name: "양지기획", reg_num: "201-77-77717" },
    ...p,
  };
}

const NO_EVIDENCE = new Map<number, EvidenceSummary>();

describe("formatEvidence", () => {
  it("사진+문서 + 대표 파일명", () => {
    expect(formatEvidence({ images: 3, docs: 1, firstName: "a.jpg" })).toBe("사진 3매 / 문서 1건 (a.jpg)");
  });
  it("사진만", () => {
    expect(formatEvidence({ images: 2, docs: 0, firstName: "" })).toBe("사진 2매");
  });
  it("0건/undefined → 없음", () => {
    expect(formatEvidence(undefined)).toBe("없음");
    expect(formatEvidence({ images: 0, docs: 0, firstName: "" })).toBe("없음");
  });
});

describe("buildDoclistModel — 필터/그룹/정렬", () => {
  it("보전 미체크·음수·0 지출 제외", () => {
    const m = buildDoclistModel(
      [
        row({ acc_book_id: 1, acc_print_ok: "Y", acc_amt: 100000 }),
        row({ acc_book_id: 2, acc_print_ok: "N", acc_amt: 200000 }), // 미체크
        row({ acc_book_id: 3, acc_print_ok: "Y", acc_amt: -5000 }), // 음수
        row({ acc_book_id: 4, acc_print_ok: "Y", acc_amt: 0 }), // 0
      ],
      NO_EVIDENCE,
    );
    expect(m.groups).toHaveLength(1);
    expect(m.groups[0].rows).toHaveLength(1);
    expect(m.totalAmount).toBe("100,000");
  });

  it("보전 항목별 그룹 + REIMB_ITEMS 순서, 거래 없는 항목 생략", () => {
    const m = buildDoclistModel(
      [
        row({ acc_book_id: 1, exp_group1_cd: "인쇄물", exp_group2_cd: "명함" }), // namecard
        row({ acc_book_id: 2, exp_group1_cd: "선거사무소", exp_group2_cd: "간판" }), // signboard
        row({ acc_book_id: 3, exp_group1_cd: "소품", exp_group2_cd: "어깨띠" }), // props
      ],
      NO_EVIDENCE,
    );
    // 출력 순서: signboard → props → namecard (REIMB_ITEMS 순서)
    expect(m.groups.map((g) => g.key)).toEqual(["signboard", "props", "namecard"]);
  });

  it("그룹 내 일자 ASC 정렬", () => {
    const m = buildDoclistModel(
      [
        row({ acc_book_id: 1, acc_date: "20260510", content: "늦음" }),
        row({ acc_book_id: 2, acc_date: "20260405", content: "이름" }),
      ],
      NO_EVIDENCE,
    );
    expect(m.groups[0].rows.map((r) => r.content)).toEqual(["이름", "늦음"]);
  });

  it("미매핑 보전 체크 지출 → 기타/미분류 그룹(맨 끝)", () => {
    const m = buildDoclistModel(
      [
        row({ acc_book_id: 1, exp_group1_cd: "선거사무소", exp_group2_cd: "간판" }), // signboard
        row({ acc_book_id: 2, exp_group1_cd: "광고", exp_group2_cd: "신문광고" }), // 미매핑
      ],
      NO_EVIDENCE,
    );
    expect(m.groups.map((g) => g.key)).toEqual(["signboard", "etc"]);
    expect(m.groups[1].itemName).toBe("기타/미분류");
  });

  it("소계·합계 집계", () => {
    const m = buildDoclistModel(
      [
        row({ acc_book_id: 1, exp_group1_cd: "선거사무소", exp_group2_cd: "간판", acc_amt: 313885 }),
        row({ acc_book_id: 2, exp_group1_cd: "선거사무소", exp_group2_cd: "현수막", acc_amt: 100000 }),
        row({ acc_book_id: 3, exp_group1_cd: "소품", exp_group2_cd: "어깨띠", acc_amt: 50000 }),
      ],
      NO_EVIDENCE,
    );
    const signboard = m.groups.find((g) => g.key === "signboard")!;
    expect(signboard.subtotalAmount).toBe("413,885");
    expect(m.totalAmount).toBe("463,885");
  });

  it("증빙 표기 + 익명 거래처", () => {
    const ev = new Map<number, EvidenceSummary>([[1, { images: 2, docs: 0, firstName: "p.jpg" }]]);
    const m = buildDoclistModel(
      [
        row({ acc_book_id: 1, cust_id: 10, customer: { name: "양지기획", reg_num: "201-77-77717" } }),
        row({ acc_book_id: 2, cust_id: -999, customer: { name: "홍길동", reg_num: "9999" } }),
      ],
      ev,
    );
    const rows = m.groups[0].rows;
    expect(rows[0].evidence).toBe("사진 2매 (p.jpg)");
    expect(rows[0].vendor).toBe("양지기획");
    expect(rows[1].evidence).toBe("없음");
    expect(rows[1].vendor).toBe("익명"); // 익명 정규화
  });

  it("claim_amt(보전청구액)이 있으면 보전청구액·소계·합계에 반영(일할계산)", () => {
    const m = buildDoclistModel(
      [
        // 일할: 지출 965,800 중 청구 313,885
        row({ acc_book_id: 1, exp_group1_cd: "선거사무소", exp_group2_cd: "간판", acc_amt: 965800, claim_amt: 313885 }),
        // claim 없음 → acc_amt
        row({ acc_book_id: 2, exp_group1_cd: "선거사무소", exp_group2_cd: "현수막", acc_amt: 100000 }),
      ],
      NO_EVIDENCE,
    );
    const signboard = m.groups.find((g) => g.key === "signboard")!;
    expect(signboard.rows[0].amount).toBe("313,885"); // 청구액 반영(지출액 아님)
    expect(signboard.subtotalAmount).toBe("413,885"); // 313,885 + 100,000
    expect(m.totalAmount).toBe("413,885");
  });

  it("빈 입력 → 그룹 0, 합계 0", () => {
    const m = buildDoclistModel([], NO_EVIDENCE);
    expect(m.groups).toHaveLength(0);
    expect(m.totalAmount).toBe("0");
  });
});

/* FR-08 soft-reconciliation: 점검목록표 합계 == 자금원 aggregator 합계.
 * doclist 는 exp_group(지출유형) 축, aggregator 는 item_sec_cd(과목) 축으로 별개지만,
 * 두 축이 일관(과목 선거비용 ⟺ 지출유형이 7항목에 매핑)되고 자금원이 known 인
 * 픽스처에서는 두 합계가 일치해야 한다(설계 §6.3). 축 분리 회귀 방어. */
describe("FR-08 reconciliation: doclist 합계 == aggregator 합계 (일관 픽스처)", () => {
  /** 두 축을 동시에 만족하는 짝 픽스처: doclist용 + aggregator용. */
  function paired(
    id: number,
    amt: number,
    exp1: string,
    exp2: string,
    accSecCd: number, // 84=후보자자산/85=후원회기부금/82=보조금/83=보조금외
  ): { d: DoclistInputRow; a: AccBookRow } {
    return {
      d: row({ acc_book_id: id, acc_amt: amt, exp_group1_cd: exp1, exp_group2_cd: exp2, acc_print_ok: "Y" }),
      a: { acc_book_id: id, acc_sec_cd: accSecCd, item_sec_cd: 10, acc_amt: amt, acc_print_ok: "Y", incm_sec_cd: 2 },
    };
  }

  it("7항목·4자금원 혼합 픽스처에서 합계 일치", () => {
    const pairs = [
      paired(1, 313885, "선거사무소", "간판", 84),
      paired(2, 252323, "거리게시용현수막", "거리게시용현수막", 85),
      paired(3, 50000, "소품", "어깨띠", 82),
      paired(4, 120000, "공개장소연설대담", "차량", 83),
      paired(5, 30000, "인쇄물", "명함", 84),
      paired(6, 90000, "인쇄물", "선거공보", 85),
      paired(7, 15000, "전화/전자우편/문자메시지", "문자메시지", 82),
    ];
    const doclist = buildDoclistModel(pairs.map((p) => p.d), NO_EVIDENCE);
    const agg = aggregateReimbursementByFundingSource({
      rows: pairs.map((p) => p.a),
      electionExpenseItemCds: [10],
    });
    expect(doclist.totalAmount).toBe(formatAmount(agg.byFundingSource.합계));
    // 미분류 그룹이 없어야 일관(7항목 모두 매핑됨)
    expect(doclist.groups.some((g) => g.key === "etc")).toBe(false);
  });

  it("보전 미체크·음수 제외가 양 축에서 동일하게 적용된다", () => {
    const pairs = [
      paired(1, 100000, "선거사무소", "간판", 84),
      { // 미체크 — 양쪽 제외
        d: row({ acc_book_id: 2, acc_amt: 200000, acc_print_ok: "N", exp_group1_cd: "소품", exp_group2_cd: "어깨띠" }),
        a: { acc_book_id: 2, acc_sec_cd: 84, item_sec_cd: 10, acc_amt: 200000, acc_print_ok: "N", incm_sec_cd: 2 } as AccBookRow,
      },
    ];
    const doclist = buildDoclistModel(pairs.map((p) => p.d), NO_EVIDENCE);
    const agg = aggregateReimbursementByFundingSource({ rows: pairs.map((p) => p.a), electionExpenseItemCds: [10] });
    expect(doclist.totalAmount).toBe(formatAmount(agg.byFundingSource.합계));
    expect(doclist.totalAmount).toBe("100,000");
  });
});
