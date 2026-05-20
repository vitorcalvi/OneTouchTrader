# PROMPT — Universal Dokploy Deployment Framework

**Target executor:** Any flash/plan-following AI module (Laguna-X2, Claude-Code, etc.).
**Goal:** Deploy any web app to a self-hosted Dokploy instance via the **UI for initial wiring** and the **API for redeploys/ops**. Verified on Dokploy `v0.29.x`.
**Out of scope:** App-specific code, schemas, business logic. Fill the `<<PLACEHOLDERS>>` per app.

> Derived from `PROMPT_DEPLOY_DOKPLOY.md` v3 (Fireup Trader deploy, 2026-05-20). Lessons codified into hard rules below.

---

## 0. Lessons learned (read before you start)

1. **Initial service creation via Dokploy API is fragile.** The required `githubId` is not discoverable through documented endpoints, and OAuth/App provider records can show empty (`accessedGitProviders: []`) at org level while still working in the UI. **Always do the first wiring in the UI.** Use the API only for redeploys, env updates, log tails, and webhook triggers.
2. **The local folder name ≠ the GitHub repo name.** Always run `git remote -v` before assuming. (`Lean-FireupTrader` on disk was `vitorcalvi/OneTouchTrader` on GitHub.)
3. **Dokploy v0.29.x auth header is `x-api-key`**, not `Authorization: Bearer`. Verify Swagger at `http://<host>:3000/swagger`.
4. **Postgres must be a `Database` service type, not `Application`.** Application-type Postgres causes port-conflicts with Dokploy's own internal `dokploy-postgres.*` containers. Database type uses Dokploy's internal network — no host port conflicts possible.
5. **Never touch `dokploy-*` containers.** Those are Dokploy's own infrastructure (UI database, traefik, etc.). Deleting them bricks the install.
6. **Platform mismatch (amd64 builder on arm64 host)** silently fails builds with no logs. Create a native arm64 builder before first deploy on Apple Silicon / arm64 servers.
7. **`corepack enable`** can fail on minimal Node Alpine images. Use `corepack enable || npm i -g yarn` as a fallback.
8. **`yarn build` often runs `tsc --noEmit && vite build`.** Pre-existing TS errors block builds. If type-checking is not gating, run `yarn vite build` directly in the Dockerfile and track the errors in a separate `TODO_TS_ERRORS.md`.
9. **NO DOCKER FALLBACK.** If Dokploy fails for any reason, STOP and write `DEPLOY_BLOCKERS.md`. Direct `docker run` defeats the entire reason for using Dokploy (auto-deploy, UI logs, backups, monitoring).
10. **Tear down orphan containers from previous attempts BEFORE retrying.** Same-named containers will collide with Dokploy-created ones.
11. **`application.create` ignores `buildType: "dockerfile"`, but `application.update` respects it.** Confirmed in Dokploy v0.29.4: applications created via API always fall back to nixpacks. **Workaround:** create with defaults, then immediately PATCH via `application.update` with `{buildType:"dockerfile", dockerfile:"<path>", dockerContextPath:"."}` — the update DOES persist correctly. Verified by reading the app back: `buildType` becomes `"dockerfile"` and the next deploy uses your Dockerfile. (Earlier framework versions said UI was the only fix — that was wrong; `application.update` is the API workaround.)
11b. **`application.saveEnvironment` requires `buildArgs`, `buildSecrets`, and `createEnvFile` fields even if empty.** Sending only `applicationId` + `env` returns 400 with `"Invalid input: expected nonoptional, received undefined"`. Always include all 4: `{applicationId, env, buildArgs:"", buildSecrets:"", createEnvFile:true}`.
11c. **`repository` field must be the bare repo name, not `owner/repo`.** Dokploy concatenates `owner` + `repository` internally, so passing `vitorcalvi/OneTouchTrader` as the repo field results in clone URL `github.com/vitorcalvi/vitorcalvi/OneTouchTrader.git` → 404. Correct: `repository: "OneTouchTrader"` and `owner: "vitorcalvi"` as separate fields.
11d. **Webhook deploys (`POST /api/deploy/<token>`) return `{"message":"Branch Not Match"}` for manual triggers.** Webhooks expect a GitHub push payload with branch info. For programmatic redeploys use `application.deploy` with `{applicationId}` and the `x-api-key` header instead — that endpoint always deploys the configured branch.
12. **Build args vs runtime env are different fields in Dokploy.** Vite/Next inline build-time vars at build, so `VITE_*` and `NEXT_PUBLIC_*` must go in the **Build args** tab, not the **Environment** tab. Putting them in Environment means they're injected at runtime only — too late, the bundle was built without them.
13. **`localhost` from the browser ≠ `localhost` on the server.** Frontend build-time API URLs must use the server's LAN IP (e.g., `http://192.168.1.45:5171`) or the public domain, never `localhost`. The bundle runs in the user's browser, not on the server.

