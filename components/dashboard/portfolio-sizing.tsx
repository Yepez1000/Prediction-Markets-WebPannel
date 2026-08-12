import type { PortfolioSizingSnapshot, StrategySizingSnapshot } from "@/lib/types";

export function PortfolioSizing({
  sizing,
  snapshots = []
}: {
  sizing?: PortfolioSizingSnapshot;
  snapshots?: StrategySizingSnapshot[];
}) {
  const items = snapshots.length > 0
    ? snapshots
    : sizing
      ? [{ id: "session", createdAt: "", sizing }]
      : [];
  if (items.length === 0) return null;

  const [latest, ...history] = items;

  return (
    <section id="portfolio-sizing" className="scroll-mt-16 grid gap-4 rounded-md border border-border bg-muted/20 p-3">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border/70 pb-3">
        <div>
          <h2 className="text-sm font-semibold">Portfolio sizing snapshots</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Latest calculation expanded. Historical distributions stay collapsed until needed.
          </p>
        </div>
        <div className="font-mono text-xs tabular-nums text-muted-foreground">
          {items.length} calculation{items.length === 1 ? "" : "s"}
        </div>
      </div>
      <SizingSnapshotPanel snapshot={latest} latest />
      {history.length > 0 ? <SizingHistory snapshots={history} latest={latest} /> : null}
    </section>
  );
}

