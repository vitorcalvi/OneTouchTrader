# Lean-FireupTrader — SaaS Plan

Reframe: stop thinking "flip the code." Start thinking "operate a paid product." A code sale caps at $3k–$15k today. A live SaaS doing $500 MRR is worth $15–25k; $5k MRR is worth $100–200k. The same code, very different number — the multiple comes from recurring revenue + churn data, not the codebase.

## What you're selling

Not a "trading bot," not "an Alpaca UI clone." Position it as:

> **A faster mobile cockpit for active Alpaca traders.**
> One-tap brackets, ladder entries, layered trailing stops (L&F), and a phone-first UX. For traders who already know what they want to do and need to do it in 2 seconds, not 8 clicks.

The differentiator is execution speed + L&F/ladder logic, not "yet another dashboard."

## Pricing

Three tiers, no free plan (free plans inflate churn signals and attract the wrong audience):

| Tier        | Price       | For                                    | Limits                          |
|-------------|-------------|----------------------------------------|---------------------------------|
| Starter     | $19/mo      | Casual active traders                  | 1 broker, paper + live, 1 device |
| Pro         | $39/mo      | Day traders                            | + L&F layered stops, ladder, multi-symbol watchlist, alerts |
| Cockpit     | $79/mo      | Heavy users                            | + multi-account, priority support, early features |

7-day trial, card required (filters tire-kickers). Annual = 2 months free.

**Why these numbers:** Alpaca's audience is retail-active. Below $19 attracts noise; above $99 needs an enterprise story you don't have yet. $39 is the sweet spot where one good trade pays for the year.

## Required SaaS plumbing (gaps in current build)

The repo is a single-tenant trading UI. To be a SaaS it needs:

1. **Auth + multi-tenant** — users store their own Alpaca keys, encrypted at rest. **Never** see plaintext keys server-side after submission (envelope encryption, per-user KMS key).
2. **Billing** — Stripe Checkout + Customer Portal. Webhook-driven entitlements.
3. **Hosting** — Vercel/Fly for frontend, a small Node service for the key broker proxy. Cloudflare in front.
4. **Status + uptime** — public status page. Trading apps that go down during market hours lose customers in one tweet.
5. **Audit log** — every order shown to the user with timestamp + outcome. Critical for trust and dispute resolution.
6. **Compliance posture** — Terms that make clear you are *not* a broker, not giving advice, not custodying funds. Alpaca's keys stay user-scoped. Probably want an LLC + $1–2k/yr E&O insurance once you have paying users.

Roughly 3–4 weeks of work if you're focused. Don't gold-plate — ship at "embarrassing but works."

## Milestones and what each is worth

| Stage              | Target            | Time         | Acquisition value (3–5× ARR) |
|--------------------|-------------------|--------------|------------------------------|
| Paid beta          | 10 paying users   | 4–8 weeks    | ~$5–15k                      |
| Product-market fit | $500 MRR, <8% churn | 3–6 months | $15–25k                      |
| Niche leader       | $5k MRR          | 9–15 months  | $100–250k                    |
| Real business      | $25k MRR         | 18–30 months | $750k–$1.5M                  |

Stop at any rung — each is a viable exit on Acquire.com.

## Acquisition channels (in order)

1. **Reddit** — r/algotrading, r/Daytrading, r/AlpacaTrading. Post a 60-second demo *of a real trade*. Don't pitch — show. Comment in threads where people complain about Alpaca's UI.
2. **YouTube + TikTok shorts** — screen-record one execution sequence (open, bracket, scale out). 30 seconds. Pin a link. This compounds.
3. **Alpaca Slack/Discord** — be helpful first, mention the product when relevant. Don't spam.
4. **IndieHackers / X build-in-public** — slower but builds a follower base that converts later.
5. **SEO content** — "How to set a trailing stop on Alpaca," "Alpaca bracket order tutorial." Long tail, slow burn.
6. **Alpaca partner program** — apply once you have 50+ paying users. They occasionally promote ecosystem tools.

Cold outreach and ads are not worth it at this stage. Audience is too niche for paid acquisition to make sense before $2k MRR.

## Biggest value lifts (highest ROI first)

1. **First 10 paying users.** Going $0 → $500 MRR is the most expensive ratio you'll ever do; doing it proves churn is survivable and unlocks every later multiple.
2. **Demo video.** 60 seconds, real trade, real P/L. Goes on landing page, YouTube, Reddit. Half of all SaaS purchases happen after watching one.
3. **Second broker (IBKR or Tradier).** Single-broker tools have a small TAM. Adding one broker 3–5× the addressable market.
4. **Landing page with waitlist.** Even before launch — "Mobile cockpit for Alpaca, $39/mo, waitlist now." If you can't get 100 signups, the product won't sell either.
5. **Public changelog.** Cheap trust signal. Updated weekly = "this is alive."

## Hard truths

- "Trading UI for Alpaca" has been built by ~50 indie devs. Most are abandoned. The bar is execution quality + actually being online during market hours.
- Trading SaaS has higher churn than normal SaaS — users blow up accounts, switch brokers, or graduate to direct API. Plan for 8–12% monthly churn until you find the stickier segment (active swing traders > scalpers).
- Liability is real once you're a paid product. Don't market as "automated" or "set-and-forget" — that's where lawsuits start. Stick to "faster manual execution."
- You can't be both the builder and the support desk at $5k MRR. Budget for either Intercom + canned answers or a part-time support contractor by then.

## Recommended path

**Next 2 weekends:** landing page + waitlist + 60-second demo + Stripe sandbox wired up.
**Next month:** auth + per-user Alpaca keys + billing webhooks. Open paid beta to waitlist at half price ($19 Pro lifetime for first 25).
**Next 90 days:** push to 25 paying users, then publish the Reddit demo. Measure churn honestly.

If at month 4 you're below $500 MRR with no upward trend, list on Acquire.com as "code + small user base." If you're above $1k MRR with retention, keep building — the curve is doing the work.

## Sale channels (if/when you exit)

1. **Acquire.com** — primary marketplace for solo-founder SaaS. Optimized for $5k–$500k deals.
2. **Flippa** — broader, more retail buyers, more noise. Worth a parallel listing.
3. **IndieHackers + r/SaaS** — direct sale, no commission, slower.
4. **Direct buyer outreach** — TradingView / Composer / similar adjacent tools occasionally tuck-in acquire. Reach out only once revenue is real.

Asking price = 3.5–4.5× ARR with clean books, retention chart, and a transferable Stripe + AWS account. Bundle 30 hours of post-sale support to close the gap.
