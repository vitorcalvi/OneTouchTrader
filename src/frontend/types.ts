export interface AlpacaConfig {
  paperApiKey: string;
  paperApiSecret: string;
  liveApiKey: string;
  liveApiSecret: string;
  isPaper: boolean;
  defaults?: {
    pollingInterval?: number;
    useAtr?: boolean;
    atrMultiplier?: number;
    quickQty?: number;
    extendedHours?: boolean;
    defaultTimeInForce?: 'day' | 'gtc' | 'ioc';
    aggressiveMode?: boolean;
    minSLPercent?: number;
    ladderPriceStep?: number;
    ladderOrderCount?: number;
    maxSLPercent?: number;
    minRewardPercent?: number;
    maxConsecutiveLosses?: number;
    maxDailyLossPct?: number;
    mobilePriceSteps?: { large: number; mid: number; small: number };
    stopSlippagePct?: number;
    mobile?: {
      tickers: string[];
      presets: string[];
      defaultPreset: string;
      defaultTier: 'M' | 'L' | 'S';
      defaultOsl?: boolean;
      width: number;
      height: number;
      margin: number;
    };
  };
}

export interface Account {
  id: string;
  account_number: string;
  status: string;
  currency: string;
  cash: string;
  portfolio_value: string;
  buying_power: string;
  equity: string;
  last_equity: string;
  multiplier: string;
  initial_margin: string;
  maintenance_margin: string;
  daytrade_count: number;
  daytrading_buying_power: string;
  pattern_day_trader?: boolean;
}

export interface AccountWithReserves extends Account {
  reserved_funds?: number;
  pending_order_value?: number;
  initial_buying_power?: number;
  effective_buying_power?: number;
}

export interface Position {
  asset_id: string;
  symbol: string;
  exchange: string;
  asset_class: string;
  qty: string;
  side: 'long' | 'short';
  market_value: string;
  cost_basis: string;
  unrealized_pl: string;
  unrealized_plpc: string;
  unrealized_intraday_pl: string;
  unrealized_intraday_plpc: string;
  current_price: string;
  lastday_price: string;
  change_today: string;
  avg_entry_price: string;
  /**
   * Position management status for three-sector layout
   * - 'watching': monitored but not actively managed (TOP sector)
   * - 'running': actively managed position (LEFT sector)
   * Defaults to 'running' for backward compatibility
   */
  status?: 'watching' | 'running';
}

export interface Order {
  id: string;
  client_order_id: string;
  created_at: string;
  updated_at: string;
  submitted_at: string;
  filled_at: string | null;
  expired_at: string | null;
  canceled_at: string | null;
  failed_at: string | null;
  asset_id: string;
  symbol: string;
  asset_class: string;
  qty: string;
  notional?: string;
  filled_qty: string;
  type: string;
  side: 'buy' | 'sell';
  time_in_force: string;
  limit_price: string | null;
  stop_price: string | null;
  stop_limit_price?: string | null;
  filled_avg_price: string | null;
  status: string;
  extended_hours: boolean;
  legs: any | null;
  trail_price: string | null;
  trail_percent: string | null;
  hwm: string | null;
  order_class?: 'simple' | 'bracket' | 'oco' | 'oto';
  stop_loss?: {
    stop_price: string;
    limit_price?: string;
  };
  take_profit?: {
    limit_price: string;
  };
}

/** Alpaca order statuses relevant to SL/TP lifecycle */
export type OrderStatus =
  | 'new'
  | 'accepted'
  | 'pending_new'
  | 'partially_filled'
  | 'filled'
  | 'held'
  | 'pending_cancel'
  | 'canceled'
  | 'expired'
  | 'replaced'
  | 'rejected'
  | 'suspended'
  | 'calculated';

/** Derived SL/TP state for UI rendering */
export type SlTpState = 'none' | 'active' | 'triggered' | 'canceled';

export interface Bar {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  n: number;
  vw: number;
}

export interface PortfolioHistory {
  timestamp: number[];
  equity: number[];
  profit_loss: number[];
  profit_loss_pct: number[];
  base_value: number;
  timeframe: string;
}
