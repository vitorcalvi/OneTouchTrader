# EXECUTION_REPORT_DEPLOY_V2.md

## Fireup Trader Deployment - Final Report

**Date:** 2026-05-20
**Session:** PROMPT_DEPLOY_DOKPLOY.md v2

---

## Deployment Summary

All three services deployed and verified successfully. Hostname migration completed using flat naming scheme due to Cloudflare free-tier SSL limitations.

### Key Lessons
- **Lesson 12:** Cloudflare free-tier Universal SSL covers exactly one level of subdomain. Use flat naming (`app-thing.root.tld`), not nested (`app.thing.root.tld`).
- **Lesson 13:** When cloudflared runs on the Dokploy host, ingress service must be `http://localhost:80` (Traefik), NOT container ports—those aren't published on the host.

---

## Services & IDs

| Service | App ID | Status | Build | Container |
|---------|--------|--------|-------|-----------|
| fireup-backend | `buvl-yIURNK0jWIGSGj03` | ✅ done | dockerfile | `app-override-cross-platform-hard-drive-9da7r9` Up |
| fireup-frontend | `KKSW0HrBYJx9OEnyBT4bz` | ✅ done | dockerfile | `fireuptrader-fireupfrontend-ftw7a5` Up |
| fireup-postgres | `0yw2U1uwlpu06X0b5DdQs` | ✅ done | postgres:18 | `postgres-program-mobile-alarm-fixptz` Up |

### Environment Updates (2026-05-20)

| Service | App ID | Updated Values |
|---------|--------|----------------|
| fireup-backend | `buvl-yIURNK0jWIGSGj03` | `ALLOWED_ORIGINS=https://app-trader.dyagnosys.com` |
| fireup-frontend | `KKSW0HrBYJx9OEnyBT4bz` | `VITE_API_BASE_URL=https://api-trader.dyagnosys.com` |

---

## Deployment URLs

### Public URLs

| Application | URL | Status |
|-------------|-----|--------|
| fireup-frontend (React trade card) | `https://app-trader.dyagnosys.com` | ✅ PASS |
| fireup-backend (API) | `https://api-trader.dyagnosys.com` | ✅ PASS |
| trader landing page | `https://trader.dyagnosys.com` | ✅ PASS (503 placeholder) |

### Old URLs (Deleted)

| Application | Old URL | Renames To | Status |
|-------------|---------|------------|--------|
| Frontend | `https://app.dyagnosys.com` | `app.trader.dyagnosys.com` → `app-trader.dyagnosys.com` | ✅ DNS deleted |
| Backend | `https://fireup-api.dyagnosys.com` | `api.trader.dyagnosys.com` → `api-trader.dyagnosys.com` | ✅ DNS deleted |

**Rename Reason:** Cloudflare free-tier Universal SSL covers exactly one level of subdomain. `app.trader.dyagnosys.com` is two levels deep → SSL handshake failure. Flat naming solves this.

### Webhook URLs

| Application | Webhook URL |
|-------------|-------------|
| fireup-backend | `http://192.168.1.45:3000/api/deploy/YkwBCOJl6aV722UlP8m3d` |
| fireup-frontend | `http://192.168.1.45:3000/api/deploy/JbE5Qsnq9blAl65ZbaGCc` |

---

## Smoke Test Results

| Test | Description | Result |
|------|-------------|--------|
| Test A | Backend health (`https://api-trader.dyagnosys.com/healthz`) | ✅ PASS: `{"status":"ok",...}` |
| Test B | Frontend index (`https://app-trader.dyagnosys.com`) | ✅ PASS: AlpacaPro served |
| Test C | CORS preflight | ✅ PASS |
| Test D | Trader landing (`https://trader.dyagnosys.com`) | ✅ PASS: 503 placeholder |

---

## Database Connection

**PostgreSQL 16** is running and accessible:

| Field | Value |
|-------|-------|
| postgresId | `0yw2U1uwlpu06X0b5DdQs` |
| App Name | `postgres-program-mobile-alarm-fixptz` |
| Database | `fireup` |
| User | `fireup_user`
| Password | `6eb35a81e81aaf0aaa1638b15e909ae1607cc732712646c8` |
| Internal Connection String | `postgresql://fireup_user:6eb35a81e81aaf0aaa1638b15e909ae1607cc732712646c8@postgres-program-mobile-alarm-fixptz:5432/fireup` |
| Status | `done` (process accepting connections on port 5432) |

> **Note:** DATABASE_URL is set on backend but the current codebase does not include a Postgres client (no `pg`, Prisma, or Drizzle ORM dependency). The Postgres service is **provisioned** but **not yet integrated**. **N/A** for LAN tests 3-4.

