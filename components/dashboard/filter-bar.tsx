import { Filter, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { DashboardData, DashboardFilters } from "@/lib/types";

function optionSet(label: string, values: string[]) {
  return [
    { label, value: "all" },
    ...values.map((value) => ({
      label: value,
      value
    }))
  ];
}

function labeledOptionSet(
  label: string,
  values: Array<{ label: string; value: string }>
) {
  return [{ label, value: "all" }, ...values];
}

export function FilterBar({
  filters,
  data
}: {
  filters: DashboardFilters;
  data: DashboardData;
}) {
  return (
    <div className="border-t border-border bg-card/40">
      <form className="mx-auto grid max-w-7xl gap-2 px-4 py-3 md:grid-cols-[220px_1fr_auto] md:px-6">
        <label className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input
            name="wallet"
            defaultValue={filters.wallet ?? ""}
            placeholder="Search wallet..."
            className="pl-9"
          />
        </label>
        <details className="rounded-md border border-border bg-input px-3 py-2">
          <summary className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <Filter className="size-4" />
            Filters
          </summary>
          <div className="mt-3 grid gap-2 md:grid-cols-4">
            <Select
              name="mode"
              defaultValue={filters.mode ?? "paper"}
              aria-label="Mode"
              options={[
                { label: "Paper", value: "paper" },
                { label: "Live", value: "live" },
                { label: "All modes", value: "all" }
              ]}
            />
            <Select
              name="strategy"
              defaultValue={filters.strategy ?? "all"}
              aria-label="Strategy"
              options={optionSet("All strategies", data.filters.strategies)}
            />
            <Select
              name="deployment"
              defaultValue={filters.deployment ?? "all"}
              aria-label="Deployment"
              options={labeledOptionSet("All deployments", data.filters.deployments)}
            />
            <Select
              name="session"
              defaultValue={filters.session ?? "all"}
              aria-label="Session"
              options={optionSet("All sessions", data.filters.sessions)}
            />
            <Input
              name="start"
              type="date"
              defaultValue={filters.start ?? ""}
              aria-label="Start date"
            />
            <Input
              name="end"
              type="date"
              defaultValue={filters.end ?? ""}
              aria-label="End date"
            />
          </div>
        </details>
        <Button type="submit" size="sm" className="h-9">
          Apply
        </Button>
      </form>
    </div>
  );
}
