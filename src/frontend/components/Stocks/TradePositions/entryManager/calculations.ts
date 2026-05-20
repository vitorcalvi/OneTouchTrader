import {
  Direction,
  DerivedPriceLevels,
  BreakEvenResult,
  RewardRatio,
} from './types';

export function formatUSD(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatPct(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return `${(value * 100).toFixed(2)}%`;
}

export function formatPrice(value: number, isCrypto: boolean): string {
  if (!Number.isFinite(value) || value <= 0) return '—';
  const decimals = isCrypto ? 8 : 2;
  return value.toFixed(decimals).replace(/\.?0+$/, '');
}

import { clamp } from '@/shared/utils/numbers';

export function roundToPrecision(value: number, precision: number): number {
  const factor = Math.pow(10, precision);
  return Math.round(value * factor) / factor;
}

export function calculateNotional(qty: number, price: number): number {
  if (qty <= 0 || price <= 0) return 0;
  return qty * price;
}

export function calculateMaxQty(availableBalance: number, price: number): number {
  if (price <= 0 || availableBalance <= 0) return 0;
  return Math.floor(availableBalance / price);
}

export function calculateBreakEven(
  notional: number,
): BreakEvenResult {
  if (notional <= 0) {
    return {
      market: { amount: 0, percentage: 0 },
      limit: { amount: 0, percentage: 0 },
    };
  }

  return {
    market: {
      amount: 0,
      percentage: 0,
    },
    limit: {
      amount: 0,
      percentage: 0,
    },
  };
}

export function calculateDerivedPriceLevels(
  entryPrice: number,
  stopLossPct: number,
  rewardRatio: RewardRatio,
  direction: Direction,
  riskAmount: number
): DerivedPriceLevels {
  if (entryPrice <= 0 || stopLossPct <= 0) {
    return {
      stopLossPrice: 0,
      takeProfitPrice: 0,
      riskPerUnit: 0,
      rewardPerUnit: 0,
      impliedQtyFromRisk: 0,
    };
  }

  const slPctDecimal = stopLossPct / 100;

  let stopLossPrice: number;
  let takeProfitPrice: number;

  if (direction === 'LONG') {
    stopLossPrice = entryPrice * (1 - slPctDecimal);
    takeProfitPrice = entryPrice * (1 + slPctDecimal * rewardRatio);
  } else {
    stopLossPrice = entryPrice * (1 + slPctDecimal);
    takeProfitPrice = entryPrice * (1 - slPctDecimal * rewardRatio);
  }

  const riskPerUnit = Math.abs(entryPrice - stopLossPrice);
  const rewardPerUnit = Math.abs(takeProfitPrice - entryPrice);
  const impliedQtyFromRisk = riskPerUnit > 0 ? riskAmount / riskPerUnit : 0;

  return {
    stopLossPrice,
    takeProfitPrice,
    riskPerUnit,
    rewardPerUnit,
    impliedQtyFromRisk,
  };
}

export function calculateSlInVolatilityUnits(
  stopLossPct: number,
  avgVolatilityPct: number
): number {
  if (avgVolatilityPct <= 0) return 0;
  return stopLossPct / avgVolatilityPct;
}

export function calculateVolatilityRewardFloor(
  avgVolatilityPct: number,
  notional: number
): number {
  return (avgVolatilityPct / 100) * notional;
}

export function calculateBreakEvenAsVolatilityPct(
  breakEvenPct: number,
  avgVolatilityPct: number
): number {
  if (avgVolatilityPct <= 0) return 0;
  return breakEvenPct / avgVolatilityPct;
}

export function calculateWantToEarnFromRisk(
  riskAmount: number,
  rewardRatio: RewardRatio
): number {
  return riskAmount * rewardRatio;
}

export function calculateImpliedRewardRatio(
  riskAmount: number,
  wantToEarn: number
): RewardRatio {
  if (riskAmount <= 0) return 1;
  const implied = wantToEarn / riskAmount;
  return clamp(Math.round(implied), 1, 3) as RewardRatio;
}

export function getVolatilityColorClass(avgVolatilityPct: number): string {
  if (avgVolatilityPct < 1) return 'text-bullish';
  if (avgVolatilityPct <= 2) return 'text-warning';
  return 'text-bearish';
}

export function getAutoSelectStopLoss(avgVolatilityPct: number): number {
  if (avgVolatilityPct <= 0.8) return 0.2;
  if (avgVolatilityPct <= 1.5) return 0.5;
  return 1;
}

export function shouldHighlightSLManualOverride(avgVolatilityPct: number): boolean {
  return avgVolatilityPct > 1.5;
}

export function getQuantityPresets(price: number, isCrypto: boolean): number[] {
  if (price <= 0) return isCrypto ? [0.01, 0.05, 0.1, 0.25, 0.5] : [10, 20, 30, 50, 100];

  if (isCrypto) {
    if (price >= 10000) return [0.001, 0.005, 0.01, 0.05, 0.1];
    if (price >= 1000) return [0.01, 0.05, 0.1, 0.25, 0.5];
    if (price >= 100) return [0.1, 0.25, 0.5, 1, 2];
    if (price >= 10) return [1, 2, 5, 10, 20];
    return [10, 25, 50, 100, 200];
  }

  if (price >= 1000) return [1, 2, 5, 10, 20];
  if (price >= 100) return [10, 20, 30, 50, 100];
  if (price >= 10) return [10, 25, 50, 100, 200];
  return [50, 100, 200, 500, 1000];
}

export function formatQtyLabel(val: number, isMax: boolean, index: number, total: number): string {
  if (isMax && index === total - 1) return 'MAX';
  if (val >= 1) return String(val);
  return val.toPrecision(1).replace(/\.?0+$/, '') || String(val);
}

export function calculateTotalRisk(riskPerUnit: number, qty: number): number {
  return Math.abs(riskPerUnit * qty);
}

export function calculateTotalReward(rewardPerUnit: number, qty: number): number {
  return Math.abs(rewardPerUnit * qty);
}
