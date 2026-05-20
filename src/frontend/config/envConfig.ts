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

// Overlay helpers for settings from localStorage
let envVersion = 0;
const subscribers = new Set<() => void>();

function readOverrides(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem('lean.settings.overrides.v1') ?? '{}');
  } catch {
    return {};
  }
}

function envValue(key: string): string | undefined {
  const o = readOverrides();
  if (o[key] != null && o[key] !== '') return o[key];
  return (import.meta.env as Record<string, string | undefined>)[key];
}

if (typeof window !== 'undefined') {
  window.addEventListener('lean:settings-changed', () => {
    envVersion++;
    subscribers.forEach(fn => fn());
  });
}

export function getEnvVersion(): number {
  return envVersion;
}

export function subscribeEnvChanges(fn: () => void): () => void {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export const isAuthEnabled = (): boolean => {
  const authEnabled = import.meta.env.VITE_AUTH_ENABLED;
  if (authEnabled === undefined || authEnabled === null || authEnabled === '') {
    return false;
  }
  const lowerAuth = authEnabled.toLowerCase();
  return !['false', '0', 'no', 'disabled'].includes(lowerAuth);
};

export const getEnvConfig = (): AlpacaConfig => {
  const tickers = parseEnvList(envValue('VITE_MOBILE_DEFAULT_TICKERS'), ['INTC', 'MU', 'MC']);
  const presets = parseEnvList(envValue('VITE_MOBILE_DEFAULT_PRESETS'), ['10K', '100K', '30K', '50K']);
  const defaultPreset = presets.includes(envValue('VITE_MOBILE_DEFAULT_PRESET') || '')
    ? (envValue('VITE_MOBILE_DEFAULT_PRESET') as string)
    : presets[0];
  const tierRaw = (envValue('VITE_MOBILE_DEFAULT_TIER') as 'M' | 'L' | 'S') || 'L';
  const defaultTier: 'M' | 'L' | 'S' = ['M', 'L', 'S'].includes(tierRaw) ? tierRaw : 'L';

  // Read Alpaca keys from overrides (localStorage) first, then env
  const paperKeyId = envValue('alpaca_paper_key_id') || '';
  const paperSecret = envValue('alpaca_paper_secret') || '';
  const liveKeyId = envValue('alpaca_live_key_id') || '';
  const liveSecret = envValue('alpaca_live_secret') || '';

  return {
    paperApiKey: paperKeyId,
    paperApiSecret: paperSecret,
    liveApiKey: liveKeyId,
    liveApiSecret: liveSecret,
    isPaper: parseEnvBool(envValue('VITE_ALPACA_IS_PAPER')),
    defaults: {
      extendedHours: parseEnvBool(envValue('VITE_EXTENDED_HOURS')),
      pollingInterval: parseEnvNumber(envValue('VITE_POLLING_INTERVAL')),
      defaultTimeInForce: (envValue('VITE_DEFAULT_TIME_IN_FORCE') || 'gtc') as 'gtc' | 'day' | 'ioc',
      aggressiveMode: parseEnvBool(envValue('VITE_AGGRESSIVE_MODE')),
      mobilePriceSteps: {
        large: parsePriceStep(envValue('VITE_MOBILE_PRICE_STEP_LARGE'), 1.00),
        mid: parsePriceStep(envValue('VITE_MOBILE_PRICE_STEP_MID'), 0.10),
        small: parsePriceStep(envValue('VITE_MOBILE_PRICE_STEP_SMALL'), 0.01),
      },
      stopSlippagePct: parseEnvNumber(envValue('VITE_STOP_SLIPPAGE_PCT')) || 0.001,
      mobile: {
        tickers,
        presets,
        defaultPreset,
        defaultTier,
        defaultOsl: parseEnvBool(envValue('VITE_MOBILE_DEFAULT_OSL')),
        width: parseEnvNumber(envValue('VITE_MOBILE_WIDTH')) || 390,
        height: parseEnvNumber(envValue('VITE_MOBILE_HEIGHT')) || 844,
        margin: parseEnvNumber(envValue('VITE_MOBILE_MARGIN')) || 12,
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
    defaultSymbol: envValue('VITE_DEFAULT_SYMBOL') || 'INTC',
    defaultQty: parseEnvNumber(envValue('VITE_DEFAULT_QTY')),
    trailingStopDefaultPct: parseEnvNumber(envValue('VITE_TRAILING_STOP_DEFAULT_PCT')),
    trailingStopMinPct: parseEnvNumber(envValue('VITE_TRAILING_STOP_MIN_PCT')),
    autoStopLossPct: parseEnvNumber(envValue('VITE_AUTO_STOP_LOSS_PCT')),
    autoTakeProfitPct: parseEnvNumber(envValue('VITE_AUTO_TAKE_PROFIT_PCT')),
    beStopOffsetPct: parseEnvNumber(envValue('VITE_BE_STOP_OFFSET')),
    slStopOffsetPct: parseEnvNumber(envValue('VITE_SL_STOP_OFFSET')),
    maxPositionSizePercent: parseEnvNumber(envValue('VITE_MAX_POSITION_SIZE_PERCENT')),
    layer1Enabled: parseEnvBool(envValue('VITE_LAYER1_ENABLED')),
    layer2Enabled: parseEnvBool(envValue('VITE_LAYER2_ENABLED')),
    layer3Enabled: parseEnvBool(envValue('VITE_LAYER3_ENABLED')),
    layer2TrailPct: parseEnvNumber(envValue('VITE_LAYER2_TRAIL_PCT')),
    layer3TrailPct: parseEnvNumber(envValue('VITE_LAYER3_TRAIL_PCT')),
    ladderPriceStep: parseEnvNumber(envValue('VITE_LADDER_PRICE_STEP')) || 0.10,
    ladderOrderCount: parseEnvNumber(envValue('VITE_LADDER_ORDER_COUNT')) || 3,
  };
};

export const getFeeConfig = () => {
  return {
    COMMISSION: 0,
    STOCKS: {
      REGULATORY_ONE_WAY: parseEnvNumber(envValue('VITE_ALPACA_STOCKS_FEE')),
    },
    TIER_1: {
      TAKER: parseEnvNumber(envValue('VITE_ALPACA_CRYPTO_TAKER_FEE')),
      MAKER: parseEnvNumber(envValue('VITE_ALPACA_CRYPTO_MAKER_FEE')),
    },
  }
};

// === Alpaca Keys from localStorage ===
export function getAlpacaKeys(mode: 'paper' | 'live'): { keyId: string; secret: string } {
  const keyId = localStorage.getItem(`alpaca_${mode}_key_id`) || '';
  const secret = localStorage.getItem(`alpaca_${mode}_secret`) || '';
  return { keyId, secret };
}

export function hasAlpacaKeys(mode: 'paper' | 'live'): boolean {
  const { keyId, secret } = getAlpacaKeys(mode);
  return Boolean(keyId && secret);
}