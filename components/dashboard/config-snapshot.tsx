export function ConfigSnapshot({
  config
}: {
  config?: Record<string, unknown>;
}) {
  if (!config) return null;

  const entries = Object.entries(config).sort(([left], [right]) =>
    left.localeCompare(right)
  );

  return (
    <section className="rounded-md border border-border bg-muted/20 p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Config snapshot</h2>
        <span className="font-mono text-xs text-muted-foreground">
          {entries.length} fields
        </span>
      </div>
      <div className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
        {entries.map(([key, value]) => (
          <div
            key={key}
            className="min-w-0 rounded-md border border-border bg-background/60 px-3 py-2"
          >
            <div className="truncate text-muted-foreground">{key}</div>
            <div className="mt-1 truncate font-mono tabular-nums">
              {formatConfigValue(value)}
            </div>
          </div>
        ))}
      </div>
      <details className="mt-3 rounded-md border border-border bg-background/60 p-3">
        <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
          Raw JSON
        </summary>
        <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words font-mono text-xs text-muted-foreground">
          {JSON.stringify(config, null, 2)}
        </pre>
      </details>
    </section>
  );
}

function formatConfigValue(value: unknown) {
  if (typeof value === "number") {
    return Number.isInteger(value) ? value.toString() : value.toFixed(6);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}
