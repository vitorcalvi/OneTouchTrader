# DEPLOY_TOPOLOGY.md

## Fireup Trader Architecture

```
                        INTERNET
                            │
                            ▼
    ┌─────────────────────────────────────────────┐
    │           Cloudflare Tunnel                 │
    │   (d406ee9a-3acd-4987-bf14-65c5bed83b73)    │
    │                                             │
    │  trader.dyagnosys.com          → trader-lp   │
    │  app-trader.dyagnosys.com      → Traefik   │
    │  api-trader.dyagnosys.com      → Traefik   │
    └─────────────────────────────────────────────┘
                            │
                            ▼
                192.168.1.45:80 (localhost)
                            │
                            ▼
                    ┌───────▼───────┐
                    │   Traefik     │
                    │ (routing by   │
                    │  Host header) │
                    └───────┬───────┘
                            │
            ┌───────────────┴───────────────┐
            │                               │
            ▼                               ▼
    ┌───────────────┐               ┌───────────────┐
    │ trader-lp     │               │ fireup-       │
    │ (Caddy :80)   │               │ frontend      │
    │               │               │ (Caddy :80)   │
    │ Serves:       │               │               │
    │ - LP HTML     │               │ Serves:       │
    │ - static ass. │               │ - React app   │
    └───────┬───────┘               └───────┬───────┘
            │                               │
            │                               ▼
            │                       (future connect)
            │                               │
            └───────────────┬───────────────┘
                            │
                            ▼
                ┌───────────────────────┐
                │ fireup-postgres       │
                │ (PostgreSQL 16)       │
                │ port: 5432            │
                │ database: fireup      │
                │ user: fireup_user     │
                └───────────────────────┘
```

## Component Details

| Component | Type | Location | Purpose |
|-----------|------|----------|---------|
| Cloudflare Tunnel | SaaS | cloudflare.com | Reverse proxy, TLS termination, DDoS protection |
| cloudflared | Process | 192.168.1.45 | Local tunnel agent, connects to Cloudflare |
| Traefik | Proxy | dokploy-traefik:80 | Routes HTTP by Host header to correct container |
| fireup-frontend | Container | Caddy:80 | Serves React SPA, handles client-side routing |
| fireup-backend | Container | Node:5171 | API server, WebSocket support, trade logic |
| fireup-postgres | Container | PostgreSQL:5432 | Database (provisioned, not yet integrated) |

## Data Flow

1. **Browser** → HTTPS request to `app-trader.dyagnosys.com`
2. **Cloudflare** → Terminates TLS, proxies to tunnel
3. **cloudflared** → Connects to Traefik on `localhost:80`
4. **Traefik** → Routes to `fireup-frontend` container by Host header
5. **Frontend** → Serves React app, API calls go to `api-trader.dyagnosys.com`

## Public URLs

| Service | URL |
|---------|-----|
| Frontend (React) | `https://app-trader.dyagnosys.com` |
| Backend (API) | `https://api-trader.dyagnosys.com` |
| Landing Page | `https://trader.dyagnosys.com` (trader-lp) |

## Internal Networking

| Service | Internal Address | Port | Purpose |
|---------|------------------|------|---------|
| trader-lp | `trader-lp-*` | 80 | Static landing page |
| fireup-frontend | `fireuptrader-fireupfrontend-*` | 80 | HTTP server |
| fireup-backend | `app-override-cross-platform-hard-drive-*` | 5171 | API server |
| fireup-postgres | `postgres-program-mobile-alarm-fixptz` | 5432 | Database |
| Traefik | `dokploy-traefik` | 80 | Reverse proxy |

## Secrets (Rotate in Production)

| Secret | Value |
|--------|-------|
| TRADE_CARD_TOKEN | `170e0b8ae7e26b43e2a70c049fec1708e4f5981b7888ec891559b2b50dd9848c` |
| Postgres Password | `6eb35a81e81aaf0aaa1638b15e909ae1607cc732712646c8` |
| Dokploy API Key | `BloSEYydevQesKwQvpKrhHvTcRUPmLTQvRHkoipsSrlKObcMUdOGCHvcGLwHYKZW` |

**Note:** Alpaca API keys required for trade-card flow — not yet configured.