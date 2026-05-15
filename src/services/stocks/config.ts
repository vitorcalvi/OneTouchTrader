// Stock Trading Configuration and Constants
import type { PositionBias, StockConfigType } from './types';
import { getEnvConfig } from '../../config/envConfig';

// =============================================================================
// ACCOUNT MANAGEMENT - Alpaca API compliance
// =============================================================================
export const ACCOUNT_RESERVE_THRESHOLD = 100; // Minimum buffer in USD to maintain

// Reserve enforcement settings
export interface AccountReserveSettings {
  reserveThreshold: number;
  enforceReserves: boolean;
}

export const defaultReserveSettings: AccountReserveSettings = {
  reserveThreshold: ACCOUNT_RESERVE_THRESHOLD,
  enforceReserves: true,
};

// Reserved funds tracking
export interface ReservedFunds {
  totalReserved: number;
  pendingOrderCount: number;
  initialBuyingPower: number;
  effectiveBuyingPower: number;
}

// =============================================================================
// COMMON OPTIMIZATIONS - Applied across all strategies
// =============================================================================

// =============================================================================
// COMMON OPTIMIZATIONS - Applied across all strategies
// =============================================================================
export const STOCK_COMMON_OPTIMIZATIONS = {
  // Position bias - neutral by default for stocks
  positionBias: 'neutral' as PositionBias,
  longEntryMultiplier: 1.0,
  shortEntryMultiplier: 1.0,

  // Hour filtering (ET) - Market hours focus
  useHourFilter: true,
  avoidHours: [9, 16], // First and last 30 mins are choppy
  bestHours: [10, 11, 14, 15] // Mid-morning and mid-afternoon
};

// =============================================================================
// MAIN CONFIG
// =============================================================================
const envDefaults = getEnvConfig().defaults || {};

export const STOCK_CONFIG: StockConfigType = {
  // Strategy mode - Auto-switchable by AI evaluator
  strategyMode: 'dayTrader',
  defaultSymbol: 'INTC',

  // Position sizing - Conservative
  lookback: 20,

  // ATR-based stops (default for dayTrader)
  atrPeriod: 14,
  atrMultiplierSL: envDefaults.atrMultiplier ?? 0.3,
  atrMultiplierTP: (envDefaults.atrMultiplier ?? 0.3) * 2,
  minSLPercent: envDefaults.minSLPercent ?? 0.35,
  maxSLPercent: envDefaults.maxSLPercent ?? 1.0,

  // Risk/Reward
  minRiskReward: 1.5,
  minRewardPercent: envDefaults.minRewardPercent ?? 0.25,

  // Trailing stop
  trailingActivationPct: 1.5,  // Activate at 1.5% profit
  trailingDistancePct: 0.75,   // Trail at 0.75%

  // RSI
  rsiPeriod: 14,
  rsiOversold: 30,
  rsiOverbought: 70,

  // Trend
  trendPeriod: 10,
  trendThreshold: 3,

  // Volume
  volumeMultiplier: 1.5,

  // Risk management
  maxConsecutiveLosses: envDefaults.maxConsecutiveLosses ?? 3,
  cooldownMs: 300000, // 5 min cooldown
  maxDailyLossPct: envDefaults.maxDailyLossPct ?? 2.0,

  // Execution
  pollMs: (envDefaults.pollingInterval ?? 3) * 1000,
  useExtendedHours: envDefaults.extendedHours ?? false,

  // Apply common optimizations
  ...STOCK_COMMON_OPTIMIZATIONS
};
