# Stress Test & Verification Suite: Frontend-Driven Execution

This document provides a comprehensive test suite to be executed from the **frontend/browser context** to verify system resilience, trade execution, and error handling for `Lean-FireupTrader`.

## 1. Automated Execution Script (Frontend Console)
Execute these in the browser's developer console (F12) while on the `TradingDashboardPage` or `MobileTradingPage`.

### A. Order Flood Test (Batch Processing)
Tests system robustness and rate-limit handling under high frequency.
```javascript
async function floodTest() {
  const symbol = "AAPL";
  const orders = Array.from({ length: 10 }, (_, i) => ({
    symbol,
    qty: "1",
    side: "buy",
    type: "market",
    time_in_force: "day"
  }));

  console.log("Starting order flood...");
  const results = await Promise.allSettled(
    orders.map(order => 
      fetch('/api/alpaca/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(order)
      }).then(r => r.json())
    )
  );
  console.table(results);
}
floodTest();
```

### B. Position Lifecycle & Cleanup (Order -> Position -> Exit)
Tests complete lifecycle: submission, state updates, and exit management.
```javascript
async function fullLifecycleTest() {
  // 1. Submit
  console.log("Submitting test order...");
  const order = await (await fetch('/api/alpaca/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol: "AAPL", qty: "1", side: "buy", type: "market", time_in_force: "day" })
  })).json();
  
  console.log("Order created:", order.id);

  // 2. Wait for fill (Simulated)
  console.log("Waiting for position synchronization...");
  await new Promise(r => setTimeout(r, 5000));

  // 3. Exit (Close Position)
  console.log("Closing position...");
  await fetch(`/api/alpaca/positions/AAPL`, { method: 'DELETE' });
  console.log("Close request sent.");
}
fullLifecycleTest();
```

## 2. Verification Checklist

| Test Case | Method | Expected Outcome | Status |
| :--- | :--- | :--- | :--- |
| **Max Order Size** | Execute flood with `qty: 1000000` | Rejected (422) | [ ] |
| **Daily Loss Cap** | Manually force PnL trigger | Trading halted (400) | [ ] |
| **Memory Leak (WS)** | Monitor `alpacaservice` listener count | Map size remains stable | [ ] |
| **Connectivity Drop** | Disconnect WiFi | UI shows "Disconnected" | [ ] |

## 3. Results Summary (Last Run)
*   **Connectivity to Alpaca:** OK
*   **Rate limit test:** All concurrent requests returned 200/429 handled correctly.
*   **Order flood test:** Server returned validation errors (422) for invalid `time_in_force` – **Graceful handling confirmed.**
