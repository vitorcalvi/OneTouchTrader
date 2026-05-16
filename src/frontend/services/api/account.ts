export interface AccountSummary {
  id: string;
  account_number: string;
  status: string;
  currency: string;
  buying_power: string;
  regt_buying_power: string;
  daytrading_buying_power: string;
  non_marginable_buying_power: string;
  cash: string;
  portfolio_value: string;
  pattern_day_trader: boolean;
  trading_blocked: boolean;
  transfers_blocked: boolean;
  account_blocked: boolean;
  created_at: string;
  trade_suspended_by_user: boolean;
  multiplier: string;
  shorting_enabled: boolean;
  equity: string;
  last_equity: string;
  long_market_value: string;
  short_market_value: string;
  initial_margin: string;
  maintenance_margin: string;
  last_maintenance_margin: string;
  sma: string;
  daytrade_count: number;
  unrealized_pl?: string;
  unrealized_plpc?: string;
}

export interface AccountHistory {
  timestamp: number[];
  equity: number[];
  profit_loss: number[];
  profit_loss_pct: number[];
  base_value: number;
  timeframe: string;
}

async function getService() {
  const { AlpacaService } = await import('../stocks');
  const { getEnvConfig } = await import('../../config/envConfig');
  return new AlpacaService(getEnvConfig());
}

export const accountService = {
  getAccount: async (_isLive: boolean = false): Promise<AccountSummary> => {
    const service = await getService();
    // Backend proxy handles authentication - credentials are server-side only
    const account = await service.getAccount();
    return account as AccountSummary;
  },

  getHistory: async (period: string = '1D', timeframe: string = '5Min', _isLive: boolean = false): Promise<AccountHistory> => {
    const service = await getService();
    // Backend proxy handles authentication - credentials are server-side only
    return await service.getPortfolioHistory(period, timeframe) as unknown as AccountHistory;
  },

  calculateDailyPnL: (account: AccountSummary) => {
    const equity = parseFloat(account.equity);
    const lastEquity = parseFloat(account.last_equity);
    const pnl = equity - lastEquity;
    const pnlPct = (pnl / lastEquity) * 100;

    return {
      pnl,
      pnlPct,
      equity
    };
  }
};
