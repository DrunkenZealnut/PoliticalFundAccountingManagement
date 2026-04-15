import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User } from "@supabase/supabase-js";

type OrgType = "party" | "lawmaker" | "candidate" | "supporter";

interface AuthState {
  user: User | null;
  orgId: number | null;
  orgSecCd: number | null;
  orgName: string | null;
  orgType: OrgType | null;
  acctName: string | null;
  accFrom: string | null;
  accTo: string | null;
  setUser: (user: User | null) => void;
  setOrgan: (organ: { org_id: number; org_sec_cd: number; org_name: string; acct_name?: string | null; acc_from?: string | null; acc_to?: string | null }) => void;
  clear: () => void;
}

function getOrgType(orgSecCd: number): OrgType {
  if ([50, 51, 52, 53, 589].includes(orgSecCd)) return "party";
  if ([54, 106].includes(orgSecCd)) return "lawmaker";
  if ([90].includes(orgSecCd)) return "candidate";
  return "supporter"; // 91,92,107,108,109,587,588
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      orgId: null,
      orgSecCd: null,
      orgName: null,
      orgType: null,
      acctName: null,
      accFrom: null,
      accTo: null,
      setUser: (user) => set({ user }),
      setOrgan: (organ) =>
        set({
          orgId: organ.org_id,
          orgSecCd: organ.org_sec_cd,
          orgName: organ.org_name,
          orgType: getOrgType(organ.org_sec_cd),
          acctName: organ.acct_name || null,
          accFrom: organ.acc_from || null,
          accTo: organ.acc_to || null,
        }),
      clear: () =>
        set({
          user: null,
          orgId: null,
          orgSecCd: null,
          orgName: null,
          orgType: null,
          acctName: null,
          accFrom: null,
          accTo: null,
        }),
    }),
    {
      name: "auth-organ",
      partialize: (state) => ({
        orgId: state.orgId,
        orgSecCd: state.orgSecCd,
        orgName: state.orgName,
        orgType: state.orgType,
        acctName: state.acctName,
        accFrom: state.accFrom,
        accTo: state.accTo,
      }),
    }
  )
);
