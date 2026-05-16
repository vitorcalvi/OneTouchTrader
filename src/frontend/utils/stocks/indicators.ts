import { Bar } from '../../types';

/**
 * Calculates the Average True Range (ATR) for a set of bars.
 * 
 * @param bars - Array of price bars (candles)
 * @param period - The period for ATR calculation (default: 14)
 * @returns The calculated ATR value, or null if insufficient data
 */
export const calculateATR = (bars: Bar[], period: number = 14): number | null => {
  if (!bars || bars.length === 0) return null;
  
  const trs: number[] = [];
  
  // Calculate True Range for the first bar (fallback to High - Low)
  const firstHigh = bars[0].h;
  const firstLow = bars[0].l;
  trs.push(firstHigh - firstLow);
  
  // Calculate True Range for subsequent bars
  for (let i = 1; i < bars.length; i++) {
      const high = bars[i].h;
      const low = bars[i].l;
      const prevClose = bars[i-1].c;
      
      const tr = Math.max(
          high - low,
          Math.abs(high - prevClose),
          Math.abs(low - prevClose)
      );
      trs.push(tr);
  }
  
  // If we have fewer TRs than the requested period, return simple average
  if (trs.length < period) {
    return trs.reduce((a, b) => a + b, 0) / trs.length;
  }
  
  // Wilder's smoothing: first ATR = SMA of first `period` TRs
  let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;

  // Then apply exponential smoothing for remaining TRs
  for (let i = period; i < trs.length; i++) {
    atr = ((atr * (period - 1)) + trs[i]) / period;
  }

  return atr;
};
