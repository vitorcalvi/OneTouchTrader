import React, { ReactNode, useMemo, useState, useEffect } from "react";
import {
  Wallet,
  Activity,
  ChevronLeft,
  ChevronRight,
  Newspaper,
  Sun,
  Moon,
  Calendar,
  Smartphone,
} from "lucide-react";
import type { Account, AlpacaConfig } from "../types";
import type { AccountSummary } from "../services/api/account";
import { AccountSummaryBar } from "../components/Stocks/TradePositions/panels/AccountSummaryBar";
import { useNavigate, useLocation } from "react-router-dom";

export type ViewType = "trade" | "news" | "earnings" | "mobile";

interface Props {
  children: ReactNode;
  view: ViewType;
  account: Account | null;
  config: AlpacaConfig | null;
  loading: boolean;
  onAccountModeChange?: (isPaper: boolean) => void;
  paperAvailable?: boolean;
  liveAvailable?: boolean;
}

const NAV_ITEMS = [
  {
    id: "trade" as const,
    label: "Active Trading",
    icon: Wallet,
    path: "/stocks-trading",
  },
  { id: "news" as const, label: "News", icon: Newspaper, path: "/news" },
  {
    id: "earnings" as const,
    label: "Earnings",
    icon: Calendar,
    path: "/earnings",
  },
  { id: "mobile" as const, label: "Mobile", icon: Smartphone, path: "/mobile" },
];

const getHeaderText = (view: ViewType) => {
  // REFACTORED: Renamed 'Active Trading' to 'TRADE DESK'
  switch (view) {
    case "trade":
      return "TRADE DESK";
    case "news":
      return "Market News";
    case "earnings":
      return "Earnings Calendar";
    case "mobile":
      return "Mobile View";
    default:
      return "TRADE DESK";
  }
};

const isAccountSummary = (value: Account | null): value is AccountSummary => {
  return Boolean(
    value &&
    "regt_buying_power" in value &&
    "non_marginable_buying_power" in value &&
    "trading_blocked" in value,
  );
};

