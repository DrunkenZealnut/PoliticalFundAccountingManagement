"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";

interface ReceiptAlertProps {
  count: number;
}

export function ReceiptAlert({ count }: ReceiptAlertProps) {
  if (count === 0) return null;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20 px-4 py-3">
      <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
      <p className="text-sm text-amber-800 dark:text-amber-200 flex-1">
        영수증 미첨부 거래가 <span className="font-semibold">{count}건</span> 있습니다.
      </p>
      <Link
        href="/dashboard/income-expense-book"
        className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-300 hover:underline shrink-0"
      >
        확인하기 <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
}
