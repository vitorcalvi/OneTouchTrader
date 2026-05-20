# PROMPT — Build & Deploy `trader.dyagnosys.com` Landing Page

**For:** Laguna
**Date issued:** 2026-05-20
**Pre-reqs:** `SELL_IT.md` (product/pricing/positioning), `DEPLOY_TOPOLOGY.md` (infra), `PROMPT_DEPLOY_DOKPLOY_FRAMEWORK.md` lessons 11–15.

---

## Goal

Replace the 503 placeholder at `https://trader.dyagnosys.com` with a real sales landing page that converts visitors to a 14-day trial (Stripe checkout placeholder for now — actual Stripe wiring is a later phase).

When done:
- `https://trader.dyagnosys.com` serves a real LP, not a 503.
- `https://app-trader.dyagnosys.com` (existing) is unchanged.
- `https://api-trader.dyagnosys.com` (existing) is unchanged.

---

## Hard rules

1. **Read `SELL_IT.md` end-to-end before writing copy.** The positioning, tier names, pricing, and "Why trial beats freemium" arguments are NON-NEGOTIABLE — they're the result of strategic decisions. Don't invent new tiers, don't change prices, don't make up features. If you think something should change, ask first.
2. **No Stripe integration in this round.** The "Start free trial" CTA links to `/signup` which is a stub page that says "Coming soon — join the waitlist." Stripe wiring is Week 2 of the SELL_IT plan.
3. **No backend changes.** This is a static site. It MUST NOT call `api-trader.dyagnosys.com`.
4. **Rule 9b applies:** no `docker run` fallback. If something breaks, append to `DEPLOY_BLOCKERS.md` and stop.
5. **API-driven Dokploy.** Don't claim "API 404" — `application.create`, `application.update`, `application.saveEnvironment`, `application.deploy`, `domain.create` all work. See framework lessons 11–11d.

---

## Stack

Per `SELL_IT.md`: **Astro static site**, served by Caddy in a Dokploy container. New repo `dyagnosys-trader-lp` (or a subfolder in the existing FireupTrader repo if the user prefers monorepo — ASK first).

Why Astro: zero JS by default (fast LCP), MDX for content, simple build, small image. The whole site is one route now; Astro scales if you add `/blog`, `/docs`, `/pricing/compare` later.

If the user prefers Next.js static export, that's also fine — same Dockerfile pattern. Don't use Gatsby, Remix, or anything that requires SSR runtime. **Static only.**

---

## Page structure (single page, scroll-based)

| Section | Purpose | Source of truth |
|---|---|---|
| **Hero** | One sentence pitch + primary CTA | SELL_IT §Positioning |
| **The problem** | Two paragraphs: "Brokers have bad UX. AI tools don't connect to your broker." | SELL_IT (implicit — derive from Tier 2 rationale) |
| **Product demo** | 90s demo video placeholder (`<video>` tag with poster image, src TBD) OR animated GIF placeholder | SELL_IT Week 4 |
| **Tiers / pricing** | 3 cards: Pro $29, Pro+AI $79, Hosted AI $199 (Hosted AI marked "Coming soon") | SELL_IT §Product structure |
| **Why trial, not freemium** | One short paragraph — turns the "is there a free tier?" objection into a feature | SELL_IT §Why trial beats freemium |
| **FAQ** | 6–8 questions covering: brokerage support (Alpaca only in v1), data security (Alpaca keys client-side only), refunds, cancellation, AI requirement (Tier 2 needs own Claude subscription), regulatory ("not investment advice"), uptime ("best-effort, no SLA in beta" — per SELL_IT §Risks) | SELL_IT §Regulatory + §Risks |
| **Footer** | ToS link, Privacy link (both stub pages "Coming soon"), © Dyagnosys 2026, contact email | SELL_IT §Regulatory |

**Hero CTA copy:** "Start 14-day free trial" → `/signup` (stub).
**Secondary CTA:** "Watch 90s demo" → scrolls to demo section.