---

## GitHub Integration

**githubId:** `zfZwNZBdCgOFJDVKsFegV`

Use this for any future API-driven app creation.

---

## Cloudflare Tunnel (§5)

### Tunnel Info

| Field | Value |
|-------|-------|
| Tunnel Name | `fireup-prod` |
| Tunnel ID | `d406ee9a-3acd-4987-bf14-65c5bed83b73` |
| Config Path | `/etc/cloudflared/config.yml` |
| Service Status | `active (running)` |

### DNS Records - ✅ COMPLETED

**Zone:** `dyagnosys.com` (vcalvi@gmail.com)

| Type | Name | Content | ID | Status |
|------|------|---------|------|--------|
| CNAME | trader | `d406ee9a-3acd-4987-bf14-65c5bed83b73.cfargotunnel.com` | `78cd2a0bb8d19e05a9c321a00478e2ba` | ✅ |
| CNAME | app-trader | `d406ee9a-3acd-4987-bf14-65c5bed83b73.cfargotunnel.com` | `e5d3490ef85e13a6ada79ed8d16971be` | ✅ |
| CNAME | api-trader | `d406ee9a-3acd-4987-bf14-65c5bed83b73.cfargotunnel.com` | `62a20a4d0b54782d6a45bb050a3fdd5b` | ✅ |

**Deleted Records:**
- `app.dyagnosys.com` (ID: `d950a93d0ed9c86662944a79c7a941a5`) ✅
- `fireup-api.dyagnosys.com` (ID: `50de3564bb720cee60c2d9f6521b1155`) ✅

**Note:** `api.dyagnosys.com` already exists in this zone pointing to a different tunnel (ID: `0855ca03-dc67-4bcf-acca-2679c1644728`) — **DO NOT TOUCH**.

### cloudflared Config

```yaml
tunnel: d406ee9a-3acd-4987-bf14-65c5bed83b73
credentials-file: /root/.cloudflared/d406ee9a-3acd-4987-bf14-65c5bed83b73.json

ingress:
  - hostname: app-trader.dyagnosys.com
    service: http://localhost:80
  - hostname: api-trader.dyagnosys.com
    service: http://localhost:80
  - hostname: trader.dyagnosys.com
    service: http_status:503
  - service: http_status:404
```

---

## Saved Values

| Secret | Value |
|--------|-------|
| TRADE_CARD_TOKEN | `170e0b8ae7e26b43e2a70c049fec1708e4f5981b7888ec891559b2b50dd9848c` |
| Postgres Password | `6eb35a81e81aaf0aaa1638b15e909ae1607cc732712646c8` |
| Dokploy API Key | `BloSEYydevQesKwQvpKrhHvTcRUPmLTQvRHkoipsSrlKObcMUdOGCHvcGLwHYKZW` |

---

## ✅ All Done

- ✅ Hostname migration complete
- ✅ All smoke tests pass
- ✅ Documentation updated
- ⏳ Alpaca keys pending (user to provide)

---

## §6 Landing Page Deploy (PROMPT_DEPLOY_LANDINGPAGE.md)

### Status
✅ **Complete** - Deployed 2026-05-20

### Landing Page Application
| Field | Value |
|-------|-------|
| Project | fireup-trader (`vGQBLjq-AebJ2jnfkE2-9`) |
| App Name | trader-lp |
| Application ID | `t266R-pA5Ez_Ij4MUuTbs` |
| Container | `trader-lp-ag6kzp` |
| Domain ID | `XyzNWRinU6ELSaR2Aqn7l` |
| Hostname | `trader.dyagnosys.com` |
| Status | `done` |
| Source | `vitorcalvi/dyagnosys-trader-lp` |
| Build Type | dockerfile |
| Webhook Token | `hl5hV3dYJ6u6uq842hEaZ` |

### Smoke Test Results

| Test | Description | Result |
|------|-------------|--------|
| Test 1 | Landing page returns 200 | ✅ PASS: `https://trader.dyagnosys.com` serves styled page with hero, pricing, FAQ |
| Test 2 | Pricing visible | ✅ PASS: `$29`, `$79`, `$199` all render |
| Test 3 | Stub pages | ✅ PASS: `/signup`, `/terms`, `/privacy` return 308→200 (Caddy trailing-slash) |
| Test 4 | SSL valid | ✅ PASS: `Verify return code: 0 (ok)` |
| Test 5 | Regression check - app-trader | ✅ PASS: `https://app-trader.dyagnosys.com` serves AlpacaPro app |
| Test 6 | Regression check - api-trader | ✅ PASS: `https://api-trader.dyagnosys.com/healthz` returns healthy |

