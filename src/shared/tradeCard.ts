export type TradeCardStatus =
  | "PENDING"
  | "FIRED"
  | "EXPIRED"
  | "CANCELED"
  | "REJECTED";

export type TradeCardDirection = "LONG" | "SHORT";
export type TradeCardEntryType = "MARKET" | "LIMIT";
export type TradeCardRegime = "TREND" | "CHOP" | "NEWS_WHIPSAW";

export interface TradeCard {
  id: string;
  createdAt: string;
  expiresAt: string;
  source: string;
  symbol: string;
  direction: TradeCardDirection;
  entryType: TradeCardEntryType;
  entryPrice: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2?: number;
  notional: number;
  shares: number;
  rationale: string;
  invalidation: string;
  regime: TradeCardRegime;
  status: TradeCardStatus;
  alpacaOrderId?: string;
  rejectionReason?: string;
  firedAt?: string;
}

export const TRADE_CARD_MAX_NOTIONAL = 20000;
export const TRADE_CARD_SYMBOL_ALLOWLIST = ["INTC", "QQQ", "IREN"] as const;
export const TRADE_CARD_DEFAULT_EXPIRY_MS = 5 * 60 * 1000;