**No newsletter signup. No live chat widget. No popup. No cookie banner unless GA is added (it's not in v1).**

---

## Visual style (keep it disciplined)

- Dark theme, matches the existing AlpacaPro app (`https://app-trader.dyagnosys.com`) — same accent green (`#22c55e`-ish) for primary CTA. Check the live app for exact tokens.
- System font stack OR Inter via `@fontsource-variable/inter`. No Google Fonts CDN (privacy + speed).
- One image: a screenshot of the trade card UI in the hero or product demo section. Take it from `https://app-trader.dyagnosys.com` — open in browser, screenshot the card, save to `public/screenshots/trade-card.png`.
- No stock photos. No illustrations of generic "AI brain" or "rocket" or "abstract finance graphs."
- Lighthouse target: 95+ on all four scores. Static + Caddy makes this trivial.

---

## Build steps

### 1. Scaffold

```bash
# In a new directory OR /trader-lp subfolder of FireupTrader repo (ASK USER)
npm create astro@latest -- --template minimal --typescript strict --no-install --no-git
cd <project>
npm install
npm install @fontsource-variable/inter
```

Push to GitHub as `dyagnosys-trader-lp` (private). The existing Dokploy GitHub App (`Dokploy-FireupTrader`) needs to be granted access to the new repo via the GitHub App settings page — user will do this in the GitHub UI.

### 2. Write the page

`src/pages/index.astro` — the whole landing page (sections above).
`src/pages/signup.astro` — stub: "Waitlist — we'll email you when trial signups open. [email input]" (the email input goes nowhere for now; it's a placeholder so the CTA doesn't 404).
`src/pages/terms.astro` and `src/pages/privacy.astro` — placeholders.
`src/styles/global.css` — reset + tokens.
`src/layouts/Base.astro` — shared `<head>` (meta tags, OpenGraph, favicon).

**OpenGraph tags (critical for Twitter/Reddit shares):**
```html
<meta property="og:title" content="Fireup Trader — One-tap trading with AI">
<meta property="og:description" content="The broker UI traders keep open all day, plus AI that proposes trades you fire with one tap.">
<meta property="og:image" content="https://trader.dyagnosys.com/og.png">
<meta property="og:url" content="https://trader.dyagnosys.com">
<meta name="twitter:card" content="summary_large_image">
```
Generate `public/og.png` (1200×630) using the screenshot + tagline. You can hand-make it once in Figma/Pixelmator — no tooling needed.

### 3. Build artifact

Astro static build → `dist/`. Verify locally: `npm run build && npx serve dist`.

### 4. Dockerfile

`Dockerfile`:
```dockerfile
# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* yarn.lock* ./
RUN if [ -f package-lock.json ]; then npm ci; else corepack enable && yarn install --frozen-lockfile; fi
COPY . .
RUN npm run build

FROM caddy:2-alpine AS runner
COPY --from=build /app/dist /usr/share/caddy
COPY Caddyfile /etc/caddy/Caddyfile
EXPOSE 80
```

`Caddyfile`:
```
:80 {
    root * /usr/share/caddy
    encode gzip zstd
    try_files {path} {path}/ /index.html
    file_server
    header {
        Cache-Control "public, max-age=31536000, immutable"
        Strict-Transport-Security "max-age=31536000"
        X-Content-Type-Options "nosniff"
        Referrer-Policy "strict-origin-when-cross-origin"
    }
    # HTML must not be cached aggressively
    @html path *.html /
    header @html Cache-Control "no-cache"
}
```

Healthcheck not needed for static — Caddy is reliable. If you want one, add `respond /healthz "ok" 200` block above `file_server`.

### 5. Dokploy deploy (API only — no UI)

Use existing GitHub provider `zfZwNZBdCgOFJDVKsFegV`. Create the application:

```bash
KEY="BloSEYydevQesKwQvpKrhHvTcRUPmLTQvRHkoipsSrlKObcMUdOGCHvcGLwHYKZW"
PROJECT_ID="<read from DEPLOY_IDS.md — the existing fireuptrader project>"

# Create app (will default to nixpacks — fix immediately via update, per Lesson 11)
curl -sS -X POST -H "x-api-key: $KEY" -H "Content-Type: application/json" \
  http://192.168.1.45:3000/api/trpc/application.create \
  -d "{\"json\":{\"projectId\":\"$PROJECT_ID\",\"name\":\"trader-lp\",\"appName\":\"trader-lp\",\"description\":\"Landing page for trader.dyagnosys.com\"}}"
# Capture returned applicationId → LP_ID

# Set source = GitHub
curl -sS -X POST -H "x-api-key: $KEY" -H "Content-Type: application/json" \
  http://192.168.1.45:3000/api/trpc/application.saveGithubProvider \
  -d "{\"json\":{\"applicationId\":\"$LP_ID\",\"repository\":\"dyagnosys-trader-lp\",\"branch\":\"main\",\"owner\":\"vitorcalvi\",\"buildPath\":\"/\",\"githubId\":\"zfZwNZBdCgOFJDVKsFegV\"}}"

# Force buildType=dockerfile (this is the workaround for application.create ignoring buildType)
curl -sS -X POST -H "x-api-key: $KEY" -H "Content-Type: application/json" \
  http://192.168.1.45:3000/api/trpc/application.update \
  -d "{\"json\":{\"applicationId\":\"$LP_ID\",\"buildType\":\"dockerfile\",\"dockerfile\":\"Dockerfile\",\"dockerContextPath\":\".\"}}"

# Add Traefik domain so Traefik routes Host: trader.dyagnosys.com → this app:80
curl -sS -X POST -H "x-api-key: $KEY" -H "Content-Type: application/json" \
  http://192.168.1.45:3000/api/trpc/domain.create \
  -d "{\"json\":{\"applicationId\":\"$LP_ID\",\"host\":\"trader.dyagnosys.com\",\"path\":\"/\",\"port\":80,\"https\":false,\"certificateType\":\"none\",\"domainType\":\"application\"}}"

# Deploy
curl -sS -X POST -H "x-api-key: $KEY" -H "Content-Type: application/json" \
  http://192.168.1.45:3000/api/trpc/application.deploy \
  -d "{\"json\":{\"applicationId\":\"$LP_ID\"}}"

# Poll application.one until applicationStatus == "done"
```

### 6. Cloudflared ingress

Currently `trader.dyagnosys.com` returns 503. Replace with route to Traefik:

```yaml
# /etc/cloudflared/config.yml on 192.168.1.45
tunnel: d406ee9a-3acd-4987-bf14-65c5bed83b73
credentials-file: /root/.cloudflared/d406ee9a-3acd-4987-bf14-65c5bed83b73.json

ingress:
  - hostname: app-trader.dyagnosys.com
    service: http://localhost:80
  - hostname: api-trader.dyagnosys.com
    service: http://localhost:80
  - hostname: trader.dyagnosys.com
    service: http://localhost:80     # CHANGED — was http_status:503
  - service: http_status:404
```

Then: `sudo systemctl restart cloudflared && sudo systemctl is-active cloudflared`.

DNS for `trader.dyagnosys.com` already exists (CNAME → tunnel). **Do not modify any DNS record.**

---

## Smoke tests (all must pass)

```bash
# 1. Landing page returns 200 + has expected content
curl -fsS https://trader.dyagnosys.com/ | grep -iE "Fireup Trader|14-day|free trial" | head -5
# Expect: at least 2 matches

# 2. Pricing visible
curl -fsS https://trader.dyagnosys.com/ | grep -E '\$29|\$79|\$199'
# Expect: all three prices

# 3. Stub pages serve
for path in /signup /terms /privacy; do
  curl -sS -o /dev/null -w "$path -> %{http_code}\n" https://trader.dyagnosys.com$path
done
# Expect: 200 each

# 4. SSL valid (no handshake error)
echo | openssl s_client -servername trader.dyagnosys.com -connect trader.dyagnosys.com:443 2>&1 | grep "Verify return code"
# Expect: Verify return code: 0 (ok)

# 5. App and API still healthy (regression check)
curl -fsS https://app-trader.dyagnosys.com/ | grep -i "<title>AlpacaPro</title>"
curl -fsS https://api-trader.dyagnosys.com/healthz

# 6. Old hostnames still dead
dig app.dyagnosys.com @1.1.1.1 +short          # empty
dig fireup-api.dyagnosys.com @1.1.1.1 +short   # empty

# 7. Lighthouse (optional but recommended)
npx lighthouse https://trader.dyagnosys.com/ --only-categories=performance,accessibility,best-practices,seo --output=json --output-path=lh.json --chrome-flags="--headless"
# Target: each ≥ 95
```

---

## Documentation to update

1. **`EXECUTION_REPORT_DEPLOY_V2.md`** — add a §6 "Landing page deploy" section with:
   - LP applicationId, repo, deploy date
   - Smoke test outputs (paste raw curl results)
   - Lighthouse scores
2. **`DEPLOY_IDS.md`** — add `trader-lp` app + domainId.
3. **`DEPLOY_TOPOLOGY.md`** — add `trader-lp` container to the diagram, route `trader.dyagnosys.com` to it (no longer 503).
4. **`PROMPT_DEPLOY_DOKPLOY_FRAMEWORK.md`** — only add a new lesson if you discover something new during this deploy. Don't pad.
5. **`SELL_IT.md`** — DO NOT EDIT. That's the product spec, not your output.

---

## Pre-decided defaults (do not ask — execute)

User wants end-to-end execution. These defaults are locked; user will adjust copy/visuals later if needed.

1. **Repo:** create a **new private repo** `dyagnosys-trader-lp` under user `vitorcalvi`. Do not pollute the `OneTouchTrader` repo. Grant the existing `Dokploy-FireupTrader` GitHub App access to the new repo — note this as a one-time user action in the final report (the GitHub App permission grant is the only step that requires the user's GitHub UI).
2. **Contact email:** use `hello@dyagnosys.com` in the footer as a placeholder. Add an HTML comment next to it: `<!-- TODO: confirm email is live -->`.
3. **Wordmark:** ship with the text "Fireup Trader" in the accent green (`#22c55e` or whatever the existing app uses — check `app-trader.dyagnosys.com`) as the wordmark. No symbol, no logo file. SVG inline text only.
4. **Beta badge:** YES. Put a small "Beta" pill next to the wordmark in the header AND next to the primary CTA in the hero. SELL_IT §Risks mandates "best-effort uptime, no SLA in beta" — the badge sets that expectation visually.

Start coding immediately.

---

## What to deliver

- A git branch with the LP code + Dockerfile + Caddyfile, ready to merge.
- Dokploy `trader-lp` application deployed and `applicationStatus: done`.
- Cloudflared config updated and service restarted.
- All 7 smoke tests passing, output pasted into `EXECUTION_REPORT_DEPLOY_V2.md` §6.
- The 4 documentation files above updated.
- Final report: list of file changes + the URL the user should click to verify (`https://trader.dyagnosys.com`).

Total estimated time: **4–6 hours** for a careful first pass.
