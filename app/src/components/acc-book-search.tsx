"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CodeSelect } from "@/components/code-select";
import type { CodeValue } from "@/hooks/use-code-values";

export interface SearchFilters {
  dateFrom: string;
  dateTo: string;
  accSecCd: number;
  itemSecCd: number;
  content: string;
  amountMin: string;
  amountMax: string;
  rcpNo: string;
  rcpUnattached: boolean;
}

const EMPTY_FILTERS: SearchFilters = {
  dateFrom: "",
  dateTo: "",
  accSecCd: 0,
  itemSecCd: 0,
  content: "",
  amountMin: "",
  amountMax: "",
  rcpNo: "",
  rcpUnattached: false,
};

interface AccBookSearchProps {
  accountOptions: CodeValue[];
  itemOptions: CodeValue[];
  onSearch: (filters: SearchFilters) => void;
  onReset: () => void;
  onItemOptionsChange?: (accSecCd: number) => void;
}

export function AccBookSearch({
  accountOptions,
  itemOptions,
  onSearch,
  onReset,
  onItemOptionsChange,
}: AccBookSearchProps) {
  const [filters, setFilters] = useState<SearchFilters>(EMPTY_FILTERS);
  const [expanded, setExpanded] = useState(false);

  function handleSearch() {
    onSearch(filters);
  }

  function handleReset() {
    setFilters(EMPTY_FILTERS);
    onReset();
  }

  function handleAccChange(v: number) {
    setFilters({ ...filters, accSecCd: v, itemSecCd: 0 });
    onItemOptionsChange?.(v);
  }

  return (
    <div className="bg-gray-50 rounded-lg border p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-gray-700">검색 조건</span>
        <button
          type="button"
          className="text-xs text-blue-600 hover:underline"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "간략히" : "상세검색"}
        </button>
      </div>

      {/* Row 1: 일자, 계정, 과목, 내역 */}
      <div className="grid grid-cols-12 gap-2 items-end">
        <div className="col-span-6 md:col-span-2">
          <Label className="text-xs text-gray-500">일자 From</Label>
          <Input type="date" value={filters.dateFrom}
            onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
            className="h-8 text-sm" />
        </div>
        <div className="col-span-6 md:col-span-2">
          <Label className="text-xs text-gray-500">일자 To</Label>
          <Input type="date" value={filters.dateTo}
            onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
            className="h-8 text-sm" />
        </div>
        <div className="col-span-6 md:col-span-2">
          <CodeSelect label="계정" value={filters.accSecCd} onChange={handleAccChange}
            options={accountOptions} placeholder="전체 계정"
            className="[&_select]:h-8 [&_select]:text-sm [&_select]:mt-0 [&_label]:text-xs [&_label]:text-gray-500" />
        </div>
        <div className="col-span-6 md:col-span-2">
          <CodeSelect label="과목" value={filters.itemSecCd}
            onChange={(v) => setFilters({ ...filters, itemSecCd: v })}
            options={itemOptions} placeholder="전체 과목" disabled={!filters.accSecCd}
            tooltip={"▸ 선거비용: 선거에 직접 소요되는 비용\n▸ 선거비용외 정치자금: 통상적 정치활동 비용"}
            className="[&_select]:h-8 [&_select]:text-sm [&_select]:mt-0 [&_label]:text-xs [&_label]:text-gray-500" />
        </div>
        <div className="col-span-8 md:col-span-2">
          <Label className="text-xs text-gray-500">내역</Label>
          <Input value={filters.content}
            onChange={(e) => setFilters({ ...filters, content: e.target.value })}
            placeholder="내역 검색" className="h-8 text-sm"
            onKeyDown={(e) => e.key === "Enter" && handleSearch()} />
        </div>
        <div className="col-span-4 md:col-span-2 flex gap-1">
          <Button size="sm" className="h-8 flex-1" onClick={handleSearch}>조회</Button>
          <Button size="sm" variant="outline" className="h-8 flex-1" onClick={handleReset}>초기화</Button>
        </div>
      </div>

      {/* Row 2 (expanded): 금액, 증빙 */}
      {expanded && (
        <div className="grid grid-cols-12 gap-2 items-end mt-2 pt-2 border-t border-gray-200">
          <div className="col-span-6 md:col-span-2">
            <Label className="text-xs text-gray-500">금액 이상</Label>
            <Input type="number" value={filters.amountMin}
              onChange={(e) => setFilters({ ...filters, amountMin: e.target.value })}
              placeholder="최소 금액" className="h-8 text-sm" />
          </div>
          <div className="col-span-6 md:col-span-2">
            <Label className="text-xs text-gray-500">금액 이하</Label>
            <Input type="number" value={filters.amountMax}
              onChange={(e) => setFilters({ ...filters, amountMax: e.target.value })}
              placeholder="최대 금액" className="h-8 text-sm" />
          </div>
          <div className="col-span-6 md:col-span-2">
            <Label className="text-xs text-gray-500">증빙서번호</Label>
            <Input value={filters.rcpNo}
              onChange={(e) => setFilters({ ...filters, rcpNo: e.target.value })}
              placeholder="번호 검색" className="h-8 text-sm" />
          </div>
          <div className="col-span-6 md:col-span-2 flex items-end h-8">
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input type="checkbox" checked={filters.rcpUnattached}
                onChange={(e) => setFilters({ ...filters, rcpUnattached: e.target.checked })} />
              증빙서 미첨부만
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

/** Apply filters to a Supabase query builder */
export function applyFiltersToQuery(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  filters: SearchFilters
) {
  if (filters.dateFrom) {
    query = query.gte("acc_date", filters.dateFrom.replace(/-/g, ""));
  }
  if (filters.dateTo) {
    query = query.lte("acc_date", filters.dateTo.replace(/-/g, ""));
  }
  if (filters.accSecCd) {
    query = query.eq("acc_sec_cd", filters.accSecCd);
  }
  if (filters.itemSecCd) {
    query = query.eq("item_sec_cd", filters.itemSecCd);
  }
  if (filters.content) {
    query = query.ilike("content", `%${filters.content}%`);
  }
  if (filters.amountMin) {
    query = query.gte("acc_amt", Number(filters.amountMin));
  }
  if (filters.amountMax) {
    query = query.lte("acc_amt", Number(filters.amountMax));
  }
  if (filters.rcpNo) {
    query = query.ilike("rcp_no", `%${filters.rcpNo}%`);
  }
  if (filters.rcpUnattached) {
    query = query.eq("rcp_yn", "N");
  }
  return query;
}
