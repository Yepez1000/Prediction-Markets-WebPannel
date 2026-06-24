import * as React from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

type SelectProps = React.ComponentProps<"select"> & {
  options: Array<{ label: string; value: string }>;
};

function Select({ className, options, ...props }: SelectProps) {
  return (
    <span className="relative block">
      <select
        className={cn(
          "h-9 w-full appearance-none rounded-md border border-border/80 bg-input py-1 pl-3 pr-8 font-mono text-sm text-foreground outline-none transition-colors focus:ring-2 focus:ring-ring",
          className
        )}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 size-4 text-muted-foreground" />
    </span>
  );
}

export { Select };
