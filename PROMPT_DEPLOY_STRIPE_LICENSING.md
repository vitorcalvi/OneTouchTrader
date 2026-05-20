# PROMPT — Stripe Checkout + JWT License System

**For:** Laguna
**Date issued:** 2026-05-20
**Replaces:** SELL_IT.md §Week 2 (Clerk auth). We deliberately skip Clerk and any user DB — Stripe is the source of truth.

---

## Architecture (do not redesign)

```
Buy flow
  trader.dyagnosys.com → POST /checkout → Stripe Checkout (collects email) → success_url
  /license?session_id=... → GET /issue-license → JWT (24h, sub=stripe_customer_id, tier)
  Display JWT + auto-copy + deeplink: app-trader.dyagnosys.com/#license=<jwt>

Use flow
  app-trader reads #license=<jwt> OR localStorage('license')
  Verify signature + exp client-side
  Send Authorization: Bearer <jwt> on every API call
  Backend middleware verifies signature + exp + (optionally) Stripe status

Refresh
  12h before exp: POST /refresh-license with old JWT
  Backend: extract sub (customer_id), query Stripe subscription
  Active or trialing → issue new 24h JWT
  Cancelled / past_due → 401, app shows paste-license modal

Recover
  /recover → POST /recover-license { email }
  Backend: stripe.customers.search({ email })
  If active subscription → email new JWT via Resend
  No active subscription → 404 (don't disclose whether email exists, for privacy)

Webhook (optional v1, recommended)
  POST /stripe-webhook
  invoice.payment_failed, customer.subscription.deleted → no DB action needed
  (refresh-on-near-expiry handles invalidation within 24h naturally)
  Include only for analytics + future use
```

**Zero database tables.** Stripe is the source of truth. Postgres service can be deleted from Dokploy.

---

## Hard rules

1. **Test mode only in v1.** Use the test keys below. Live mode is a separate switch after manual end-to-end QA.
2. **JWT secret must be ≥32 random bytes.** Generate with `openssl rand -hex 32`. Do not commit. Store in Dokploy backend env as `JWT_SECRET`.
3. **No email storage.** Email is only used as the lookup key inside Stripe — we never persist it ourselves.
4. **No "remember me" / long-lived JWTs.** Max 24h exp. Refresh re-validates against Stripe every time.
5. **No client-side Stripe SDK calls** that take money. All payment intents originate from the backend `/checkout` endpoint. Frontend just redirects to the URL Stripe returns.
6. Rule 9b applies. No `docker run` fallback.
7. API-driven Dokploy ops. See framework lessons 11–17.

---

## Pre-decided defaults (do not ask)

| Decision | Value |
|---|---|
| Stripe mode | test (use keys below) |
| Tiers to launch | Pro ($29/mo) + Pro+AI ($79/mo). Hosted AI = "Coming soon" placeholder, not buyable yet. |
| Trial period | 14 days, card required (Stripe `subscription_data.trial_period_days = 14`) |
| Currency | USD |
| JWT algorithm | HS256 |
| JWT exp | 86400 seconds (24h) |
| JWT refresh window | refresh when < 12h remaining |
| JWT claims | `{ sub: stripe_customer_id, tier: "pro" \| "pro_ai", status: "active" \| "trialing", iat, exp, jti }` |
| `tier` mapping | Pro price → `pro`. Pro+AI price → `pro_ai`. |
| License delivery | display on /license page + auto-copy + email via Resend as backup |
| Recovery rate limit | 5 requests per email per hour (in-memory map is fine for v1) |
| App-side license input | modal that accepts paste, validates client-side, stores in localStorage |
| Backend library | `stripe`, `jose`, `resend` (Node 22, ESM) |
| Frontend library | none — vanilla fetch + redirect |

---

## Credentials (provided by user)

**Obtain from user's existing Stripe Dashboard or previous deployment:**

```env
STRIPE_PUBLISH_TEST_API=pk_test_...
STRIPE_SECRET_TEST_API=sk_test_...
STRIPE_TEST_WEBHOOK=whsec_...
RESEND_API_KEY=re_...
```

Generate fresh:
```env
JWT_SECRET=<openssl rand -hex 32>
```

