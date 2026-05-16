// ============================================================================
// SHARED TYPES - Central Type Definitions
// ============================================================================
// This module exports all type definitions used across the application.
// Organized by domain for easy discovery and imports.

// ============================================================================
// AUTHENTICATION TYPES
// ============================================================================
export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  subscriptionStatus: string;
  createdAt: string;
}

export interface AuthResponse {
  success: boolean;
  status?: number;
  data?: {
    user: AuthUser;
    token: string;
  };
  error?: string;
  timestamp?: string;
}

export interface AuthError {
  message: string;
  field?: string;
}

// ============================================================================
// MARKETPLACE / TRADE TYPES
// ============================================================================
export interface Trade {
  id: string;
  symbol: string;
  strategyName: string;
  pnl: number;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  fees: number;
  status: string;
  listedForSale: boolean;
  listingPrice?: number;
  entryTime: string;
  exitTime?: string;
  createdAt: string;
  updatedAt?: string;
  user?: {
    id: string;
    email: string;
    subscriptionStatus: string;
  };
}

export interface TradesResponse {
  success: boolean;
  data: Trade[];
  count: number;
  timestamp: string;
  error?: string;
}

export interface TradeDetailsResponse {
  success: boolean;
  data: Trade;
  timestamp: string;
  error?: string;
}

export interface FetchTradesParams {
  limit?: number;
  offset?: number;
  strategy?: string;
  minPnl?: number;
}

// ============================================================================
// PAYMENT TYPES
// ============================================================================
export interface CreatePaymentIntentRequest {
  tradeId: string;
}

export interface PaymentIntentResponse {
  success: boolean;
  data?: {
    clientSecret: string;
    paymentIntentId: string;
    sessionId: string;
    amount: number;
    commission: number;
  };
  error?: string;
  timestamp?: string;
}

export interface ListTradeRequest {
  tradeId: string;
  customPrice?: number;
}

export interface ListTradeResponse {
  success: boolean;
  data?: {
    trade: Trade;
    commission: {
      commission: number;
      commissionRate: number;
      sellerPayout: number;
    };
  };
  error?: string;
  timestamp?: string;
}

// ============================================================================
// USER TYPES
// ============================================================================
export interface UpdateProfileRequest {
  name?: string;
}

export interface UserPurchasesResponse {
  success: boolean;
  data: any[];
  count: number;
  timestamp: string;
  error?: string;
}

export interface UserTradesResponse {
  success: boolean;
  data: any[];
  count: number;
  timestamp: string;
  error?: string;
}

export interface UpdateProfileResponse {
  success: boolean;
  data?: {
    user: AuthUser;
  };
  error?: string;
}

// ============================================================================
// ALPACA TRADING TYPES (from src/frontend/types.ts)
// ============================================================================
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
      ladderPriceStep?: number;
      ladderOrderCount?: number;
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
  /** Position management status for three-sector layout */
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

// ============================================================================
// API ERROR TYPES (for consistency across API calls)
// ============================================================================
export interface ApiErrorResponse {
  success: false;
  error: string;
  code?: string;
  status?: number;
  timestamp: string;
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  timestamp: string;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;


