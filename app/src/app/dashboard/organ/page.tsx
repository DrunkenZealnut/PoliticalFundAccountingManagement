"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { useAuth } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HelpTooltip } from "@/components/help-tooltip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AddressSearchDialog } from "@/components/address-search-dialog";

interface Organ {
  org_id: number;
  org_sec_cd: number;
  org_name: string;
  reg_num: string;
  reg_date: string | null;
  post: string | null;
  addr: string | null;
  addr_detail: string | null;
  tel: string | null;
  fax: string | null;
  rep_name: string | null;
  acct_name: string | null;
  comm: string | null;
  hint1: string | null;
  hint2: string | null;
  pre_acc_from: string | null;
  pre_acc_to: string | null;
  acc_from: string | null;
  acc_to: string | null;
}

const ORG_TYPES = [
  { value: 50, label: "중앙당" }, { value: 51, label: "정책연구소" },
  { value: 52, label: "시도당" }, { value: 53, label: "정당선거사무소" },
  { value: 54, label: "국회의원" }, { value: 90, label: "(예비)후보자" },
  { value: 106, label: "경선후보자" },
  { value: 91, label: "대통령선거후보자후원회" }, { value: 92, label: "국회의원후원회" },
  { value: 107, label: "대통령선거경선후보자후원회" }, { value: 108, label: "당대표경선후보자후원회" },
  { value: 109, label: "(예비)후보자후원회" },
  { value: 587, label: "중앙당후원회" }, { value: 588, label: "중앙당창당준비위원회후원회" },
];

