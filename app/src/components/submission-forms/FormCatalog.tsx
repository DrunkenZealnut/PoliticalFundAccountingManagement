"use client";

/**
 * 선관위 제출서류 카탈로그 — 조직타입별 서식을 카테고리로 묶어 표시, 검색·선택.
 */
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import type { HwpxFormDef } from "@/lib/hwpx/form-fields";

interface Props {
  forms: readonly HwpxFormDef[];
  selectedId: string | null;
  onSelect: (def: HwpxFormDef) => void;
}

export default function FormCatalog({ forms, selectedId, onSelect }: Props) {
  const [q, setQ] = useState("");

  const groups = useMemo(() => {
    const filtered = forms.filter(
      (f) => f.label.includes(q) || f.id.includes(q) || f.category.includes(q)
    );
    const map = new Map<string, HwpxFormDef[]>();
    for (const f of filtered) {
      const list = map.get(f.category) ?? [];
      list.push(f);
      map.set(f.category, list);
    }
    return Array.from(map.entries());
  }, [forms, q]);

  return (
    <div className="flex flex-col gap-3">
      <Input
        placeholder="서식 검색…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <nav className="flex flex-col gap-3">
        {groups.length === 0 && (
          <p className="px-1 text-sm text-muted-foreground">검색 결과가 없습니다.</p>
        )}
        {groups.map(([category, items]) => (
          <div key={category} className="flex flex-col gap-1">
            <p className="px-1 text-xs font-semibold text-muted-foreground">{category}</p>
            {items.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => onSelect(f)}
                className={`rounded-md px-3 py-2 text-left text-sm transition-colors ${
                  selectedId === f.id
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted"
                }`}
              >
                <span className="mr-1.5 text-xs opacity-70">{f.id}</span>
                {f.label}
              </button>
            ))}
          </div>
        ))}
      </nav>
    </div>
  );
}
