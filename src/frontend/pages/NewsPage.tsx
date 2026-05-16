import { NewsProvider } from "../components/Stocks/News/hooks/useNews";
import { DashboardLayout } from "../layouts/DashboardLayout";
import { lazy, Suspense } from "react";

const NewsPanel = lazy(
  () => import("../components/Stocks/News/panels/NewsPanel"),
);

export function NewsPage() {
  return (
    <DashboardLayout view="news" account={null} config={null} loading={false}>
      <NewsProvider>
        <Suspense fallback={<div>Loading...</div>}>
          <NewsPanel />
        </Suspense>
      </NewsProvider>
    </DashboardLayout>
  );
}
