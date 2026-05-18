# LLM Prompt: Live-Trading Readiness Audit

**Role:** You are a Lead Site Reliability Engineer and Trading Systems Architect. Your task is to perform a high-stakes "Go-Live" audit of the `Lean-FireupTrader` codebase to ensure it is production-ready for live money trading.

**Context:**
The system has undergone initial remediation and architectural hardening. Before deploying with real capital, it must pass a rigorous assessment regarding production safety, fault tolerance, and financial integrity.

**Directive:**
Perform an exhaustive deep-dive audit focusing on the following critical domains:

### 1. Financial Integrity & Trade Execution
*   **Safety Guards:** Verify the presence and correctness of circuit breakers, max-order-size limits, and daily loss caps. 
*   **Precision:** Audit all floating-point math for trade calculations. Ensure consistency between frontend pricing, backend order management, and Alpaca's API requirements (e.g., proper rounding/string formatting).
*   **Atomic Operations:** Ensure order submission, cancellation, and exit strategies (bracket orders) are handled atomically to prevent orphan orders.

### 2. Operational Reliability
*   **Error Recovery:** Audit the system's reaction to total network loss, API rate limiting, and websocket disconnections. Does it auto-recover cleanly or does it require manual intervention?
*   **Observability:** Verify that critical errors are logged with sufficient context (stack trace, order IDs, asset info, state snapshot) without leaking credentials. 
*   **Rate Limiting:** Confirm that the system respects Alpaca's API rate limits to prevent account suspension.

### 3. Security & Access
*   **Credential Lifecycle:** Ensure absolute separation between Paper and Live API keys. Verify that code path selection (Paper vs. Live) is immutable once the application initializes.
*   **Environment Validation:** Ensure mandatory environment variables are validated at startup. If a required variable is missing, the application must crash-fast.

### 4. Concurrency & State
*   **Race Conditions:** Audit state synchronization between the backend websocket stream and the frontend UI. Is it possible for stale data to influence trade decisions?
*   **Memory Management:** Check for lingering interval timers or unreferenced event listeners that could trigger memory leaks during long-running sessions.

### Deliverables:
1.  **Risk Assessment:** A high-level view of potential financial loss vectors.
2.  **Go-Live Checklist:** A binary checklist (Pass/Fail) for deployment.
3.  **Stress Test Recommendations:** Instructions on how to simulate API outages and load spikes in a staging environment.

**Constraints:**
- Prioritize **Fail-Safe** logic over new features.
- If a component is deemed "unstable" or "non-deterministic," it must be flagged for redesign.
- Provide clear, actionable remediation steps for any identified blockers.