These go into Dokploy backend env via `application.saveEnvironment` (see framework lesson 11b — all 4 fields required: env, buildArgs, buildSecrets, createEnvFile). Preserve existing env vars (NODE_ENV, VITE_TRADE_CARD_TOKEN, DATABASE_URL — yes leave it even though unused, ALLOWED_ORIGINS, VITE_ALPACA_IS_PAPER).

---

## Step 1 — Stripe product setup (one-time, via Stripe API)

Run this once (locally or in a Dokploy job, doesn't matter):

```js
import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_TEST_API);

const products = [
  {
    name: 'Fireup Trader — Pro',
    description: 'One-tap trading webapp. Live Alpaca brokerage.',
    price_cents: 2900,
    tier: 'pro',
  },
  {
    name: 'Fireup Trader — Pro + AI',
    description: 'Pro + MCP server license for Claude Desktop integration.',
    price_cents: 7900,
    tier: 'pro_ai',
  },
];

for (const p of products) {
  const product = await stripe.products.create({
    name: p.name,
    description: p.description,
    metadata: { tier: p.tier },
  });
  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: p.price_cents,
    currency: 'usd',
    recurring: { interval: 'month' },
    metadata: { tier: p.tier },
  });
  console.log(`${p.tier}: product=${product.id} price=${price.id}`);
}
```

**Record the two price IDs** into env vars on the backend:
```env
STRIPE_PRICE_PRO=price_xxx
STRIPE_PRICE_PRO_AI=price_xxx
```

Do NOT create the price IDs in code repeatedly — that creates duplicate Stripe products on every deploy.

---

## Step 2 — Backend endpoints

Add to existing backend repo (`OneTouchTrader`, served at `api-trader.dyagnosys.com`). Create `src/routes/licensing.mjs`:

### Dependencies
```bash
npm install stripe jose resend
```

### Skeleton

```js
import Stripe from 'stripe';
import { SignJWT, jwtVerify } from 'jose';
import { Resend } from 'resend';
import { randomUUID } from 'crypto';

const stripe = new Stripe(process.env.STRIPE_SECRET_TEST_API);
const resend = new Resend(process.env.RESEND_API_KEY);
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

const TIER_BY_PRICE = {
  [process.env.STRIPE_PRICE_PRO]: 'pro',
  [process.env.STRIPE_PRICE_PRO_AI]: 'pro_ai',
};

const APP_URL = 'https://app-trader.dyagnosys.com';
const LP_URL  = 'https://trader.dyagnosys.com';
const TRIAL_DAYS = 14;
const JWT_TTL_SEC = 60 * 60 * 24; // 24h

async function issueJwt({ customer_id, tier, status }) {
  return await new SignJWT({ tier, status })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(customer_id)
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${JWT_TTL_SEC}s`)
    .sign(JWT_SECRET);
}

// POST /checkout  { tier: "pro" | "pro_ai" } → { url }
export async function postCheckout(req, res) {
  const { tier } = req.body;
  const priceId = tier === 'pro_ai' ? process.env.STRIPE_PRICE_PRO_AI : process.env.STRIPE_PRICE_PRO;
  if (!priceId) return res.status(400).json({ error: 'invalid_tier' });

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: { trial_period_days: TRIAL_DAYS, metadata: { tier } },
    success_url: `${LP_URL}/license?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:  `${LP_URL}/?canceled=1`,
    allow_promotion_codes: true,
  });
  res.json({ url: session.url });
}

// GET /issue-license?session_id=...  → { jwt }
export async function getIssueLicense(req, res) {
  const { session_id } = req.query;
  if (!session_id) return res.status(400).json({ error: 'missing_session_id' });

  const session = await stripe.checkout.sessions.retrieve(session_id, {
    expand: ['subscription', 'customer'],
  });
  if (!session.subscription) return res.status(402).json({ error: 'payment_incomplete' });

  const sub = session.subscription;
  if (!['active', 'trialing'].includes(sub.status)) {
    return res.status(402).json({ error: 'subscription_inactive', status: sub.status });
  }

  const priceId = sub.items.data[0].price.id;
  const tier = TIER_BY_PRICE[priceId] || 'pro';
  const jwt = await issueJwt({ customer_id: sub.customer, tier, status: sub.status });

  // best-effort email backup
  if (session.customer_details?.email) {
    await resend.emails.send({
      from: 'Fireup Trader <noreply@trader.dyagnosys.com>',
      to: session.customer_details.email,
      subject: 'Your Fireup Trader license',
      text: `Your license token (paste into app):\n\n${jwt}\n\nThis token expires in 24h; the app will auto-refresh while your subscription is active. Open: ${APP_URL}/#license=${jwt}`,
    }).catch(() => {}); // don't fail issuance if Resend down
  }

  res.json({ jwt });
}

