import { describe, it, expect } from "vitest";
import { renderIncomeLedgerSection } from "./owpml-table";
import { buildIncomeLedgerModel, type IncomeLedgerInputRow } from "./income-ledger-builder";

const getName = (cv: number) => ({ 84: "후보자 자산", 85: "후원회 기부금", 10: "선거비용" }[cv] ?? `코드${cv}`);

/** 합성 템플릿: GROUP 마커 + 표(헤더행 1, 데이터행 1) + 13컬럼 토큰 일부. */
const TEMPLATE_SECTION = `<hp:sec>
<!--LEDGER:GROUP_START-->
<hp:p id="0"><hp:run><hp:t>[계 정 명 : {{계정명}}]</hp:t></hp:run></hp:p>
<hp:p id="0"><hp:run><hp:t>[과 목 명 : {{과목명}}]</hp:t></hp:run></hp:p>
<hp:tbl id="500" zOrder="1" numberingType="TABLE" rowCnt="2" colCnt="13" borderFillIDRef="11">
<hp:tr>
<hp:tc borderFillIDRef="12"><hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:subList><hp:p id="0"><hp:run><hp:t>연월일</hp:t></hp:run></hp:p></hp:subList></hp:tc>
</hp:tr>
<!--LEDGER:ROW_START--><hp:tr>
<hp:tc borderFillIDRef="13"><hp:cellAddr colAddr="0" rowAddr="1"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:subList><hp:p id="0"><hp:run><hp:t>{{연월일}}</hp:t></hp:run></hp:p></hp:subList></hp:tc>
<hp:tc borderFillIDRef="13"><hp:cellAddr colAddr="1" rowAddr="1"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:subList><hp:p id="0"><hp:run><hp:t>{{내역}}</hp:t></hp:run></hp:p></hp:subList></hp:tc>
<hp:tc borderFillIDRef="13"><hp:cellAddr colAddr="2" rowAddr="1"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:subList><hp:p id="0"><hp:run><hp:t>{{수입금회}}</hp:t></hp:run></hp:p></hp:subList></hp:tc>
<hp:tc borderFillIDRef="13"><hp:cellAddr colAddr="6" rowAddr="1"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:subList><hp:p id="0"><hp:run><hp:t>{{잔액}}</hp:t></hp:run></hp:p></hp:subList></hp:tc>
<hp:tc borderFillIDRef="13"><hp:cellAddr colAddr="7" rowAddr="1"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:subList><hp:p id="0"><hp:run><hp:t>{{성명}}</hp:t></hp:run></hp:p></hp:subList></hp:tc>
</hp:tr><!--LEDGER:ROW_END-->
</hp:tbl>
<!--LEDGER:GROUP_END-->
</hp:sec>`;

function row(p: Partial<IncomeLedgerInputRow>): IncomeLedgerInputRow {
  return {
    acc_date: "20260521", incm_sec_cd: 1, acc_sec_cd: 84, item_sec_cd: 10, content: "내역",
    acc_amt: 1000, rcp_no: null, cust_id: 1,
    customer: { name: "홍길동", reg_num: "570923", addr: "서울", addr_detail: "1", job: "직", tel: "02" },
    ...p,
  };
}

