import { EarningsProvider } from "../components/Stocks/Earnings/hooks/useEarnings";
import { DashboardLayout } from "../layouts/DashboardLayout";
import { lazy, Suspense } from "react";

const EarningsPanel = lazy(
  () => import("../components/Stocks/Earnings/panels/EarningsPanel"),
);

export function EarningsPage() {
  return (
    <DashboardLayout
      view="earnings"
      account={null}
      config={null}
      loading={false}
    >
      <EarningsProvider>
        <Suspense fallback={<div>Loading...</div>}>
          <EarningsPanel />
        </Suspense>
      </EarningsProvider>
    </DashboardLayout>
  );
}
