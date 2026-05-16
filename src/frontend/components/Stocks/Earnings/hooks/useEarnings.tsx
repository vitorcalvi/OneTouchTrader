import {
  useState,
  useCallback,
  useEffect,
  createContext,
  useContext,
} from "react";
import type {
  EarningsItem,
  EarningsFilter,
  EarningsContextType,
} from "../types";

// Helper to get default date range (today to 30 days from now)
const getDefaultDateRange = () => {
  const today = new Date();
  const future = new Date();
  future.setDate(today.getDate() + 30);

  const formatDate = (date: Date) => date.toISOString().split("T")[0];

  return {
    from: formatDate(today),
    to: formatDate(future),
  };
};

const DEFAULT_FILTER: EarningsFilter = {
  symbol: "",
  dateRange: getDefaultDateRange(),
  viewMode: "calendar",
};

const EarningsContext = createContext<EarningsContextType | null>(null);

export function EarningsProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<EarningsItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilterState] = useState<EarningsFilter>(DEFAULT_FILTER);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState(Date.now());

  const selectItem = useCallback((id: string | null) => {
    setSelectedId(id);
  }, []);

  const setFilter = useCallback((partial: Partial<EarningsFilter>) => {
    setFilterState((prev) => ({ ...prev, ...partial }));
  }, []);

  const fetchEarnings = useCallback(
    async (signal?: AbortSignal) => {
      setIsLoading(true);
      setError(null);
      try {
        if (typeof window === "undefined" || !window.fetch) {
          setError("Earnings fetch not available in this environment");
          setItems([]);
          return;
        }

        const symbolsParam = filter.symbol ? `&symbol=${filter.symbol}` : "";
        const earningsUrl = `/api/alpaca/earnings?from=${filter.dateRange.from}&to=${filter.dateRange.to}${symbolsParam}`;

        const response = await fetch(earningsUrl, { signal });

        if (!response.ok) {
          throw new Error(`Failed to fetch earnings: ${response.statusText}`);
        }

        const data = await response.json();

        if (data?.data && Array.isArray(data.data)) {
          setItems(data.data);
        } else if (Array.isArray(data)) {
          setItems(data);
        } else {
          setItems([]);
        }

        setLastFetchedAt(Date.now());
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        const errorMessage =
          err instanceof Error ? err.message : "Failed to fetch earnings";
        setError(errorMessage);
        console.error("[Earnings] Fetch error:", err);
      } finally {
        setIsLoading(false);
      }
    },
    [filter.dateRange.from, filter.dateRange.to, filter.symbol],
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchEarnings(controller.signal);
    return () => controller.abort();
  }, [filter.dateRange.from, filter.dateRange.to, filter.symbol]);

  const value: EarningsContextType = {
    items,
    selectedId,
    filter,
    isLoading,
    error,
    lastFetchedAt,
    selectItem,
    setFilter,
    fetchEarnings: () => fetchEarnings(),
  };

  return (
    <EarningsContext.Provider value={value}>
      {children}
    </EarningsContext.Provider>
  );
}

export function useEarnings() {
  const context = useContext(EarningsContext);
  if (!context) {
    throw new Error("useEarnings must be used within EarningsProvider");
  }
  return context;
}
