/**
 * Order Validation Utilities
 */

export function validateOrder(order) {
  const errors = [];

  if (!order) {
    return { valid: false, errors: ["Missing order payload"] };
  }

  // Symbol validation
  if (!order.symbol || typeof order.symbol !== "string") {
    errors.push("Symbol is required");
  }

  // Qty or Notional check
  const hasQty = order.qty !== undefined && order.qty !== null;
  const hasNotional = order.notional !== undefined && order.notional !== null;

  if (!hasQty && !hasNotional) {
    errors.push("Either 'qty' or 'notional' is required");
  }

  // Side validation
  if (!["buy", "sell"].includes(order.side)) {
    errors.push("Side must be 'buy' or 'sell'");
  }

  // Type validation
  if (!["market", "limit", "stop", "stop_limit", "trailing_stop"].includes(order.type)) {
    errors.push("Invalid order type");
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true };
}
