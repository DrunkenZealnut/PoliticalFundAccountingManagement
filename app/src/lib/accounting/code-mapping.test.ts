import { describe, it, expect } from "vitest";
import {
  resolveAccountCodes,
  tryResolveAccountCodes,
  reverseLookupNames,
  CodeMappingError,
  type CodeValueLike,
  type AccRelLike,
} from "./code-mapping";

// 실제 Fund_Master 데이터를 본떠 만든 최소 픽스처
const codeValues: CodeValueLike[] = [
  { cv_id: 1, cs_id: 1, cv_name: "수입" }, // 총괄계정
  { cv_id: 2, cs_id: 1, cv_name: "지출" },
  // 후원회과목
  { cv_id: 93, cs_id: 12, cv_name: "전년도이월" },
  { cv_id: 94, cs_id: 12, cv_name: "기명후원금" },
  { cv_id: 95, cs_id: 12, cv_name: "익명후원금" },
  { cv_id: 96, cs_id: 12, cv_name: "그 밖의 수입" },
  { cv_id: 97, cs_id: 12, cv_name: "기부금" },
  { cv_id: 98, cs_id: 12, cv_name: "후원금모금경비" },
  // 후보자과목
  { cv_id: 70, cs_id: 11, cv_name: "기명후원금" }, // 동명이 과목 (후보자용)
];

const accRel: AccRelLike[] = [
  // 후원회 (109) 수입
  { org_sec_cd: 109, incm_sec_cd: 1, acc_sec_cd: 1, item_sec_cd: 93, exp_sec_cd: 0, input_yn: "Y", acc_order: 1 },
  { org_sec_cd: 109, incm_sec_cd: 1, acc_sec_cd: 1, item_sec_cd: 94, exp_sec_cd: 0, input_yn: "Y", acc_order: 2 },
  { org_sec_cd: 109, incm_sec_cd: 1, acc_sec_cd: 1, item_sec_cd: 95, exp_sec_cd: 0, input_yn: "Y", acc_order: 3 },
  { org_sec_cd: 109, incm_sec_cd: 1, acc_sec_cd: 1, item_sec_cd: 96, exp_sec_cd: 0, input_yn: "Y", acc_order: 4 },
  // 후원회 지출
  { org_sec_cd: 109, incm_sec_cd: 2, acc_sec_cd: 2, item_sec_cd: 97, exp_sec_cd: 0, input_yn: "Y", acc_order: 5 },
  { org_sec_cd: 109, incm_sec_cd: 2, acc_sec_cd: 2, item_sec_cd: 98, exp_sec_cd: 0, input_yn: "Y", acc_order: 6 },
  // input_yn=N 케이스
  { org_sec_cd: 109, incm_sec_cd: 1, acc_sec_cd: 1, item_sec_cd: 999, exp_sec_cd: 0, input_yn: "N", acc_order: 99 },
];

