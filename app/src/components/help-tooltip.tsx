"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useBeginnerMode } from "@/stores/beginner-mode";
import { HELP_TEXTS } from "@/lib/help-texts";

interface HelpTooltipProps {
  id: string;
  children: React.ReactNode;
}

export function HelpTooltip({ id, children }: HelpTooltipProps) {
  const isEnabled = useBeginnerMode((s) => s.isEnabled);
  const tooltip = HELP_TEXTS[id];

  if (!isEnabled || !tooltip) return <>{children}</>;

  return (
    <TooltipProvider delay={300}>
      <Tooltip>
        <TooltipTrigger render={<span />}>{children}</TooltipTrigger>
        <TooltipContent className="max-w-xs text-sm">
          <p className="font-semibold text-gray-900">{tooltip.title}</p>
          <p className="text-gray-600 mt-0.5">{tooltip.description}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
