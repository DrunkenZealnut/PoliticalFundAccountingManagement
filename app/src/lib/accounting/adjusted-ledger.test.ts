import { describe, it, expect } from "vitest";
import { buildAdjustedAccBook, adjustedOrigins, adjustedNotes } from "./adjusted-ledger";
import { fillExportReceiptNumbers, type ReceiptCodeNames } from "./receipt-no";

/** acc_book 행 헬퍼(스냅샷 키). */
const row = (p: Record<string, unknown>): Record<string, unknown> => ({
  acc_book_id: 1,
  incm_sec_cd: 1,
  acc_sec_cd: 84,
  item_sec_cd: 86,
  acc_date: "20260101",
  content: "x",
  acc_amt: 0,
  rcp_yn: "N",
  rcp_no: null,
  rcp_no2: null,
  bigo: null,
  cust_id: 1,
  ...p,
});

const NAMES: ReceiptCodeNames = {
  acc: { 82: "보조금", 84: "후보자등자산" },
  item: { 86: "선거비용", 87: "선거비용외정치자금" },
};

describe("buildAdjustedAccBook (재조정 SSOT)", () => {
  it("후보자(82 부족→84 이동) 분할: 이동분에 신규 acc_book_id 부여(고유)", () => {
    // 84/86 수입 100,000 + 82/86 수입 30,000, 82/86 지출 50,000 → 30k 잔류 + 20k를 84로 이동.
    const out = buildAdjustedAccBook([
      row({ acc_book_id: 1, incm_sec_cd: 1, acc_sec_cd: 84, item_sec_cd: 86, acc_amt: 100000, acc_date: "20260101" }),
      row({ acc_book_id: 2, incm_sec_cd: 1, acc_sec_cd: 82, item_sec_cd: 86, acc_amt: 30000, acc_date: "20260102" }),
      row({ acc_book_id: 3, incm_sec_cd: 2, acc_sec_cd: 82, item_sec_cd: 86, acc_amt: 50000, acc_date: "20260103" }),
    ]);
    // acc_book_id 전부 고유(분할 슬라이스도) — React key·채번 안전
    const ids = out.map((r) => r.acc_book_id);
    expect(new Set(ids).size).toBe(ids.length);
    // 지출이 82:30,000 + 84:20,000으로 분할
    const exp = out.filter((r) => Number(r.incm_sec_cd) === 2);
    expect(exp.reduce((s, r) => s + Number(r.acc_amt), 0)).toBe(50000);
    expect(exp.some((r) => Number(r.acc_sec_cd) === 84 && Number(r.acc_amt) === 20000)).toBe(true);
  });

  it("비후보자(자금원 82~85 없음)는 원본 그대로 반환", () => {
    const input = [
      row({ acc_book_id: 1, incm_sec_cd: 1, acc_sec_cd: 1, item_sec_cd: 94, acc_amt: 1000 }),
      row({ acc_book_id: 2, incm_sec_cd: 2, acc_sec_cd: 2, item_sec_cd: 97, acc_amt: 500 }),
    ];
    expect(buildAdjustedAccBook(input)).toBe(input); // 동일 참조(무변경)
  });

  it("메타(customer·content) 보존 — 이동분도 원행 메타 상속", () => {
    const out = buildAdjustedAccBook([
      row({ acc_book_id: 1, incm_sec_cd: 1, acc_sec_cd: 84, item_sec_cd: 86, acc_amt: 100000, acc_date: "20260101" }),
      row({ acc_book_id: 3, incm_sec_cd: 2, acc_sec_cd: 82, item_sec_cd: 86, acc_amt: 50000, acc_date: "20260103", content: "현수막", customer: { name: "△기획" } }),
    ]);
    // 82 수입 0 → 50,000 전액 84로 이동(단일 이동). content·customer 상속.
    const movedExp = out.filter((r) => Number(r.incm_sec_cd) === 2);
    expect(movedExp.every((r) => r.content === "현수막")).toBe(true);
    expect(movedExp.every((r) => (r.customer as { name: string })?.name === "△기획")).toBe(true);
  });
});

