import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { useAuth } from "@/stores/auth";

/**
 * select-organ 삭제 모달 RTL 테스트 (organ-deletion design §8.2 UI 케이스 / Gap G1)
 * - 기관명 불일치 시 [영구 삭제] 비활성, 정확 일치 시 활성
 * - 마지막 기관 삭제 → /register-organ 라우팅
 * - 현재 선택 기관 삭제 → clearOrgan(store orgId 초기화), 다른 기관 남으면 register-organ 미이동
 */

const h = vi.hoisted(() => ({
  push: vi.fn(),
  orgs: [] as unknown[],
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: h.push }),
}));

vi.mock("@/lib/supabase/client", () => ({
  createSupabaseBrowser: () => ({
    from: () => ({
      select: () => ({ eq: () => Promise.resolve({ data: h.orgs }) }),
    }),
  }),
}));

import SelectOrganPage from "./page";

function mkOrg(id: number, name: string) {
  return {
    org_id: id,
    is_default: false,
    organ: {
      org_id: id,
      org_sec_cd: 92,
      org_name: name,
      acc_from: null,
      acc_to: null,
      acct_name: null,
    },
  };
}

function setupFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, opts: { body: string }) => {
      const body = JSON.parse(opts.body);
      if (body.action === "preview") {
        return {
          ok: true,
          json: async () => ({
            orgId: body.orgId,
            orgName: "x",
            counts: {
              income: 1,
              incomeAmt: 100,
              expense: 0,
              expenseAmt: 0,
              evidence: 0,
              estate: 0,
              customer: 0,
              backup: 0,
            },
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({ deleted: true, orgName: "x", result: { organ_deleted: 1 } }),
      };
    })
  );
}

beforeEach(() => {
  h.push = vi.fn();
  h.orgs = [];
  useAuth.setState({
    user: { id: "u1" } as never,
    orgId: null,
    orgSecCd: null,
    orgName: null,
    orgType: null,
    acctName: null,
    accFrom: null,
    accTo: null,
  });
  vi.stubGlobal("alert", vi.fn());
  setupFetch();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("select-organ 삭제 모달", () => {
  it("기관명이 정확히 일치할 때만 [영구 삭제]가 활성화된다", async () => {
    h.orgs = [mkOrg(1, "회사A"), mkOrg(2, "회사B")];
    render(<SelectOrganPage />);

    await screen.findByText("회사A");
    fireEvent.click(screen.getByLabelText("회사A 삭제"));

    // 모달 오픈
    await screen.findByText("사용기관 삭제");
    const delBtn = screen.getByRole("button", { name: "영구 삭제" });
    expect(delBtn).toBeDisabled();

    const input = screen.getByPlaceholderText("회사A");
    fireEvent.change(input, { target: { value: "회사" } });
    expect(delBtn).toBeDisabled();

    fireEvent.change(input, { target: { value: "회사A" } });
    expect(delBtn).toBeEnabled();
  });

  it("마지막 기관을 삭제하면 /register-organ으로 이동한다", async () => {
    h.orgs = [mkOrg(1, "회사A")];
    render(<SelectOrganPage />);

    await screen.findByText("회사A");
    fireEvent.click(screen.getByLabelText("회사A 삭제"));
    await screen.findByText("사용기관 삭제");

    fireEvent.change(screen.getByPlaceholderText("회사A"), { target: { value: "회사A" } });
    fireEvent.click(screen.getByRole("button", { name: "영구 삭제" }));

    await waitFor(() => expect(h.push).toHaveBeenCalledWith("/register-organ"));
  });

  it("현재 선택된 기관을 삭제하면 clearOrgan으로 orgId가 초기화되고, 남은 기관이 있으면 register-organ로 이동하지 않는다", async () => {
    h.orgs = [mkOrg(1, "회사A"), mkOrg(2, "회사B")];
    useAuth.setState({ orgId: 1 }); // 현재 선택 = 회사A
    render(<SelectOrganPage />);

    await screen.findByText("회사A");
    fireEvent.click(screen.getByLabelText("회사A 삭제"));
    await screen.findByText("사용기관 삭제");

    fireEvent.change(screen.getByPlaceholderText("회사A"), { target: { value: "회사A" } });
    fireEvent.click(screen.getByRole("button", { name: "영구 삭제" }));

    await waitFor(() => expect(useAuth.getState().orgId).toBeNull());
    expect(h.push).not.toHaveBeenCalledWith("/register-organ");
  });
});
