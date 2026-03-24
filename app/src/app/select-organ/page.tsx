"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { useAuth } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const ORG_TYPE_LABELS: Record<number, string> = {
  50: "중앙당",
  51: "정책연구소",
  52: "시도당",
  53: "정당선거사무소",
  54: "국회의원",
  90: "(예비)후보자",
  106: "경선후보자",
  91: "대통령선거후보자후원회",
  92: "국회의원후원회",
  107: "대통령선거경선후보자후원회",
  108: "당대표경선후보자후원회",
  109: "(예비)후보자후원회",
  587: "중앙당후원회",
  588: "중앙당창당준비위원회후원회",
};

interface UserOrganRow {
  org_id: number;
  is_default: boolean | null;
  organ: {
    org_id: number;
    org_sec_cd: number;
    org_name: string;
    acc_from: string | null;
    acc_to: string | null;
    acct_name: string | null;
  };
}

function fmtPeriod(from: string | null, to: string | null): string {
  if (!from || !to) return "-";
  const f =
    from.length === 8
      ? `${from.slice(0, 4)}.${from.slice(4, 6)}.${from.slice(6, 8)}`
      : from;
  const t =
    to.length === 8
      ? `${to.slice(0, 4)}.${to.slice(4, 6)}.${to.slice(6, 8)}`
      : to;
  return `${f} ~ ${t}`;
}

export default function SelectOrganPage() {
  const router = useRouter();
  const { user, setOrgan } = useAuth();
  const [organs, setOrgans] = useState<UserOrganRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!user) {
        router.push("/login");
        return;
      }
      const supabase = createSupabaseBrowser();
      const { data } = await supabase
        .from("user_organ")
        .select(
          "org_id, is_default, organ(org_id, org_sec_cd, org_name, acc_from, acc_to, acct_name)"
        )
        .eq("user_id", user.id);
      setOrgans((data || []) as unknown as UserOrganRow[]);
      setLoading(false);
    }
    load();
  }, [user, router]);

  function handleSelect(org: {
    org_id: number;
    org_sec_cd: number;
    org_name: string;
    acct_name?: string | null;
  }) {
    setOrgan(org);
    router.push("/dashboard");
  }

  function handleRegisterNew() {
    router.push("/register-organ");
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400">
        사용기관 목록을 불러오는 중...
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">사용기관 선택</CardTitle>
          <p className="text-sm text-gray-500 mt-1">
            사용할 기관을 선택하세요. 선택 후 대시보드로 이동합니다.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {organs.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-gray-500 mb-4">
                등록된 사용기관이 없습니다.
              </p>
              <Button onClick={handleRegisterNew}>사용기관 신규등록</Button>
            </div>
          ) : (
            <>
              {organs.map((item) => (
                <button
                  key={item.org_id}
                  onClick={() => handleSelect(item.organ)}
                  className="w-full text-left p-4 rounded-lg border hover:bg-blue-50 hover:border-blue-300 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-lg">
                        {item.organ.org_name}
                      </p>
                      <p className="text-sm text-gray-500 mt-0.5">
                        {ORG_TYPE_LABELS[item.organ.org_sec_cd] ||
                          `코드: ${item.organ.org_sec_cd}`}
                      </p>
                    </div>
                    {item.is_default && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                        기본
                      </span>
                    )}
                  </div>
                  <div className="mt-2 text-xs text-gray-400 flex gap-4">
                    <span>
                      회계기간:{" "}
                      {fmtPeriod(item.organ.acc_from, item.organ.acc_to)}
                    </span>
                    {item.organ.acct_name && (
                      <span>회계책임자: {item.organ.acct_name}</span>
                    )}
                  </div>
                </button>
              ))}
              <div className="pt-4 border-t text-center">
                <Button variant="outline" onClick={handleRegisterNew}>
                  사용기관 신규등록
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