14. **Cloudflare free-tier Universal SSL covers exactly one level of subdomain.** Use flat naming (`app-thing.root.tld`), not nested (`app.thing.root.tld`). Nested subdomains trigger a free-tier SSL handshake failure because Universal SSL only supports `*.root.tld` wildcard, not `*.*.root.tld`. Plan public hostnames accordingly — e.g., `app-trader.dyagnosys.com` instead of `app.trader.dyagnosys.com`.

15. **When cloudflared runs on the Dokploy host, ingress service must be `http://localhost:80` (Traefik), NOT container ports.** Container ports (e.g., 5171, 8080) are not published on the host. Traefik listens on `localhost:80` and routes by Host header. The Cloudflare hostname must also exist as a Dokploy Traefik domain on the target app, or traffic won't reach the container.

---

## 1. Required inputs (collect ALL before starting)

| # | Item | Source |
|---|---|---|
| 1 | **Dokploy URL + version** | `http://<host>:3000` — note version in footer |
| 2 | **Dokploy API key** | Profile → API/CLI Keys → Generate New Key (copy once, shown only once) |
| 3 | **Auth header style** | Check Swagger at `http://<host>:3000/swagger` → Authorize button → header name (usually `x-api-key`) |
| 4 | **Server SSH access** | `ssh <user>@<host>` with key-auth (no password). Confirm passwordless sudo if privileged commands needed. |
| 5 | **Server OS + architecture** | `ssh <user>@<host> 'uname -a'` — note `aarch64` vs `x86_64` |
| 6 | **GitHub org/repo (exact name)** | Run `git remote -v` in repo root. The local folder name is NOT authoritative. |
| 7 | **GitHub provider connected in Dokploy** | UI → Git → GitHub → confirm connection exists and lists the target repo in dropdown |
| 8 | **GitHub App repo access** | github.com/settings/installations/<id> → "All repositories" OR target repo explicitly selected |
| 9 | **App-specific env vars** | List every `*_API_KEY`, `*_SECRET`, `DATABASE_URL` placeholder, build args, runtime vars |
| 10 | **Public-facing domains** (if applicable) | DNS provider + zone the user controls |

**Verify the API key works BEFORE touching anything else:**

```bash
curl -fsS -H "x-api-key: <DOKPLOY_API_KEY>" \
  http://<host>:3000/api/project.all | jq 'length'
```

Returns a number → key works. 401 → key wrong. 404 → wrong endpoint, check Swagger.

If verification fails, STOP. Write `DEPLOY_BLOCKERS.md` listing the failed call + raw response. Do not continue.

---

## 2. Files the app needs (templates)

### 2.1 `Dockerfile.backend` (Node/Bun/Python — adapt to stack)

```dockerfile
# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable || npm i -g yarn
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production=false

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json yarn.lock ./
COPY src ./src
EXPOSE <<BACKEND_PORT>>
CMD ["node", "<<BACKEND_ENTRYPOINT>>"]
```

### 2.2 `Dockerfile.frontend` (Vite/Next/CRA — adapt to stack)

```dockerfile
# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable || npm i -g yarn
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile
COPY . .
# Build-time env: must be passed as Docker build args (Vite/Next inline at build)
ARG <<VITE_BUILD_ARG_1>>
ENV <<VITE_BUILD_ARG_1>>=$<<VITE_BUILD_ARG_1>>
# NOTE: skip type-checking if pre-existing errors block the build (track separately)
RUN yarn vite build   # or: yarn next build, yarn build, etc.

FROM caddy:2-alpine AS runner
COPY --from=build /app/dist /usr/share/caddy
COPY Caddyfile /etc/caddy/Caddyfile
EXPOSE 80
```

### 2.3 `Caddyfile` (SPA fallback — skip if Next.js handles routing)

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

### 2.4 `.dockerignore`

```
node_modules
dist
.next
.git
.env
.env.*
*.log
.claude
PROMPT_*.md
DEPLOY_*.md
EXECUTION_*.md
README*.md
```

