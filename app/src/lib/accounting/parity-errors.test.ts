import { describe, it, expect } from "vitest";
import {
  PARITY_ERROR_CODES,
  ParityError,
  ParityErrors,
} from "./parity-errors";

describe("PARITY_ERROR_CODES", () => {
  it("6개 코드 모두 정의됨", () => {
    expect(Object.keys(PARITY_ERROR_CODES)).toHaveLength(6);
  });

  it("코드는 PARITY-NNN 형식", () => {
    for (const code of Object.values(PARITY_ERROR_CODES)) {
      expect(code).toMatch(/^PARITY-\d{3}$/);
    }
  });
});

describe("ParityError class", () => {
  it("toResponse로 표준 응답 포맷 변환", () => {
    const err = new ParityError(
      PARITY_ERROR_CODES.SQLITE_HEADER_INVALID,
      "잘못된 파일",
      400,
      { reason: "magic mismatch" },
    );
    const res = err.toResponse();
    expect(res.error.code).toBe("PARITY-004");
    expect(res.error.message).toBe("잘못된 파일");
    expect(res.error.details).toEqual({ reason: "magic mismatch" });
  });

  it("details 없을 때 응답에서 details 키 자체가 생략됨", () => {
    const err = new ParityError(PARITY_ERROR_CODES.CODE_MAPPING_FAILED, "msg", 400);
    const res = err.toResponse();
    expect("details" in res.error).toBe(false);
  });

  it("httpStatus 보존", () => {
    const err = new ParityError(PARITY_ERROR_CODES.SQLJS_INIT_FAILED, "x", 500);
    expect(err.httpStatus).toBe(500);
  });
});

describe("ParityErrors factory", () => {
  it("sqliteHeaderInvalid → PARITY-004, 400", () => {
    const e = ParityErrors.sqliteHeaderInvalid();
    expect(e.code).toBe("PARITY-004");
    expect(e.httpStatus).toBe(400);
  });

  it("conflictPolicyRequired → PARITY-005, 409", () => {
    const e = ParityErrors.conflictPolicyRequired();
    expect(e.code).toBe("PARITY-005");
    expect(e.httpStatus).toBe(409);
  });

  it("organPairInconsistent → PARITY-002, 400", () => {
    const e = ParityErrors.organPairInconsistent({ orgSecCd: 109 });
    expect(e.code).toBe("PARITY-002");
    expect(e.details).toEqual({ orgSecCd: 109 });
  });
});
