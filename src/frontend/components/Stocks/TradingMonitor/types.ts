export interface WatchingPosition {
  id: string;
  ticker: string;
  side: 'LONG' | 'SHORT';
  leverage: number;
  currentPrice: number;
  pnl: number;
  pnlPercent: number;
}

export interface RunningPosition extends WatchingPosition {
  entryPrice: number;
  positionSize: number;
  bePnl: number;
  bePnlPercent: number;
}
