// =============================================================================
// Stock Trading Services - Alpaca Markets API
// =============================================================================

// Alpaca Service
export { AlpacaService } from './AlpacaService';
export type { OrderUpdate } from './AlpacaService';

// =============================================================================
// Types
// =============================================================================
export type {
  StockStrategyMode,
  PositionBias,
  StockConfigType
} from './types';

// =============================================================================
// Configuration
// =============================================================================
export {
  STOCK_CONFIG,
  STOCK_COMMON_OPTIMIZATIONS
} from './config';