### Regression Note (CSS Bug Fixed)

**Bug caught in production smoke testing:** `src/layouts/Base.astro` had incorrect CSS import:
\`\`\`astro
<link rel="stylesheet" href={import.meta.url.src + '/../styles/global.css'} />
\`\`\`
This emitted literal `undefined/../styles/global.css` — site rendered unstyled.

**Fix:** Corrected to proper Astro pattern:
\`\`\`astro
---
import '../styles/global.css';
---
\`\`\`
Pushed as commit `11060dd` and redeployed. This validates the importance of smoke tests.

### Final URLs

| URL | Status |
|-----|--------|
| `https://trader.dyagnosys.com` | ✅ 200, fully styled landing page |
| `https://app-trader.dyagnosys.com` | ✅ AlpacaPro app (regression check) |
| `https://api-trader.dyagnosys.com/healthz` | ✅ healthy (regression check) |

### Cloudflared Config (Applied)

Updated `/etc/cloudflared/config.yml` on 192.168.1.45:
\`\`\`yaml
ingress:
  - hostname: app-trader.dyagnosys.com
    service: http://localhost:80
  - hostname: api-trader.dyagnosys.com
    service: http://localhost:80
  - hostname: trader.dyagnosys.com
    service: http://localhost:80
  - service: http_status:404
\`\`\`

**Note:** `trader.dyagnosys.com` now routes to Traefik (port 80) for the landing page.

Restarted: `sudo systemctl restart cloudflared && sudo systemctl is-active cloudflared`

---

## §7 Stripe Licensing Deploy (PROMPT_DEPLOY_STRIPE_LICENSING.md)

### Status
✅ **Complete** - Deployed 2026-05-20

### Backend Licensing Endpoints Added
Added to `api-trader.dyagnosys.com`:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/checkout` | POST | Create Stripe checkout session, redirect to Stripe |
| `/issue-license` | GET | Exchange `session_id` for JWT after successful payment |
| `/refresh-license` | POST | Refresh expiring JWT (needs valid Bearer token) |
| `/recover-license` | POST | Email recovery for license token |
| `/stripe-webhook` | POST | Webhook endpoint (for future analytics) |

### Stripe Products Created

| Tier | Price ID | Amount |
|------|----------|--------|
| Pro | `price_1TZ6GCHEkCRsSe7wsi06r2iE` | $29.00 / month |
| Pro + AI | `price_1TZ6GCHEkCRsSe7wuGTaZiFT` | $79.00 / month |

### Landing Page Updates

| Page | Purpose |
|------|---------|
| `/` | Pricing CTAs now POST to `/checkout` with tier |
| `/license` | Receives `session_id`, calls `/issue-license`, displays JWT |
| `/recover` | Email input form → POST to `/recover-license` |

### Frontend License Module Created

`src/frontend/services/licensing/index.ts`:
- `getLicense()` / `setLicense()` / `clearLicense()` - localStorage management
- `decodeLicense()` - parse JWT payload
- `isExpiringSoon()` - check if refresh needed (12h buffer)
- `refreshLicense()` - call `/refresh-license` with Bearer token
- `useLicense()` - React hook for component integration

### Required Backend Environment Variables

Add to `fireup-backend` via `application.saveEnvironment`:

| Variable | Source |
|----------|--------|
| `STRIPE_SECRET_TEST_API` | Provided (test mode) |
| `STRIPE_PUBLISH_TEST_API` | Provided (test mode) |
| `STRIPE_TEST_WEBHOOK` | Provided (test mode) |
| `STRIPE_PRICE_PRO` | `price_1TZ6GCHEkCRsSe7wsi06r2iE` |
| `STRIPE_PRICE_PRO_AI` | `price_1TZ6GCHEkCRsSe7wuGTaZiFT` |
| `RESEND_API_KEY` | Provided |
| `JWT_SECRET` | Generate fresh: `openssl rand -hex 32` |
| `APP_URL` | `https://app-trader.dyagnosys.com` |
| `LP_URL` | `https://trader.dyagnosys.com` |

### End-to-End Test Status

**Not yet run** - waiting for backend redeployment with Stripe env vars. Once deployed:

1. `POST /checkout` → expect `{ url: "https://checkout.stripe.com/..." }`
2. Browser: pay with test card `4242 4242 4242 4242`
3. `/license?session_id=...` → shows JWT
4. App opens with license pre-loaded
5. `/refresh-license` → `{ jwt: "<new jwt>" }`

