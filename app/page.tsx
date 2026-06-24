import { Dashboard } from "@/components/dashboard/dashboard";
import { getDashboardData } from "@/lib/analytics";
import type { DashboardFilters } from "@/lib/types";

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
    mode: readParam(params, "mode"),
    strategy: readParam(params, "strategy"),
    instance: readParam(params, "instance"),
    session: readParam(params, "session"),
    category: readParam(params, "category"),
    wallet: readParam(params, "wallet"),
    start: readParam(params, "start"),
    end: readParam(params, "end")
  };

  const data = await getDashboardData(filters);

  return <Dashboard data={data} filters={filters} />;
}
