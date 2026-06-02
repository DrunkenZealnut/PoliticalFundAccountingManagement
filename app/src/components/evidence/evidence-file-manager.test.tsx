import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { EvidenceFileManager } from "./evidence-file-manager";

const noop = () => {};

const sampleRow = (over: Record<string, unknown> = {}) => ({
  file_id: 1,
  acc_book_id: 10,
  org_id: 7,
  file_name: "영수증.jpg",
  file_type: "image/jpeg",
  storage_path: "7/acc/10/a.jpg",
  file_size: 2048,
  created_at: "2026-06-01",
  signed_url: "https://signed/a.jpg",
  ...over,
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("EvidenceFileManager", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
  });

  it("거래 선택 시 기존 첨부 목록을 조회해 파일명을 렌더한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => [sampleRow()] })
    );
    render(<EvidenceFileManager accBookId={10} orgId={7} pendingFiles={[]} onPendingChange={noop} />);
    expect(await screen.findByText(/영수증\.jpg/)).toBeInTheDocument();
  });

  it("첨부가 없으면 '첨부된 증빙파일 없음'을 표시한다", async () => {
    render(<EvidenceFileManager accBookId={10} orgId={7} pendingFiles={[]} onPendingChange={noop} />);
    expect(await screen.findByText("첨부된 증빙파일 없음")).toBeInTheDocument();
  });

  it("신규 대기 파일(pendingFiles)을 표시한다", () => {
    render(
      <EvidenceFileManager
        accBookId={null}
        orgId={7}
        pendingFiles={[{ name: "new.pdf", type: "application/pdf", base64: "QUJD" }]}
        onPendingChange={noop}
      />
    );
    expect(screen.getByText(/new\.pdf/)).toBeInTheDocument();
  });

  it("대기 파일 제거 버튼 클릭 시 onPendingChange로 해당 파일을 제외한다", () => {
    const onChange = vi.fn();
    render(
      <EvidenceFileManager
        accBookId={null}
        orgId={7}
        pendingFiles={[
          { name: "a.pdf", type: "application/pdf", base64: "QQ==" },
          { name: "b.pdf", type: "application/pdf", base64: "Qg==" },
        ]}
        onPendingChange={onChange}
      />
    );
    const removeButtons = screen.getAllByLabelText("제거");
    fireEvent.click(removeButtons[0]);
    expect(onChange).toHaveBeenCalledWith([{ name: "b.pdf", type: "application/pdf", base64: "Qg==" }]);
  });

  it("삭제 클릭 시 DELETE 요청 후 목록을 재조회한다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [sampleRow()] }) // 초기 목록
      .mockResolvedValueOnce({ ok: true, json: async () => ({ deleted: true }) }) // DELETE
      .mockResolvedValueOnce({ ok: true, json: async () => [] }); // 재조회
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("confirm", () => true);

    render(<EvidenceFileManager accBookId={10} orgId={7} pendingFiles={[]} onPendingChange={noop} />);
    await screen.findByText(/영수증\.jpg/);

    fireEvent.click(screen.getByLabelText("삭제"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/evidence-file?fileId=1&orgId=7"),
        expect.objectContaining({ method: "DELETE" })
      );
    });
  });

  it("첨부 개수가 상한(10건)에 도달하면 파일 입력을 비활성화한다", async () => {
    const tenRows = Array.from({ length: 10 }, (_, i) => sampleRow({ file_id: i + 1 }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => tenRows }));
    const { container } = render(
      <EvidenceFileManager accBookId={10} orgId={7} pendingFiles={[]} onPendingChange={noop} />
    );
    await waitFor(() => {
      const input = container.querySelector('input[type="file"]') as HTMLInputElement;
      expect(input.disabled).toBe(true);
    });
  });
});
