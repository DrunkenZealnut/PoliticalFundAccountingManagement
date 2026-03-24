"use client";

import { Label } from "@/components/ui/label";
import type { CodeValue } from "@/hooks/use-code-values";

// 특정 코드값에 대한 부가 설명 (드롭다운 옵션에 표시)
const CODE_HINTS: Record<number, string> = {
  86: "선거에 직접 소요되는 비용",
  87: "통상적 정치활동 비용",
};

interface CodeSelectProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  options: CodeValue[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  tooltip?: string;
}

export function CodeSelect({
  label,
  value,
  onChange,
  options,
  placeholder = "선택",
  disabled = false,
  className = "",
  tooltip,
}: CodeSelectProps) {
  return (
    <div className={className}>
      {label && (
        <div className="flex items-center gap-1">
          <Label>{label}</Label>
          {tooltip && (
            <span className="relative group">
              <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-gray-300 text-gray-400 text-[9px] font-bold cursor-help leading-none">?</span>
              <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 hidden group-hover:block w-72 p-2.5 rounded-md bg-white text-gray-900 border border-gray-200 shadow-lg text-xs leading-relaxed z-50 whitespace-pre-line">{tooltip}</span>
            </span>
          )}
        </div>
      )}
      <select
        className="w-full mt-0.5 border rounded px-3 py-2 text-sm disabled:bg-gray-100 disabled:text-gray-500"
        value={value || ""}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt.cv_id} value={opt.cv_id}>
            {opt.cv_name}{CODE_HINTS[opt.cv_id] ? ` — ${CODE_HINTS[opt.cv_id]}` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