describe("adjustedOrigins (구분: 원본/이동/분할)", () => {
  it("분할(한 지출이 2자금원)·원본 수입 판정", () => {
    const out = buildAdjustedAccBook([
      row({ acc_book_id: 1, incm_sec_cd: 1, acc_sec_cd: 84, item_sec_cd: 86, acc_amt: 100000, acc_date: "20260101" }),
      row({ acc_book_id: 2, incm_sec_cd: 1, acc_sec_cd: 82, item_sec_cd: 86, acc_amt: 30000, acc_date: "20260102" }),
      row({ acc_book_id: 3, incm_sec_cd: 2, acc_sec_cd: 82, item_sec_cd: 86, acc_amt: 50000, acc_date: "20260103" }),
    ]);
    const origins = adjustedOrigins(out);
    // 수입 2건은 원본
    out.forEach((r, i) => {
      if (Number(r.incm_sec_cd) === 1) expect(origins[i]).toBe("원본");
    });
    // 지출 3은 두 자금원으로 분할 → 그 슬라이스들은 "분할"
    const expOrigins = out.map((r, i) => ({ r, o: origins[i] })).filter((x) => Number(x.r.incm_sec_cd) === 2);
    expect(expOrigins.every((x) => x.o === "분할")).toBe(true);
  });

  it("단일 자금원 이동(전액)은 '이동'", () => {
    const out = buildAdjustedAccBook([
      row({ acc_book_id: 1, incm_sec_cd: 1, acc_sec_cd: 84, item_sec_cd: 86, acc_amt: 100000, acc_date: "20260101" }),
      row({ acc_book_id: 3, incm_sec_cd: 2, acc_sec_cd: 82, item_sec_cd: 86, acc_amt: 50000, acc_date: "20260103" }), // 82 수입 0 → 전액 84
    ]);
    const origins = adjustedOrigins(out);
    const exp = out.map((r, i) => ({ r, o: origins[i] })).find((x) => Number(x.r.incm_sec_cd) === 2)!;
    expect(exp.o).toBe("이동");
  });
});

describe("재조정 + 영수증 채번 (화면==export 동일 경로)", () => {
  it("재조정 행에 (계정×과목)별 영수증번호 — 분할 슬라이스도 정확", () => {
    const adjusted = buildAdjustedAccBook([
      row({ acc_book_id: 1, incm_sec_cd: 1, acc_sec_cd: 84, item_sec_cd: 86, acc_amt: 100000, acc_date: "20260101", rcp_yn: "Y" }),
      row({ acc_book_id: 2, incm_sec_cd: 2, acc_sec_cd: 84, item_sec_cd: 86, acc_amt: 30000, acc_date: "20260102", rcp_yn: "Y" }),
      row({ acc_book_id: 3, incm_sec_cd: 2, acc_sec_cd: 84, item_sec_cd: 87, acc_amt: 20000, acc_date: "20260103", rcp_yn: "Y" }),
    ]);
    const numbered = fillExportReceiptNumbers(adjusted, NAMES);
    const byId = new Map(numbered.map((r) => [Number(r.acc_book_id), r.rcp_no]));
    // 84 선거비용 지출 → 자(비)-1, 84 선거비용외 → 자-1 (스킴 A)
    expect(byId.get(2)).toBe("자(비)-1");
    expect(byId.get(3)).toBe("자-1");
  });

  // TC-3: 채번은 (가) 계산만 — 멱등·기존 rcp_no 시드 보존·미부여만 채움.
  it("멱등 + 기존 rcp_no 시드 보존(미부여분만 이어서 채번)", () => {
    const seeded = [
      row({ acc_book_id: 1, incm_sec_cd: 2, acc_sec_cd: 84, item_sec_cd: 86, acc_amt: 30000, rcp_yn: "Y", rcp_no: "자(비)-5", rcp_no2: 5 }),
      row({ acc_book_id: 2, incm_sec_cd: 2, acc_sec_cd: 84, item_sec_cd: 86, acc_amt: 20000, rcp_yn: "Y" }), // 미부여
      row({ acc_book_id: 3, incm_sec_cd: 2, acc_sec_cd: 84, item_sec_cd: 87, acc_amt: 10000, rcp_yn: "Y" }), // 미부여(선거비용외)
    ];
    const once = fillExportReceiptNumbers(seeded, NAMES);
    const num1 = new Map(once.map((r) => [Number(r.acc_book_id), r.rcp_no]));
    expect(num1.get(1)).toBe("자(비)-5"); // 기존 시드 보존
    expect(num1.get(2)).toBe("자(비)-6"); // max(5)+1 이어서
    expect(num1.get(3)).toBe("자-1"); // 선거비용외 별도 조합
    // 멱등: 채번 결과를 다시 채번해도 동일(이미 전부 부여 → 무변경)
    const twice = fillExportReceiptNumbers(once, NAMES);
    expect(twice.map((r) => r.rcp_no)).toEqual(once.map((r) => r.rcp_no));
    expect(twice.map((r) => r.rcp_no2)).toEqual(once.map((r) => r.rcp_no2));
  });
});

