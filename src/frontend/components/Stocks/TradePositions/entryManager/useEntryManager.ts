import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  EntryManagerState,
  EntryManagerComputed,
  EntryManagerActions,
  RewardRatio,
  Direction,
  OrderSide,
  OrderType,
  ExecutionPayload,
  StopLossPreset,
} from './types';
import {
  calculateNotional,
  calculateMaxQty,
  calculateBreakEven,
  calculateDerivedPriceLevels,
  calculateSlInVolatilityUnits,
  calculateVolatilityRewardFloor,
  calculateBreakEvenAsVolatilityPct,
  calculateWantToEarnFromRisk,
  calculateImpliedRewardRatio,
  getAutoSelectStopLoss,
} from './calculations';
import {
  generateVolatilityWarnings,
  generateValidationGuards,
  canExecute,
  VolatilityContext,
  ValidationContext,
} from './volatility';
import { getTradingConfig } from '@/config/envConfig';

const _tradingConfig = getTradingConfig();

export interface UseEntryManagerOptions {
  initialSymbol?: string;
  initialPrice?: number;
  availableBalance?: number;
  avgVolatilityPct?: number;
}

export interface UseEntryManagerReturn {
  state: EntryManagerState;
  computed: EntryManagerComputed;
  actions: EntryManagerActions;
}

