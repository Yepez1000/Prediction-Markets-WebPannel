import type { PortfolioSizingSnapshot } from "@/lib/types";

export function PortfolioSizing({
  sizing
}: {
  sizing?: PortfolioSizingSnapshot;
}) {
  if (!sizing) return null;

  const formulaValue =
    sizing.riskBudget !== undefined && sizing.percentileValue
      ? sizing.riskBudget / sizing.percentileValue
      : sizing.computedPct;

  return (
    <section className="grid gap-3 rounded-md border border-border bg-muted/20 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Portfolio sizing</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {sizing.source}
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
