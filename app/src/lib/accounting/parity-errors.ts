/**
 * 선관위 PFund2 호환성 관련 표준 에러 코드와 응답 포맷.
 *
 * 설계 §6.1 / §6.2 참조.
 * import-sqlite, export-sqlite, recompute-settlement 등 호환 경로에서 사용.
 */

export const PARITY_ERROR_CODES = {
  CODE_MAPPING_FAILED: "PARITY-001",
  ORGAN_PAIR_INCONSISTENT: "PARITY-002",
  SETTLEMENT_CORRECTION_FAILED: "PARITY-003",
  SQLITE_HEADER_INVALID: "PARITY-004",
  IMPORT_CONFLICT_POLICY_REQUIRED: "PARITY-005",
  SQLJS_INIT_FAILED: "PARITY-006",
  ORGAN_CREDENTIALS_MISSING: "PARITY-007",
} as const;

export type ParityErrorCode = typeof PARITY_ERROR_CODES[keyof typeof PARITY_ERROR_CODES];

export interface ParityErrorPayload {
  error: {
    code: ParityErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
}

export class ParityError extends Error {
  readonly code: ParityErrorCode;
  readonly httpStatus: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: ParityErrorCode,
    message: string,
    httpStatus: number,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ParityError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }

  toResponse(): ParityErrorPayload {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details ? { details: this.details } : {}),
      },
    };
  }
}

/**
 * Predefined factory helpers — 자주 쓰는 케이스를 한 줄로.
 */
export const ParityErrors = {
  codeMappingFailed(details?: Record<string, unknown>): ParityError {
    return new ParityError(
      PARITY_ERROR_CODES.CODE_MAPPING_FAILED,
      "코드 매핑 실패: 계정/과목 이름이 표준에 없습니다",
      400,
      details,
    );
  },
  organPairInconsistent(details?: Record<string, unknown>): ParityError {
    return new ParityError(
      PARITY_ERROR_CODES.ORGAN_PAIR_INCONSISTENT,
      "ORGAN 페어 정합성 오류: 후원회인데 후보자 정보가 누락됐습니다",
      400,
      details,
    );
  },
  settlementCorrectionFailed(details?: Record<string, unknown>): ParityError {
    return new ParityError(
      PARITY_ERROR_CODES.SETTLEMENT_CORRECTION_FAILED,
      "결산 보정 실패: 자금출처 분류가 불가능합니다",
      500,
      details,
    );
  },
  sqliteHeaderInvalid(details?: Record<string, unknown>): ParityError {
    return new ParityError(
      PARITY_ERROR_CODES.SQLITE_HEADER_INVALID,
      "유효한 SQLite 파일이 아닙니다 (헤더 매직바이트 불일치)",
      400,
      details,
    );
  },
  conflictPolicyRequired(details?: Record<string, unknown>): ParityError {
    return new ParityError(
      PARITY_ERROR_CODES.IMPORT_CONFLICT_POLICY_REQUIRED,
      "Import 충돌 정책이 지정되지 않았습니다 (overwrite/skip/merge)",
      409,
      details,
    );
  },
  sqljsInitFailed(details?: Record<string, unknown>): ParityError {
    return new ParityError(
      PARITY_ERROR_CODES.SQLJS_INIT_FAILED,
      "SQLite WASM 초기화 실패",
      500,
      details,
    );
  },
  organCredentialsMissing(details?: Record<string, unknown>): ParityError {
    return new ParityError(
      PARITY_ERROR_CODES.ORGAN_CREDENTIALS_MISSING,
      "선관위 프로그램 로그인 정보(사용자ID/비밀번호)가 등록되지 않았습니다",
      400,
      details,
    );
  },
};