// POST /refresh-license  Authorization: Bearer <old jwt> → { jwt }
export async function postRefreshLicense(req, res) {
  const old = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!old) return res.status(401).json({ error: 'missing_token' });
  let payload;
  try {
    ({ payload } = await jwtVerify(old, JWT_SECRET, { clockTolerance: 60 }));
  } catch {
    return res.status(401).json({ error: 'invalid_token' });
  }

  const customerId = payload.sub;
  const subs = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 5 });
  const active = subs.data.find(s => ['active', 'trialing'].includes(s.status));
  if (!active) return res.status(402).json({ error: 'no_active_subscription' });

  const priceId = active.items.data[0].price.id;
  const tier = TIER_BY_PRICE[priceId] || 'pro';
  const jwt = await issueJwt({ customer_id: customerId, tier, status: active.status });
  res.json({ jwt });
}

// POST /recover-license  { email } → { ok: true }   (always, to avoid email enumeration)
const recoverRate = new Map(); // email -> [timestamps]
export async function postRecoverLicense(req, res) {
  const { email } = req.body;
  if (!email || typeof email !== 'string') return res.status(400).json({ error: 'invalid_email' });

  // rate limit: 5/hour/email
  const now = Date.now();
  const hits = (recoverRate.get(email) || []).filter(t => now - t < 3600_000);
  if (hits.length >= 5) return res.status(429).json({ error: 'rate_limited' });
  recoverRate.set(email, [...hits, now]);

  // always respond ok, do the work async
  res.json({ ok: true });

  try {
    const search = await stripe.customers.search({ query: `email:'${email.replace(/'/g, "")}'` });
    for (const cust of search.data) {
      const subs = await stripe.subscriptions.list({ customer: cust.id, status: 'all', limit: 5 });
      const active = subs.data.find(s => ['active', 'trialing'].includes(s.status));
      if (!active) continue;
      const priceId = active.items.data[0].price.id;
      const tier = TIER_BY_PRICE[priceId] || 'pro';
      const jwt = await issueJwt({ customer_id: cust.id, tier, status: active.status });
      await resend.emails.send({
        from: 'Fireup Trader <noreply@trader.dyagnosys.com>',
        to: email,
        subject: 'Your Fireup Trader license (recovery)',
        text: `Here's a fresh license token:\n\n${jwt}\n\nOpen: ${APP_URL}/#license=${jwt}`,
      });
    }
  } catch (e) {
    console.error('recovery failed', e);
  }
}

// POST /stripe-webhook  (raw body required for signature verification)
export async function postStripeWebhook(req, res) {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.rawBody, sig, process.env.STRIPE_TEST_WEBHOOK);
  } catch {
    return res.status(400).end();
  }
  // v1: just log. Refresh-on-near-expiry handles state.
  console.log('[stripe webhook]', event.type, event.data.object.id);
  res.json({ received: true });
}

// Middleware for trade endpoints
export async function requireLicense(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'missing_token' });
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    req.license = payload; // { sub, tier, status, iat, exp, jti }
    next();
  } catch {
    res.status(401).json({ error: 'invalid_token' });
  }
}
```

### Wire into server-refactored.mjs

```js
import express from 'express';
// ...existing imports...
import {
  postCheckout, getIssueLicense, postRefreshLicense, postRecoverLicense,
  postStripeWebhook, requireLicense
} from './routes/licensing.mjs';

