# DEPLOY_BLOCKERS.md

## Historical Blockers (All Resolved)

This file documents blockers encountered during deployment. All have been resolved.

---

### Blocker 1: GitHub Provider API Not Accessible

**When:** Task 3 deployment
**What failed:** `application.create` API calls returned "Github Provider not found"
**Fix:** API is working — `githubId` discovered via `application.one?applicationId=<id>` query. Use `application.update` for env changes, `application.deploy` for redeploys.

---

### Blocker 2: Frontend Build Used Nixpacks Instead of Dockerfile

**When:** Initial frontend deployment
**What failed:** `application.create` ignored `buildType: "dockerfile"` and used nixpacks
**Fix:** Lesson 11 — `application.update` respects Dockerfile settings. Recreate via UI or PATCH with correct buildType.

---

### Blocker 3: Cloudflare DNS Wrong Zone

**When:** §5 Cloudflare tunnel setup
**What failed:** DNS records written to wrong zone (fireup.io instead of dyagnosys.com)
**Fix:** Lesson 14 — Cloudflare free-tier Universal SSL covers one subdomain level. Use flat naming (`app-trader.dyagnosys.com`). Created correct records via API in `dyagnosys.com` zone.

---

### Blocker 4: Traefik Domains Not Updated

**When:** §5b hostname migration
**What failed:** Dokploy API returned 404 for application endpoints
**Status:** ✅ Verified working — API responds correctly. Domains updated:
- `app-trader.dyagnosys.com` → frontend (port 80)
- `api-trader.dyagnosys.com` → backend (port 5171)

---

### Blocker 5: Postgres Tests N/A

**When:** LAN verification
**What failed:** Tests 3-4 (Postgres connections)
**Fix:** Backend codebase has no Postgres client — no `pg`, Prisma, or Drizzle ORM. Postgres is provisioned but not integrated. Marked N/A.

---

## Current Status: ✅ ALL GREEN

| Resource | Status |
|----------|--------|
| fireup-frontend | ✅ Running on `https://app-trader.dyagnosys.com` |
| fireup-backend | ✅ Running on `https://api-trader.dyagnosys.com` |
| fireup-postgres | ✅ Running (provisioned, not yet used) |
| trader-lp | ✅ Running on `https://trader.dyagnosys.com` |
| Cloudflare Tunnel | ✅ Active (UUID: `d406ee9a-3acd-4987-bf14-65c5bed83b73`) |
| DNS Records | ✅ 3 CNAMEs created, 2 old deleted |

**Outstanding (user-blocked):**
- ALPACA_API_KEY / ALPACA_API_SECRET needed for trade-card flow

---

### Blocker 6: Landing Page Repo Creation (Resolved)

**When:** PROMPT_DEPLOY_LANDINGPAGE.md deployment

**Resolution:** Created via `gh repo create` — no manual GitHub UI step needed when CLI is authenticated.

**Final state:**
- Application ID: `t266R-pA5Ez_Ij4MUuTbs`
- Container: `trader-lp-ag6kzp`
- Hostname: `trader.dyagnosys.com` → `http://localhost:80` (Traefik)
- Status: `done`
- Smoke tests: All pass (hero, pricing, FAQ, CSS fixed)

---

### Blocker 7: Docker Daemon Missing External DNS (Resolved)

**When:** PROMPT_DEPLOY_STRIPE_LICENSING.md deployment

**What failed:** Container `/etc/resolv.conf` had no external nameservers. Build couldn't resolve `auth.docker.io` (docker image pulls) or `api.github.com` (git clone). Symptom: `getaddrinfo EAI_AGAIN <host>` or "failed to fetch anonymous token" during builds.

**Root cause:** Pre-existing host config issue exposed by rebuild. Docker daemon had no DNS configuration.

**Fix:** Added `/etc/docker/daemon.json`:
```json
{"dns": ["1.1.1.1", "8.8.8.8"]}
```
Then `sudo systemctl restart docker` (~30s outage, containers auto-recovered).

**Verification:**
```bash
sudo docker exec <any-container> getent hosts api.github.com
# Now returns IP addresses instead of empty
```