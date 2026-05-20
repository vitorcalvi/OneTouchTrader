export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'MARKET' | 'LIMIT';
export type RewardRatio = 1 | 2 | 3 | 4 | number;
export type StopLossPreset = 0.2 | 0.5 | 1 | number;
export type Direction = 'LONG' | 'SHORT';

export interface EntryManagerState {
  symbol: string;
  avgVolatilityPct: number;
  currentPrice: number;
  availableBalance: number;
  selectedQty: number;
  isMaxQty: boolean;
  riskAmount: number;
  wantToEarn: number;
  stopLossPct: number;
  rewardRatio: RewardRatio;
  direction: Direction;
}

export interface DerivedPriceLevels {
  stopLossPrice: number;
  takeProfitPrice: number;
  riskPerUnit: number;
  rewardPerUnit: number;
  impliedQtyFromRisk: number;
}

export interface BreakEvenResult {
  market: {
    amount: number;
    percentage: number;
  };
  limit: {
    amount: number;
    percentage: number;
  };
}

export interface VolatilityWarning {
  type: 'warn' | 'info' | 'hint';
  message: string;
  field: string;
}

export interface ValidationGuard {
  isValid: boolean;
  reason: string;
  severity: 'error' | 'warn' | 'info';
}

export interface ExecutionPayload {
  symbol: string;
  side: OrderSide;
  type: OrderType;
  qty: number;
  price: number;
  stopLoss: number;
  takeProfit: number;
  riskUSD: number;
  rewardUSD: number;
  rrRatio: number;
  stopLossPct: number;
  avgVolatilityPct: number;
  slVsATR: number;
}

export interface EntryManagerComputed {
  notional: number;
  maxQty: number;
  priceLevels: DerivedPriceLevels;
  breakEven: BreakEvenResult;
  slInVolatilityUnits: number;
  volatilityRewardFloor: number;
  breakEvenAsVolatilityPct: number;
  warnings: VolatilityWarning[];
  validations: ValidationGuard[];
  canExecute: boolean;
}

export interface EntryManagerActions {
  setSymbol: (symbol: string) => void;
  setAvgVolatilityPct: (pct: number) => void;
  setCurrentPrice: (price: number) => void;
  setAvailableBalance: (balance: number) => void;
  setSelectedQty: (qty: number) => void;
  selectMaxQty: () => void;
  setRiskAmount: (amount: number) => void;
  setWantToEarn: (amount: number) => void;
  setStopLossPct: (pct: number) => void;
  setRewardRatio: (ratio: RewardRatio) => void;
  setDirection: (direction: Direction) => void;
  buildExecutionPayload: (side: OrderSide, type: OrderType) => ExecutionPayload | null;
}
