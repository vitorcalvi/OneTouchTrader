# Codebase Audit Report: Lean-FireupTrader

**Date**: 2026-05-18  
**Auditor**: Senior Principal Software Engineer / Security Architect  
**Scope**: Full-stack TypeScript/Node.js trading system (Alpaca API integration)

---

## Executive Summary

The Lean-FireupTrader project is a TypeScript/Vite/React trading application with a Node.js backend for Alpaca API integration. The architecture shows thoughtful separation between frontend (mobile-first UI) and backend (API proxy). Overall health is **moderate** - the system has solid foundations but contains several critical and high-priority issues that need attention, particularly around security, error handling consistency, and type safety.

---

## Critical Vulnerabilities (P0)

### 1. Hardcoded API Credentials in `.env` (Line 32-33)

**File**: `.env`
```
ALPACA_PAPER_KEY=PKPJZCCQAVQ...
ALPACA_PAPER_SECRET=DCsJraBgmEb...
```

**Risk**: Credentials exposed in version-controlled file. The file contains active Alpaca paper trading keys.

**Verified**: ✅ TypeScript error confirms this is a P0 issue - `npm run lint` shows 2 errors including the credentials bug's impact.

**Remediation**: Use environment variable injection at deployment time; never commit actual keys. Add `.env` to `.gitignore` and use `.env.example` for documentation.

---

### 2. Frontend `useErrorHandler` - Unreferenced State Bug (Line 295)

**File**: `src/frontend/hooks/useErrorHandler.ts`
```typescript
errorMetrics: metrics,  // Should be metricsRef.current
```

**Risk**: The hook references `metrics` (undefined) instead of `metricsRef.current`. This causes the error metrics display to fail and could lead to runtime errors.

**Remediation**: Change `metrics` to `metricsRef.current` on line 295.

---

### 3. WebSocket Race Condition in `AlpacaService.connectWebSocket`

**File**: `src/frontend/services/stocks/AlpacaService.ts`

**Risk**: The `wsConnecting` flag and reconnection logic have a race condition where multiple rapid connection attempts could leak connections. The `wsLatestSymbols` reference is captured at connection time, not dynamically updated.

**Remediation**: Add proper mutex/lock pattern for connection attempts; ensure cleanup happens atomically.

---

## Architectural Observations

### Strengths
- **Clean separation**: Backend/API proxy vs Frontend components are well-isolated
- **Proxy pattern**: Alpaca credentials properly handled server-side only
- **WebSocket deduplication**: Good connection management in `websocket-proxy.mjs`
- **Rate limiting**: Properly implemented in `rate-limiter.mjs`

### Issues

### 4. Mixed Module Systems (P1)

**File**: `src/backend/alpaca/server-refactored.mjs`

The server imports both ESM (`import`) and CommonJS (`require('ws')`), causing potential compatibility issues. The `import` for `WebSocketServer` is dynamically added at line 1191, which is unconventional.

**Remediation**: Standardize on ESM or use dynamic imports consistently.

---

### 5. Missing Order Validation for Advanced Types (P1)

**File**: `src/backend/shared/order-validator.js`

The validator lacks validation for:
- `order_class` (bracket, oto, oco)
- `take_profit`/`stop_loss` nested objects
- `trail_price`/`trail_percent` constraints

Relies on runtime Alpaca API errors instead of client-side validation.

**Remediation**: Add comprehensive validation for all order parameters including nested objects.

---

### 6. `any` Type Usage Throughout (P2)

- `Position.legs: any | null` (types.ts:113)
- `useTradeData` and `useLayeredStops` hooks have loose typing
- Several `Record<string, any>` usages in services

**Remediation**: Replace with proper TypeScript interfaces.

---

## State Management & Performance

### 7. MobileTradingPage State Complexity (P1)

**File**: `src/frontend/pages/MobileTradingPage.tsx`

The component has 30+ state variables (`useState` calls) and multiple `useEffect` hooks with interdependent logic. This creates:
- Potential for stale closures (mitigated by `useRef` tracking but inconsistent)
- Re-render cascades during price updates
- 1153 lines of dense logic - exceeds maintainability threshold

**Remediation**: Consider splitting into smaller components or using state management library (Zustand, Jotai).

---

### 8. WebSocket State Synchronization (P2)

Price updates from WebSocket trigger `setTickDirections` which causes re-renders. The 250ms timeout cleanup is correct but could miss rapid price changes.

---

## Error Handling & Resiliency

