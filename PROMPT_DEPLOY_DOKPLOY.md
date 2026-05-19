# PROMPT — Deploy Fireup Trader to Dokploy (Week 1 of SELL_IT.md)

**Target executor:** Poolside / Laguna-X2 (flash module, follows explicit plans, does not improvise).
**Goal:** Take the current repo and deploy it to the user's existing Dokploy instance, exposed publicly via Cloudflare Tunnel, with Postgres provisioned and nightly R2 backups. No code rewrite.
**Out of scope this prompt:** Clerk, Stripe, MCP server (those are Weeks 2-3 of `SELL_IT.md`).

---

## 0. Locked facts (do not re-decide)

| Item | Value |
|---|---|
| Dokploy URL (LAN) | `http://192.168.1.45:3000` |
| Dokploy version | `v0.29.4` |
| Server public IP | `95.17.150.124` |
| Dokploy user email | `vitorcalvi@dyagnosys.com` |
| Repo root | `/Users/vitorcalvi/Desktop/Lean-FireupTrader` |
| GitHub remote | assume `origin` exists; if not, abort and ask user |
| Frontend stack | Vite + React 19 + TS, builds to `dist/` |
| Backend file | `src/backend/alpaca/server-refactored.mjs` |
| Backend port | **5171** (hardcoded in `server-refactored.mjs:90`) |
| Backend deps | Node 22, raw http server, exposes `/api/*` + `/ws/alpaca` |
| Package manager | **yarn** (`yarn.lock` is the source of truth) |
| Public domains | `app.fireup.io` (frontend) and `api.fireup.io` (backend) |
| DNS | Cloudflare (user already controls the zone) |
| Public access | **Cloudflare Tunnel** (no port-forward; do NOT open ports on the home router) |
| Database | **Postgres 16** in Dokploy (one-click template) — schema only, no app code touches it yet |
| Backups | Cloudflare R2 (S3-compatible) — nightly dump via Dokploy backup feature |
| Uptime monitor | UptimeRobot free tier — hit `https://api.fireup.io/healthz` every 5 min |

If any locked fact above is wrong, STOP and report to the user. Do not guess.

---

## 1. Files to create (exact paths, exact contents)

### 1.1 `Dockerfile.backend` (repo root)

```dockerfile
# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json yarn.lock ./
RUN corepack enable && yarn install --frozen-lockfile --production=false

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json yarn.lock ./
COPY src ./src
EXPOSE 5171
# server-refactored.mjs reads .env via env-loader; Dokploy injects env vars at runtime
CMD ["node", "src/backend/alpaca/server-refactored.mjs"]
```

### 1.2 `Dockerfile.frontend` (repo root)

```dockerfile
# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json yarn.lock ./
RUN corepack enable && yarn install --frozen-lockfile
COPY . .
# VITE_* vars must be present AT BUILD TIME — pass via Dokploy build args
ARG VITE_TRADE_CARD_TOKEN
ARG VITE_API_BASE_URL
ENV VITE_TRADE_CARD_TOKEN=$VITE_TRADE_CARD_TOKEN
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN yarn build

FROM caddy:2-alpine AS runner
COPY --from=build /app/dist /usr/share/caddy
COPY Caddyfile /etc/caddy/Caddyfile
EXPOSE 80
```

### 1.3 `Caddyfile` (repo root)

```caddy
:80 {
  root * /usr/share/caddy
  encode gzip
  try_files {path} /index.html
  file_server

  @assets path /assets/*
  header @assets Cache-Control "public, max-age=31536000, immutable"

  header /index.html Cache-Control "no-store"
}
```

### 1.4 `.dockerignore` (repo root)

```
node_modules
dist
.git
.env
.env.*
*.log
JOURNAL_*.md
PROMPT_*.md
EXECUTION_REPORT.md
SELL_IT.md
README_DEEPLY.md
.claude
prompts
```

### 1.5 `src/backend/alpaca/routes/healthz.mjs` (new file)

