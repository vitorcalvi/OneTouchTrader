import { useState, useEffect, Suspense, lazy, useCallback } from "react";
import { AlpacaConfig, Account } from "../types";
import { AlpacaService } from "../services/stocks";
import { getEnvConfig } from "../config/envConfig";
import { DashboardLayout } from "../layouts/DashboardLayout";
import { Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { logger } from "../utils/logger";

const TradePanel = lazy(
  () => import("../components/Stocks/TradePositions/panels/TradePanel"),
);

export function StocksTradingPage() {
  const [config, setConfig] = useState<AlpacaConfig>(() => getEnvConfig());
  const [service, setService] = useState<AlpacaService>(
    () => new AlpacaService(getEnvConfig()),
  );

  const [account, setAccount] = useState<Account | null>(null);
  const [authError, setAuthError] = useState<{
    isHalted: boolean;
    message: string;
    isLiveMode: boolean;
  } | null>(null);
  const [paperAvailable, setPaperAvailable] = useState(true);
  const [liveAvailable, setLiveAvailable] = useState(true);

  const logAction = useCallback(
    (
      actionType: string,
      data: Record<string, unknown>,
      result: string = "start",
    ) => {
      logger.debug("Action", { type: actionType, data, result });
    },
    [],
  );

  const [loading, setLoading] = useState<boolean>(!!service);

  useEffect(() => {
    fetch('/api/alpaca/health')
      .then(r => r.json())
      .then(data => {
        setPaperAvailable(data.hasPaperKeys !== false);
        setLiveAvailable(data.hasLiveKeys !== false);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setService(new AlpacaService(config));
  }, [config]);

  const handleAccountModeChange = useCallback(
    (isPaper: boolean) => {
      logAction("account.mode.change", { isPaper }, "start");
      setConfig((prev) => ({ ...prev, isPaper }));
      setAccount(null);
      setLoading(true);
      setAuthError(null);
      logAction("account.mode.change", { isPaper }, "success");
    },
    [logAction],
  );

  useEffect(() => {
    if (service) {
      service
        .getAccount()
        .then((acc) => {
          setAccount(acc);
          setAuthError(null);
          logAction(
            "account.fetch",
            { isPaper: config.isPaper, hasAccount: !!acc },
            "success",
          );
        })
        .catch((err) => {
          if (err.message.includes("401") || err.message.includes("403")) {
            const modeLabel = config.isPaper ? "Paper" : "Live";
            logger.error(
              `${modeLabel} authentication failed. Trading HALTED. Check API keys.`,
            );
            setAccount(null);
            logAction(
              "account.fetch",
              { isPaper: config.isPaper, error: err.message },
              "error",
            );

            setAuthError({
              isHalted: true,
              message: `${modeLabel} key rejected — trading halted. Check credentials.`,
              isLiveMode: !config.isPaper,
            });
          } else {
            setAccount(null);
            logger.error("Failed to fetch account:", err.message);
            logAction(
              "account.fetch",
              { isPaper: config.isPaper, error: err.message },
              "error",
            );
          }
        })
        .finally(() => setLoading(false));
    }
  }, [service, config, logAction]);

  const refreshAccount = useCallback(() => {
    if (service) {
      logAction("account.refresh", { isPaper: config.isPaper }, "start");
      service
        .getAccount()
        .then((acc) => {
          setAccount(acc);
          setAuthError(null);
          logAction(
            "account.refresh",
            { isPaper: config.isPaper, hasAccount: !!acc },
            "success",
          );
        })
        .catch((err) => {
          if (err.message.includes("401") || err.message.includes("403")) {
            const modeLabel = config.isPaper ? "Paper" : "Live";
            setAuthError({
              isHalted: true,
              message: `${modeLabel} key rejected — trading halted. Check credentials.`,
              isLiveMode: !config.isPaper,
            });
          }
          logAction(
            "account.refresh",
            { isPaper: config.isPaper, error: err?.message },
            "error",
          );
        });
    } else {
      logAction("account.refresh", { isPaper: config.isPaper }, "blocked");
    }
  }, [service, config.isPaper, logAction]);

  const ViewLoader = () => (
    <div className="w-full h-64 flex items-center justify-center">
      <Loader2 className="animate-spin text-indigo-500" size={32} />
    </div>
  );

  if (authError?.isHalted) {
    return (
      <div className="w-full h-screen flex flex-col items-center justify-center bg-gray-900/95 border border-red-500/20 rounded-xl p-8">
        <AlertTriangle className="text-red-500 mb-4" size={48} />
        <h2 className="text-xl font-semibold text-white">Trading Halted</h2>
        <p className="text-gray-300 mt-2 text-center">{authError.message}</p>
        <p className="text-sm text-gray-400 mt-1">
          {authError.isLiveMode
            ? "You were using Live mode keys. Switch to Paper mode and try again."
            : "Check your API credentials in .env file."}
        </p>
        <button
          type="button"
          className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors flex items-center gap-2"
          onClick={() => window.location.reload()}
        >
          <RefreshCw className="w-4 h-4" size={16} />
          Retry
        </button>
        {authError.isLiveMode && paperAvailable !== false && (
          <button
            type="button"
            className="mt-2 px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
            onClick={() => handleAccountModeChange(true)}
          >
            Switch to Paper Mode
          </button>
        )}
      </div>
    );
  }

  return (
    <DashboardLayout
      view="trade"
      account={account}
      config={config}
      loading={loading}
      onAccountModeChange={handleAccountModeChange}
      paperAvailable={paperAvailable}
      liveAvailable={liveAvailable}
    >
      <Suspense fallback={<ViewLoader />}>
        <TradePanel
          service={service!}
          account={account}
          onRefresh={refreshAccount}
          isLoading={loading}
        />
      </Suspense>
    </DashboardLayout>
  );
}