### 2.5 `/healthz` endpoint (required for UptimeRobot + Dokploy health checks)

Return JSON: `{"status":"ok","uptimeSec":<n>,"ts":"<iso>"}`. Wire at the bare path `/healthz`, NOT under `/api/*`.

### 2.6 `.env.production.example` (committed, NO real secrets)

List every env var the app reads with `__SET_IN_DOKPLOY__` as the placeholder. Note any var that must be passed as a **build arg** vs **runtime env** (Vite/Next vars are build-time).

---

## 3. Pre-deploy cleanup (always run, even on first deploy)

Orphan containers from prior attempts will collide. Remove them, but never touch `dokploy-*`.

```bash
# Inspect
ssh <user>@<host> 'sudo docker ps -a --filter "name=<<APP_PREFIX>>-" --format "table {{.Names}}\t{{.Status}}\t{{.Image}}"'

# Stop+remove (adjust names per app)
ssh <user>@<host> 'sudo docker stop <<APP_PREFIX>>-backend <<APP_PREFIX>>-frontend <<APP_PREFIX>>-postgres 2>/dev/null; \
                   sudo docker rm   <<APP_PREFIX>>-backend <<APP_PREFIX>>-frontend <<APP_PREFIX>>-postgres 2>/dev/null; \
                   echo "cleanup done"'

# Remove app-specific volumes (NOT dokploy-* volumes)
ssh <user>@<host> 'sudo docker volume ls -q | grep -i <<APP_PREFIX>> | grep -v dokploy | xargs -r sudo docker volume rm'

# Verify ports are free
ssh <user>@<host> 'sudo ss -tlnp | grep -E ":(<<BACKEND_PORT>>|<<FRONTEND_PORT>>)\b" || echo "ports free"'
```

If a port is still bound by something not in the cleanup list, STOP. Do not kill arbitrary processes.

### 3.1 Platform builder fix (arm64 hosts only)

If `uname -m` returned `aarch64`:

```bash
ssh <user>@<host> 'docker buildx ls | grep -q linux/arm64 || \
                   docker buildx create --name arm64-builder --platform linux/arm64 --use && \
                   docker buildx inspect --bootstrap'
```

---

## 4. Initial deploy via Dokploy UI (mandatory for first-time wiring)

API-only provisioning fails on the `githubId` reference. **Do step-by-step in the browser:**

### 4.1 Create project

UI → **Projects** → **+ Create Project** → name `<<PROJECT_NAME>>` → Create.

### 4.2 Verify GitHub provider visibility

Click any service template → **Source** tab → **Repository** dropdown. Type a substring of the target repo name. If the repo appears, GitHub provider is good. If not:

- Confirm repo name via `git remote -v` (not the folder name)
- Open github.com/settings/installations → find the Dokploy GitHub App → Configure → grant access to the repo
- Force-refresh in Dokploy: remove and re-add the GitHub provider (UI → Git → GitHub)

Do not proceed until the dropdown shows the repo.

### 4.3 Create each Application service (one at a time)

For each app component (backend, frontend, etc.):

