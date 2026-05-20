#!/bin/bash
# Deployment script for Fireup Trader on Dokploy
# Run this after obtaining the required secrets

set -e

# === SECRETS (to be filled by user) ===
ALPACA_API_KEY=""
ALPACA_API_SECRET=""
DOKPLOY_API_KEY=""
TRADE_CARD_TOKEN="170e0b8ae7e26b43e2a70c049fec1708e4f5981b7888ec891559b2b50dd9848c"
POSTGRES_PASSWORD="6eb35a81e81aaf0aaa1638b15e909ae1607cc732712646c8"

# === API endpoints ===
DOKPLOY_HOST="http://192.168.1.45:3000"
GITHUB_REPO="vitorcalvi/OneTouchTrader"
GITHUB_BRANCH="main"

# === Step 1: Create Project ===
curl -s -X POST "$DOKPLOY_HOST/api/v1/projects" \
  -H "Authorization: Bearer $DOKPLOY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "fireup-trader"}'

# === Step 2: Create Services ===
# Backend
curl -s -X POST "$DOKPLOY_HOST/api/v1/services/application" \
  -H "Authorization: Bearer $DOKPLOY_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"project\": \"fireup-trader\",
    \"name\": \"fireup-backend\",
    \"source\": \"github\",
    \"repo\": \"$GITHUB_REPO\",
    \"branch\": \"$GITHUB_BRANCH\",
    \"dockerfile\": \"Dockerfile.backend\",
    \"build\": \"dockerfile\",
    \"ports\": [{\"port\": 5171, \"hostPort\": 5171}],
    \"env\": {
      \"NODE_ENV\": \"production\",
      \"ALPACA_API_KEY\": \"$ALPACA_API_KEY\",
      \"ALPACA_API_SECRET\": \"$ALPACA_API_SECRET\",
      \"VITE_ALPACA_IS_PAPER\": \"true\",
      \"TRADE_CARD_TOKEN\": \"$TRADE_CARD_TOKEN\",
      \"ALLOWED_ORIGINS\": \"http://192.168.1.45:8080\"
    }
  }"

# Frontend
curl -s -X POST "$DOKPLOY_HOST/api/v1/services/application" \
  -H "Authorization: Bearer $DOKPLOY_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"project\": \"fireup-trader\",
    \"name\": \"fireup-frontend\",
    \"source\": \"github\",
    \"repo\": \"$GITHUB_REPO\",
    \"branch\": \"$GITHUB_BRANCH\",
    \"dockerfile\": \"Dockerfile.frontend\",
    \"build\": \"dockerfile\",
    \"buildArgs\": {
      \"VITE_TRADE_CARD_TOKEN\": \"$TRADE_CARD_TOKEN\",
      \"VITE_API_BASE_URL\": \"http://192.168.1.45:5171\"
    },
    \"ports\": [{\"port\": 80, \"hostPort\": 8080}]
  }"

# Postgres
curl -s -X POST "$DOKPLOY_HOST/api/v1/services/database" \
  -H "Authorization: Bearer $DOKPLOY_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"project\": \"fireup-trader\",
    \"name\": \"fireup-postgres\",
    \"template\": \"postgres\",
    \"postgres\": {
      \"version\": \"16\",
      \"database\": \"fireup\",
      \"user\": \"fireup\",
      \"password\": \"$POSTGRES_PASSWORD\"
    }
  }"

echo "Deployment configured. Check Dokploy UI for status."