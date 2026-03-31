"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { useAuth } from "@/stores/auth";

/**
 * Home page - smart redirect based on auth state:
 *   Not logged in → /login
 *   Logged in, no org → /register-organ
 *   Logged in, 1 org → auto-select → /dashboard
 *   Logged in, multiple orgs → /select-organ
 */
export default function HomePage() {
  const router = useRouter();
  const { user, setUser, setOrgan } = useAuth();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    async function checkAndRedirect() {
      const supabase = createSupabaseBrowser();

      // 1. Check current session (with timeout to avoid infinite hang)
      let sessionUser = null;
      try {
        const result = await Promise.race([
          supabase.auth.getUser(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("timeout")), 3000)
          ),
        ]);
        sessionUser = result.data?.user ?? null;
      } catch {
        // Timeout or error — treat as not logged in
        router.replace("/login");
        return;
      }

      if (!sessionUser) {
        router.replace("/login");
        return;
      }

      // Store user in auth state
      setUser(sessionUser);

      // 2. Check organs
      const { data: organs } = await supabase
        .from("user_organ")
        .select("org_id, is_default, organ(org_id, org_sec_cd, org_name)")
        .eq("user_id", sessionUser.id);

      if (!organs || organs.length === 0) {
        router.replace("/register-organ");
        return;
      }

      if (organs.length === 1) {
        // Auto-select the only organ
        const orgRow = organs[0] as unknown as {
          organ: { org_id: number; org_sec_cd: number; org_name: string };
        };
        setOrgan(orgRow.organ);
        router.replace("/dashboard");
        return;
      }

      // Try to auto-select default organ
      const defaultOrg = organs.find(
        (o) => (o as unknown as { is_default: boolean }).is_default
      );
      if (defaultOrg) {
        const orgRow = defaultOrg as unknown as {
          organ: { org_id: number; org_sec_cd: number; org_name: string };
        };
        setOrgan(orgRow.organ);
        router.replace("/dashboard");
        return;
      }

      // Multiple orgs, no default → user must choose
      router.replace("/select-organ");
    }

    checkAndRedirect().finally(() => setChecking(false));
  }, [router, setUser, setOrgan, user]);

  if (checking) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
        <h1 className="text-2xl font-bold text-gray-700 mb-2">
          정치자금 회계관리
        </h1>
        <p className="text-gray-400 text-sm">로그인 확인 중...</p>
      </div>
    );
  }

  return null;
}
