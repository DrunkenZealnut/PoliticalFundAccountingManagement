"use client";

import { useState, useCallback } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Customer {
  cust_id: number;
  cust_sec_cd: number;
  name: string | null;
  reg_num: string | null;
  job: string | null;
  tel: string | null;
}

interface CustomerSearchDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect: (customer: Customer) => void;
}

const CUST_TYPES = [
  { value: 63, label: "개인" },
  { value: 62, label: "사업자" },
  { value: 89, label: "후원회" },
  { value: 88, label: "중앙당" },
  { value: 57, label: "시도당" },
  { value: 58, label: "정책연구소" },
  { value: 59, label: "정당선거사무소" },
  { value: 60, label: "국회의원" },
  { value: 61, label: "(예비)후보자" },
  { value: 103, label: "기타" },
];

const CUST_TYPE_MAP: Record<number, string> = Object.fromEntries(
  CUST_TYPES.map((t) => [t.value, t.label])
);

export function CustomerSearchDialog({
  open,
  onClose,
  onSelect,
}: CustomerSearchDialogProps) {
  const [keyword, setKeyword] = useState("");
  const [results, setResults] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [regLoading, setRegLoading] = useState(false);
  const [regForm, setRegForm] = useState({
    cust_sec_cd: 63,
    name: "",
    reg_num: "",
    job: "",
    tel: "",
  });

  const search = useCallback(async () => {
    setLoading(true);
    const supabase = createSupabaseBrowser();
    let query = supabase
      .from("customer")
      .select("cust_id, cust_sec_cd, name, reg_num, job, tel")
      .order("name");

    if (keyword.trim()) {
      query = query.or(`name.ilike.%${keyword}%,reg_num.ilike.%${keyword}%`);
    }

    const { data } = await query.limit(50);
    setResults(data || []);
    setLoading(false);
  }, [keyword]);

  function handleSelect(c: Customer) {
    onSelect(c);
    onClose();
    resetRegForm();
  }

  function resetRegForm() {
    setShowRegister(false);
    setRegForm({ cust_sec_cd: 63, name: "", reg_num: "", job: "", tel: "" });
  }

  async function handleRegister() {
    if (!regForm.name.trim()) {
      alert("성명(명칭)을 입력하세요.");
      return;
    }

    setRegLoading(true);
    const supabase = createSupabaseBrowser();

    // 중복 체크
    const { data: dup } = await supabase
      .from("customer")
      .select("cust_id")
      .eq("cust_sec_cd", regForm.cust_sec_cd)
      .eq("name", regForm.name)
      .eq("reg_num", regForm.reg_num || "");

    if (dup && dup.length > 0) {
      alert("같은 구분 + 성명 + 생년월일(사업자번호)의 수입지출처가 이미 존재합니다.");
      setRegLoading(false);
      return;
    }

    const { data: newCust, error } = await supabase
      .from("customer")
      .insert(regForm)
      .select("cust_id, cust_sec_cd, name, reg_num, job, tel")
      .single();

    if (error) {
      alert(`등록 실패: ${error.message}`);
      setRegLoading(false);
      return;
    }

    // 등록 후 바로 선택
    if (newCust) {
      handleSelect(newCust as Customer);
    }
    setRegLoading(false);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { onClose(); resetRegForm(); } }}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {showRegister ? "수입지출처 신규등록" : "수입지출처 검색"}
          </DialogTitle>
        </DialogHeader>

        {!showRegister ? (
          <>
            {/* 검색 모드 */}
            <div className="flex gap-2">
              <Input
                placeholder="성명 또는 생년월일/사업자번호"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && search()}
              />
              <Button onClick={search} disabled={loading}>
                검색
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowRegister(true)}
                className="shrink-0"
              >
                신규등록
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto border rounded mt-2">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left">구분</th>
                    <th className="px-3 py-2 text-left">성명(명칭)</th>
                    <th className="px-3 py-2 text-left">생년월일/사업자번호</th>
                    <th className="px-3 py-2 text-left">직업</th>
                    <th className="px-3 py-2 text-left">전화번호</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-gray-400">
                        검색 중...
                      </td>
                    </tr>
                  ) : results.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-gray-400">
                        검색 결과가 없습니다.
                        <button
                          className="block mx-auto mt-2 text-blue-600 hover:underline text-sm"
                          onClick={() => {
                            setShowRegister(true);
                            if (keyword.trim()) {
                              setRegForm({ ...regForm, name: keyword.trim() });
                            }
                          }}
                        >
                          새로 등록하기
                        </button>
                      </td>
                    </tr>
                  ) : (
                    results.map((c) => (
                      <tr
                        key={c.cust_id}
                        className="border-b cursor-pointer hover:bg-blue-50"
                        onClick={() => handleSelect(c)}
                      >
                        <td className="px-3 py-2">
                          {CUST_TYPE_MAP[c.cust_sec_cd] || c.cust_sec_cd}
                        </td>
                        <td className="px-3 py-2 font-medium">{c.name}</td>
                        <td className="px-3 py-2">{c.reg_num}</td>
                        <td className="px-3 py-2">{c.job}</td>
                        <td className="px-3 py-2">{c.tel}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <>
            {/* 신규등록 모드 */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>구분 *</Label>
                  <select
                    className="w-full mt-1 border rounded px-3 py-2 text-sm"
                    value={regForm.cust_sec_cd}
                    onChange={(e) =>
                      setRegForm({ ...regForm, cust_sec_cd: Number(e.target.value) })
                    }
                  >
                    {CUST_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>성명(명칭) *</Label>
                  <Input
                    value={regForm.name}
                    onChange={(e) =>
                      setRegForm({ ...regForm, name: e.target.value })
                    }
                    placeholder="성명 또는 법인명"
                  />
                </div>
                <div>
                  <Label>생년월일/사업자번호</Label>
                  <Input
                    value={regForm.reg_num}
                    onChange={(e) =>
                      setRegForm({ ...regForm, reg_num: e.target.value })
                    }
                    placeholder="YYYYMMDD"
                  />
                </div>
                <div>
                  <Label>직업(업종)</Label>
                  <Input
                    value={regForm.job}
                    onChange={(e) =>
                      setRegForm({ ...regForm, job: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>전화번호</Label>
                  <Input
                    value={regForm.tel}
                    onChange={(e) =>
                      setRegForm({ ...regForm, tel: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-2 border-t">
                <Button onClick={handleRegister} disabled={regLoading}>
                  {regLoading ? "등록 중..." : "등록 후 선택"}
                </Button>
                <Button variant="outline" onClick={resetRegForm}>
                  취소 (검색으로 돌아가기)
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
