import { Dashboard } from "@/components/dashboard/dashboard";
import {
  SessionComparison,
  SessionComparisonSkeleton
} from "@/components/dashboard/session-comparison";
import { getDashboardData } from "@/lib/analytics";
import { getSessionComparison } from "@/lib/reconciliation";
import type { DashboardFilters } from "@/lib/types";
import { Suspense } from "react";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function readParam(
  params: Record<string, string | string[] | undefined>,
  key: keyof DashboardFilters
) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function Home({
  searchParams
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const filters: DashboardFilters = {
    mode: readParam(params, "mode") ?? "paper",
    strategy: readParam(params, "strategy"),
    deployment: readParam(params, "deployment"),
    instance: readParam(params, "instance"),
    session: readParam(params, "session"),
    category: readParam(params, "category"),
    asset: readParam(params, "asset"),
    wallet: readParam(params, "wallet"),
    source: readParam(params, "source"),
    start: readParam(params, "start"),
    end: readParam(params, "end"),
    pnlView: readParam(params, "pnlView") as DashboardFilters["pnlView"],
    sourceScope: readParam(params, "sourceScope") as DashboardFilters["sourceScope"],
    pnlUnit: readParam(params, "pnlUnit") as DashboardFilters["pnlUnit"],
    sessionSort: readParam(params, "sessionSort") as DashboardFilters["sessionSort"],
    sessionDirection: readParam(params, "sessionDirection") as DashboardFilters["sessionDirection"]
  };

  const sessionId = filters.session && filters.session !== "all" ? filters.session : undefined;
  const comparisonPromise = sessionId
    ? getSessionComparison(sessionId, filters)
    : undefined;
  const data = await getDashboardData(filters);

  const comparison = sessionId ? (
    <Suspense fallback={<SessionComparisonSkeleton />}>
      <SessionComparison
        sessionId={sessionId}
        filters={filters}
        comparisonPromise={comparisonPromise}
      />
    </Suspense>
  ) : undefined;

  return <Dashboard data={data} filters={filters} comparison={comparison} />;
}