export function useEntryManager(options: UseEntryManagerOptions = {}): UseEntryManagerReturn {
  const {
    initialSymbol = _tradingConfig.defaultSymbol || 'INTC',
    initialPrice = 0,
    availableBalance = 0,
    avgVolatilityPct: externalVolatility = 0,
  } = options;

  const [symbol, setSymbol] = useState(initialSymbol);
  const [avgVolatilityPct, setAvgVolatilityPctState] = useState(externalVolatility);
  const [currentPrice, setCurrentPriceState] = useState(initialPrice);
  const [availableBalanceState, setAvailableBalanceState] = useState(availableBalance);
  const [selectedQty, setSelectedQtyState] = useState(_tradingConfig.defaultQty || 100);
  const [isMaxQty, setIsMaxQty] = useState(false);
  const [riskAmount, setRiskAmountState] = useState(0.2);
  const [wantToEarn, setWantToEarnState] = useState(0.4);
  const [stopLossPct, setStopLossPctState] = useState<StopLossPreset>(0.2);
  const [rewardRatio, setRewardRatioState] = useState<RewardRatio>(2);
  const [direction, setDirectionState] = useState<Direction>('LONG');

  useEffect(() => {
    if (externalVolatility > 0) {
      const autoSL = getAutoSelectStopLoss(externalVolatility);
      setStopLossPctState(autoSL as StopLossPreset);
    }
  }, [externalVolatility]);

  const computed = useMemo((): EntryManagerComputed => {
    const maxQty = calculateMaxQty(availableBalanceState, currentPrice);

    const effectiveQty = isMaxQty ? maxQty : selectedQty;
    const effectiveNotional = calculateNotional(effectiveQty, currentPrice);

    const priceLevels = calculateDerivedPriceLevels(
      currentPrice,
      stopLossPct,
      rewardRatio,
      direction,
      riskAmount
    );

    const breakEven = calculateBreakEven(effectiveNotional);

    const slInVolatilityUnits = calculateSlInVolatilityUnits(stopLossPct, avgVolatilityPct);
    const volatilityRewardFloor = calculateVolatilityRewardFloor(avgVolatilityPct, effectiveNotional);
    const breakEvenAsVolatilityPct = calculateBreakEvenAsVolatilityPct(
      breakEven.market.percentage,
      avgVolatilityPct
    );

    const volatilityContext: VolatilityContext = {
      avgVolatilityPct,
      stopLossPct,
      slInVolatilityUnits,
      volatilityRewardFloor,
      breakEvenAsVolatilityPct,
      wantToEarn,
      breakEven,
      notional: effectiveNotional,
    };
    const warnings = generateVolatilityWarnings(volatilityContext);

    const validationContext: ValidationContext = {
      selectedQty: effectiveQty,
      riskAmount,
      wantToEarn,
      stopLossPct,
      avgVolatilityPct,
      breakEven,
      priceLevels,
      currentPrice,
      symbol,
    };
    const validations = generateValidationGuards(validationContext);

    const canExecuteOrders = canExecute(validations);

    return {
      notional: effectiveNotional,
      maxQty,
      priceLevels,
      breakEven,
      slInVolatilityUnits,
      volatilityRewardFloor,
      breakEvenAsVolatilityPct,
      warnings,
      validations,
      canExecute: canExecuteOrders,
    };
  }, [
    selectedQty,
    currentPrice,
    availableBalanceState,
    isMaxQty,
    riskAmount,
    wantToEarn,
    stopLossPct,
    rewardRatio,
    direction,
    avgVolatilityPct,
    symbol,
  ]);

  const setAvgVolatilityPct = useCallback((pct: number) => {
    setAvgVolatilityPctState(pct);
    if (pct > 0) {
      const autoSL = getAutoSelectStopLoss(pct);
      setStopLossPctState(autoSL as StopLossPreset);
    }
  }, []);

  const setCurrentPrice = useCallback((price: number) => {
    setCurrentPriceState(price);
  }, []);

  const setAvailableBalance = useCallback((balance: number) => {
    setAvailableBalanceState(balance);
  }, []);

  const setSelectedQty = useCallback((qty: number) => {
    setSelectedQtyState(qty);
    setIsMaxQty(false);
  }, []);

  const selectMaxQty = useCallback(() => {
    setIsMaxQty(true);
  }, []);

  const setRiskAmount = useCallback((amount: number) => {
    setRiskAmountState(amount);
    const newWantToEarn = calculateWantToEarnFromRisk(amount, rewardRatio);
    setWantToEarnState(newWantToEarn);
  }, [rewardRatio]);

  const setWantToEarnAction = useCallback((amount: number) => {
    setWantToEarnState(amount);
    const impliedRR = calculateImpliedRewardRatio(riskAmount, amount);
    if (impliedRR !== rewardRatio) {
      setRewardRatioState(impliedRR);
    }
  }, [riskAmount, rewardRatio]);

  const setStopLossPct = useCallback((pct: number) => {
    setStopLossPctState(pct as 0.5 | 1);
  }, []);

  const setRewardRatioAction = useCallback((ratio: RewardRatio) => {
    setRewardRatioState(ratio);
    const newWantToEarn = calculateWantToEarnFromRisk(riskAmount, ratio);
    setWantToEarnState(newWantToEarn);
  }, [riskAmount]);

  const setDirection = useCallback((dir: Direction) => {
    setDirectionState(dir);
  }, []);

  const buildExecutionPayload = useCallback(
    (side: OrderSide, type: OrderType): ExecutionPayload | null => {
      if (!computed.canExecute) {
        return null;
      }

      const effectiveQty = isMaxQty ? computed.maxQty : selectedQty;

      return {
        symbol,
        side,
        type,
        qty: effectiveQty,
        price: currentPrice,
        stopLoss: computed.priceLevels.stopLossPrice,
        takeProfit: computed.priceLevels.takeProfitPrice,
        riskUSD: riskAmount,
        rewardUSD: wantToEarn,
        rrRatio: rewardRatio,
        stopLossPct,
        avgVolatilityPct,
        slVsATR: computed.slInVolatilityUnits,
      };
    },
    [
      computed,
      isMaxQty,
      selectedQty,
      symbol,
      currentPrice,
      riskAmount,
      wantToEarn,
      rewardRatio,
      stopLossPct,
      avgVolatilityPct,
    ]
  );

  const actions: EntryManagerActions = {
    setSymbol,
    setAvgVolatilityPct,
    setCurrentPrice,
    setAvailableBalance,
    setSelectedQty,
    selectMaxQty,
    setRiskAmount,
    setWantToEarn: setWantToEarnAction,
    setStopLossPct,
    setRewardRatio: setRewardRatioAction,
    setDirection,
    buildExecutionPayload,
  };

  const state: EntryManagerState = {
    symbol,
    avgVolatilityPct,
    currentPrice,
    availableBalance: availableBalanceState,
    selectedQty,
    isMaxQty,
    riskAmount,
    wantToEarn,
    stopLossPct,
    rewardRatio,
    direction,
  };

  return {
    state,
    computed,
    actions,
  };
}

export function useEntryManagerWithSync(
  options: UseEntryManagerOptions & {
    externalPrice?: number;
    externalVolatility?: number;
    externalBalance?: number;
  }
): UseEntryManagerReturn {
  const result = useEntryManager(options);
  const { setCurrentPrice, setAvgVolatilityPct, setAvailableBalance } = result.actions;

  useEffect(() => {
    if (options.externalPrice !== undefined && options.externalPrice > 0) {
      setCurrentPrice(options.externalPrice);
    }
  }, [options.externalPrice, setCurrentPrice]);

  useEffect(() => {
    if (options.externalVolatility !== undefined && options.externalVolatility > 0) {
      setAvgVolatilityPct(options.externalVolatility);
    }
  }, [options.externalVolatility, setAvgVolatilityPct]);

  useEffect(() => {
    if (options.externalBalance !== undefined && options.externalBalance > 0) {
      setAvailableBalance(options.externalBalance);
    }
  }, [options.externalBalance, setAvailableBalance]);

  return result;
}