// Webhook MUST be before express.json() because it needs raw body
app.post('/stripe-webhook', express.raw({ type: 'application/json' }), (req, res, next) => {
  req.rawBody = req.body; postStripeWebhook(req, res).catch(next);
});

app.use(express.json());

app.post('/checkout', postCheckout);
app.get('/issue-license', getIssueLicense);
app.post('/refresh-license', postRefreshLicense);
app.post('/recover-license', postRecoverLicense);

// Existing trade endpoints — gate behind license:
app.post('/cards', requireLicense, /* existing handler */);
app.get('/healthz', /* unchanged, no auth */);
```

---

## Step 3 — Landing page changes (`trader.dyagnosys.com`)

In the `dyagnosys-trader-lp` repo:

1. **Pricing CTAs**: each tier button POSTs to `https://api-trader.dyagnosys.com/checkout` with `{ tier: "pro" }` or `{ tier: "pro_ai" }`, then `window.location = response.url`. Hosted AI tier shows "Coming soon" + disabled button.

2. **New page `/license`** (`src/pages/license.astro`):
   - Reads `session_id` from URL query
   - Calls `GET /issue-license?session_id=...`
   - Displays JWT in a `<pre>` with a Copy button
   - Shows a big "Open App" button → `https://app-trader.dyagnosys.com/#license=<jwt>`
   - Footer note: "We also emailed it to you as backup"
   - On error (no session_id, payment_incomplete): show friendly message + "Back to pricing"

3. **New page `/recover`** (`src/pages/recover.astro`):
   - Email input + Submit
   - POSTs to `/recover-license`
   - Always shows: "If a subscription exists for this email, you'll receive a license shortly. Check spam."

4. **Footer link**: "Lost your license? → /recover"

---

## Step 4 — App changes (`app-trader.dyagnosys.com`)

In the existing React app (the FireupTrader frontend at `KKSW0HrBYJx9OEnyBT4bz`):

1. **License module** (`src/license.js` or `.ts`):
   ```js
   const KEY = 'fireup_license';
   export function getLicense() { return localStorage.getItem(KEY); }
   export function setLicense(jwt) { localStorage.setItem(KEY, jwt); }
   export function clearLicense() { localStorage.removeItem(KEY); }

   export function decodeUnsafe(jwt) {
     try { return JSON.parse(atob(jwt.split('.')[1])); } catch { return null; }
   }

   export function isExpiringSoon(jwt) {
     const p = decodeUnsafe(jwt);
     if (!p?.exp) return true;
     return (p.exp * 1000 - Date.now()) < 12 * 3600 * 1000;
   }

   export async function refresh() {
     const r = await fetch('https://api-trader.dyagnosys.com/refresh-license', {
       method: 'POST',
       headers: { Authorization: `Bearer ${getLicense()}` },
     });
     if (!r.ok) { clearLicense(); return null; }
     const { jwt } = await r.json();
     setLicense(jwt); return jwt;
   }
   ```

2. **App entry**: on mount,
   - Check URL hash `#license=...` → extract, save to localStorage, strip from URL.
   - If no license → show paste-license modal.
   - If license present and `isExpiringSoon` → fire `refresh()` in background.
   - Wrap all API calls with `Authorization: Bearer ${getLicense()}`.
   - On any 401: `clearLicense()` and show paste modal.

3. **Tier-gated UI**: read tier from `decodeUnsafe(jwt).tier`. If `tier === 'pro'`, hide MCP / AI Inbox UI. If `tier === 'pro_ai'`, show it.

4. **Paste-license modal**: textarea + Save button. Validates client-side: parses, checks `exp > now`, then saves and reloads.

---

## Step 5 — Stripe webhook configuration

In Stripe Dashboard (test mode):
- Developers → Webhooks → Add endpoint
- URL: `https://api-trader.dyagnosys.com/stripe-webhook`
- Events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
- Signing secret: should match `STRIPE_TEST_WEBHOOK` (`whsec_656ac8dd...`). If Stripe generates a new one, update env.

---

## Step 6 — Deploy

