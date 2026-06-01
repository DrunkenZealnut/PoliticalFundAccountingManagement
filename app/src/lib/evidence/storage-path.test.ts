import { describe, it, expect } from "vitest";
import {
  buildEvidenceStoragePath,
  sanitizeFileName,
  EVIDENCE_MAX_FILES,
  EVIDENCE_MAX_FILE_SIZE,
} from "./storage-path";

describe("sanitizeFileName", () => {
  it("확장자를 보존하고 본문을 안전 문자로 정규화한다", () => {
    expect(sanitizeFileName("영수증 2024.jpg")).toEqual({ safeName: "_2024", ext: ".jpg" });
  });

  it("한글/공백/특수문자를 밑줄로 치환하고 연속 밑줄을 축약한다", () => {
    expect(sanitizeFileName("계약서!!! (최종).pdf")).toEqual({ safeName: "_", ext: ".pdf" });
  });

  it("확장자가 없으면 ext는 빈 문자열", () => {
    const { ext } = sanitizeFileName("noext");
    expect(ext).toBe("");
  });

  it("본문은 100자로 제한된다", () => {
    const long = "a".repeat(200) + ".png";
    const { safeName, ext } = sanitizeFileName(long);
    expect(safeName.length).toBe(100);
    expect(ext).toBe(".png");
  });

  it("확장자에 섞인 경로 구분자·특수문자를 제거한다", () => {
    expect(sanitizeFileName("a.jp/g").ext).toBe(".jpg");
    expect(sanitizeFileName("x.pdf?v=1").ext).toBe(".pdfv1");
  });
});

describe("buildEvidenceStoragePath", () => {
  it("거래 연결 시 {orgId}/acc/{accBookId}/{ts}_{seq}_{safe}.ext 구조로 그룹화한다", () => {
    const path = buildEvidenceStoragePath({
      orgId: 7,
      accBookId: 1024,
      fileName: "receipt.jpg",
      seq: 2,
      timestamp: 1717200000000,
    });
    expect(path).toBe("7/acc/1024/1717200000000_2_receipt.jpg");
  });

  it("acc_book_id가 없으면(NULL) {orgId}/unlinked/ 경로를 사용한다", () => {
    const path = buildEvidenceStoragePath({
      orgId: 7,
      accBookId: null,
      fileName: "logo.pdf",
      timestamp: 1717200000000,
    });
    expect(path).toBe("7/unlinked/1717200000000_logo.pdf");
  });

  it("seq 기본값은 0", () => {
    const path = buildEvidenceStoragePath({
      orgId: 3,
      accBookId: 5,
      fileName: "a.png",
      timestamp: 1000,
    });
    expect(path).toBe("3/acc/5/1000_0_a.png");
  });

  it("같은 거래·같은 타임스탬프라도 seq로 충돌을 방지한다", () => {
    const ts = 1717200000000;
    const p0 = buildEvidenceStoragePath({ orgId: 7, accBookId: 1, fileName: "x.jpg", seq: 0, timestamp: ts });
    const p1 = buildEvidenceStoragePath({ orgId: 7, accBookId: 1, fileName: "x.jpg", seq: 1, timestamp: ts });
    expect(p0).not.toBe(p1);
  });

  it("모든 경로는 orgId prefix로 시작해 조직 격리를 보장한다", () => {
    const path = buildEvidenceStoragePath({ orgId: 42, accBookId: 9, fileName: "f.pdf", timestamp: 1 });
    expect(path.startsWith("42/")).toBe(true);
  });

  it("악의적 파일명도 경로 세그먼트를 추가로 주입하지 못한다", () => {
    const path = buildEvidenceStoragePath({ orgId: 7, accBookId: 1, fileName: "a.b/c", timestamp: 1 });
    // {org}/acc/{id}/{file} — 정확히 4 세그먼트 ('/' 주입 없음)
    expect(path.split("/")).toHaveLength(4);
  });
});

describe("상수", () => {
  it("거래당 첨부 상한은 10건", () => {
    expect(EVIDENCE_MAX_FILES).toBe(10);
  });

  it("파일 1건 최대 크기는 10MB", () => {
    expect(EVIDENCE_MAX_FILE_SIZE).toBe(10 * 1024 * 1024);
  });
});
