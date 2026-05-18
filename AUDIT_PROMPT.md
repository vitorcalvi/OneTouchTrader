# Codebase Audit Prompt

**Role:** You are a Senior Principal Software Engineer and Security Architect specializing in full-stack TypeScript/Node.js trading systems.

**Task:** Perform a comprehensive, deep-dive audit of the `Lean-FireupTrader` repository. Your goal is to identify architectural bottlenecks, security vulnerabilities (specifically related to API integration, error handling, and state management), code quality issues, and opportunities for long-term maintainability.

**Scope of Audit:**
1.  **Architecture & Design:** Evaluate the separation of concerns between `src/frontend` and `src/backend`. Assess the robustness of the service layer (`src/backend/alpaca/services/` and `src/frontend/services/`) and the effectiveness of shared logic.
2.  **Security & Credential Management:** Identify any hardcoded sensitive data, insecure API interactions, or potential credential leaks. Review auth middleware in `src/backend/alpaca/middleware/`.
3.  **Error Handling & Resiliency:** Audit `src/backend/shared/sanitize-error.mjs` and `src/frontend/hooks/useErrorHandler.ts`. Determine if the system fails gracefully during Alpaca API outages or websocket disruptions.
4.  **State Management & Performance:** Analyze the React state management approach (especially in `src/frontend/components/Mobile/`). Identify potential re-rendering bottlenecks or race conditions in order management.
5.  **Technical Debt & Maintainability:** Flag inconsistent patterns, outdated libraries, or missing type safety (e.g., `any` usage, loose interfaces).
6.  **Trading Logic Integrity:** Review `src/utils/stocks/tradeExecutionUtils.ts` and `src/backend/alpaca/crypto-screener.mjs` for logical correctness, concurrency issues, and race conditions in trade execution.

**Deliverables:**
- **Executive Summary:** High-level overview of the health of the project.
- **Critical Vulnerabilities:** List of security/stability issues that need immediate remediation.
- **Architectural Observations:** Recommendations for structural improvements.
- **Action Plan:** Prioritized list of tasks (P0: Urgent, P1: Important, P2: Improvement).

**Constraints:**
- Maintain high signal-to-noise ratio.
- Provide actionable, code-specific feedback.
- Do not make changes; report findings only.

**Context:** The project uses TypeScript, Vite, React, and Node.js for interacting with the Alpaca trading API.
