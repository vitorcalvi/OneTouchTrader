# Fireup Trader — Go-to-Market Plan

**Positioning:** Paid broker UI with 14-day trial (acquisition) + paid AI co-pilot via MCP (monetization upsell).

**Model:** Trial → Paid. Not freemium. Trading SaaS rarely succeeds with freemium-forever (TradingView, Trendspider, Benzinga Pro are all trial-to-paid). Conversion math is better, support burden is lower, signal is cleaner.

---

## Product structure

### Trial — 14 days free (acquisition)
Full Tier 1 access. Card required upfront. Auto-converts to $29/mo unless canceled.

- Unlimited tickers
- Alpaca **paper account** during trial (live unlocks on payment)
- Manual bracket orders, position management
- Mobile-shape PWA (installable on iOS/Android)
- Trade log / history

Trial-to-paid conversion in fintech is typically **8-25%**. Card-upfront filters tire-kickers and gives clean signal on whether the product is good enough to convert.

### Tier 1 — Pro ($29/mo)
Full webapp, no AI.

- Everything in trial
- **Live Alpaca brokerage** support (BYO keys, client-side only — never hit our DB)
- Full trade log / journal export
- Auto-bracket presets (the `.env` features)
- Mobile + desktop PWA

### Tier 2 — Pro + AI ($79/mo) — THE UPSELL
Tier 1 + MCP server license.

- Trade Card Inbox enabled in webapp
- MCP server (`npm install -g @fireup/mcp`)
- User runs Claude Desktop with their own subscription
- Claude proposes trade cards, user fires with one tap
- Audit log of all AI-proposed cards (whether fired or not)

### Tier 3 — Hosted AI ($199/mo) — later
Tier 2 + we host Claude API calls.

- Zero-config (no Claude Desktop install)
- We pay Anthropic, charge user
- Higher margin, higher infra cost
- Build after Tier 2 has 50+ paying users

---

## Infrastructure stack (self-hosted v1)

For the first 10-30 paying users, run everything on the **existing Linux home server with Dokploy + Cloudflare Tunnel**. Migrate to a paid VPS only when growth demands it. Monthly cost: **~$0** until 30+ paying users.

| Layer | Tool | Why |
|---|---|---|
| App hosting | **Dokploy** (already running) | Deploys Docker containers from GitHub on push |
| Public access | **Cloudflare Tunnel** | No port-forward, no public IP, free TLS, DDoS protection |
| DNS + domain | **Cloudflare** (already there) | — |
| Frontend | Vite static build served by Caddy/Nginx container in Dokploy | One container, rebuild on commit |
| Backend | Existing Node `server-refactored.mjs` packaged as Dockerfile in Dokploy | Same code, no rewrite |
| Database | **Postgres in Dokploy** (one-click), nightly backups to Cloudflare R2 | Free, sufficient for v1 |
| Auth | **Clerk free tier** (up to 10K MAU) | Don't self-host auth in v1 — too risky |
| Billing | **Stripe** (no alternative) | Webhooks hit backend via Cloudflare Tunnel |
| Email | **Resend free tier** (3K/mo) | Receipts, trial expiry notices |
| Error monitoring | **Sentry self-hosted in Dokploy** or free Sentry tier | Critical — know when things break |
| Uptime monitoring | **UptimeRobot free** | 5-min ping → SMS alert |

### Risks of self-hosting from home (real, not theoretical)

1. **Power/ISP outages** — home goes down, app goes down. Mitigations: UPS battery ($80) + 4G failover router ($50) → reaches ~99.5% uptime. Without them: ~98-99%.
2. **Backups are mandatory** — nightly Postgres dump to Cloudflare R2 (free for v1 volume). Without this, one disk failure = business dead.
3. **SLA expectation gap** — paying users expect 99.9%, you'll deliver ~99%. **Disclose explicitly in ToS** ("best-effort uptime, no SLA in beta").
4. **Cloudflare AUP** — free tier may restrict commercial brokerage use. Read the AUP; budget $20/mo for Cloudflare Pro if needed before commercial launch.

### When to graduate off home server

Migrate backend to a Hetzner Cloud VPS ($5/mo) when **any** of:
- 30+ paying users
- Two unplanned outages in one month
- A user complains about trade-firing latency

Migration is ~2 hours: clone Dokploy stack to remote VPS, swap DNS in Cloudflare. Tunnel makes it trivial.

---

## 4-Week Shipping Plan

### Week 1 — Foundation (self-hosted)
- Build Tier 1 (trade card system) per `PROMPT_TIER1_ONECLICK.md` ✅ already done
- Write `Dockerfile` for frontend (Caddy serving Vite build)
- Write `Dockerfile` for backend (Node 22 + `server-refactored.mjs`)
- Deploy both to **Dokploy** from GitHub
- Expose both via **Cloudflare Tunnel** → `app.fireup.io` and `api.fireup.io`
- Provision **Postgres** in Dokploy, define schema for users + trade cards
- Configure nightly Postgres dump to **Cloudflare R2**
- Wire **UptimeRobot** ping → SMS alert
- Buy **UPS battery** for home server

