import { AlpacaConfig } from '../types';

const parseEnvNumber = (val: string | undefined): number => {
  if (!val) return 0;
  const parsed = parseFloat(val);
  return isNaN(parsed) ? 0 : parsed;
};

const parseEnvBool = (val: string | undefined): boolean => {
  if (!val) return false;
  return val.toLowerCase() === 'true';
};

const parsePriceStep = (val: string | undefined, defaultVal: number): number => {
  if (!val) return defaultVal;
  const parsed = parseFloat(val);
  return isNaN(parsed) || parsed <= 0 ? defaultVal : parsed;
};

const parseEnvList = (val: string | undefined, fallback: string[]): string[] => {
  if (!val) return fallback;
  const items = val.split(',').map(s => s.trim()).filter(Boolean);
  return items.length > 0 ? items : fallback;
};

export const isAuthEnabled = (): boolean => {
  const authEnabled = import.meta.env.VITE_AUTH_ENABLED;
  if (authEnabled === undefined || authEnabled === null || authEnabled === '') {
    return false;
  }
  const lowerAuth = authEnabled.toLowerCase();
  return !['false', '0', 'no', 'disabled'].includes(lowerAuth);
};

export const getEnvConfig = (): AlpacaConfig => {
  const tickers = parseEnvList(import.meta.env.VITE_MOBILE_DEFAULT_TICKERS, ['INTC', 'MU', 'MC']);
  const presets = parseEnvList(import.meta.env.VITE_MOBILE_DEFAULT_PRESETS, ['10K', '100K', '30K', '50K']);
  const defaultPreset = presets.includes(import.meta.env.VITE_MOBILE_DEFAULT_PRESET || '')
    ? (import.meta.env.VITE_MOBILE_DEFAULT_PRESET as string)
    : presets[0];
  const tierRaw = (import.meta.env.VITE_MOBILE_DEFAULT_TIER as 'M' | 'L' | 'S') || 'L';
  const defaultTier: 'M' | 'L' | 'S' = ['M', 'L', 'S'].includes(tierRaw) ? tierRaw : 'L';

  return {
    paperApiKey: '',
    paperApiSecret: '',
    liveApiKey: '',
    liveApiSecret: '',
    isPaper: parseEnvBool(import.meta.env.VITE_ALPACA_IS_PAPER),
    defaults: {
      extendedHours: parseEnvBool(import.meta.env.VITE_EXTENDED_HOURS),
      pollingInterval: parseEnvNumber(import.meta.env.VITE_POLLING_INTERVAL),
      defaultTimeInForce: (import.meta.env.VITE_DEFAULT_TIME_IN_FORCE || 'gtc') as 'gtc' | 'day' | 'ioc',
      aggressiveMode: parseEnvBool(import.meta.env.VITE_AGGRESSIVE_MODE),
      mobilePriceSteps: {
        large: parsePriceStep(import.meta.env.VITE_MOBILE_PRICE_STEP_LARGE, 1.00),
        mid: parsePriceStep(import.meta.env.VITE_MOBILE_PRICE_STEP_MID, 0.10),
        small: parsePriceStep(import.meta.env.VITE_MOBILE_PRICE_STEP_SMALL, 0.01),
      },
      stopSlippagePct: parseEnvNumber(import.meta.env.VITE_STOP_SLIPPAGE_PCT) || 0.001,
      mobile: {
        tickers,
        presets,
        defaultPreset,
        defaultTier,
        defaultOsl: parseEnvBool(import.meta.env.VITE_MOBILE_DEFAULT_OSL),
        width: parseEnvNumber(import.meta.env.VITE_MOBILE_WIDTH) || 390,
        height: parseEnvNumber(import.meta.env.VITE_MOBILE_HEIGHT) || 844,
        margin: parseEnvNumber(import.meta.env.VITE_MOBILE_MARGIN) || 12,
      },
    }
  };
};

export const getLLMConfig = () => {
  return {
    provider: (import.meta.env.VITE_LLM_PROVIDER as any) || 'cerebras',
    cerebrasApiKey: import.meta.env.VITE_CEREBRAS_API_KEY || '',
    openrouterApiKey: import.meta.env.VITE_OPENROUTER_API_KEY || '',
    cohereApiKey: import.meta.env.VITE_COHERE_API_KEY || '',
    mistralApiKey: import.meta.env.VITE_MISTRAL_API_KEY || '',
    groqApiKey: import.meta.env.VITE_GROQ_API_KEY || '',
    googleApiKey: import.meta.env.VITE_GOOGLE_API_KEY || '',
    copilotApiKey: import.meta.env.VITE_COPILOT_API_KEY || '',
  };
};

export const getTradingConfig = () => {
  return {
    strategy: 'scalper' as const,
    defaultSymbol: import.meta.env.VITE_DEFAULT_SYMBOL || 'INTC',
    defaultQty: parseEnvNumber(import.meta.env.VITE_DEFAULT_QTY),
    trailingStopDefaultPct: parseEnvNumber(import.meta.env.VITE_TRAILING_STOP_DEFAULT_PCT),
    trailingStopMinPct: parseEnvNumber(import.meta.env.VITE_TRAILING_STOP_MIN_PCT),
    autoStopLossPct: parseEnvNumber(import.meta.env.VITE_AUTO_STOP_LOSS_PCT),
    autoTakeProfitPct: parseEnvNumber(import.meta.env.VITE_AUTO_TAKE_PROFIT_PCT),
    beStopOffsetPct: parseEnvNumber(import.meta.env.VITE_BE_STOP_OFFSET),
    slStopOffsetPct: parseEnvNumber(import.meta.env.VITE_SL_STOP_OFFSET),
    maxPositionSizePercent: parseEnvNumber(import.meta.env.VITE_MAX_POSITION_SIZE_PERCENT),
    layer1Enabled: parseEnvBool(import.meta.env.VITE_LAYER1_ENABLED),
    layer2Enabled: parseEnvBool(import.meta.env.VITE_LAYER2_ENABLED),
    layer3Enabled: parseEnvBool(import.meta.env.VITE_LAYER3_ENABLED),
    layer2TrailPct: parseEnvNumber(import.meta.env.VITE_LAYER2_TRAIL_PCT),
    layer3TrailPct: parseEnvNumber(import.meta.env.VITE_LAYER3_TRAIL_PCT),
    ladderPriceStep: parseEnvNumber(import.meta.env.VITE_LADDER_PRICE_STEP) || 0.10,
    ladderOrderCount: parseEnvNumber(import.meta.env.VITE_LADDER_ORDER_COUNT) || 3,
  };
};

export const getFeeConfig = () => {
  return {
    COMMISSION: 0,
    STOCKS: {
      REGULATORY_ONE_WAY: parseEnvNumber(import.meta.env.VITE_ALPACA_STOCKS_FEE),
    },
    TIER_1: {
      TAKER: parseEnvNumber(import.meta.env.VITE_ALPACA_CRYPTO_TAKER_FEE),
      MAKER: parseEnvNumber(import.meta.env.VITE_ALPACA_CRYPTO_MAKER_FEE),
    },
  };
};