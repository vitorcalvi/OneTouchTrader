import React, { useCallback, useEffect, useState } from 'react';
import { accountService, AccountSummary } from '../../../../services/api/account';

interface AccountSummaryBarProps {
  initialAccount?: AccountSummary | null;
  isLive?: boolean;
}

export const AccountSummaryBar: React.FC<AccountSummaryBarProps> = ({ 
  initialAccount = null, 
  isLive = false 
}) => {
  const [account, setAccount] = useState<AccountSummary | null>(initialAccount);
  const [isLoading, setIsLoading] = useState(!initialAccount);
  const [error, setError] = useState<Error | null>(null);

  // Wrap fetchAccount in useCallback to stabilize it for useEffect
  const fetchAccount = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await accountService.getAccount(isLive);
      setAccount(data);
    } catch (err: any) {
      setError(err);
      console.error('Failed to fetch account summary:', err);
    } finally {
      setIsLoading(false);
    }
  }, [isLive]);

  // FIX #18: Add fetchAccount to deps to avoid stale closure in 30s polling
  useEffect(() => {
    // Initial fetch if not provided
    if (!initialAccount) {
      fetchAccount();
    } else {
      setAccount(initialAccount);
      setIsLoading(false);
    }

    // Poll every 30 seconds
    const interval = setInterval(fetchAccount, 30000);
    return () => clearInterval(interval);
  }, [initialAccount, isLive, fetchAccount]);

  if (error && !account) {
    return (
      <div className="text-center py-4">
        <span className="text-[var(--color-bearish)] text-sm">Failed to load account data. </span>
        <button 
          onClick={fetchAccount}
          className="text-[var(--color-bearish-light)] underline text-sm hover:text-[var(--color-bearish)]"
        >
          Retry
        </button>
      </div>
    );
  }

  if (isLoading && !account) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 w-full animate-pulse">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex flex-col gap-1">
            <div className="h-3 w-24 bg-[var(--color-bg-elevated)] rounded"></div>
            <div className="h-8 w-32 bg-[var(--color-bg-tertiary)] rounded"></div>
          </div>
        ))}
      </div>
    );
  }

  if (!account) return null;

  const portfolioValue = parseFloat(account.portfolio_value || account.equity || '0');
  const longMarketValue = parseFloat(account.long_market_value || '0');
  const shortMarketValue = parseFloat(account.short_market_value || '0');
  const positionValue = longMarketValue + shortMarketValue;
  const dailyPnL = accountService.calculateDailyPnL(account);
  const dailyChange = dailyPnL.pnl;
  const dailyChangeIsPositive = dailyChange >= 0;
  const formatMoney = (value: number) => {
    const abs = Math.abs(value);
    return abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <div 
      className="grid grid-cols-4 gap-3 w-full"
      role="region"
      aria-label="Account Summary"
    >
      <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] px-4 py-3">
        {/* REFACTORED: Expanded abbreviation 'DT Buying Power' to full 'DAY TRADING BUYING POWER' */}
        <div className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-widest">DAY TRADING BUYING POWER</div>
        <div className="mt-1 text-xl font-mono font-black text-[var(--color-bullish)] tracking-tight">
          ${parseFloat(account.daytrading_buying_power || account.buying_power || '0').toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
      </div>

      <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] px-4 py-3">
        <div className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-widest">Portfolio</div>
        <div className="mt-1 text-xl font-mono font-black text-[var(--color-text-primary)] tracking-tight">
          ${portfolioValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
      </div>

      <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] px-4 py-3">
        <div className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-widest">Daily Change</div>
        <div className={`mt-1 text-xl font-mono font-black tracking-tight ${dailyChangeIsPositive ? 'text-[var(--color-bullish)]' : 'text-[var(--color-bearish)]'}`}>
          {dailyChangeIsPositive ? '+' : '-'}${formatMoney(dailyChange)}
        </div>
      </div>

      <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] px-4 py-3">
        <div className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-widest">Position Value</div>
        <div className="mt-1 text-xl font-mono font-black tracking-tight text-[var(--color-text-primary)]">
          ${formatMoney(positionValue)}
        </div>
      </div>
    </div>
  );
};