describe("renderIncomeLedgerSection", () => {
  it("그룹 수만큼 표를, 행 수만큼 데이터행을 생성한다", () => {
    const model = buildIncomeLedgerModel(
      [
        row({ acc_sec_cd: 84, item_sec_cd: 10, acc_date: "20260521", acc_amt: 100, content: "A" }),
        row({ acc_sec_cd: 84, item_sec_cd: 10, acc_date: "20260522", acc_amt: 200, content: "B" }),
        row({ acc_sec_cd: 85, item_sec_cd: 10, acc_date: "20260523", acc_amt: 300, content: "C" }),
      ],
      getName,
    );
    const out = renderIncomeLedgerSection(TEMPLATE_SECTION, model);
    expect((out.match(/<hp:tbl\b/g) ?? []).length).toBe(2); // 그룹 2개 = 표 2개
    expect(out).toContain("후보자 자산");
    expect(out).toContain("후원회 기부금");
    expect(out).toContain("A");
    expect(out).toContain("B");
    expect(out).toContain("C");
  });

  it("표 id 가 그룹마다 고유하다", () => {
    const model = buildIncomeLedgerModel(
      [row({ acc_sec_cd: 84, item_sec_cd: 10 }), row({ acc_sec_cd: 85, item_sec_cd: 10 })],
      getName,
    );
    const out = renderIncomeLedgerSection(TEMPLATE_SECTION, model);
    const ids = [...out.matchAll(/<hp:tbl\b[^>]*\bid="(\d+)"/g)].map((m) => m[1]);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2); // 중복 없음
  });

  it("rowCnt = 헤더행수 + 데이터행수", () => {
    const model = buildIncomeLedgerModel(
      [
        row({ acc_date: "20260521" }),
        row({ acc_date: "20260522" }),
        row({ acc_date: "20260523" }),
      ],
      getName,
    );
    const out = renderIncomeLedgerSection(TEMPLATE_SECTION, model);
    // 헤더행 1 (rowAddr=0) + 데이터 3 = 4
    expect(out).toMatch(/rowCnt="4"/);
  });

  it("데이터행 rowAddr 가 1,2,3...으로 증가한다", () => {
    const model = buildIncomeLedgerModel(
      [row({ acc_date: "20260521" }), row({ acc_date: "20260522" })],
      getName,
    );
    const out = renderIncomeLedgerSection(TEMPLATE_SECTION, model);
    expect(out).toContain('rowAddr="1"');
    expect(out).toContain('rowAddr="2"');
  });

  it("누계/잔액이 셀에 반영된다", () => {
    const model = buildIncomeLedgerModel(
      [
        row({ acc_date: "20260521", acc_amt: 20000000, content: "A" }),
        row({ acc_date: "20260522", acc_amt: 1500000, content: "B" }),
      ],
      getName,
    );
    const out = renderIncomeLedgerSection(TEMPLATE_SECTION, model);
    expect(out).toContain("20,000,000");
    expect(out).toContain("1,500,000");
    expect(out).toContain("21,500,000"); // 누계=잔액
  });

  it("마커 주석과 잔여 토큰을 모두 제거한다", () => {
    const model = buildIncomeLedgerModel([row({})], getName);
    const out = renderIncomeLedgerSection(TEMPLATE_SECTION, model);
    expect(out).not.toMatch(/<!--LEDGER:/);
    expect(out).not.toMatch(/\{\{[^}]+\}\}/);
  });

  it("XML 특수문자를 escape 한다", () => {
    const model = buildIncomeLedgerModel(
      [row({ content: "A&B<C>", customer: { name: "K&R", reg_num: "570923", addr: "x", addr_detail: "y", job: "z", tel: "t" } })],
      getName,
    );
    const out = renderIncomeLedgerSection(TEMPLATE_SECTION, model);
    expect(out).toContain("A&amp;B&lt;C&gt;");
    expect(out).toContain("K&amp;R");
    expect(out).not.toContain("A&B<C>");
  });

  it("수입 0건이면 빈 표 1개를 생성한다", () => {
    const model = buildIncomeLedgerModel([], getName);
    const out = renderIncomeLedgerSection(TEMPLATE_SECTION, model);
    expect((out.match(/<hp:tbl\b/g) ?? []).length).toBe(1);
    expect(out).toMatch(/rowCnt="1"/); // 헤더행만
    expect(out).not.toMatch(/\{\{[^}]+\}\}/);
  });

  it("GROUP 마커가 없으면 에러", () => {
    expect(() => renderIncomeLedgerSection("<hp:sec></hp:sec>", buildIncomeLedgerModel([row({})], getName))).toThrow();
  });
});