1. Add backend env vars via `application.saveEnvironment` (preserve existing 5 vars + add: `STRIPE_SECRET_TEST_API`, `STRIPE_PUBLISH_TEST_API`, `STRIPE_TEST_WEBHOOK`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_PRO_AI`, `RESEND_API_KEY`, `JWT_SECRET`, `APP_URL`, `LP_URL`).
2. `application.deploy` for backend (`buvl-yIURNK0jWIGSGj03`).
3. Commit + push `dyagnosys-trader-lp` changes → auto-deploys via Dokploy webhook OR `application.deploy` for `t266R-pA5Ez_Ij4MUuTbs`.
4. Commit + push frontend app changes → `application.deploy` for `KKSW0HrBYJx9OEnyBT4bz`.

---

## Step 7 — End-to-end test (Stripe test cards)

Use card `4242 4242 4242 4242` exp `12/34` cvc `123`.

```bash
# 1. LP checkout works
curl -X POST https://api-trader.dyagnosys.com/checkout -H "Content-Type: application/json" -d '{"tier":"pro"}'
# Expect: { "url": "https://checkout.stripe.com/c/pay/cs_test_..." }

# 2. Manual browser: open the URL, pay with test card, land on /license
# Verify JWT shown + email arrives (check Resend dashboard or your inbox)

# 3. Open https://app-trader.dyagnosys.com/#license=<jwt>
# Verify app loads, trade card UI works, calls to api include Authorization header

# 4. Verify refresh
TOKEN=<the jwt>
curl -X POST https://api-trader.dyagnosys.com/refresh-license -H "Authorization: Bearer $TOKEN"
# Expect: { "jwt": "<new jwt>" } with new exp 24h ahead

# 5. Recovery
curl -X POST https://api-trader.dyagnosys.com/recover-license -H "Content-Type: application/json" -d '{"email":"YOUR_TEST_EMAIL"}'
# Expect: { "ok": true }, email arrives within 30s

# 6. Tampered token → 401
BAD=$(echo "$TOKEN" | sed 's/./X/1')
curl -X POST https://api-trader.dyagnosys.com/refresh-license -H "Authorization: Bearer $BAD"
# Expect: 401 { "error": "invalid_token" }

# 7. Cancel subscription in Stripe Dashboard → wait → POST /refresh-license → 402 no_active_subscription

# 8. Webhook signature check
stripe listen --forward-to https://api-trader.dyagnosys.com/stripe-webhook
# trigger a test event → backend logs `[stripe webhook] ...`
```

All 8 must pass before declaring done.

---

## Documentation to update

1. **`SELL_IT.md`** — add a "v1 deviation: licensing without Clerk/DB" callout in the Tier 1 / Tier 2 sections referencing this doc.
2. **`DEPLOY_IDS.md`** — add Stripe price IDs once generated.
3. **`DEPLOY_TOPOLOGY.md`** — add Stripe + Resend as external dependencies in the diagram.
4. **`EXECUTION_REPORT_DEPLOY_V2.md`** — add §7 "Stripe licensing live (test mode)" with all 8 test outputs.
5. **`PROMPT_DEPLOY_DOKPLOY_FRAMEWORK.md`** — add lesson if you discover something new. Don't pad.

---

## What NOT to do

- Don't add Clerk, Auth0, Supabase, or any auth provider.
- Don't add a `users` table or any DB table. Postgres stays unused.
- Don't extend JWT lifetime past 24h "for convenience."
- Don't store the JWT secret in code, frontend bundle, or git.
- Don't put `STRIPE_SECRET_TEST_API` or `RESEND_API_KEY` in frontend env (`VITE_*`) — backend only.
- Don't store user email in your own systems. It's already in Stripe.
- Don't switch to live mode until end-to-end test passes in test mode AND user explicitly says go.
- Don't ship "remember me", "stay logged in 30 days", or any session persistence other than the 24h JWT in localStorage.
- Don't add OAuth, SSO, magic links beyond the recover flow.

---

## Time estimate

- Backend endpoints + Stripe products: 3h
- LP /license + /recover + CTA wiring: 2h
- App license module + paste modal + tier gating: 3h
- E2E testing with Stripe test cards: 2h
- Docs: 1h

**~11h total.** Report back with: file diffs, the 8 test outputs, and any deviations from this spec with reasoning.