```javascript
export function handleHealthz(req, res) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({
    status: "ok",
    uptimeSec: Math.floor(process.uptime()),
    ts: new Date().toISOString(),
  }));
}
```

### 1.6 Wire healthz into `server-refactored.mjs`

Find the route table (search for `handlePostTradeCard` import — add next to it).

**Add import** near other route handler imports:
```javascript
import { handleHealthz } from "./routes/healthz.mjs";
```

**Add route handler** before the 404 fallback (right after the trade-cards routes). The exact pattern used by sibling routes is the canonical one — copy that style verbatim. The route is `GET /healthz` (no `/api` prefix — UptimeRobot expects the bare path).

### 1.7 `.env.production.example` (repo root, committed — example only, NO real secrets)

```bash
# Backend (injected by Dokploy at runtime)
NODE_ENV=production
ALPACA_API_KEY=__SET_IN_DOKPLOY__
ALPACA_API_SECRET=__SET_IN_DOKPLOY__
VITE_ALPACA_IS_PAPER=true
TRADE_CARD_TOKEN=__SET_IN_DOKPLOY__
ALLOWED_ORIGINS=https://app.fireup.io

# Frontend (build-time, injected as Docker build args)
VITE_TRADE_CARD_TOKEN=__SAME_AS_BACKEND_TRADE_CARD_TOKEN__
VITE_API_BASE_URL=https://api.fireup.io
```

---

## 2. Cloudflare Tunnel setup (do this BEFORE Dokploy services)

### 2.1 Create the tunnel (one-time, on the Linux server via SSH)

```bash
# SSH into server
ssh root@95.17.150.124   # or whatever user the Dokploy host uses

# Install cloudflared
curl -fsSL https://pkg.cloudflare.com/install.sh | bash || (
  wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb &&
  dpkg -i cloudflared-linux-amd64.deb
)

# Login (opens a one-time auth URL — paste it into a browser on the user's Mac)
cloudflared tunnel login

# Create the tunnel
cloudflared tunnel create fireup-prod

# Note the tunnel UUID printed — save it as TUNNEL_UUID
```

### 2.2 Create `/etc/cloudflared/config.yml`

```yaml
tunnel: <TUNNEL_UUID>
credentials-file: /root/.cloudflared/<TUNNEL_UUID>.json

ingress:
  - hostname: app.fireup.io
    service: http://localhost:8080
  - hostname: api.fireup.io
    service: http://localhost:5171
  - service: http_status:404
```

