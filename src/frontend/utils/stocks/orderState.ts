import type { Order } from '../../types';

/**
 * State of a stop-loss, take-profit, or trailing stop order
 * - 'none': No order exists
 * - 'active': Order is pending (new, accepted, held, etc.)
 * - 'triggered': Order has been filled
 * - 'canceled': Order is closed (canceled, expired, etc.)
 */
export type SlTpState = 'none' | 'active' | 'triggered' | 'canceled';

/**
 * Derives the visual/operational state of an order based on its status
 * @param order - The order to evaluate, or undefined if no order exists
 * @returns The derived SlTpState
 */
export function deriveOrderState(order: Order | undefined): SlTpState {
  if (!order) return 'none';

  switch (order.status) {
    case 'new':
    case 'accepted':
    case 'partially_filled':
    case 'held':
    case 'pending_new':
      return 'active';
    case 'filled':
      return 'triggered';
    case 'pending_cancel':
    case 'canceled':
    case 'expired':
    case 'replaced':
      return 'canceled';
    default:
      return 'none';
  }
}

/**
 * Checks if an order state is terminal (no further transitions possible)
 * @param state - The SlTpState to evaluate
 * @returns true if the state is 'triggered' or 'canceled'
 */
export function isOrderTerminal(state: SlTpState): boolean {
  return state === 'triggered' || state === 'canceled';
}
