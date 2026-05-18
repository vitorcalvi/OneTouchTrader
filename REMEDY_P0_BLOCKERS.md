# Remediation Plan: P0 Live-Trading Blockers

This document outlines the implementation strategy to address the critical P0 blockers identified in the `LIVE_TRADE_AUDIT_REPORT.md` before deploying to live production.

## 1. Max Order Size Enforcement
**Target:** `src/frontend/services/stocks/StockOrderManager.ts`

- **Implementation:** Modify `submitOrder` to retrieve current account balance (via `AlpacaService`).
- **Logic:**
  ```typescript
  const account = await this.alpacaService.getAccount();
  if (order.qty * currentPrice > account.buying_power * MAX_ORDER_PERCENT) {
    throw new Error("Order size exceeds risk limits");
  }
  ```
- **Validation:** Add a new test case in `StockOrderManager.test.ts` (if exists) or a validation script to ensure orders are rejected when above limit.

## 2. Daily Loss Cap Implementation
**Target:** `src/frontend/services/stocks/portfolioRiskService.ts` & `AlpacaService.ts`

- **Implementation:** Create a persistent tracker for today's total P&L.
- **Logic:**
  - Retrieve daily P&L from `/api/alpaca/account`.
  - Maintain a memory-resident `dailyLoss` state.
  - In `submitOrder`, check: `if (totalPnl < -DAILY_LOSS_LIMIT) throw new Error("Daily loss cap reached");`.
- **Integration:** Hook this check into `StockOrderManager` before submission.

## 3. WebSocket Listener Cleanup
**Target:** `src/frontend/services/stocks/AlpacaService.ts`

- **Implementation:** Enhance `AlpacaService.ts` to automatically prune listeners.
- **Logic:**
  - Modify `orderUpdateListeners` handler to identify terminal states: `filled`, `canceled`, `expired`.
  - Trigger `this.orderUpdateListeners.delete(orderId)` when one of these states is received from the WebSocket.
- **Verification:** Monitor `orderUpdateListeners.size` during a simulated session with 50+ orders.

## Execution Timeline
1. **P0-1 & P0-2:** Implement risk checks (Order Size & Daily Loss).
2. **P0-3:** Implement WebSocket cleanup logic.
3. **Verification:** Run Stress Test scripts (provided in `LIVE_TRADE_AUDIT_REPORT.md`) to validate the new safeguards.
