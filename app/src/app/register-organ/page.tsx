"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { useAuth } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpTooltip } from "@/components/help-tooltip";
import { AddressSearchDialog } from "@/components/address-search-dialog";

const ORG_TYPES = [
  { value: 90, label: "(예비)후보자" },
  { value: 109, label: "(예비)후보자후원회" },
  { value: 54, label: "국회의원" },
  { value: 92, label: "국회의원후원회" },
  { value: 106, label: "경선후보자" },
  { value: 50, label: "중앙당" },
  { value: 52, label: "시도당" },
  { value: 51, label: "정책연구소" },
  { value: 53, label: "정당선거사무소" },
  { value: 91, label: "대통령선거후보자후원회" },
  { value: 107, label: "대통령선거경선후보자후원회" },
  { value: 108, label: "당대표경선후보자후원회" },
  { value: 587, label: "중앙당후원회" },
  { value: 588, label: "중앙당창당준비위원회후원회" },
];

export default function RegisterOrganPage() {
  const router = useRouter();
  const { user, setOrgan } = useAuth();
  const [loading, setLoading] = useState(false);
  const [addrDialogOpen, setAddrDialogOpen] = useState(false);

  const [form, setForm] = useState({
    org_sec_cd: 90,
    org_name: "",
    reg_num: "",
    reg_date: new Date().toISOString().slice(0, 10).replace(/-/g, ""),
    rep_name: "",
    acct_name: "",
    comm: "",
    post: "",
    addr: "",
    addr_detail: "",
    tel: "",
    fax: "",
    hint1: "",
    hint2: "",
    acc_from: "",
    acc_to: "",
    pre_acc_from: "",
    pre_acc_to: "",
  });

  async function handleSave() {
    if (!user) {
      alert("로그인이 필요합니다.");
      router.push("/login");
      return;
    }
    if (!form.org_name.trim()) {
      alert("사용기관명을 입력하세요.");
      return;
    }
    if (!form.reg_num.trim()) {
      alert("생년월일/사업자번호를 입력하세요.");
      return;
    }
    if (!form.acct_name.trim()) {
      alert("회계책임자를 입력하세요.");
      return;
    }
    if (!form.acc_from || !form.acc_to) {
      alert("당해 회계기간을 입력하세요.");
      return;
    }

    setLoading(true);
    const supabase = createSupabaseBrowser();

    // 중복 체크
    const { data: dup } = await supabase
      .from("organ")
      .select("org_id")
      .eq("org_sec_cd", form.org_sec_cd)
      .eq("org_name", form.org_name)
      .eq("reg_num", form.reg_num);

    if (dup && dup.length > 0) {
      alert(
        "같은 사용기관구분 + 기관명 + 사업자번호의 사용기관이 이미 존재합니다."
      );
      setLoading(false);
      return;
    }

    const { data: newOrgan, error } = await supabase
      .from("organ")
      .insert(form)
      .select("org_id, org_sec_cd, org_name")
      .single();

    if (error) {
      alert(`등록 실패: ${error.message}`);
      setLoading(false);
      return;
    }

    // user_organ 매핑
    const orgData = newOrgan as { org_id: number; org_sec_cd: number; org_name: string };
    await supabase.from("user_organ").insert({
      user_id: user.id,
      org_id: orgData.org_id,
      is_default: true,
    });

    setOrgan(orgData);
    setLoading(false);
    router.push("/dashboard");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-8">
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">사용기관 신규등록</CardTitle>
          <p className="text-sm text-gray-500">
            회계관리를 위한 사용기관 정보를 입력하세요
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 기관 기본정보 */}
          <div>
            <h3 className="text-sm font-semibold text-gray-600 mb-3">
              기관 정보
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <HelpTooltip id="organ.type">
                  <Label>사용기관 구분 *</Label>
                </HelpTooltip>
                <select
                  className="w-full mt-1 border rounded px-3 py-2 text-sm"
                  value={form.org_sec_cd}
                  onChange={(e) =>
                    setForm({ ...form, org_sec_cd: Number(e.target.value) })
                  }
                >
                  {ORG_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>사용기관명 *</Label>
                <Input
                  value={form.org_name}
                  onChange={(e) =>
                    setForm({ ...form, org_name: e.target.value })
                  }
                  placeholder="예: 오준석후보"
                />
              </div>
              <div>
                <Label>생년월일/사업자번호 *</Label>
                <Input
                  value={form.reg_num}
                  onChange={(e) =>
                    setForm({ ...form, reg_num: e.target.value })
                  }
                  placeholder="YYYYMMDD"
                />
              </div>
              <div>
                <Label>등록일자</Label>
                <Input
                  value={form.reg_date}
                  onChange={(e) =>
                    setForm({ ...form, reg_date: e.target.value })
                  }
                  placeholder="YYYYMMDD"
                />
              </div>
              <div>
                <Label>대표자명</Label>
                <Input
                  value={form.rep_name}
                  onChange={(e) =>
                    setForm({ ...form, rep_name: e.target.value })
                  }
                />
              </div>
              <div>
                <Label>회계책임자 *</Label>
                <Input
                  value={form.acct_name}
                  onChange={(e) =>
                    setForm({ ...form, acct_name: e.target.value })
                  }
                />
              </div>
              <div>
                <Label>관할위원회명</Label>
                <Input
                  value={form.comm}
                  onChange={(e) => setForm({ ...form, comm: e.target.value })}
                />
              </div>
              <div>
                <Label>전화번호</Label>
                <Input
                  value={form.tel}
                  onChange={(e) => setForm({ ...form, tel: e.target.value })}
                />
              </div>
              <div>
                <Label>팩스</Label>
                <Input
                  value={form.fax}
                  onChange={(e) => setForm({ ...form, fax: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* 주소 */}
          <div>
            <h3 className="text-sm font-semibold text-gray-600 mb-3">주소</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>우편번호</Label>
                <div className="flex gap-1 mt-1">
                  <Input
                    value={form.post}
                    onChange={(e) =>
                      setForm({ ...form, post: e.target.value })
                    }
                    placeholder="5자리"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setAddrDialogOpen(true)}
                    className="shrink-0 text-xs"
                  >
                    주소검색
                  </Button>
                </div>
              </div>
              <div className="md:col-span-2">
                <Label>주소</Label>
                <Input
                  value={form.addr}
                  onChange={(e) => setForm({ ...form, addr: e.target.value })}
                  placeholder="주소검색으로 입력 또는 직접 입력"
                />
              </div>
              <div className="md:col-span-3">
                <Label>상세주소</Label>
                <Input
                  value={form.addr_detail}
                  onChange={(e) =>
                    setForm({ ...form, addr_detail: e.target.value })
                  }
                  placeholder="상세주소 직접 입력"
                />
              </div>
            </div>
          </div>

          {/* 회계기간 */}
          <div>
            <h3 className="text-sm font-semibold text-gray-600 mb-3">
              회계기간
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <HelpTooltip id="organ.acc-period">
                  <Label>당해 회계기간 *</Label>
                </HelpTooltip>
                <div className="flex gap-2 mt-1">
                  <Input
                    value={form.acc_from}
                    onChange={(e) =>
                      setForm({ ...form, acc_from: e.target.value })
                    }
                    placeholder="시작 YYYYMMDD"
                  />
                  <span className="self-center text-gray-400">~</span>
                  <Input
                    value={form.acc_to}
                    onChange={(e) =>
                      setForm({ ...form, acc_to: e.target.value })
                    }
                    placeholder="종료 YYYYMMDD"
                  />
                </div>
              </div>
              <div>
                <HelpTooltip id="organ.pre-period">
                  <Label>이전 회계기간</Label>
                </HelpTooltip>
                <div className="flex gap-2 mt-1">
                  <Input
                    value={form.pre_acc_from}
                    onChange={(e) =>
                      setForm({ ...form, pre_acc_from: e.target.value })
                    }
                    placeholder="시작 YYYYMMDD"
                  />
                  <span className="self-center text-gray-400">~</span>
                  <Input
                    value={form.pre_acc_to}
                    onChange={(e) =>
                      setForm({ ...form, pre_acc_to: e.target.value })
                    }
                    placeholder="종료 YYYYMMDD"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 비밀번호 힌트 */}
          <div>
            <h3 className="text-sm font-semibold text-gray-600 mb-3">
              비밀번호 힌트
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <HelpTooltip id="organ.hint">
                  <Label>비밀번호확인질문</Label>
                </HelpTooltip>
                <Input
                  value={form.hint1}
                  onChange={(e) =>
                    setForm({ ...form, hint1: e.target.value })
                  }
                  placeholder="예: 나의 고향은?"
                />
              </div>
              <div>
                <Label>비밀번호확인답변</Label>
                <Input
                  value={form.hint2}
                  onChange={(e) =>
                    setForm({ ...form, hint2: e.target.value })
                  }
                  placeholder="예: 서울"
                />
              </div>
            </div>
          </div>

          {/* 버튼 */}
          <div className="flex gap-2 pt-2 border-t">
            <Button onClick={handleSave} disabled={loading}>
              {loading ? "등록 중..." : "사용기관 등록"}
            </Button>
            <Button variant="outline" onClick={() => router.push("/login")}>
              취소
            </Button>
          </div>
        </CardContent>
      </Card>

      <AddressSearchDialog
        open={addrDialogOpen}
        onClose={() => setAddrDialogOpen(false)}
        onSelect={({ post, addr }) => setForm({ ...form, post, addr })}
      />
    </div>
  );
}
