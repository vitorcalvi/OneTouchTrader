import type { Order } from '../../types';
import type { AlpacaService } from '../../services/stocks';

interface CancelExitOrdersOptions {
  symbol: string;
  side?: 'buy' | 'sell';
  preFetchedOrders?: Order[];
  verifyAttempts?: number;
  verifyDelayMs?: number;
}

const EXIT_ORDER_TYPES = ['stop', 'stop_limit', 'trailing_stop', 'limit'] as const;

/**
 * Cancel all existing exit orders (SL/TP/TSL/limit) for a symbol, optionally scoped by side.
 * Waits for propagation to reduce race conditions with Alpaca order state.
 */
export async function cancelExistingExitOrders(
  service: AlpacaService,
  {
    symbol,
    side,
    preFetchedOrders,
    verifyAttempts = 12,
    verifyDelayMs = 400,
  }: CancelExitOrdersOptions
): Promise<boolean> {
  try {
    const openOrders = preFetchedOrders || await service.getOrders('open');
    const exitOrders = openOrders.filter(o =>
      o.symbol === symbol &&
      (!side || o.side === side) &&
      EXIT_ORDER_TYPES.includes(o.type as any)
    );

    if (exitOrders.length === 0) {
      return false;
    }

    await Promise.allSettled(exitOrders.map(o => service.cancelOrder(o.id)));

    let confirmed = false;
    for (let i = 0; i < verifyAttempts; i++) {
      await new Promise(r => setTimeout(r, verifyDelayMs));
      const verify = await service.getOrders('open');
      const stillThere = verify.some(o =>
        o.symbol === symbol &&
        (!side || o.side === side) &&
        EXIT_ORDER_TYPES.includes(o.type as any)
      );
      if (!stillThere) {
        confirmed = true;
        break;
      }
    }

    return confirmed;
  } catch (e) {
    console.error('Failed to cancel existing exit orders:', e);
    return false;
  }
}
