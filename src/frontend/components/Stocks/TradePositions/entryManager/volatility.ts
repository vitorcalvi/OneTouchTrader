import {
  VolatilityWarning,
  ValidationGuard,
  RewardRatio,
  BreakEvenResult,
  DerivedPriceLevels,
} from './types';

export interface VolatilityContext {
  avgVolatilityPct: number;
  stopLossPct: number;
  slInVolatilityUnits: number;
  volatilityRewardFloor: number;
  breakEvenAsVolatilityPct: number;
  wantToEarn: number;
  breakEven: BreakEvenResult;
  notional: number;
}

export function generateVolatilityWarnings(ctx: VolatilityContext): VolatilityWarning[] {
  const warnings: VolatilityWarning[] = [];

  if (ctx.avgVolatilityPct <= 0) {
    return warnings;
  }

  const riskAtVolatility = ctx.avgVolatilityPct / ctx.stopLossPct;
  if (riskAtVolatility >= 0.8) {
    warnings.push({
      type: 'warn',
      message: 'Stop loss is within daily volatility range. Consider wider SL or reduce qty.',
      field: 'stopLossPct',
    });
  }

  if (ctx.slInVolatilityUnits < 1.0) {
    warnings.push({
      type: 'warn',
      message: 'SL is tighter than 1x ATR — high whipsaw risk',
      field: 'stopLossPct',
    });
  }

  if (ctx.slInVolatilityUnits > 3.0) {
    warnings.push({
      type: 'info',
      message: 'SL is wider than 3x ATR — large drawdown before invalidation',
      field: 'stopLossPct',
    });
  }

  if (ctx.wantToEarn < ctx.volatilityRewardFloor) {
    warnings.push({
      type: 'hint',
      message: `Target below 1x volatility move ($${ctx.volatilityRewardFloor.toFixed(2)})`,
      field: 'wantToEarn',
    });
  }

  if (ctx.breakEvenAsVolatilityPct > 0.5) {
    warnings.push({
      type: 'info',
      message: 'Fees consume >50% of avg daily move — prefer LIMIT orders',
      field: 'breakEven',
    });
  }

  return warnings;
}

export interface ValidationContext {
  selectedQty: number;
  riskAmount: number;
  wantToEarn: number;
  stopLossPct: number;
  avgVolatilityPct: number;
  breakEven: BreakEvenResult;
  priceLevels: DerivedPriceLevels;
  currentPrice: number;
  symbol: string;
}

export function generateValidationGuards(ctx: ValidationContext): ValidationGuard[] {
  const guards: ValidationGuard[] = [];

  if (!ctx.symbol || ctx.symbol.trim() === '') {
    guards.push({
      isValid: false,
      reason: 'Select a symbol',
      severity: 'error',
    });
  }

  if (ctx.currentPrice <= 0) {
    guards.push({
      isValid: false,
      reason: 'Price not available',
      severity: 'error',
    });
  }

  if (ctx.selectedQty <= 0) {
    guards.push({
      isValid: false,
      reason: 'Select a quantity',
      severity: 'error',
    });
  }

  if (ctx.riskAmount <= 0) {
    guards.push({
      isValid: false,
      reason: 'Set a risk amount',
      severity: 'error',
    });
  }

  if (ctx.wantToEarn < ctx.riskAmount && ctx.riskAmount > 0) {
    guards.push({
      isValid: false,
      reason: 'R:R is negative',
      severity: 'warn',
    });
  }

  if (ctx.avgVolatilityPct > 0 && ctx.stopLossPct < ctx.avgVolatilityPct) {
    guards.push({
      isValid: true,
      reason: 'SL inside noise range',
      severity: 'warn',
    });
  }

  if (ctx.wantToEarn < ctx.breakEven.market.amount && ctx.wantToEarn > 0) {
    guards.push({
      isValid: true,
      reason: "Reward doesn't cover fees (market)",
      severity: 'warn',
    });
  }

  if (ctx.wantToEarn < ctx.breakEven.limit.amount && ctx.wantToEarn > 0) {
    guards.push({
      isValid: true,
      reason: "Reward doesn't cover fees (limit)",
      severity: 'warn',
    });
  }

  return guards;
}

export function canExecute(guards: ValidationGuard[]): boolean {
  return guards.every(g => g.isValid);
}

export function getBlockingErrors(guards: ValidationGuard[]): string[] {
  return guards.filter(g => !g.isValid && g.severity === 'error').map(g => g.reason);
}

export function getWarnings(guards: ValidationGuard[]): string[] {
  return guards.filter(g => g.severity === 'warn').map(g => g.reason);
}

export function getVolatilityStatus(
  avgVolatilityPct: number
): { level: 'low' | 'medium' | 'high'; colorClass: string; label: string } {
  if (avgVolatilityPct < 1) {
    return { level: 'low', colorClass: 'text-bullish', label: 'Low' };
  }
  if (avgVolatilityPct <= 2) {
    return { level: 'medium', colorClass: 'text-warning', label: 'Medium' };
  }
  return { level: 'high', colorClass: 'text-bearish', label: 'High' };
}

export function calculateATRPercentage(
  atrValue: number,
  currentPrice: number
): number {
  if (currentPrice <= 0) return 0;
  return (atrValue / currentPrice) * 100;
}

export function getDefaultRewardRatioForVolatility(avgVolatilityPct: number): RewardRatio {
  if (avgVolatilityPct <= 2) return 2;
  return 1;
}

export function getSuggestedRiskAmount(
  accountEquity: number,
  riskPerTradePct: number = 1
): number {
  return accountEquity * (riskPerTradePct / 100);
}

export function validateRiskAmount(
  riskAmount: number,
  availableBalance: number
): { valid: boolean; capped?: number; message?: string } {
  if (riskAmount <= 0) {
    return { valid: false, message: 'Risk amount must be positive' };
  }

  const maxRisk = availableBalance * 0.1;
  if (riskAmount > maxRisk) {
    return {
      valid: true,
      capped: maxRisk,
      message: `Risk capped at 10% of available balance ($${maxRisk.toFixed(2)})`,
    };
  }

  return { valid: true };
}
