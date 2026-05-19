# Lean-FireupTrader — SaaS Roadmap

**Product:** Mobile cockpit for active Alpaca traders (focus on speed, ladder entries, L&F stops).
**Goal:** $500 MRR (10-25 users) in 30 days to validate PMF.

## The Strategy
1. **Move fast:** Don't build "automated" trading. Sell "faster manual execution."
2. **Keep it lean:** One dev, one product, one focus.
3. **Trust is everything:** Secure keys, uptime, clear disclaimers.

## 30-Day Tactical Plan

| Week | Focus | Core Deliverable |
| :--- | :--- | :--- |
| **1** | **Identity** | Clerk auth integration. Store Alpaca keys encrypted in DB. |
| **2** | **Billing** | Stripe Checkout integration. Entitlement check middleware. |
| **3** | **Proxy** | Backend refactor: fetch keys by UserID. Audit logs. |
| **4** | **Launch** | Landing page + 60s demo video. Open beta to waitlist. |

## SaaS Requirements
- **Auth:** Clerk (keep users out of server code).
- **Security:** Encrypted key storage (Never plaintext in logs/DB).
- **Billing:** Stripe (Checkout + Webhooks for tiers).
- **Data:** Audit logs for every trade (essential for trust).
- **Disclaimer:** "Tool for faster execution," not "advice" or "custodial."

## Acquisition
- Reddit (r/Daytrading, r/AlpacaTrading): Share a 60s demo of a *real trade*.
- YouTube/TikTok: Short, high-intensity clips of the interface in action.
- Changelog: Public, updated weekly to signal "we are alive."

## The "Exit" Metric
If after 60 days, growth is flat and churn > 15%, list on Acquire.com as "code + user base."
If > $500 MRR and growing, build to $5k MRR.