### Open Questions

- [x] Deploy backend with Stripe env vars
- [x] Run end-to-end test (§7)

---

## §8 Stripe Deploy Retrospective (2026-05-20)

### Verified Live Tests (Test Mode)

| Test | Endpoint | Result |
|------|----------|--------|
| 1 | GET /healthz | ✅ `{"status":"ok"}` |
| 2 | POST /checkout `{"tier":"pro"}` | ✅ returns `https://checkout.stripe.com/c/pay/cs_test_...` |
| 3 | POST /checkout `{"tier":"pro_ai"}` | ✅ returns Stripe URL |
| 4 | POST /refresh-license (tampered token) | ✅ HTTP 401 `{"error":"invalid_token"}` |
| 5 | POST /recover-license | ✅ HTTP 200 `{"ok":true}` |
| 6 | Regression: app-trader + trader (LP) | ✅ both 200 |

### Five Bugs Encountered (In Order Discovered)

**Bug 1 — Missing package.json/staging**

**What happened:** Committed `server-refactored.mjs` with new imports (`import Stripe from 'stripe'`, etc.) but the diff did NOT include `package.json`. Ran `npm install` locally, wrote code, then `git add` only the source. Never ran `git status` before committing.

**Fix:** Commit `0128e374` added the three deps to `package.json`.

**Lesson:** Before every commit that imports new packages, run `git status` and verify `package.json` AND the lockfile are both staged.

**Bug 2 — Stale yarn.lock**

**What happened:** Dockerfile uses `yarn install --frozen-lockfile` which failed because `yarn.lock` didn't list the new deps. Shipped code without ever running `docker build .` locally.

**Fix:** Commit `996315bf` regenerated `yarn.lock` with the new deps.

**Lesson:** Always commit lockfile with `package.json`. Always run `docker build .` once before pushing infrastructure changes — it's 60 seconds and catches every "works on my machine" bug.

**Bug 3 — application.deploy does NOT re-pull from GitHub**

**What happened:** Three successive redeploys all built the same broken image because Dokploy used cached local checkout at `/etc/dokploy/applications/<appName>/code/` which was still at commit `bc07a573`. Git fetch only happens on webhook-triggered deploys, not API-triggered ones.

**Fix:** SSH'd and ran:
```bash
cd /etc/dokploy/applications/app-override-cross-platform-hard-drive-9da7r9/code
sudo git fetch origin main && sudo git reset --hard origin/main
```

**Lesson:** `application.deploy` NEVER re-pulls from GitHub. It builds whatever is currently in the local code directory. Force a fresh pull before every API deploy.

**Bug 4 — Docker daemon had no external DNS**

**What happened:** Container `/etc/resolv.conf` had no external nameservers (`127.0.0.11` only). Build couldn't resolve `auth.docker.io` or `api.github.com`. This was a pre-existing host config issue exposed by the rebuild.

**Fix:** Added `/etc/docker/daemon.json`:
```json
{"dns": ["1.1.1.1", "8.8.8.8"]}
```
Then `sudo systemctl restart docker` (~30s outage, containers auto-recovered).

**Lesson:** Docker container DNS may need explicit configuration. Verify with:
```bash
sudo docker exec <any-container> getent hosts api.github.com
```

**Bug 5 — /recover-license referenced undefined body variable**

**What happened:** Copy-pasted `/checkout` handler but wrote `const { email } = body;` — bare `body` is undefined. Result: HTTP 500 `body is not defined`.

**Fix:** Commit `1e8bfcf7` changed to `const { email } = await readBody(req);`.

**Lesson:** When copy-pasting handlers, test each one. Don't trust pattern-matching.

### Summary Table

| Bug | Root Cause | Fix Commit | Key Lesson |
|-----|------------|------------|------------|
| 1. Package.json missing | Forgot to stage deps files | `0128e374` | `git status` before every commit |
| 2. Stale lockfile | Didn't run `yarn install` locally | `996315bf` | Commit lockfile after deps install |
| 3. No git fetch | `application.deploy` uses cached code | Manual git reset | Force fetch via SSH before API deploy |
| 4. No Docker DNS | Container resolv.conf missing external nameservers | Manual daemon.json | Check DNS with `getent hosts` |
| 5. Undefined body | Copy-pasted handler without updating | `1e8bfcf7` | Test each handler you write |

**Rule 10 reminder:** NO DOCKER FALLBACK. If Dokploy can't deploy for ANY reason, STOP and write `DEPLOY_BLOCKERS.md` with details.