> **Why 8080 for frontend:** Caddy in the frontend container listens on 80 inside the container; Dokploy will map it to a host port (we'll pick 8080 in §3.2). Backend stays on 5171 (its native port).

### 2.3 Route DNS via Cloudflare

```bash
cloudflared tunnel route dns fireup-prod app.fireup.io
cloudflared tunnel route dns fireup-prod api.fireup.io
```

### 2.4 Run as a systemd service

```bash
cloudflared service install
systemctl enable --now cloudflared
systemctl status cloudflared   # confirm active (running)
```

**STOP HERE and confirm with the user:** "Cloudflare tunnel installed, DNS routed, service running. Ready to deploy app to Dokploy?"

---

## 3. Dokploy deployment

> Use the Dokploy API (token from **Profile → API/CLI Keys → Generate New Key**) for everything below. If a step fails via API, fall back to the UI at `http://192.168.1.45:3000` and tell the user which step failed.

### 3.1 Create project

- Dashboard → **Projects** → **+ Create Project**
- Name: `fireup-trader`

### 3.2 Add three services inside the project

#### Service A: `fireup-backend` (Application)

- Source: **GitHub** (connect repo if not already connected: Dashboard → Git → GitHub)
- Repo: `<github-org>/Lean-FireupTrader` (ask user if unknown)
- Branch: `main`
- Build type: **Dockerfile**
- Dockerfile path: `Dockerfile.backend`
- Build context: `.`
- Port: `5171`
- Host port mapping: `5171:5171`
- Environment variables (paste all from `.env.production.example`, fill in real values — get from user):
  - `NODE_ENV=production`
  - `ALPACA_API_KEY=<ask user>`
  - `ALPACA_API_SECRET=<ask user>`
  - `VITE_ALPACA_IS_PAPER=true` (start paper, flip to false after smoke test passes)
  - `TRADE_CARD_TOKEN=<generate: openssl rand -hex 32>`
  - `ALLOWED_ORIGINS=https://app.fireup.io`
- Deploy

#### Service B: `fireup-frontend` (Application)

- Same repo + branch
- Build type: **Dockerfile**
- Dockerfile path: `Dockerfile.frontend`
- Build context: `.`
- Port: `80`
- Host port mapping: `8080:80`
- **Build args** (these are required at build-time, not runtime):
  - `VITE_TRADE_CARD_TOKEN=<same value as backend TRADE_CARD_TOKEN>`
  - `VITE_API_BASE_URL=https://api.fireup.io`
- Deploy

#### Service C: `fireup-postgres` (Database → Postgres template)

- Template: **Postgres 16**
- Name: `fireup-postgres`
- Database name: `fireup`
- User: `fireup`
- Password: generate (`openssl rand -hex 24`) — save it; user will need it in Week 2
- Internal port: `5432`
- Do **NOT** expose externally. Other services reach it via Dokploy's internal Docker network as `fireup-postgres:5432`.

> Schema bootstrap is deferred to Week 2 (when Clerk + trade-card persistence land). Just provision and leave empty for now.

### 3.3 Configure backups (Service C → Backups tab)

- Click **+ Add Backup**
- Destination: **S3 Destinations** → **Add S3 Destination**
  - Provider: **Cloudflare R2**
  - Endpoint: `https://<cloudflare-account-id>.r2.cloudflarestorage.com` (ask user for account ID)
  - Bucket: `fireup-postgres-backups` (create in Cloudflare R2 UI first; bucket creation is free)
  - Access Key + Secret: from R2 → Manage R2 API Tokens → Create API Token (read+write for that bucket only)
- Schedule: **Daily at 03:00 UTC** (US market is closed)
- Retention: 14 days
- Click **Test Backup** — verify a `.sql.gz` lands in R2 before proceeding.

---

## 4. Verification tests (run all; do not skip any)

Run from the user's Mac (`/Users/vitorcalvi/Desktop/Lean-FireupTrader`). Each test must pass before moving to the next.

### Test 1 — Backend health (public)

```bash
curl -fsS https://api.fireup.io/healthz | jq .
```

**Pass:** JSON with `"status":"ok"` and `uptimeSec` > 0.
**Fail diagnostics:**
- 502 → backend container not running. Check Dokploy → fireup-backend → Logs.
- DNS error → `cloudflared tunnel route dns` step skipped. Re-run §2.3.
- Connection refused → Caddyfile/tunnel ingress mismatch. Verify §2.2.

### Test 2 — Frontend loads (public)

```bash
curl -fsSI https://app.fireup.io/ | head -5
```

**Pass:** `HTTP/2 200` with `content-type: text/html`.
**Fail:** If 404 from Caddy, the SPA fallback isn't working — re-check §1.3.

### Test 3 — CORS allows frontend → backend

Open `https://app.fireup.io` in a browser. Open DevTools → Network. Confirm no CORS errors on `/api/*` calls. If errors appear, check that backend `ALLOWED_ORIGINS` env var includes exactly `https://app.fireup.io` (no trailing slash).

### Test 4 — Trade card end-to-end (the same paper test that worked locally)

```bash
TOKEN=<TRADE_CARD_TOKEN from Service A env>
curl -fsS -X POST https://api.fireup.io/api/trade-cards \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d @- <<'EOF' | jq .
{
  "symbol": "INTC",
  "direction": "LONG",
  "entryType": "LIMIT",
  "entryPrice": 100.00,
  "stopLoss": 99.50,
  "takeProfit1": 101.50,
  "takeProfit2": 102.00,
  "shares": 10,
  "notional": 1000,
  "regime": "TREND",
  "rationale": "deploy smoke test — do not fire if market open"
}
EOF
```

**Pass:** 201 Created with a card object containing `id` and `status: "PENDING"`.
Then cancel it immediately (do NOT fire — this is paper but still consumes Alpaca rate limit):

```bash
CARD_ID=<id from previous response>
curl -fsS -X POST "https://api.fireup.io/api/trade-cards/$CARD_ID/cancel" | jq .
```

**Pass:** Card status flips to `CANCELED`.

### Test 5 — Postgres reachable from backend container

```bash
# SSH into the Dokploy host
ssh root@95.17.150.124
docker exec -i $(docker ps -qf name=fireup-backend) sh -c \
  "apk add --no-cache postgresql-client >/dev/null && \
   PGPASSWORD=<pg password> psql -h fireup-postgres -U fireup -d fireup -c 'SELECT 1;'"
```

**Pass:** Returns a row with `1`. (Schema is empty; that's expected.)

### Test 6 — Backup smoke test

In Dokploy → Service C (postgres) → Backups → click **Run Now**. Check R2 bucket within 2 minutes — there should be one new `.sql.gz` object.

### Test 7 — UptimeRobot

- Sign in to UptimeRobot (free tier).
- Add monitor: HTTP(s), URL `https://api.fireup.io/healthz`, interval 5 min.
- Add SMS or email alert contact.
- Trigger a test: stop the backend service in Dokploy briefly, confirm alert fires, then restart.

---

## 5. Post-deploy checklist (user-facing — print at end)

```
✅ DEPLOYED — Fireup Trader on Dokploy
  Frontend:  https://app.fireup.io
  Backend:   https://api.fireup.io
  Health:    https://api.fireup.io/healthz
  Dokploy:   http://192.168.1.45:3000 (LAN only)
  Postgres:  fireup-postgres:5432 (internal only, password saved in Dokploy env)
  Backups:   R2 bucket "fireup-postgres-backups", daily 03:00 UTC, 14d retention
  Monitor:   UptimeRobot → SMS/email on /healthz failure

⚠️  STILL TODO (manual, before commercial launch):
  - Buy UPS battery for home server ($80 — Amazon "APC Back-UPS 600VA")
  - Buy 4G failover router ($50 — optional, +0.5% uptime)
  - Read Cloudflare Tunnel AUP for commercial brokerage use; budget $20/mo Cloudflare Pro if needed
  - ToS + Privacy Policy pages (boilerplate ok for v1; lawyer review before paid launch)

🔜 WEEK 2 (next prompt):
  - Clerk auth (drop-in <SignIn />)
  - Stripe checkout (14-day trial, card upfront)
  - Migrate trade-card store from in-memory Map → Postgres
  - Per-user API tokens for MCP (Week 3)
```

---

## 6. Rules for Laguna (read before starting)

1. **Do not improvise file contents.** Copy-paste the blocks in §1 verbatim. The only fields to fill are `<TUNNEL_UUID>`, `<github-org>`, `<ask user>`, `<generate ...>`.
2. **One section at a time, in order.** Section 0 → 1 → 2 → 3 → 4. Do not jump ahead.
3. **STOP and ask the user** when you see "ask user" or "STOP HERE". Do not invent values.
4. **Tests are mandatory.** If Test N fails, do not proceed to Test N+1 — diagnose using the "Fail diagnostics" notes and report back.
5. **Never commit secrets.** `.env.production.example` has placeholders only. Real values live in Dokploy env-vars UI, not in git.
6. **Never open inbound ports on the home router.** Public access is Cloudflare Tunnel only.
7. **If you can't complete a step via the Dokploy API, fall back to the UI** and tell the user exactly which step needs a manual click.
8. **Report format at the end:** Same shape as `EXECUTION_REPORT.md` (files created, tests passed/failed, known issues, next steps).

---

— Plan v1, 2026-05-19