describe("resolveAccountCodes", () => {
  it("후원회 기명후원금 (수입) 정상 매핑", () => {
    const result = resolveAccountCodes(
      "수입",
      "기명후원금",
      { orgSecCd: 109, incmSecCd: 1 },
      codeValues,
      accRel,
    );
    expect(result).toEqual({ acc_sec_cd: 1, item_sec_cd: 94, exp_sec_cd: 0 });
  });

  it("후원회 익명후원금 (수입) 정상 매핑", () => {
    const result = resolveAccountCodes(
      "수입",
      "익명후원금",
      { orgSecCd: 109, incmSecCd: 1 },
      codeValues,
      accRel,
    );
    expect(result.item_sec_cd).toBe(95);
  });

  it("후원회 기부금 (지출) 정상 매핑", () => {
    const result = resolveAccountCodes(
      "지출",
      "기부금",
      { orgSecCd: 109, incmSecCd: 2 },
      codeValues,
      accRel,
    );
    expect(result).toEqual({ acc_sec_cd: 2, item_sec_cd: 97, exp_sec_cd: 0 });
  });

  it("후원회 전년도이월 (수입) 정상 매핑", () => {
    const result = resolveAccountCodes(
      "수입",
      "전년도이월",
      { orgSecCd: 109, incmSecCd: 1 },
      codeValues,
      accRel,
    );
    expect(result.item_sec_cd).toBe(93);
  });

  it("계정 이름 없음 → account_not_found 오류", () => {
    expect(() =>
      resolveAccountCodes(
        "유령계정",
        "기명후원금",
        { orgSecCd: 109, incmSecCd: 1 },
        codeValues,
        accRel,
      ),
    ).toThrow(CodeMappingError);

    try {
      resolveAccountCodes(
        "유령계정",
        "기명후원금",
        { orgSecCd: 109, incmSecCd: 1 },
        codeValues,
        accRel,
      );
    } catch (e) {
      expect((e as CodeMappingError).reason).toBe("account_not_found");
    }
  });

  it("과목 이름 없음 → subject_not_found 오류", () => {
    try {
      resolveAccountCodes(
        "수입",
        "유령과목",
        { orgSecCd: 109, incmSecCd: 1 },
        codeValues,
        accRel,
      );
      expect.fail("should have thrown");
    } catch (e) {
      expect((e as CodeMappingError).reason).toBe("subject_not_found");
    }
  });

  it("acc_rel 조합 없음 → rel_not_found 오류 (수입에 지출 과목)", () => {
    try {
      resolveAccountCodes(
        "수입", // 1
        "기부금", // 97 — 지출 과목
        { orgSecCd: 109, incmSecCd: 1 },
        codeValues,
        accRel,
      );
      expect.fail("should have thrown");
    } catch (e) {
      expect((e as CodeMappingError).reason).toBe("rel_not_found");
    }
  });

  it("input_yn=N인 매핑은 사용하지 않음", () => {
    // item_sec_cd=999는 N으로만 존재
    try {
      // 픽스처에 999 이름 없으니 subject_not_found가 먼저 발생할 거지만,
      // 명시적으로 시뮬레이션: cv 추가 후 input_yn=N만 있는 경우
      const extra: CodeValueLike[] = [
        ...codeValues,
        { cv_id: 999, cs_id: 12, cv_name: "비활성과목" },
      ];
      resolveAccountCodes(
        "수입",
        "비활성과목",
        { orgSecCd: 109, incmSecCd: 1 },
        extra,
        accRel,
      );
      expect.fail("should have thrown");
    } catch (e) {
      expect((e as CodeMappingError).reason).toBe("rel_not_found");
    }
  });

  it("후보자(90)는 후보자과목(CS_ID=11) 우선 사용", () => {
    // 후보자용 acc_rel 추가
    const candidateAccRel: AccRelLike[] = [
      ...accRel,
      { org_sec_cd: 90, incm_sec_cd: 1, acc_sec_cd: 1, item_sec_cd: 70, exp_sec_cd: 0, input_yn: "Y", acc_order: 1 },
    ];
    const result = resolveAccountCodes(
      "수입",
      "기명후원금", // 후보자과목(70)과 후원회과목(94) 둘 다 동명. 후보자(90)이므로 70 선택
      { orgSecCd: 90, incmSecCd: 1 },
      codeValues,
      candidateAccRel,
    );
    expect(result.item_sec_cd).toBe(70);
  });
});

describe("tryResolveAccountCodes", () => {
  it("정상 매핑 시 결과 반환", () => {
    expect(
      tryResolveAccountCodes("수입", "기명후원금", { orgSecCd: 109, incmSecCd: 1 }, codeValues, accRel),
    ).not.toBeNull();
  });

  it("실패 시 null 반환 (throw 안 함)", () => {
    expect(
      tryResolveAccountCodes("유령", "기명후원금", { orgSecCd: 109, incmSecCd: 1 }, codeValues, accRel),
    ).toBeNull();
  });
});

describe("reverseLookupNames", () => {
  it("정상 코드 → 이름 반환", () => {
    const result = reverseLookupNames(
      { acc_sec_cd: 1, item_sec_cd: 94, exp_sec_cd: 0 },
      codeValues,
    );
    expect(result.accountName).toBe("수입");
    expect(result.subjectName).toBe("기명후원금");
    expect(result.expenseName).toBeNull(); // 0은 null로
  });

  it("미정의 cv_id → null (throw 안 함)", () => {
    const result = reverseLookupNames(
      { acc_sec_cd: 9999, item_sec_cd: 9998, exp_sec_cd: 9997 },
      codeValues,
    );
    expect(result.accountName).toBeNull();
    expect(result.subjectName).toBeNull();
    expect(result.expenseName).toBeNull();
  });

  it("후보자과목(CS_ID=11)과 후원회과목(CS_ID=12) 동명 cv_id 구분", () => {
    // codeValues에 cv_id=70은 후보자과목 '기명후원금', cv_id=94는 후원회과목 '기명후원금'
    const candidate = reverseLookupNames(
      { acc_sec_cd: 1, item_sec_cd: 70, exp_sec_cd: 0 },
      codeValues,
    );
    const supporter = reverseLookupNames(
      { acc_sec_cd: 1, item_sec_cd: 94, exp_sec_cd: 0 },
      codeValues,
    );
    expect(candidate.subjectName).toBe("기명후원금");
    expect(supporter.subjectName).toBe("기명후원금");
    // 같은 이름이지만 cv_id로 식별됨
  });
});
