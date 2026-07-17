"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function HistoryControls({
  loadedEventCount,
  totalEventCount,
  hasMoreEvents
}: {
  loadedEventCount?: number;
  totalEventCount?: number;
  hasMoreEvents?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [amount, setAmount] = useState("100");
  const [isPending, startTransition] = useTransition();

  if (loadedEventCount === undefined || !hasMoreEvents) return null;
  const currentEventCount = loadedEventCount;
  const remainingEventCount = totalEventCount === undefined
    ? undefined
    : Math.max(0, totalEventCount - currentEventCount);

  function navigate(params: URLSearchParams) {
    startTransition(() => {
      router.push(`/?${params.toString()}#session-overview`);
    });
  }

  function loadMore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = Number.parseInt(amount, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    const nextAmount = remainingEventCount === undefined
      ? parsed
      : Math.min(parsed, remainingEventCount);
    if (nextAmount <= 0) return;

    const params = new URLSearchParams(searchParams.toString());
    params.set("tradeLimit", String(currentEventCount + nextAmount));
    params.delete("tradePage");
    params.delete("history");
    navigate(params);
  }

  function loadWholeHistory() {
    const params = new URLSearchParams(searchParams.toString());
    params.set("history", "all");
    params.delete("tradePage");
    params.delete("tradeLimit");
    navigate(params);
  }

  return (
    <div className="flex shrink-0 items-center gap-2 border-l border-border pl-2">
      {totalEventCount !== undefined ? (
        <span className="font-mono tabular-nums text-muted-foreground">
          {currentEventCount.toLocaleString()}/{totalEventCount.toLocaleString()}
        </span>
      ) : null}
      <form className="flex items-center gap-1" onSubmit={loadMore}>
        <label className="sr-only" htmlFor="history-load-amount">
          Additional session events to load
        </label>
        <Input
          id="history-load-amount"
          type="number"
          min="1"
          max={remainingEventCount}
          step="1"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          className="h-8 w-20 font-mono text-xs"
          disabled={isPending}
        />
        <Button type="submit" variant="outline" size="sm" disabled={isPending}>
          Load more
        </Button>
      </form>
      <Button type="button" variant="outline" size="sm" onClick={loadWholeHistory} disabled={isPending}>
        Whole history
      </Button>
    </div>
  );
}
