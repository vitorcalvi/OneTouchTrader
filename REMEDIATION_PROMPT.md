# LLM Prompt: Remediation of Identified Architectural and Technical Debt

**Role:** You are a Senior Principal Software Engineer. Your task is to execute the remediation plan based on the findings from the codebase audit of `Lean-FireupTrader`.

**Context:**
The audit identified several critical areas requiring attention: 
1. **Architectural Separation:** Inconsistent usage of backend/frontend services.
2. **Error Handling/Resiliency:** Fragile error handling and inconsistent metrics reporting.
3. **State Management:** Performance issues due to excessive re-renders in trade monitoring components.
4. **Type Safety:** Widespread use of `any` types, particularly in WebSocket listeners and order management.
5. **Trading Logic:** Potential race conditions in order submission and batch processing.

**Directive:**
Execute the following remediation tasks prioritized by urgency. 

### P0: Critical Infrastructure & Stability (Immediate Remediation)
1. **Strong Typing for Order Pipeline:** Replace `any` in `AlpacaService` listeners and WebSocket message handlers with explicit interfaces (`OrderUpdate`).
2. **WebSocket Robustness:** Implement validation for all incoming WebSocket messages in `AlpacaService.ts` and add centralized error logging.
3. **Correctness of Execution Logic:** Refactor bracket order price calculations in `StockOrderManager.ts` to strictly adhere to the provided inputs, removing hardcoded logic that causes erroneous execution.

### P1: Resiliency & Performance
1. **Service Consolidation:** Unify the entry points for order submissions in `StockOrderManager.ts` and `AlpacaService.ts` to reduce code duplication and inconsistent API calls.
2. **State Management Optimization:** Refactor `useErrorHandler.ts` to use `useRef` for error metrics instead of `useState` to prevent cascading component re-renders during high-frequency API events.
3. **Transactional Integrity:** Implement transactional patterns (or locking mechanisms) for batch order submissions in `MobileTradingPage.tsx` to prevent partial execution failures.

### P2: Technical Debt & Cleanup
1. **Tick Optimization:** Improve tick direction state updates in `MobileTradingPage.tsx` to handle high-frequency price updates without lag.
2. **Lifecycle Management:** Add cleanup handlers for fire-and-forget promises in `useTradeData.ts` to prevent memory leaks and dangling subscriptions.

**Execution Guidelines:**
- **Prioritize Validation:** Every change MUST be verified with unit tests or integration tests.
- **Maintain Consistency:** Adhere strictly to existing architectural patterns. If a pattern is problematic, propose a refactor in a separate, isolated step.
- **Security First:** Never expose secrets; ensure all server-side proxies maintain complete credential isolation.
- **Lean Tool Usage:** Use efficient grep/read patterns. Combine tasks when they affect the same files to minimize context overhead.
- **Report Status:** Keep the session updated via `update_topic` as you transition between task groups.
