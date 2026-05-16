// ============================================================================
// Types
// ============================================================================

export type TradingMode = 'scalper' | 'trendFollower' | 'momentum' | 'aggressive' | 'intraday' | 'volatilitySqueeze';

export interface ClosedPosition {
  symbol: string;
  qty: string;
  side: 'long' | 'short';
  unrealized_pl: string;
  current_price: string;
  asset_id: string;
  tradingMode?: TradingMode;
  closedAt?: string;
  // Analytics fields for post-trade analysis
  strategy_id?: string;
  entry_time?: string;
  entry_price?: string;
  exit_price?: string;
  stop_price?: string;
  target_price?: string;
  risk_amount?: number;
  risk_r_multiple?: number;
  account_equity_at_entry?: number;
  position_pct_equity?: number;
  duration_minutes?: number;
}

export interface ImportSummary {
  multiplier?: number;
  clamp?: string;
  guard?: { enabled: boolean; cap?: string };
  tips?: string[];
  error?: string;
  details?: string;
  applied?: {
    symbol?: string;
    mode?: string;
    multiplier?: number;
    trailMin?: number;
    trailMax?: number;
    trailMid?: number;
    scalpersUpdated?: boolean;
  };
  warnings?: string[];
}

// ============================================================================
// Utilities
// ============================================================================

export const vibrate = (pattern: number | number[] = 10) => {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(pattern);
  }
};

export const exportToCSV = (data: any[], filename: string) => {
  if (data.length === 0) return;

  // Get all unique keys from all objects
  const keys = Array.from(new Set(data.flatMap(obj => Object.keys(obj))));

  // Create CSV header
  const header = keys.join(',');

  // Create CSV rows
  const rows = data.map(obj => {
    return keys.map(key => {
      const value = obj[key];
      // Handle values that might contain commas or quotes
      if (value === null || value === undefined) return '';
      const stringValue = String(value);
      if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    }).join(',');
  });

  // Combine header and rows
  const csv = [header, ...rows].join('\n');

  // Create and download file
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// ============================================================================
// Control Components
// ============================================================================

export { EntryManager } from './controls/EntryManager';
export { StopOrderMonitor } from './controls/StopOrderMonitor';

// ============================================================================
// Display Components
// ============================================================================

export { PositionCard, type PositionAction, type PositionActionPayload } from './display/PositionCard';
export { PositionRiskManagement } from './display/PositionRiskManagement';
export { RecentClosed } from './display/RecentClosed';
export { WatchingPositionsSector } from './display/WatchingPositionsSector';
export { RunningPositionsSector } from './display/RunningPositionsSector';
export { PositionControlPanel } from './display/PositionControlPanel';

// ============================================================================
// Hooks
// ============================================================================

export { useTradeData } from './hooks/useTradeData';
export { useSymbolAutocomplete } from './hooks/useSymbolAutocomplete';
export { useStockTrades } from './hooks/useStockTrades';

// ============================================================================
// Default export for lazy loading
// ============================================================================

export { default } from './panels/TradePanel';
