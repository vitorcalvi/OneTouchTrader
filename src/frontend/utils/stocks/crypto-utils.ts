/**
 * Crypto trading utilities
 */

/**
 * Compute exit quantity for crypto positions with 8 decimal precision
 * Used for BTC/ETH on Alpaca to avoid "insufficient balance" errors
 */
export function computeCryptoExitQty(input: {
  requestedQty: number;
  filledQty: number;
  positionQty?: number;
}): string | null {
  const requestedQty = Number.isFinite(input.requestedQty)
    ? input.requestedQty
    : 0;
  const filledQty = Number.isFinite(input.filledQty) ? input.filledQty : 0;
  const positionQty = Number.isFinite(input.positionQty ?? NaN)
    ? input.positionQty!
    : 0;

  // Use actual position qty if available (most accurate for balance),
  // then filled qty, then requested
  const baseQty =
    positionQty > 0 ? positionQty : filledQty > 0 ? filledQty : requestedQty;

  if (!(baseQty > 0)) return null;

  // Strictly enforce 8 decimal places for BTC/ETH on Alpaca
  const factor = 1e8;

  // Floor first to get the representable quantity
  const flooredBase = Math.floor(baseQty * factor) / factor;

  // Apply epsilon guard AFTER flooring to ensure we never undershoot
  // Use 1e-8 (1 satoshi) minimum buffer, or 0.01% of floored amount, whichever is larger
  // This ensures the final value is strictly less than position and won't cause balance errors
  const epsilon = Math.max(1e-8, flooredBase * 1e-4);
  const adjusted = flooredBase - epsilon;

  // Final floor to ensure 8 decimal precision
  const floored = Math.floor(adjusted * factor) / factor;

  // Guard: ensure final qty is still meaningful (at least 1e-8)
  if (floored < 1e-8) return null;

  return floored.toFixed(8).replace(/\.?0+$/, "");
}
