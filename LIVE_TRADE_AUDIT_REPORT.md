# Live-Trading Readiness Audit Report

**Date:** 2026-05-18  
**Auditor:** Lead SRE / Trading Systems Architect  
**System:** Lean-FireupTrader

---

## 1. RISK ASSESSMENT

### Critical Financial Loss Vectors

| Risk Category | Severity | Description |
|---------------|----------|-------------|
| **Missing Max Order Size Limits** | CRITICAL | No `max-order-size` limits enforced - orders can exceed account equity |
| **Missing Daily Loss Caps** | HIGH | No circuit breaker for daily losses - unlimited drawdown exposure |
| **Bracket Order Orphan Risk** | MEDIUM | `submitBracketOrder` exists but no atomicity guarantee for OCO legs |
| **Floating-Point Precision** | LOW | Price rounding handled by Alpaca API backend proxy |

### Observed Behaviors
- `StockOrderManager.ts` accepts any `qty` value without validation
- `portfolioRisk.ts` calculates VaR/var95 but not enforced as trading limits
- No `max_position_size_percent` enforcement in order flow (only in config)

---

## 2. GO-LIVE CHECKLIST

| Domain | Check | Status | Notes |
|--------|-------|--------|-------|
| **Financial Integrity** |
| Circuit Breakers | ⚠️ Partial | Only polling circuit breaker exists (`useTradeData.ts` 8-consecutive error threshold) |
| Max Order Size Limits | ❌ Fail | No server-side or frontend limits |
| Daily Loss Cap | ❌ Fail | No daily loss tracking/enforcement |
| Bracket Order Atomicity | ⚠️ Partial | `StockOrderManager.submitBracketOrder` sends both legs but no rollback |
| Floating-Point Precision | ✅ Pass | Alpaca handles price formatting; frontend stringifies payload |
| **Operational Reliability** |
| Network Loss Recovery | ✅ Pass | Exponential backoff in `fetchWithRetry` (max 3 retries) |
| Rate Limit Handling | ✅ Pass | 429 triggers backoff; 60s window enforced |
| WebSocket Auto-Recovery | ⚠️ Partial | Reconnect with 5min timeout, max 3 retries |
| Error Observability | ✅ Pass | `SecureLogger` redacts credentials; `handleError` captures stack traces |
| **Security & Access** |
| Credential Separation | ✅ Pass | Paper/Live keys stored separately; `isPaper` flag controls routing |
| Credential Immutability | ✅ Pass | API keys loaded once at server startup |
| Environment Validation | ✅ Pass | `validateEnv` crashes fast if keys missing in production |
| **Concurrency & State** |
| Race Conditions | ⚠️ Partial | `metricsRef` fix prevents state race but order updates not synchronized |
| Memory Leaks | ⚠️ Partial | WebSocket cleanup exists but `orderUpdateListeners` Map never pruned |
| Timer Cleanup | ✅ Pass | `useEffect` cleanup in `useTradeData` disconnects WebSocket |

---

## 3. STRESS TEST RECOMMENDATIONS

### API Outage Simulation (Staging)

```bash
# 1. Simulate network partition
sudo iptables -A OUTPUT -p tcp --dport 443 -j DROP
# Verify circuit breaker trips after 8 polling errors

# 2. Simulate rate limiting
for i in {1..200}; do
  curl -H "APCA-API-KEY-ID: $KEY" http://localhost:5171/api/alpaca/account &
done
# Verify 429 responses and backoff behavior

# 3. WebSocket disconnect simulation
# Stop backend server during active trading session
# Verify frontend shows stale data warning and toast notification
```

### Load Spike Simulation

```bash
# Use Artillery for 100 concurrent users polling positions
artillery run --target http://localhost:5171/api/alpaca/positions spike.yaml

# Verify:
# - Rate limiter caps at configured limit
# - No memory growth over 5 minutes
# - WebSocket connections remain stable
```

### Order Flood Test

```bash
# Submit 50 bracket orders rapidly
for i in {1..50}; do
  curl -X POST http://localhost:5171/api/alpaca/orders \
    -d '{"symbol":"AAPL","qty":1,"side":"buy","type":"limit","limit_price":"100"}' &
done
# Verify all orders are rejected for exceeding position limits
```

---

## 4. BLOCKERS FOR LIVE DEPLOYMENT

| Priority | Issue | Required Fix |
|----------|-------|--------------|
| P0 | No max order size enforcement | Add `maxOrderSize` validation in `StockOrderManager.submitOrder` |
| P0 | No daily loss cap | Implement daily P&L tracker with configurable stop-loss |
| P1 | WebSocket listener cleanup | Prune `orderUpdateListeners` on order fill/cancel |
| P1 | No position size enforcement | Add check against `maxPositionSizePercent` from config |

---

## 5. PASSED SAFEGUARDS

- ✅ API rate limiting with exponential backoff
- ✅ Credential redaction in logs (`SecureLogger`)
- ✅ Environment validation on startup (crash-fast)
- ✅ Paper/Live key isolation
- ✅ WebSocket reconnection with backoff
- ✅ Polling circuit breaker (8 errors)
- ✅ Request body size limit (1MB)
- ✅ Abort signal timeout (10s default)

---

*Report generated from codebase analysis. Remediate P0 blockers before live trading.*