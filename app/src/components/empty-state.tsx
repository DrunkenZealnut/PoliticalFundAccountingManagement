"use client";

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

interface EmptyStateAction {
  label: string;
  href: string;
  variant?: "default" | "outline";
}

interface EmptyStateProps {
  icon?: string;
  title: string;
  description: string;
  actions: EmptyStateAction[];
}

export function EmptyState({ icon = "📋", title, description, actions }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center" role="status">
      <span className="text-4xl mb-3" aria-hidden="true">{icon}</span>
      <h3 className="text-base font-semibold text-gray-900 mb-1">{title}</h3>
      <p className="text-sm text-gray-500 mb-4 max-w-sm">{description}</p>
      <div className="flex gap-2">
        {actions.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className={buttonVariants({ size: "sm", variant: action.variant || "default" })}
          >
            {action.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
