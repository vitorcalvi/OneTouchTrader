# DEPLOY_IDS.md

## Discovered IDs (2026-05-20)

### Current Applications (Updated 2026-05-20)

| Name | Application ID | Status | Notes |
|------|---------------|--------|-------|
| fireup-postgres | `0yw2U1uwlpu06X0b5DdQs` | ✅ done | PostgreSQL 16 Database, process accepting connections |
| fireup-backend | `buvl-yIURNK0jWIGSGj03` | ✅ done | Docker build, container `app-override-cross-platform-hard-drive-9da7r9` Up 2min |
| fireup-frontend | `KKSW0HrBYJx9OEnyBT4bz` | ✅ done | Docker build, container `fireuptrader-fireupfrontend-ftw7a5` Up 4min |
| trader-lp | `t266R-pA5Ez_Ij4MUuTbs` | ✅ done | Landing page for trader.dyagnosys.com, container `trader-lp-ag6kzp` |

### Project & Environment

| Field | ID/Value |
|-------|----------|
| Project ID | `vGQBLjq-AebJ2jnfkE2-9` |
| Project Name | `fireup-trader` |
| Environment ID | `sWX6M4lx4CYARPD1zYsmK` |
| Environment Name | `production` |

### trader-lp Service

| Field | Value |
|-------|-------|
| Application ID | `t266R-pA5Ez_Ij4MUuTbs` |
| Container Name | `trader-lp-ag6kzp` |
| Domain ID | `XyzNWRinU6ELSaR2Aqn7l` |
| Hostname | `trader.dyagnosys.com` |
| Status | `done` |
| Webhook Token | `hl5hV3dYJ6u6uq842hEaZ` |
| Build Type | dockerfile |
| Source | `vitorcalvi/dyagnosys-trader-lp` |

### Repository

| Field | Value |
|-------|-------|
| Repository Name | `vitorcalvi/OneTouchTrader` |
| Branch | `main` |
| Dockerfile | `Dockerfile.backend` / `Dockerfile.frontend` |
| Port | 5171 (backend), 80/8080 (frontend) |

### GitHub Integration - RESOLVED

| Field | Status |
|-------|--------|
| githubId | `zfZwNZBdCgOFJDVKsFegV` |
| Deployment Result | ✅ Works with discovered githubId |

**Note:** This ID can be used for future API-driven app creation.

### Webhook URLs

| Application | Webhook URL |
|-------------|-------------|
| fireup-backend | `http://192.168.1.45:3000/api/deploy/YkwBCOJl6aV722UlP8m3d` |
| fireup-frontend | `http://192.168.1.45:3000/api/deploy/JbE5Qsnq9blAl65ZbaGCc` |

### Environment Updates (2026-05-20)

| Application | VITE_API_BASE_URL / ALLOWED_ORIGINS |
|-------------|-------------------------------------|
| fireup-frontend | `VITE_API_BASE_URL=https://api-trader.dyagnosys.com` |
| fireup-backend | `ALLOWED_ORIGINS=https://app-trader.dyagnosys.com` |

### Cloudflare Tunnel

| Field | Value |
|-------|-------|
| Tunnel Name | `fireup-prod` |
| Tunnel UUID | `d406ee9a-3acd-4987-bf14-65c5bed83b73` |
| Zone | `dyagnosys.com` |
| Zone ID | `6bfab97085a8ff18be42968855a0cdc8` |

### DNS Records (Cloudflare)

| Hostname | Record ID | Status |
|----------|-----------|--------|
| trader | `78cd2a0bb8d19e05a9c321a00478e2ba` | ✅ |
| app-trader | `e5d3490ef85e13a6ada79ed8d16971be` | ✅ |
| api-trader | `62a20a4d0b54782d6a45bb050a3fdd5b` | ✅ |

### Deleted DNS Records

| Hostname | Old Record ID | Reason |
|----------|---------------|--------|
| app.dyagnosys.com | `d950a93d0ed9c86662944a79c7a941a5` | Replaced by app-trader.dyagnosys.com |
| fireup-api.dyagnosys.com | `50de3564bb720cee60c2d9f6521b1155` | Replaced by api-trader.dyagnosys.com |

**Note:** `api.dyagnosys.com` already exists in this zone pointing to a different tunnel (ID: `0855ca03-dc67-4bcf-acca-2679c1644728`) — **DO NOT TOUCH**.

### Postgres Connection

| Field | Value |
|-------|-------|
| postgresId | `0yw2U1uwlpu06X0b5DdQs` |
| App Name | `postgres-program-mobile-alarm-fixptz` |
| Database | `fireup` |
| User | `fireup_user` |
| Password | `6eb35a81e81aaf0aaa1638b15e909ae1607cc732712646c8` |
| Internal Connection String | `postgresql://fireup_user:6eb35a81e81aaf0aaa1638b15e909ae1607cc732712646c8@postgres-program-mobile-alarm-fixptz:5432/fireup` |
| Status | `done` (process accepting connections on port 5432) |
| Note | *Provisioned for future use - backend doesn't currently include a Postgres client* |

### Known Secrets

| Secret | Value |
|--------|-------|
| TRADE_CARD_TOKEN | `170e0b8ae7e26b43e2a70c049fec1708e4f5981b7888ec891559b2b50dd9848c` |
| Postgres Password | `6eb35a81e81aaf0aaa1638b15e909ae1607cc732712646c8` |
| Dokploy API Key | `BloSEYydevQesKwQvpKrhHvTcRUPmLTQvRHkoipsSrlKObcMUdOGCHvcGLwHYKZW` |

### Stripe Pricing (Test Mode)

| Tier | Price ID | Amount |
|------|----------|--------|
| Pro | `price_1TZ6GCHEkCRsSe7wsi06r2iE` | $29.00 / month |
| Pro + AI | `price_1TZ6GCHEkCRsSe7wuGTaZiFT` | $79.00 / month |

### Stripe Secrets (Test Mode - from PROMPT_DEPLOY_STRIPE_LICENSING.md)

**Required by backend** — obtain from user or existing deployment:

| Secret | Description |
|--------|-------------|
| STRIPE_PUBLISH_TEST_API | Publishable key (pk_test_...) |
| STRIPE_SECRET_TEST_API | Secret key (sk_test_...) |
| STRIPE_TEST_WEBHOOK | Webhook signing secret (whsec_...) |
| RESEND_API_KEY | Resend API key for license emails |
| JWT_SECRET | Generate with `openssl rand -hex 32` |

### Required Backend Environment Variables

Add these to the `fireup-backend` application via `application.saveEnvironment`:

| Variable | Source |
|----------|--------|
| `STRIPE_SECRET_TEST_API` | Provided (test mode) |
| `STRIPE_PUBLISH_TEST_API` | Provided (test mode) |
| `STRIPE_TEST_WEBHOOK` | Provided (test mode) |
| `STRIPE_PRICE_PRO` | Created via API |
| `STRIPE_PRICE_PRO_AI` | Created via API |
| `RESEND_API_KEY` | Provided |
| `JWT_SECRET` | Generate fresh |
| `APP_URL` | `https://app-trader.dyagnosys.com` |
| `LP_URL` | `https://trader.dyagnosys.com` |