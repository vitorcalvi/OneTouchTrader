export type SettingKind = 'string' | 'number' | 'boolean' | 'enum' | 'csv' | 'password';

export interface SettingDef {
  key: string; // e.g. 'VITE_AUTO_STOP_LOSS_PCT'
  label: string; // 'Auto Stop Loss %'
  kind: SettingKind;
  group: string; // 'Risk' | 'Mobile UI' | 'Orders' | 'Layered Stops' | 'Ladder' | 'Defaults'
  enumValues?: string[]; // for kind:'enum'
  min?: number;
  max?: number;
  step?: number; // for kind:'number'
  help?: string;
}

export const SETTINGS: SettingDef[] = [
  // === Brokerage (top of Settings) ===
  { key: 'alpaca_paper_key_id', label: 'Paper API Key ID', kind: 'password', group: 'Brokerage', help: 'Alpaca paper trading key' },
  { key: 'alpaca_paper_secret', label: 'Paper API Secret', kind: 'password', group: 'Brokerage', help: 'Alpaca paper trading secret' },
  { key: 'alpaca_live_key_id', label: 'Live API Key ID', kind: 'password', group: 'Brokerage', help: 'Alpaca live trading key' },
  { key: 'alpaca_live_secret', label: 'Live API Secret', kind: 'password', group: 'Brokerage', help: 'Alpaca live trading secret' },

  // === Defaults ===
  { key: 'VITE_DEFAULT_SYMBOL', label: 'Default Symbol', kind: 'string', group: 'Defaults' },
  { key: 'VITE_DEFAULT_QTY', label: 'Default Qty', kind: 'number', group: 'Defaults', min: 1 },
  { key: 'VITE_DEFAULT_TIME_IN_FORCE', label: 'Time In Force', kind: 'enum', group: 'Defaults', enumValues: ['day', 'gtc', 'ioc'] },
  { key: 'VITE_EXTENDED_HOURS', label: 'Extended Hours', kind: 'boolean', group: 'Defaults' },
  { key: 'VITE_ALPACA_IS_PAPER', label: 'Paper Trading', kind: 'boolean', group: 'Defaults', help: 'Same toggle as the PAPER/LIVE pill in the header.' },

  // === Mobile UI ===
  { key: 'VITE_MOBILE_DEFAULT_TICKERS', label: 'Watchlist Tickers', kind: 'csv', group: 'Mobile UI', help: 'Comma-separated, e.g. INTC,IREN' },
  { key: 'VITE_MOBILE_DEFAULT_PRESETS', label: 'Notional Presets ($)', kind: 'csv', group: 'Mobile UI', help: 'e.g. 5K,10K,20K,40K' },
  { key: 'VITE_MOBILE_DEFAULT_PRESET', label: 'Default Preset', kind: 'string', group: 'Mobile UI' },
  { key: 'VITE_MOBILE_DEFAULT_TIER', label: 'Default Order Tier', kind: 'enum', group: 'Mobile UI', enumValues: ['M', 'L', 'S'] },
  { key: 'VITE_MOBILE_DEFAULT_OSL', label: 'Default O-SL On', kind: 'boolean', group: 'Mobile UI' },
  { key: 'VITE_MOBILE_PRICE_STEP_LARGE', label: 'Price Step Large', kind: 'number', group: 'Mobile UI', step: 0.01 },
  { key: 'VITE_MOBILE_PRICE_STEP_MID', label: 'Price Step Mid', kind: 'number', group: 'Mobile UI', step: 0.01 },
  { key: 'VITE_MOBILE_PRICE_STEP_SMALL', label: 'Price Step Small', kind: 'number', group: 'Mobile UI', step: 0.001 },
  { key: 'VITE_ORDER_TYPE', label: 'Order Type Order', kind: 'csv', group: 'Mobile UI', help: 'e.g. STOP,MARKET,LIMIT' },

  // === Orders ===
  { key: 'VITE_AGGRESSIVE_MODE', label: 'Aggressive Mode', kind: 'boolean', group: 'Orders' },
  { key: 'VITE_POLLING_INTERVAL', label: 'Polling Interval (s)', kind: 'number', group: 'Orders', min: 1, max: 60 },
  { key: 'VITE_STOP_SLIPPAGE_PCT', label: 'Stop Slippage %', kind: 'number', group: 'Orders', step: 0.01 },

  // === Risk ===
  { key: 'VITE_AUTO_TAKE_PROFIT_PCT', label: 'Auto TP %', kind: 'number', group: 'Risk', step: 0.05 },
  { key: 'VITE_AUTO_STOP_LOSS_PCT', label: 'Auto SL %', kind: 'number', group: 'Risk', step: 0.05 },
  { key: 'VITE_BE_STOP_OFFSET', label: 'BE Stop Offset', kind: 'number', group: 'Risk', step: 0.01 },
  { key: 'VITE_SL_STOP_OFFSET', label: 'SL Stop Offset', kind: 'number', group: 'Risk', step: 0.01 },
  { key: 'VITE_TRAILING_STOP_DEFAULT_PCT', label: 'Trailing Stop %', kind: 'number', group: 'Risk', step: 0.05 },
  { key: 'VITE_TRAILING_STOP_MIN_PCT', label: 'Trailing Min %', kind: 'number', group: 'Risk', step: 0.05 },
  { key: 'VITE_MAX_POSITION_SIZE_PERCENT', label: 'Max Position %', kind: 'number', group: 'Risk', min: 1, max: 100 },

  // === Layered Stops (L&F) ===
  { key: 'VITE_LAYER1_ENABLED', label: 'L1 Enabled', kind: 'boolean', group: 'Layered Stops' },
  { key: 'VITE_LAYER2_ENABLED', label: 'L2 Enabled', kind: 'boolean', group: 'Layered Stops' },
  { key: 'VITE_LAYER3_ENABLED', label: 'L3 Enabled', kind: 'boolean', group: 'Layered Stops' },
  { key: 'VITE_LAYER2_TRAIL_PCT', label: 'L2 Trail %', kind: 'number', group: 'Layered Stops', step: 0.05 },
  { key: 'VITE_LAYER3_TRAIL_PCT', label: 'L3 Trail %', kind: 'number', group: 'Layered Stops', step: 0.05 },

  // === Ladder ===
  { key: 'VITE_LADDER_PRICE_STEP', label: 'Ladder Step', kind: 'number', group: 'Ladder', step: 0.01 },
  { key: 'VITE_LADDER_ORDER_COUNT', label: 'Ladder Orders', kind: 'number', group: 'Ladder', min: 1, max: 10 },
];