export const DashboardLayout: React.FC<Props> = ({
  children,
  view,
  account,
  config,
  loading,
  onAccountModeChange,
  paperAvailable = true,
  liveAvailable = true,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [theme, setTheme] = useState("dark");
  const [marketTick, setMarketTick] = useState(0);

  useEffect(() => {
    if (theme === "light") {
      document.documentElement.classList.add("light");
    } else {
      document.documentElement.classList.remove("light");
    }
  }, [theme]);

  const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark");

  useEffect(() => {
    const id = window.setInterval(() => setMarketTick((t) => t + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const toggleSidebar = () => setIsSidebarCollapsed(!isSidebarCollapsed);

  const summaryAccount = isAccountSummary(account) ? account : null;
  const marketInfo = useMemo(() => {
    const getEtNow = () =>
      new Date(
        new Date().toLocaleString("en-US", { timeZone: "America/New_York" }),
      );
    const now = getEtNow();
    const isWeekday = now.getDay() >= 1 && now.getDay() <= 5;
    const open = new Date(now);
    open.setHours(9, 30, 0, 0);
    const close = new Date(now);
    close.setHours(16, 0, 0, 0);
    const isOpen = isWeekday && now >= open && now < close;

    if (!isOpen) return { isOpen: false, session: "—", untilClose: "—" };

    // Time elapsed since market open
    const elapsedMs = Math.max(0, now.getTime() - open.getTime());
    const elapsedMin = Math.floor(elapsedMs / 60_000);
    const h = Math.floor(elapsedMin / 60);
    const m = elapsedMin % 60;

    // Time until market close
    const untilCloseMs = Math.max(0, close.getTime() - now.getTime());
    const untilCloseMin = Math.floor(untilCloseMs / 60_000);
    const hClose = Math.floor(untilCloseMin / 60);
    const mClose = untilCloseMin % 60;

    return {
      isOpen: true,
      session: `${h}h ${m}m`,
      untilClose: `${hClose}h ${mClose}m`,
    };
  }, [marketTick]);

  // Get current path for active nav state
  const currentPath = location.pathname;

  return (
    <div className="h-[100dvh] w-full bg-base text-primary font-sans flex flex-col md:flex-row overflow-hidden">
      {/* Sidebar - Desktop */}
      <aside
        className={`${
          isSidebarCollapsed ? "w-20" : "w-64"
        } bg-base border-r border-border hidden md:flex flex-col h-full shrink-0 transition-all duration-300 ease-in-out relative`}
        aria-label="Main Sidebar"
      >
        {/* Logo Row */}
        <div className="h-16 px-4 flex items-center justify-between border-b border-border overflow-hidden gap-2">
          <div className="flex items-center space-x-3 min-w-max">
            <div className="w-8 h-8 bg-gradient-to-tr from-accent to-purple-500 rounded-xl flex items-center justify-center shadow-lg shadow-accent/20 shrink-0">
              <Activity size={18} className="text-primary" />
            </div>
            {!isSidebarCollapsed && (
              <span className="text-xl font-black tracking-tight text-primary transition-opacity duration-300">
                Alpaca<span className="text-accent">Pro</span>
              </span>
            )}
          </div>
          {!isSidebarCollapsed && (
            <button
              type="button"
              onClick={toggleTheme}
              className="p-2 rounded-lg text-muted hover:text-primary hover:bg-white/5 transition-colors"
              title={
                theme === "dark"
                  ? "Switch to light mode"
                  : "Switch to dark mode"
              }
            >
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          )}
          {isSidebarCollapsed && (
            <button
              type="button"
              onClick={toggleTheme}
              className="p-2 rounded-lg text-muted hover:text-primary hover:bg-white/5 transition-colors"
              title={
                theme === "dark"
                  ? "Switch to light mode"
                  : "Switch to dark mode"
              }
            >
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1 overflow-hidden">
          {NAV_ITEMS.map(({ id, label, icon: Icon, path }) => (
            <button
              type="button"
              key={id}
              onClick={() => navigate(path)}
              aria-current={currentPath === path ? "page" : undefined}
              aria-label={label}
              className={`w-full flex items-center px-4 py-3 rounded-xl transition-all duration-200 font-bold ${
                currentPath === path
                  ? "bg-accent/20 text-accent border border-accent/30 shadow-lg shadow-accent/10"
                  : "text-muted hover:bg-white/5 hover:text-secondary border border-transparent"
              } ${isSidebarCollapsed ? "justify-center" : "space-x-3"}`}
            >
              <Icon size={20} className="shrink-0" />
              {!isSidebarCollapsed && (
                <span className="truncate transition-opacity duration-300">
                  {label}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* Toggle Button - Absolute positioned for smooth feel */}
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label={
            isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"
          }
          className="absolute -right-3 top-20 bg-surface border border-border rounded-full p-1 text-muted hover:text-primary hover:bg-white/5 transition-all shadow-md z-10"
        >
          {isSidebarCollapsed ? (
            <ChevronRight size={14} />
          ) : (
            <ChevronLeft size={14} />
          )}
        </button>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden bg-base">
        {/* Top Header (h-auto for responsive content) - Desktop only */}
        <header className="bg-base border-b border-border px-6 py-3 hidden md:flex items-center justify-between gap-6 shrink-0">
          <div className="flex flex-col gap-1 shrink-0">
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-black text-primary tracking-tight whitespace-nowrap">
                {getHeaderText(view)}
              </h1>
              <div className="inline-flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => paperAvailable !== false && onAccountModeChange?.(true)}
                  disabled={paperAvailable === false}
                  className={`px-3 py-1 rounded-md text-[11px] font-black uppercase tracking-wider border transition-colors ${
                    paperAvailable === false
                      ? 'bg-transparent text-[#4a5568] border-border cursor-not-allowed'
                      : config?.isPaper
                        ? "bg-bull-bg text-bull-light border-bull-border"
                        : "bg-transparent text-muted border-border hover:text-secondary hover:border-surface"
                  }`}
                >
                  Paper
                </button>
                <button
                  type="button"
                  onClick={() => liveAvailable !== false && onAccountModeChange?.(false)}
                  disabled={liveAvailable === false}
                  className={`px-3 py-1 rounded-md text-[11px] font-black uppercase tracking-wider border transition-colors ${
                    liveAvailable === false
                      ? 'bg-transparent text-[#4a5568] border-border cursor-not-allowed'
                      : config && !config.isPaper
                        ? "bg-bear-bg text-bear-light border-bear-border"
                        : "bg-transparent text-muted border-border hover:text-secondary hover:border-surface"
                  }`}
                >
                  Live
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2 text-[11px] text-muted">
                <span
                  className={`inline-block w-1.5 h-1.5 rounded-full ${marketInfo.isOpen ? "bg-bull" : "bg-muted"}`}
                />
                <span className="font-semibold">
                  {marketInfo.isOpen ? "Market Open" : "Market Closed"}
                </span>
                <span className="text-muted">•</span>
                <span className="font-semibold">Session:</span>
                <span className="font-semibold text-secondary">
                  {marketInfo.session}
                </span>
              </div>
              {marketInfo.isOpen && (
                <div className="flex items-center gap-2 text-[11px] text-muted ml-4">
                  <span className="font-semibold">Until Close:</span>
                  <span className="font-semibold text-secondary">
                    {marketInfo.untilClose}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 min-w-0">
            {loading && (
              <div className="grid grid-cols-5 gap-3 w-full animate-pulse">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="h-16 bg-surface rounded-xl border border-border"
                  />
                ))}
              </div>
            )}
            {!loading && account && (
              <div className="w-full">
                <AccountSummaryBar
                  initialAccount={summaryAccount}
                  isLive={!config?.isPaper}
                />
              </div>
            )}
          </div>
        </header>

        {/* Mobile Top Bar */}
        <div className="md:hidden fixed top-0 left-0 right-0 bg-base/95 backdrop-blur-md border-b border-border h-14 px-4 z-40 flex justify-between items-center pt-[env(safe-area-inset-top)] shadow-sm">
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 bg-gradient-to-tr from-accent to-purple-500 rounded-lg flex items-center justify-center">
              <Activity size={14} className="text-primary" />
            </div>
            <span className="font-black text-primary tracking-tight">
              AlpacaPro
            </span>
            {config && (
              <div className="inline-flex rounded-md border border-border bg-surface p-0.5">
                <button
                  type="button"
                  onClick={() => onAccountModeChange?.(true)}
                  className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded ${
                    config.isPaper ? "bg-warn-bg text-warn-light" : "text-muted"
                  }`}
                >
                  Paper
                </button>
                <button
                  type="button"
                  onClick={() => onAccountModeChange?.(false)}
                  className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded ${
                    !config.isPaper
                      ? "bg-bear-bg text-bear-light"
                      : "text-muted"
                  }`}
                >
                  Live
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={toggleTheme}
              className="p-2 rounded-lg text-muted hover:text-primary hover:bg-white/5 transition-colors"
              title={
                theme === "dark"
                  ? "Switch to light mode"
                  : "Switch to dark mode"
              }
            >
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            {account && (
              <div className="flex flex-col items-end">
                <span className="text-[10px] text-muted uppercase leading-none font-bold">
                  Equity
                </span>
                <span className="text-sm font-mono font-black text-primary leading-none">
                  ${Math.round(parseFloat(account.equity)).toLocaleString()}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden bg-base p-6 md:p-8 pt-14 pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-8 md:pt-6">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-base border-t border-border pb-[env(safe-area-inset-bottom)] z-50 flex justify-around items-center h-[calc(3.5rem+env(safe-area-inset-bottom))]">
        {/* Center Trade Button */}
        <div className="relative -top-5">
          <button
            type="button"
            onClick={() => navigate("/stocks-trading")}
            className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg border-4 border-base transition-transform active:scale-95 ${
              currentPath === "/stocks-trading"
                ? "bg-accent text-primary shadow-accent/30"
                : "bg-surface text-muted"
            }`}
          >
            <Wallet
              size={24}
              fill={currentPath === "/stocks-trading" ? "currentColor" : "none"}
            />
          </button>
        </div>

        <button
          type="button"
          onClick={() => navigate("/news")}
          className={`flex-1 flex flex-col items-center justify-center h-full space-y-1 active:bg-white/5 transition-colors ${
            currentPath === "/news" ? "text-accent" : "text-muted"
          }`}
        >
          <Newspaper
            size={20}
            strokeWidth={currentPath === "/news" ? 2.5 : 2}
          />
          <span className="text-[10px] font-bold">News</span>
        </button>

        <button
          type="button"
          onClick={() => navigate("/earnings")}
          className={`flex-1 flex flex-col items-center justify-center h-full space-y-1 active:bg-white/5 transition-colors ${
            currentPath === "/earnings" ? "text-accent" : "text-muted"
          }`}
        >
          <Calendar
            size={20}
            strokeWidth={currentPath === "/earnings" ? 2.5 : 2}
          />
          <span className="text-[10px] font-bold">Earnings</span>
        </button>
      </nav>
    </div>
  );
};

export default DashboardLayout;