### Week 2 — Multi-tenancy + Billing
- Integrate **Clerk** in frontend (`<SignIn />` drop-in)
- Migrate in-memory trade card store from `routes/trade-cards.mjs` → Postgres
- Alpaca keys stored **client-side in localStorage** — never hit our DB (lower compliance burden)
- Add **Stripe** checkout (14-day trial, card required, auto-convert to Tier 1)
- Stripe webhook handler in backend (subscription created / canceled / payment failed)
- Token-issuance UI in settings (for MCP auth — per-user API tokens scoped to that user's cards)
- Add ToS + Privacy Policy pages (boilerplate ok for v1, lawyer review before scaling)

### Week 3 — MCP server
- Build MCP server as separate npm package: `@fireup/mcp`
- Tools: `post_trade_card`, `get_positions`, `get_recent_cards`, `cancel_card`
- License token validation on every MCP request (token issued in Week 2)
- One-page docs for Claude Desktop install
- Mac/Windows one-click installer that edits `claude_desktop_config.json` (kills the biggest friction point)

### Week 4 — Soft launch
- Landing page: `fireup.io` (Astro static site in Dokploy, 1 day)
- Demo video: 90 sec showing Claude → card → fire
- Soft launch on Twitter, r/Daytrading, r/algotrading
- Goal: 10 paying users by end of week 4

---

## Strategic positioning

### MCP as Upsell (chosen)
- Webapp is the broker UI users keep open all day
- AI is the productivity boost they pay extra for
- Competes on **execution UX** primarily, **AI quality** secondarily

### Why this beats "MCP as moat"
- Webapp is the **daily habit** — that's the sticky surface
- AI quality is iterating fast across the industry; basing the moat on prompt quality = race to the bottom
- Upsell model lets trial users see AI demo in week 2 of trial — natural conversion path to Tier 2

---

## Why trial beats freemium for THIS product

1. **Support load:** free users in finance generate the most "why didn't my order fill?" tickets. Free tier = unbounded support burden for $0 revenue.

2. **Infra cost per user:** every paper order, every position refresh, every Alpaca rate-limit hit costs you. Free users consume the same resources as paying ones.

3. **Conversion math:**
   - Freemium fintech conversion: **1-3%** → need 10K free for 100 paid
   - Trial-to-paid conversion: **8-25%** → need 1K trials for ~150 paid
   - Trial requires 1/10 the top-of-funnel for same revenue, with 1/10 the support load

4. **Brand risk:** when a free user posts "this app made me lose money" on Twitter, it tars the brand for paid users. Card-upfront filters this out.

5. **Signal quality:** if trial conversion is weak, your product needs work. Freemium hides this signal because "free users haven't converted" can mean anything.

### When to add a free tier later
After 90 days of trial-only with strong conversion (>15%), consider a strict free *demo* tier:
- 1 ticker only
- Paper only
- 24h trade log retention
- No AI
- Walls at moment of value (live brokerage) and friction (second ticker)

This is "freemium-as-demo" — top-of-funnel only, not a product. Don't ship this in v1.

---

## Pricing math — $10K MRR in 6 months

| Tier | Users | Price | MRR |
|---|---|---|---|
| Tier 1 — Pro | 100 | $29 | $2,900 |
| Tier 2 — Pro + AI | 80 | $79 | $6,320 |
| Tier 3 — Hosted AI | 5 | $199 | $995 |
| **Total** | **185** | | **$10,215** |

### Funnel math
- Need ~30 new paying users/month over 6 months
- At 15% trial-to-paid: need **200 trials/month**
- Trials from organic (Twitter demos, Reddit, SEO): hard but doable for a solo dev with a working product
- From paid ads: $30-50 CAC = $6-10K total ad spend over 6 months

### Reality check
- First paying customer in **30 days**: realistic
- $1K MRR in **90 days**: realistic
- $10K MRR in **6 months**: requires one viral demo (Twitter video or one strong Reddit post) + steady weekly content

---

## Regulatory checklist (before launch, not after)

- [ ] LLC formed (Delaware or your state, ~$300)
- [ ] Terms of Service with explicit "not investment advice" language
- [ ] Privacy Policy (covers Alpaca keys handling)
- [ ] Cookie/analytics consent if using GA
- [ ] Disclaimer banner on every AI-generated card: "AI suggestion. You are responsible for all trades."
- [ ] Audit log of every fired order (legal protection if a user disputes)
- [ ] Stripe handles PCI, Clerk handles auth — don't roll your own

Skip none of these. Cost: ~$500-1500 in legal review for ToS. Cheap insurance against the first lawsuit.

---

## Build order (this is the path)

**Week 1:** Dockerize frontend + backend → Dokploy → Cloudflare Tunnel + Postgres + R2 backups + UPS + uptime alerts
**Week 2:** Clerk auth + Stripe (14-day trial, card upfront) + Postgres migration of trade cards
**Week 3:** MCP server (`@fireup/mcp`) + Claude Desktop one-click installer
**Week 4:** Landing page + 90-sec demo video + soft launch

**Milestones:**
- First paying customer: 30 days
- $1K MRR: 90 days
- $10K MRR: 6 months (requires viral content moment)

— Plan v2, 2026-05-19