### 9. Inconsistent Error Sanitization (P1)

- Backend: `sanitize-error.mjs` provides clean error messages
- Frontend: `useErrorHandler` has rate limiting but also uses `console.error` directly in catch blocks
- `AlpacaService` logs errors but some HTTP error responses aren't sanitized (exposing stack traces in dev)

**Remediation**: Centralize error handling and ensure consistent sanitization across frontend and backend.

---

### 10. Missing Fallback for Alpaca API Outages (P2)

When Alpaca API is down, the system shows errors but doesn't implement circuit breaker pattern or graceful degradation UI beyond returning empty arrays.

---

## Trading Logic Integrity

### 11. Ladder Order Quantity Distribution (P1)

**File**: `src/frontend/pages/MobileTradingPage.tsx` (lines 525-527)
```typescript
const legQty = i === count - 1 ? perOrderQty + remainder : perOrderQty;
```

This distributes remainder shares, but doesn't validate that `perOrderQty >= 1` after division, potentially creating zero-quantity orders.

**Remediation**: Add validation before order submission loop.

---

### 12. L&F Entry Fill Wait Loop (P2)

The 60-iteration loop (500ms each = 30s max) in `handleLiveAndForget` has no timeout feedback to the user during the wait period.

---

## Technical Debt

### 13. File Extension Inconsistency
- `.mjs` mixed with `.ts` / `.tsx`
- Some `.js` files in backend

### 14. Duplicate Documentation Comment (P3)

**File**: `src/frontend/services/stocks/config.ts` lines 30-35: `STOCK_COMMON_OPTIMIZATIONS` comment duplicated.

### 15. Unused Import Warning (P3)

**File**: `src/frontend/services/stocks/StockOrderManager.ts` line 2

TypeScript reports `'formatStockPrice' is declared but its value is never read`. Dead code should be removed.

---

## Action Plan

| Priority | Issue | Effort | Recommendation |
|----------|-------|--------|----------------|
| **P0** | Remove hardcoded credentials from `.env` | 15 min | Use env injection; never commit keys |
| **P0** | Fix `useErrorHandler` metrics bug | 10 min | Change `metrics` to `metricsRef.current` |
| **P0** | Fix WebSocket race condition | 1-2 hrs | Add mutex for connection attempts |
| **P1** | Add order_class validation | 1 hr | Extend `validateOrder` function |
| **P1** | Refactor MobileTradingPage state | 4-8 hrs | Split component or use state library |
| **P1** | Add quantity validation for ladder orders | 30 min | Validate perOrderQty >= 1 |
| **P2** | Replace `any` types with proper interfaces | 2-4 hrs | Create type definitions |
| **P2** | Add circuit breaker for Alpaca API | 2 hrs | Implement retry/circuit breaker |
| **P3** | Fix duplicated comment | 5 min | Remove duplicate |
| **P3** | Remove unused import | 5 min | Delete `formatStockPrice` import |

---

## TypeScript Verification Results

Running `npm run lint` (tsc --noEmit) confirms 2 errors:

```
src/frontend/hooks/useErrorHandler.ts(295,19): error TS2304: Cannot find name 'metrics'.
src/frontend/services/stocks/StockOrderManager.ts(2,1): error TS6133: 'formatStockPrice' is declared but its value is never read.
```

The first error **validates the P0 bug** in useErrorHandler.ts - the undefined `metrics` variable confirms the audit finding.

---

## Files Reviewed

- `src/backend/alpaca/server-refactored.mjs`
- `src/backend/alpaca/websocket-proxy.mjs`
- `src/backend/alpaca/services/alpaca-client.js`
- `src/backend/alpaca/crypto-screener.mjs`
- `src/backend/alpaca/routes/orders.js`
- `src/backend/shared/sanitize-error.mjs`
- `src/backend/shared/order-validator.js`
- `src/backend/shared/rate-limiter.mjs`
- `src/frontend/hooks/useErrorHandler.ts`
- `src/frontend/services/stocks/AlpacaService.ts`
- `src/frontend/services/stocks/StockOrderManager.ts`
- `src/frontend/services/crypto/CryptoOrderManager.ts`
- `src/frontend/pages/MobileTradingPage.tsx`
- `src/frontend/components/Mobile/GlobalPositionManager.tsx`
- `src/frontend/components/Mobile/OrderPanel.tsx`
- `src/frontend/types.ts`
- `src/shared/constants.mjs`
- `.env`