describe("adjustedNotes (비고: 재배분 {원}→{현})", () => {
  it("분할 이동분에 '재배분 82→84' note, 잔류 slice0·수입은 null", () => {
    const out = buildAdjustedAccBook([
      row({ acc_book_id: 1, incm_sec_cd: 1, acc_sec_cd: 84, item_sec_cd: 86, acc_amt: 100000, acc_date: "20260101" }),
      row({ acc_book_id: 2, incm_sec_cd: 1, acc_sec_cd: 82, item_sec_cd: 86, acc_amt: 30000, acc_date: "20260102" }),
      row({ acc_book_id: 3, incm_sec_cd: 2, acc_sec_cd: 82, item_sec_cd: 86, acc_amt: 50000, acc_date: "20260103" }),
    ]);
    const notes = adjustedNotes(out);
    // 82→84로 이동한 20,000 슬라이스에 재배분 note
    const moved = out.map((r, i) => ({ r, n: notes[i] })).filter((x) => Number(x.r.incm_sec_cd) === 2 && Number(x.r.acc_sec_cd) === 84);
    expect(moved.length).toBe(1);
    expect(moved[0].n).toBe("재배분 82→84");
    // 82 잔류(slice0)·수입 행은 note 없음
    out.forEach((r, i) => {
      if (Number(r.incm_sec_cd) === 1) expect(notes[i]).toBeNull();
      if (Number(r.incm_sec_cd) === 2 && Number(r.acc_sec_cd) === 82) expect(notes[i]).toBeNull();
    });
  });

  it("단일 전액 이동(slice0)도 '재배분 82→84' + accName 적용", () => {
    const out = buildAdjustedAccBook([
      row({ acc_book_id: 1, incm_sec_cd: 1, acc_sec_cd: 84, item_sec_cd: 86, acc_amt: 100000, acc_date: "20260101" }),
      row({ acc_book_id: 3, incm_sec_cd: 2, acc_sec_cd: 82, item_sec_cd: 86, acc_amt: 50000, acc_date: "20260103" }), // 82 수입 0 → 전액 84
    ]);
    const notes = adjustedNotes(out, (cv) => ({ 82: "보조금", 84: "후보자등자산" }[cv] ?? String(cv)));
    const exp = out.map((r, i) => ({ r, n: notes[i] })).find((x) => Number(x.r.incm_sec_cd) === 2)!;
    expect(exp.n).toBe("재배분 보조금→후보자등자산");
  });
});
