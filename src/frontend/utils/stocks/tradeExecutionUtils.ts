/**
 * Shared utilities for trade execution hooks
 */

/**
 * Retry an async operation with exponential backoff
 */
export async function runWithRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxRetries = 3,
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const isLast = attempt === maxRetries;
      console.error(
        `[${label}] attempt ${attempt}/${maxRetries} failed:`,
        err?.message,
      );
      if (isLast) {
        throw err;
      }
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
  throw new Error(`${label} failed after ${maxRetries} attempts`);
}

/**
 * Cancel an order with retry support
 */
export async function cancelOrderWithRetry(
  cancelFn: (orderId: string) => Promise<void>,
  orderId: string,
  logPrefix: string,
  retries = 2,
): Promise<boolean> {
  for (let i = 0; i <= retries; i++) {
    try {
      await cancelFn(orderId);
      console.log(
        `${logPrefix} Successfully cancelled order ${orderId} (attempt ${i + 1})`,
      );
      return true;
    } catch (e: unknown) {
      const error = e as Error;
      console.error(
        `${logPrefix} Failed to cancel order ${orderId} (attempt ${i + 1}):`,
        error.message,
      );
      if (i === retries) return false;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  return false;
}

/**
 * Format price for crypto (variable decimal places)
 */
export function formatCryptoPrice(value: number): string {
  const pipSize =
    value >= 1000
      ? 0.1
      : value >= 100
        ? 0.01
        : value >= 1
          ? 0.0001
          : 0.00000001;
  const rounded = Math.round(value / pipSize) * pipSize;
  const decimals = pipSize.toString().split(".")[1]?.length ?? 0;
  return rounded.toFixed(decimals);
}

/**
 * Format price based on asset class
 */
export function formatPrice(value: number, isCrypto: boolean): string {
  return isCrypto ? formatCryptoPrice(value) : value.toFixed(2);
}

/**
 * Round to tick size
 */
export function roundToTick(price: number, tickSize: number): number {
  return Math.round(price / tickSize) * tickSize;
}
