"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface AddressResult {
  zipNo: string;
  lnmAdres: string;
  rnAdres: string;
}

interface AddressSearchDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect: (address: { post: string; addr: string }) => void;
}

export function AddressSearchDialog({
  open,
  onClose,
  onSelect,
}: AddressSearchDialogProps) {
  const [keyword, setKeyword] = useState("");
  const [results, setResults] = useState<AddressResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);

  const search = useCallback(
    async (pageNum = 1) => {
      if (keyword.trim().length < 2) {
        setError("검색어를 2자 이상 입력하세요.");
        return;
      }
      setLoading(true);
      setError("");
      setPage(pageNum);

      try {
        const res = await fetch(
          `/api/address/search?keyword=${encodeURIComponent(keyword)}&currentPage=${pageNum}&countPerPage=10`
        );
        const data = await res.json();

        if (data.error) {
          setError(data.error);
          setResults([]);
        } else {
          setResults(data.addresses || []);
          setTotalCount(data.totalCount || 0);
        }
      } catch {
        setError("주소 검색 중 오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    },
    [keyword]
  );

  function handleSelect(addr: AddressResult) {
    onSelect({
      post: addr.zipNo,
      addr: addr.rnAdres || addr.lnmAdres,
    });
    onClose();
  }

  const totalPages = Math.ceil(totalCount / 10);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>우편번호 검색</DialogTitle>
        </DialogHeader>

        <div className="flex gap-2">
          <Input
            placeholder="도로명, 건물명, 지번 입력 (2자 이상)"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search(1)}
          />
          <Button onClick={() => search(1)} disabled={loading}>
            {loading ? "검색 중..." : "검색"}
          </Button>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</p>
        )}

        {totalCount > 0 && (
          <p className="text-xs text-gray-500">
            총 {totalCount}건 ({page}/{totalPages} 페이지)
          </p>
        )}

        <div className="flex-1 overflow-y-auto border rounded">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left w-20">우편번호</th>
                <th className="px-3 py-2 text-left">도로명 주소</th>
                <th className="px-3 py-2 text-left">지번 주소</th>
              </tr>
            </thead>
            <tbody>
              {results.length === 0 ? (
                <tr>
                  <td
                    colSpan={3}
                    className="px-3 py-6 text-center text-gray-400"
                  >
                    {loading
                      ? "검색 중..."
                      : "검색어를 입력하고 검색 버튼을 클릭하세요."}
                  </td>
                </tr>
              ) : (
                results.map((addr, i) => (
                  <tr
                    key={`${addr.zipNo}-${i}`}
                    className="border-b cursor-pointer hover:bg-blue-50"
                    onClick={() => handleSelect(addr)}
                  >
                    <td className="px-3 py-2 font-mono text-blue-600">
                      {addr.zipNo}
                    </td>
                    <td className="px-3 py-2">{addr.rnAdres}</td>
                    <td className="px-3 py-2 text-gray-500">
                      {addr.lnmAdres}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex justify-center gap-1 pt-1">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => search(page - 1)}
            >
              이전
            </Button>
            <span className="flex items-center px-3 text-sm text-gray-500">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || loading}
              onClick={() => search(page + 1)}
            >
              다음
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
