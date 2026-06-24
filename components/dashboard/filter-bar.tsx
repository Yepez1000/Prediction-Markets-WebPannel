import { Search, SlidersHorizontal } from "lucide-react";

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

export function FilterBar({
  filters,
  data
}: {
  filters: DashboardFilters;
  data: DashboardData;
}) {
  return (
    <form className="grid gap-2 border-y border-border/70 bg-card/55 p-3 md:grid-cols-[120px_150px_150px_150px_150px_1fr_auto]">
      <Select
        name="mode"
        defaultValue={filters.mode ?? "all"}
        aria-label="Mode"
        options={[
          { label: "All modes", value: "all" },
          { label: "Paper", value: "paper" },
          { label: "Live", value: "live" }
        ]}
      />
      <Select
        name="strategy"
        defaultValue={filters.strategy ?? "all"}
        aria-label="Strategy"
        options={optionSet("All strategies", data.filters.strategies)}
      />
      <Select
        name="instance"
        defaultValue={filters.instance ?? "all"}
        aria-label="Instance"
        options={optionSet("All instances", data.filters.instances)}
      />
      <Select
        name="session"
        defaultValue={filters.session ?? "all"}
        aria-label="Session"
        options={optionSet("All sessions", data.filters.sessions)}
      />
      <Select
        name="category"
        defaultValue={filters.category ?? "all"}
        aria-label="Category"
        options={optionSet("All categories", data.filters.categories)}
      />
      <label className="relative">
        <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
        <Input
          name="wallet"
          defaultValue={filters.wallet ?? ""}
          placeholder="wallet, source, or signal JSON"
          className="pl-9"
        />
      </label>
      <Button type="submit" size="sm" className="h-9">
        <SlidersHorizontal className="size-4" />
        Apply
      </Button>
    </form>
  );
}
