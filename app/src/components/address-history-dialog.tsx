"use client";

import { useState, useCallback } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface AddrHistory {
  cust_seq: number;
  reg_date: string | null;
  tel: string | null;
  post: string | null;
  addr: string | null;
  addr_detail: string | null;
}

interface AddressHistoryDialogProps {
  open: boolean;
  onClose: () => void;
  custId: number;
  custName: string;
  onApply?: (addr: { tel: string; post: string; addr: string; addr_detail: string }) => void;
}

export function AddressHistoryDialog({
  open,
  onClose,
  custId,
  custName,
  onApply,
}: AddressHistoryDialogProps) {
  const [records, setRecords] = useState<AddrHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!custId) return;
    setLoading(true);
    const supabase = createSupabaseBrowser();
    const { data } = await supabase
      .from("customer_addr")
      .select("*")
      .eq("cust_id", custId)
      .order("cust_seq", { ascending: false });
    setRecords(data || []);
    setLoading(false);
    setLoaded(true);
  }, [custId]);

  // Load on first open
  if (open && !loaded) {
    load();
  }
  if (!open && loaded) {
    setLoaded(false);
    setRecords([]);
  }

  function fmtDate(d: string | null) {
    if (!d || d.length !== 8) return d || "-";
    return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[70vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>주소 변경 이력 - {custName}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto border rounded">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left w-10">순번</th>
                <th className="px-3 py-2 text-left">변경일자</th>
                <th className="px-3 py-2 text-left">전화번호</th>
                <th className="px-3 py-2 text-left">우편번호</th>
                <th className="px-3 py-2 text-left">주소</th>
                {onApply && <th className="px-3 py-2 w-16" />}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={onApply ? 6 : 5} className="px-3 py-6 text-center text-gray-400">
                    로딩 중...
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={onApply ? 6 : 5} className="px-3 py-6 text-center text-gray-400">
                    주소 변경 이력이 없습니다.
                  </td>
                </tr>
              ) : (
                records.map((r) => (
                  <tr key={r.cust_seq} className="border-b hover:bg-gray-50">
                    <td className="px-3 py-2">{r.cust_seq}</td>
                    <td className="px-3 py-2">{fmtDate(r.reg_date)}</td>
                    <td className="px-3 py-2">{r.tel || "-"}</td>
                    <td className="px-3 py-2 font-mono">{r.post || "-"}</td>
                    <td className="px-3 py-2">
                      {r.addr || "-"}
                      {r.addr_detail ? ` ${r.addr_detail}` : ""}
                    </td>
                    {onApply && (
                      <td className="px-3 py-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          onClick={() =>
                            onApply({
                              tel: r.tel || "",
                              post: r.post || "",
                              addr: r.addr || "",
                              addr_detail: r.addr_detail || "",
                            })
                          }
                        >
                          적용
                        </Button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-gray-400">
          총 {records.length}건의 변경 이력
        </p>
      </DialogContent>
    </Dialog>
  );
}