function SizingHistory({
  snapshots,
  latest
}: {
  snapshots: StrategySizingSnapshot[];
  latest: StrategySizingSnapshot;
}) {
  return (
    <section className="overflow-hidden rounded-md border border-border bg-background/30">
      <div className="hidden grid-cols-[minmax(132px,1.4fr)_minmax(84px,0.7fr)_minmax(84px,0.7fr)_minmax(92px,0.8fr)] gap-3 border-b border-border bg-muted/30 px-3 py-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:grid">
        <span>Calculation</span>
        <span className="text-right">Sizing</span>
        <span className="text-right">Change</span>
        <span className="text-right">Pctl value</span>
      </div>
      <div className="divide-y divide-border">
        {snapshots.map((snapshot) => {
          const delta = snapshot.sizing.computedPct - latest.sizing.computedPct;
          return (
            <details key={snapshot.id} className="group">
              <summary className="grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 text-xs transition-colors hover:bg-muted/30 focus-visible:bg-muted/30 focus-visible:outline-none sm:grid-cols-[minmax(132px,1.4fr)_minmax(84px,0.7fr)_minmax(84px,0.7fr)_minmax(92px,0.8fr)]">
                <span className="min-w-0">
                  <span className="block truncate font-medium text-foreground">
                    {formatSnapshotTime(snapshot.createdAt)}
                  </span>
                  <span className="block truncate pt-0.5 text-[11px] text-muted-foreground">
                    {snapshot.sizing.source}
                    {snapshot.sizing.sampleCount !== undefined
                      ? ` / ${snapshot.sizing.sampleCount.toLocaleString()} samples`
                      : ""}
                  </span>
                </span>
                <span className="text-right font-mono tabular-nums text-primary sm:hidden">
                  {formatSizingPercent(snapshot.sizing.computedPct)}
                </span>
                <span className="hidden text-right font-mono tabular-nums text-primary sm:block">
                  {formatSizingPercent(snapshot.sizing.computedPct)}
                </span>
                <span className={`hidden text-right font-mono tabular-nums sm:block ${delta === 0 ? "text-muted-foreground" : delta > 0 ? "text-profit" : "text-loss"}`}>
                  {formatSizingDelta(delta)}
                </span>
                <span className="hidden text-right font-mono tabular-nums text-muted-foreground sm:block">
                  {money(snapshot.sizing.percentileValue)}
                </span>
              </summary>
              <div className="border-t border-border bg-muted/10 p-3">
                <SizingSnapshotPanel snapshot={snapshot} compact />
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}

function SizingSnapshotPanel({
  snapshot,
  latest = false,
  compact = false
}: {
  snapshot: StrategySizingSnapshot;
  latest?: boolean;
  compact?: boolean;
}) {
  const { sizing } = snapshot;
  const formulaValue =
    sizing.riskBudget !== undefined && sizing.percentileValue
      ? sizing.riskBudget / sizing.percentileValue
      : sizing.computedPct;

  return (
    <section className={compact ? "grid gap-3" : "grid gap-3 rounded-md border border-primary/25 bg-background/40 p-3"}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">{sizing.source}</h3>
            {latest ? (
              <span className="rounded-sm border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                Latest
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatSnapshotTime(snapshot.createdAt)}
            {sizing.sampleCount !== undefined ? ` / ${sizing.sampleCount} samples` : ""}
          </p>
        </div>
        <div className="font-mono text-2xl font-semibold tabular-nums text-primary">
          {formatSizingPercent(sizing.computedPct)}
        </div>
      </div>
      <div className="grid gap-2 text-sm sm:grid-cols-4">
        <SizingStat label="Bankroll" value={money(sizing.bankroll)} />
        <SizingStat label="Risk budget" value={money(sizing.riskBudget)} />
        <SizingStat
          label={`P${sizing.percentile ?? 0} deployment`}
          value={money(sizing.percentileValue)}
        />
        <SizingStat
          label="Configured pct"
          value={
            sizing.configuredPct === undefined
              ? "n/a"
              : formatSizingPercent(sizing.configuredPct)
          }
        />
      </div>

      <div className="rounded-md border border-border bg-background/60 p-3 font-mono text-xs text-muted-foreground">
        <span className="text-foreground">portfolio_pct</span>
        {" = min(1, "}
        <span>{money(sizing.bankroll)}</span>
        {" * "}
        <span>
          {sizing.riskFraction === undefined
            ? "risk"
            : formatSizingPercent(sizing.riskFraction)}
        </span>
        {" / "}
        <span>{money(sizing.percentileValue)}</span>
        {") = "}
        <span className="text-primary">{formatSizingPercent(formulaValue)}</span>
      </div>

      <DistributionChart sizing={sizing} />

      {sizing.summary ? (
        <div className="grid gap-2 text-xs sm:grid-cols-5">
          <SizingStat label="Median" value={money(sizing.summary.median)} />
          <SizingStat label="Average" value={money(sizing.summary.average)} />
          <SizingStat label="P75" value={money(sizing.summary.p75)} />
          <SizingStat label="P90" value={money(sizing.summary.p90)} />
          <SizingStat label="P95" value={money(sizing.summary.p95)} />
        </div>
      ) : null}
    </section>
  );
}

function DistributionChart({ sizing }: { sizing: PortfolioSizingSnapshot }) {
  const bins = sizing.distribution?.bins ?? [];
  if (bins.length === 0) return null;

  const width = 900;
  const height = 260;
  const padding = 24;
  const maxCount =
    sizing.distribution?.maxCount ?? Math.max(1, ...bins.map((bin) => bin.count));
  const minX = Math.min(...bins.map((bin) => bin.x0));
  const maxX = Math.max(...bins.map((bin) => bin.x1));
  const xRange = maxX - minX || 1;
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const xFor = (value: number) => padding + ((value - minX) / xRange) * innerWidth;
  const yForCount = (count: number) =>
    height - padding - (count / Math.max(1, maxCount)) * innerHeight;
  const normalFit = sizing.distribution?.normalFit ?? [];
  const maxDensity =
    sizing.distribution?.maxDensity ??
    Math.max(0, ...normalFit.map((point) => point.density));
  const yForDensity = (density: number) =>
    height - padding - (density / Math.max(1e-9, maxDensity)) * innerHeight;
  const normalPath = normalFit
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"} ${xFor(point.x)} ${yForDensity(point.density)}`
    )
    .join(" ");
  const markerX =
    sizing.percentileValue !== undefined ? xFor(sizing.percentileValue) : undefined;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-[260px] w-full rounded-md border border-border bg-[#111315]"
      preserveAspectRatio="none"
      role="img"
      aria-label="Wallet position value distribution"
    >
      {bins.map((bin) => {
        const x = xFor(bin.x0);
        const barWidth = Math.max(2, xFor(bin.x1) - x - 2);
        const y = yForCount(bin.count);
        return (
          <rect
            key={`${bin.x0}-${bin.x1}`}
            x={x}
            y={y}
            width={barWidth}
            height={height - padding - y}
            fill="rgb(34 197 94)"
            opacity="0.45"
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
      {normalPath ? (
        <path
          d={normalPath}
          fill="none"
          stroke="rgb(59 130 246)"
          strokeWidth="3"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
      {markerX !== undefined ? (
        <line
          x1={markerX}
          x2={markerX}
          y1={padding}
          y2={height - padding}
          stroke="rgb(234 179 8)"
          strokeDasharray="6 6"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
      <text x={padding} y={height - 7} className="fill-muted-foreground text-[11px]">
        {money(minX)}
      </text>
      <text
        x={width - padding}
        y={height - 7}
        textAnchor="end"
        className="fill-muted-foreground text-[11px]"
      >
        {money(maxX)}
      </text>
    </svg>
  );
}

function SizingStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background/60 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-sm tabular-nums">{value}</div>
    </div>
  );
}

function money(value: number | undefined) {
  if (value === undefined) return "n/a";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  }).format(value);
}

function formatSizingPercent(value: number) {
  return `${(value * 100).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4
  })}%`;
}

function formatSizingDelta(value: number) {
  if (value === 0) return "0.00 pp";
  return `${value > 0 ? "+" : ""}${(value * 100).toFixed(2)} pp`;
}

function formatSnapshotTime(value: string) {
  if (!value) return "Session default";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}
