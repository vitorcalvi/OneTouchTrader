// Stock Trading Types - Single source of truth

// =============================================================================
// STRATEGY MODE TYPE (simplified)
// =============================================================================
export type StockStrategyMode = 'dayTrader' | 'swingTrader' | 'scalper';

// =============================================================================
// POSITION BIAS
// =============================================================================
export type PositionBias = 'long' | 'short' | 'neutral';

// =============================================================================
// CONFIG TYPE
// =============================================================================
export interface StockConfigType {
  // Strategy
  strategyMode: StockStrategyMode;
  defaultSymbol: string;

  // Position sizing
  lookback: number;

  // ATR-based stops
  atrPeriod: number;
  atrMultiplierSL: number;  // SL = entry +/- (ATR * multiplier)
  atrMultiplierTP: number;  // TP = entry +/- (ATR * multiplier)
  minSLPercent: number;     // Minimum SL as % of price
  maxSLPercent: number;     // Maximum SL as % of price

  // Risk/Reward
  minRiskReward: number;
  minRewardPercent: number;

  // Trailing stop
  trailingActivationPct: number;  // % gain to activate
  trailingDistancePct: number;    // Trail distance as %

  // RSI
  rsiPeriod: number;
  rsiOversold: number;
  rsiOverbought: number;

  // Trend
  trendPeriod: number;
  trendThreshold: number;

  // Volume
  volumeMultiplier: number;

  // Risk management
  maxConsecutiveLosses: number;
  cooldownMs: number;
  maxDailyLossPct: number;

  // Execution
  pollMs: number;
  useExtendedHours: boolean;

  // Position bias
  positionBias: PositionBias;
  longEntryMultiplier: number;
  shortEntryMultiplier: number;

  // Hour filtering
  useHourFilter: boolean;
  avoidHours: number[];
  bestHours: number[];
}
