"use client";

/**
 * HWPX 서식의 입력값을 organ DB + auth store + 고정값으로 자동 채우는 훅.
 * 계좌(수동) 등 source=manual 필드는 빈 문자열로 둔다.
 */
import { useCallback, useEffect, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { useAuth } from "@/stores/auth";
import type { HwpxFormDef } from "@/lib/hwpx/form-fields";

interface OrganRow {
  org_name: string | null;
  rep_name: string | null;
  acct_name: string | null;
  addr: string | null;
  addr_detail: string | null;
  tel: string | null;
  reg_num: string | null;
}

export function useHwpxPrefill() {
  const { orgId, orgName, acctName } = useAuth();
  const [organ, setOrgan] = useState<OrganRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (cancelled) return;
      if (!orgId) {
        setOrgan(null);
        return;
      }
      const supabase = createSupabaseBrowser();
      const { data } = await supabase
        .from("organ")
        .select("org_name, rep_name, acct_name, addr, addr_detail, tel, reg_num")
        .eq("org_id", orgId)
        .single();
      if (!cancelled) setOrgan((data as OrganRow) ?? null);
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  /** 서식 정의의 각 필드를 source 에 맞춰 초기값으로 채운다. */
  const prefill = useCallback(
    (def: HwpxFormDef): Record<string, string> => {
      const fullAddr = organ
        ? [organ.addr, organ.addr_detail].filter(Boolean).join(" ")
        : "";
      const out: Record<string, string> = {};
      for (const field of def.fields) {
        const s = field.source;
        let v = "";
        if (s.from === "organ") {
          if (s.column === "addr") v = fullAddr;
          else v = (organ?.[s.column] as string | null) ?? "";
        } else if (s.from === "auth") {
          v = (s.key === "orgName" ? orgName : acctName) ?? "";
        } else if (s.from === "const") {
          v = s.value;
        }
        out[field.token] = v;
      }
      return out;
    },
    [organ, orgName, acctName]
  );

  return { prefill, organ };
}
