import { getFeeConfig } from '@/config/envConfig';
import { isCryptoSymbol } from '@/shared/utils/stocks';

const ALPACA_FEES = getFeeConfig();

export function calculateBreakEven(
  entryPrice: number,
  isCrypto: boolean,
  orderType: 'market' | 'limit' = 'limit',
  side: 'long' | 'short' = 'long'
): number {
  if (entryPrice <= 0) return entryPrice;

  if (!isCrypto) {
    const roundTripFeeRate = ALPACA_FEES.STOCKS.REGULATORY_ONE_WAY * 2;
    const bePrice = entryPrice * (1 + roundTripFeeRate);
    return side === 'long' ? bePrice : entryPrice * (1 - roundTripFeeRate);
  }

  const feeRate =
    orderType === 'market'
      ? ALPACA_FEES.TIER_1.TAKER
      : Math.max(0, ALPACA_FEES.TIER_1.MAKER);
  const roundTripFeeRate = feeRate * 2;
  const bePrice = entryPrice * (1 + roundTripFeeRate);
  return side === 'long' ? bePrice : entryPrice * (1 - roundTripFeeRate);
}

export function calcBePnlDistance(
  entryPrice: number,
  livePrice: number,
  isCrypto: boolean,
  orderType: 'market' | 'limit' = 'market',
  side: 'long' | 'short' = 'long'
): { beDollar: number; bePct: number; isAboveBreakEven: boolean } {
  const bePrice = calculateBreakEven(entryPrice, isCrypto, orderType, side);
  const beDollar = side === 'long' ? bePrice - livePrice : livePrice - bePrice;
  const bePct = livePrice > 0 ? (beDollar / livePrice) * 100 : 0;
  return {
    beDollar,
    bePct,
    isAboveBreakEven: beDollar <= 0,
  };
}

export function getDefaultQtyForSymbol(presets: number[], symbol: string): number | null {
  const isCrypto = isCryptoSymbol(symbol);
  if (!isCrypto) return 100;

  if (!Array.isArray(presets) || presets.length === 0) return null;
  const target = 0.05;

  if (presets.includes(target)) return target;

  let best = presets[0];
  let bestDistance = Math.abs(best - target);
  for (const candidate of presets) {
    const distance = Math.abs(candidate - target);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}
