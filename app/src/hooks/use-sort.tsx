import { useState, useMemo, useCallback } from "react";

export type SortDir = "asc" | "desc";

export interface SortState {
  key: string;
  dir: SortDir;
}

export function useSort<T>(data: T[], defaultKey?: string, defaultDir: SortDir = "asc") {
  const [sort, setSort] = useState<SortState | null>(
    defaultKey ? { key: defaultKey, dir: defaultDir } : null
  );

  const toggle = useCallback((key: string) => {
    setSort((prev) => {
      if (prev?.key === key) {
        return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
      }
      return { key, dir: "asc" };
    });
  }, []);

  const sorted = useMemo(() => {
    if (!sort) return data;
    const { key, dir } = sort;
    return [...data].sort((a, b) => {
      const av = (a as Record<string, unknown>)[key];
      const bv = (b as Record<string, unknown>)[key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") {
        return dir === "asc" ? av - bv : bv - av;
      }
      const as = String(av);
      const bs = String(bv);
      return dir === "asc" ? as.localeCompare(bs, "ko") : bs.localeCompare(as, "ko");
    });
  }, [data, sort]);

  return { sorted, sort, toggle };
}

/** Sortable <th> — renders ▲/▼ indicator */
export function SortTh({
  label,
  sortKey,
  current,
  onToggle,
  className = "",
}: {
  label: string;
  sortKey: string;
  current: SortState | null;
  onToggle: (key: string) => void;
  className?: string;
}) {
  const active = current?.key === sortKey;
  const arrow = active ? (current.dir === "asc" ? " ▲" : " ▼") : "";
  return (
    <th
      className={`px-3 py-2 cursor-pointer select-none hover:bg-gray-100 ${className}`}
      onClick={() => onToggle(sortKey)}
    >
      {label}{arrow}
    </th>
  );
}