export default function OrganPage() {
  const { orgId } = useAuth();
  const [organ, setOrgan] = useState<Organ | null>(null);
  const [loading, setLoading] = useState(!!orgId);
  const [addrDialogOpen, setAddrDialogOpen] = useState(false);

  const [form, setForm] = useState({
    org_sec_cd: 90, org_name: "", reg_num: "", reg_date: "", acct_name: "", rep_name: "",
    comm: "", post: "", addr: "", addr_detail: "", tel: "", fax: "",
    hint1: "", hint2: "", acc_from: "", acc_to: "", pre_acc_from: "", pre_acc_to: "",
  });

  function applyOrgan(o: Organ) {
    setOrgan(o);
    setForm({
      org_sec_cd: o.org_sec_cd, org_name: o.org_name, reg_num: o.reg_num, reg_date: o.reg_date || "",
      acct_name: o.acct_name || "", rep_name: o.rep_name || "", comm: o.comm || "",
      post: o.post || "", addr: o.addr || "", addr_detail: o.addr_detail || "",
      tel: o.tel || "", fax: o.fax || "", hint1: o.hint1 || "", hint2: o.hint2 || "",
      acc_from: o.acc_from || "", acc_to: o.acc_to || "",
      pre_acc_from: o.pre_acc_from || "", pre_acc_to: o.pre_acc_to || "",
    });
  }

  function load() {
    if (!orgId) return;
    const supabase = createSupabaseBrowser();
    supabase.from("organ").select("*").eq("org_id", orgId).single()
      .then(({ data }) => { if (data) applyOrgan(data as Organ); setLoading(false); });
  }

  useEffect(() => {
    if (!orgId) return;
    const supabase = createSupabaseBrowser();
    supabase.from("organ").select("*").eq("org_id", orgId).single()
      .then(({ data }) => { if (data) applyOrgan(data as Organ); setLoading(false); });
  }, [orgId]);

  async function handleSave() {
    const supabase = createSupabaseBrowser();
    if (!orgId || !organ) return;
    const { error } = await supabase.from("organ").update(form).eq("org_id", orgId);
    if (error) { alert(`수정 실패: ${error.message}`); return; }
    alert("저장되었습니다. 수정 내용 반영을 위해 로그아웃 후 재로그인하세요.");
    load();
  }

  if (loading) return <div className="text-center py-8 text-gray-400">로딩 중...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">사용기관 관리</h2>
        <HelpTooltip id="btn.save"><Button onClick={handleSave}>저장</Button></HelpTooltip>
      </div>

      <Card>
        <CardHeader><CardTitle>기관 정보</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <HelpTooltip id="organ.type"><Label>사용기관 구분</Label></HelpTooltip>
              <select
                className="w-full mt-0.5 border rounded px-3 py-2 text-sm bg-gray-50 text-gray-700"
                value={form.org_sec_cd}
                onChange={(e) => setForm({ ...form, org_sec_cd: Number(e.target.value) })}
                disabled
                title="사용기관 구분은 신규등록 시에만 설정 가능합니다"
              >
                {ORG_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-0.5">신규등록 시에만 변경 가능</p>
            </div>
            <div>
              <Label>기관명</Label>
              <Input value={form.org_name} onChange={(e) => setForm({ ...form, org_name: e.target.value })} />
            </div>
            <div>
              <Label>생년월일/사업자번호</Label>
              <Input value={form.reg_num} onChange={(e) => setForm({ ...form, reg_num: e.target.value })} />
            </div>
            <div>
              <Label>대표자명</Label>
              <Input value={form.rep_name} onChange={(e) => setForm({ ...form, rep_name: e.target.value })} />
            </div>
            <div>
              <Label>회계책임자</Label>
              <Input value={form.acct_name} onChange={(e) => setForm({ ...form, acct_name: e.target.value })} />
            </div>
            <div>
              <Label>관할위원회명</Label>
              <Input value={form.comm} onChange={(e) => setForm({ ...form, comm: e.target.value })} />
            </div>
            <div>
              <Label>우편번호</Label>
              <div className="flex gap-1 mt-1">
                <Input value={form.post} onChange={(e) => setForm({ ...form, post: e.target.value })} className="flex-1" />
                <Button type="button" variant="outline" size="sm" onClick={() => setAddrDialogOpen(true)} className="shrink-0 text-xs">주소검색</Button>
              </div>
            </div>
            <div className="md:col-span-2">
              <Label>주소</Label>
              <Input value={form.addr} onChange={(e) => setForm({ ...form, addr: e.target.value })} placeholder="주소검색으로 입력 또는 직접 입력" />
            </div>
            <div>
              <Label>상세주소</Label>
              <Input value={form.addr_detail} onChange={(e) => setForm({ ...form, addr_detail: e.target.value })} placeholder="상세주소 직접 입력" />
            </div>
            <div>
              <Label>전화번호</Label>
              <Input value={form.tel} onChange={(e) => setForm({ ...form, tel: e.target.value })} />
            </div>
            <div>
              <Label>팩스</Label>
              <Input value={form.fax} onChange={(e) => setForm({ ...form, fax: e.target.value })} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>회계기간</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <HelpTooltip id="organ.pre-period"><Label>이전 회계기간</Label></HelpTooltip>
              <div className="flex gap-2 mt-1">
                <Input value={form.pre_acc_from} onChange={(e) => setForm({ ...form, pre_acc_from: e.target.value })} placeholder="시작 YYYYMMDD" />
                <span className="self-center">~</span>
                <Input value={form.pre_acc_to} onChange={(e) => setForm({ ...form, pre_acc_to: e.target.value })} placeholder="종료 YYYYMMDD" />
              </div>
            </div>
            <div>
              <HelpTooltip id="organ.acc-period"><Label>당해 회계기간</Label></HelpTooltip>
              <div className="flex gap-2 mt-1">
                <Input value={form.acc_from} onChange={(e) => setForm({ ...form, acc_from: e.target.value })} placeholder="시작 YYYYMMDD" />
                <span className="self-center">~</span>
                <Input value={form.acc_to} onChange={(e) => setForm({ ...form, acc_to: e.target.value })} placeholder="종료 YYYYMMDD" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>비밀번호 힌트</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <HelpTooltip id="organ.hint"><Label>비밀번호확인질문</Label></HelpTooltip>
              <Input value={form.hint1} onChange={(e) => setForm({ ...form, hint1: e.target.value })} placeholder="예: 나의 고향은?" />
            </div>
            <div>
              <Label>비밀번호확인답변</Label>
              <Input value={form.hint2} onChange={(e) => setForm({ ...form, hint2: e.target.value })} placeholder="예: 서울" />
            </div>
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
