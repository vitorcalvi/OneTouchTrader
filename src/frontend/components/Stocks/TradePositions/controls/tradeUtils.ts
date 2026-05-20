// Hardcoded fee rate for break-even calculation
const FEE_RATE = 0.001;  // 0.1%

import { isCryptoSymbol } from '@/shared/utils/stocks';

export function calculateBreakEven(
  entryPrice: number,
  _isCrypto: boolean,
  _orderType: 'market' | 'limit' = 'limit',
  side: 'long' | 'short' = 'long'
): number {
  if (entryPrice <= 0) return entryPrice;

  // Use simplified fee calculation
  const roundTripFeeRate = FEE_RATE * 2;
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