1. Project page → **+ Create Service** → **Application** → name `<<APP_PREFIX>>-<<COMPONENT>>`
2. **Source tab** → GitHub Account → select the connected provider → Repository → pick from dropdown → Branch `main` → Build Path `/` → Save
3. **Build Type** section → select **Dockerfile** → path: `Dockerfile.<<COMPONENT>>` → Save
4. **Environment tab** → paste all runtime env vars (see app's `.env.production.example`)
5. **Build args tab** (if using Vite/Next with build-time inlining) → paste build-time vars
6. **Domains/Ports tab** → expose internal container port on host port (e.g., container `5171` → host `5171`)
7. Top right → **Deploy** button → switch to **Deployments** tab → watch live log
8. On success, copy the **Webhook URL** from the Deployments tab — this is what you'll use for API-driven redeploys
9. On failure: capture the full build log verbatim into `DEPLOY_BLOCKERS.md`. Do NOT retry blindly.

### 4.4 Create Database services (NEVER as Application type)

For Postgres/MySQL/Redis/etc:

1. **+ Create Service** → **Database** → pick engine + version
2. Name: `<<APP_PREFIX>>-<<DB_TYPE>>` (e.g., `myapp-postgres`)
3. Set database name, user, password
4. Do NOT expose externally. Other services reach it via Dokploy's internal network at `<service-name>:<port>` (e.g., `myapp-postgres:5432`)
5. Deploy
6. Copy the **internal connection string** from the service page → use it as `DATABASE_URL` env var on the backend service

### 4.5 Capture all IDs into `DEPLOY_IDS.md`

After each service is created, record:

```markdown
| Service | Application ID | Webhook URL | Notes |
|---|---|---|---|
| <<APP_PREFIX>>-backend | <copy from URL bar> | <copy from Deployments tab> | port 5171 |
| <<APP_PREFIX>>-frontend | ... | ... | port 8080 |
| <<APP_PREFIX>>-postgres | ... | (databases don't have webhooks) | internal only |

Project ID: <from URL>
Environment ID: <from URL>
GitHub provider githubId: <query application.one?applicationId=<id> and read the githubId field>
```

The `githubId` is now discoverable: query `application.one?applicationId=<id>` for any successfully-created Application, and the response contains the `githubId` field. This unlocks future API-only service creation if needed.

---

## 5. API-driven redeploys (after initial wiring)

Once services exist and are wired, all redeploys go through the API.

### 5.1 Trigger redeploy by webhook (no auth required)

```bash
curl -X POST <<WEBHOOK_URL>>
```

### 5.2 Trigger redeploy by API (auth required)

```bash
curl -X POST -H "x-api-key: <<DOKPLOY_API_KEY>>" \
  http://<host>:3000/api/application.deploy \
  -H "Content-Type: application/json" \
  -d '{"applicationId":"<<APP_ID>>"}'
```

### 5.3 Update env vars

```bash
curl -X POST -H "x-api-key: <<DOKPLOY_API_KEY>>" \
  http://<host>:3000/api/application.saveEnvironment \
  -H "Content-Type: application/json" \
  -d '{"applicationId":"<<APP_ID>>","env":"KEY1=val1\nKEY2=val2"}'
```

Then redeploy. Endpoint names may vary by Dokploy version — confirm via Swagger.

### 5.4 Tail logs

UI is easiest (Deployments tab → View on the latest deployment). For API, query `deployment.all?applicationId=<id>` and fetch the latest deployment's log file.

---

## 6. LAN verification tests (run after every deploy)

### Test 1 — Backend health

```bash
ssh <user>@<host> 'curl -fsS http://localhost:<<BACKEND_PORT>>/healthz' | jq .
```

Pass: `{"status":"ok",...}`.

### Test 2 — Frontend serves HTML

```bash
ssh <user>@<host> 'curl -fsSI http://localhost:<<FRONTEND_PORT>>/' | head -5
ssh <user>@<host> 'curl -fsS  http://localhost:<<FRONTEND_PORT>>/' | grep -i "<title"
```

Pass: `HTTP/1.1 200`, `content-type: text/html`, title tag present.

### Test 3 — Database reachable from backend container

```bash
ssh <user>@<host> "sudo docker exec -i \$(sudo docker ps -qf name=<<APP_PREFIX>>-backend) sh -c \
  \"<DB_CLI_CMD> 'SELECT 1;'\""
```

Pass: returns `1`.

### Test 4 — App-specific smoke test

Define per app. Example: POST a test record, verify it persists, delete it.

### Test 5 — Containers stay up for 5 minutes

```bash
sleep 300 && ssh <user>@<host> 'sudo docker ps --filter "name=<<APP_PREFIX>>-" --format "table {{.Names}}\t{{.Status}}"'
```

Pass: all services show `Up 5 minutes`+ with no restart loops.

If any test fails, do NOT proceed to the next. Diagnose, fix, retry from Test 1.

---

## 7. Public exposure via Cloudflare Tunnel (recommended)

No inbound ports opened on the home router. Cloudflare Tunnel terminates TLS and handles DDoS.

```bash
ssh <user>@<host> 'sudo bash -s' <<'EOF'
set -e
ARCH=$(dpkg --print-architecture)  # amd64 or arm64
wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${ARCH}.deb
dpkg -i cloudflared-linux-${ARCH}.deb
cloudflared --version
EOF
```

Then interactive login + tunnel creation:

```bash
ssh -t <user>@<host> 'sudo cloudflared tunnel login'   # user must approve in browser
ssh <user>@<host> 'sudo cloudflared tunnel create <<TUNNEL_NAME>>'
```

Config at `/etc/cloudflared/config.yml`:

```yaml
tunnel: <TUNNEL_UUID>
credentials-file: /root/.cloudflared/<TUNNEL_UUID>.json

ingress:
  - hostname: app-<<DOMAIN>>
    service: http://localhost:<<FRONTEND_PORT>>
  - hostname: api-<<DOMAIN>>
    service: http://localhost:<<BACKEND_PORT>>
  - service: http_status:404
```

Route DNS + install service:

```bash
ssh <user>@<host> 'sudo cloudflared tunnel route dns <<TUNNEL_NAME>> app-<<DOMAIN>>'
ssh <user>@<host> 'sudo cloudflared tunnel route dns <<TUNNEL_NAME>> api-<<DOMAIN>>'
ssh <user>@<host> 'sudo cloudflared service install && sudo systemctl enable --now cloudflared'
```

**Note:** Use flat naming (`app-domain.tld`, `api-domain.tld`) due to Cloudflare free-tier SSL limitations. See Lesson 14.

**After Cloudflare is live, update frontend with the public API URL** (Vite/Next inline at build):
- UI → frontend service → Build args → change `<<VITE_API_BASE_URL>>` to `https://api-<<DOMAIN>>` → Redeploy.

**Update backend CORS** (runtime env):
- UI → backend service → Environment → set `ALLOWED_ORIGINS=https://app-<<DOMAIN>>` → Restart.

---

## 8. Backups (Cloudflare R2 via Dokploy Database service)

User creates first:
1. R2 bucket `<<APP_PREFIX>>-db-backups`
2. R2 API token scoped to that bucket only
3. Note account ID

In Dokploy → Database service → **Backups** → Add Backup → S3 Destination → Cloudflare R2:
- Endpoint: `https://<account-id>.r2.cloudflarestorage.com`
- Bucket + access keys from above
- Schedule: daily at off-peak hour
- Retention: 14 days
- Click **Test Backup** — confirm one file lands in R2 before continuing

---

## 9. Monitoring (UptimeRobot free tier)

- Add HTTPS monitor → `https://api-<<DOMAIN>>/healthz` → 5-min interval
- Add alert contact (SMS or email)
- Trigger test: stop backend service in Dokploy for ~1 min → confirm alert fires → restart

---

## 10. Hard rules for the executor

0. **Execution context.** Commands run from the user's machine. Server commands are wrapped as `ssh <user>@<host> '<cmd>'`. If a password prompt appears, STOP.
1. **Initial deploy MUST go through Dokploy UI.** API-only first-time provisioning fails on `githubId` resolution. The UI step is non-negotiable.
2. **All redeploys go through the Dokploy API** (webhook or `application.deploy`). Never use `docker run`, `docker compose`, or any other bypass.
3. **Collect all §1 inputs BEFORE writing any files.** Missing input → STOP and ask.
4. **Verify the API key** with the curl in §1 before §3. Wrong key → STOP, write `DEPLOY_BLOCKERS.md`.
5. **Verify GitHub provider sees the repo** in §4.2 before creating Application services. Repo missing → STOP and route the user through the GitHub App permissions fix.
6. **Database services are `Database` type, never `Application`.** No exceptions.
7. **Tests are mandatory and ordered.** Test N fails → do not run Test N+1.
8. **Never commit secrets.** `.env.production.example` has placeholders only. Real values live in Dokploy env-vars UI.
9. **Never open inbound ports on the home router.** Public access goes through Cloudflare Tunnel.
10. **🛑 NO DOCKER FALLBACK.** If Dokploy can't deploy for ANY reason — auth, build error, missing provider, port conflict, anything — STOP and write `DEPLOY_BLOCKERS.md` with:
    - The exact failed UI action or API call
    - The raw error message
    - The current state of the Dokploy project
    - What the user needs to do to unblock
    Then exit. Do not `docker run`. Do not `docker compose up`. Do not "just get it working." Direct Docker defeats the entire reason for using Dokploy.
11. **Never delete `dokploy-*` containers or volumes.** Those are Dokploy's own infrastructure.
12. **Always write a final report.** `EXECUTION_REPORT_DEPLOY.md` on success, `DEPLOY_BLOCKERS.md` on failure. Both files at the repo root.

---

## 11. Final report template (success path)

```markdown
# EXECUTION_REPORT_DEPLOY.md

## Deployed: <<APP_NAME>>
- Dokploy URL: http://<host>:3000
- Project ID: <id>
- Environment: production

## Services
| Name | Type | App ID | Status | URL |
|---|---|---|---|---|
| <<APP_PREFIX>>-backend | Application | <id> | Running | http://<host>:<port> |
| <<APP_PREFIX>>-frontend | Application | <id> | Running | http://<host>:<port> |
| <<APP_PREFIX>>-postgres | Database | <id> | Running | internal |

## Webhook URLs (for API-driven redeploys)
- backend: http://<host>:3000/api/deploy/<token>
- frontend: http://<host>:3000/api/deploy/<token>

## Tests
- Test 1 (backend health): PASS — <output>
- Test 2 (frontend HTML): PASS — <output>
- Test 3 (DB reachable): PASS
- Test 4 (app smoke test): PASS
- Test 5 (5-min stability): PASS

## Public URLs (if §7 ran)
- https://app.<<DOMAIN>>
- https://api.<<DOMAIN>>/healthz

## Saved values (rotate in production)
- (list all secrets generated this session)

## Next steps
- (anything deferred: backups, monitoring, schema migrations)
```

---

## 12. Final report template (blocker path)

```markdown
# DEPLOY_BLOCKERS.md

## Blocker: <one-line summary>
**When:** <step number from this framework>
**What failed:** <exact UI click or API call>
**Raw error:**
\`\`\`
<paste verbatim>
\`\`\`

## State at failure
- Project ID: <id>
- Services created so far: <list with IDs and status>
- Containers running: <docker ps output, filtered>

## What the user must do to unblock
1. <specific action — e.g., "github.com/settings/installations/<id> → grant access to repo X">
2. <second action if needed>

## Saved values
<secrets generated so far, so they're not lost>

---

### Lesson 16 — application.create requires environmentId

**When:** trader-lp deploy 2026-05-20

**What happened:** `application.create` returned:
\`\`\`
Invalid input: expected string, received undefined
\`\`\`
at path `environmentId`.

**Root cause:** Current Dokploy versions require `environmentId` in `application.create`. The field wasn't documented in earlier frameworks.

**Fix:** Read `project.one` to get the project's environments array. Use the entry where `isDefault: true` (usually named "production"). Pass that `environmentId` in `application.create`.

**Reference:** `sWX6M4lx4CYARPD1zYsmK` (production environmentId from DEPLOY_IDS.md)

---

### Lesson 17 — Astro CSS imports

**When:** trader-lp deploy 2026-05-20

**What happened:** `src/layouts/Base.astro` had:
\`\`\`astro
<link rel="stylesheet" href={import.meta.url.src + '/../styles/global.css'} />
\`\`\`
This emitted literal `undefined/../styles/global.css` — site rendered unstyled.

**Root cause:** `import.meta.url.src` is not a valid Astro pattern. The `<link>` tag with dynamic import path doesn't work.

**Fix:** Use the correct Astro pattern in frontmatter:
\`\`\`astro
---
import '../styles/global.css';
---
\`\`\`
Astro auto-bundles CSS imports and inlines critical CSS into `<style>` in the head.

---

### Lesson 18 — Stripe licensing deployment pattern

**When:** PROMPT_DEPLOY_STRIPE_LICENSING.md 2026-05-20

**What was done:** Deployed Stripe checkout + JWT licensing system to `api-trader.dyagnosys.com`:

1. Created Stripe products via API (`price_1TZ6GCHEkCRsSe7wsi06r2iE` for Pro, `price_1TZ6GCHEkCRsSe7wuGTaZiFT` for Pro+AI)
2. Added licensing endpoints to backend (`/checkout`, `/issue-license`, `/refresh-license`, `/recover-license`)
3. Updated landing page with tier-based checkout forms
4. Created `/license` and `/recover` pages

**Key integration points:**
- Landing page uses `<form method="POST" action="https://api-trader.dyagnosys.com/checkout">` with hidden `tier` input → redirects to Stripe
- After Stripe checkout, URL redirects to `/license?session_id=...` which calls `/issue-license` API
- Frontend app (app-trader) uses `src/frontend/services/licensing/index.ts` to read JWT from URL, validate, and send `Authorization: Bearer <jwt>` on API calls
- License refreshes automatically 12h before expiry via `/refresh-license`

**Env vars required:** `STRIPE_SECRET_TEST_API`, `STRIPE_PUBLISH_TEST_API`, `STRIPE_TEST_WEBHOOK`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_PRO_AI`, `RESEND_API_KEY`, `JWT_SECRET`, `APP_URL`, `LP_URL`

---

Rule 10 triggered: Stopped per "NO DOCKER FALLBACK".
```

---

— Framework v2, 2026-05-20. Codified from `PROMPT_DEPLOY_DOKPLOY.md` v3 lessons.
