# LLM Prompt — Build Tier 1: One-Click Trade Card Execution

Paste this into Claude Code (or any capable coding LLM) inside the `Lean-FireupTrader` repo.

---

## Context

You are working in `/Users/vitorcalvi/Desktop/Lean-FireupTrader`, a React + Vite app that provides a mobile-style trading UI for an Alpaca LIVE brokerage account (~$146K BP). The app already has:

- Mobile components in `src/frontend/components/Mobile/` (OrderPanel, SizePresets, GlobalPositionManager, etc.)
- `.env`-driven auto-bracket orders with these vars: `VITE_AUTO_TAKE_PROFIT_PCT`, `VITE_AUTO_STOP_LOSS_PCT`, `VITE_BE_STOP_OFFSET`, `VITE_SL_STOP_OFFSET`, `VITE_TRAILING_STOP_DEFAULT_PCT`, `VITE_MOBILE_DEFAULT_PRESETS`, `VITE_MOBILE_DEFAULT_PRESET`
- Working Alpaca order submission flow via the existing OrderPanel
- TradingView desktop is open separately — this app is execution-only, not charting

The user is a discretionary day trader. He scalps INTC using QQQ as a regime guide. His main bottleneck is **hesitation between deciding a trade and clicking the button** — he frequently misses +$13–60 moves because the manual entry process takes 30+ seconds. He wants an outside LLM (this assistant in a chat) to propose a structured trade card; he reviews it; he hits **one button** to fire the bracket order on Alpaca.

## Goal

Build a "Trade Card Inbox" feature: an external LLM POSTs a structured trade card to the app, the user sees it in the UI with all fields pre-filled, and a single confirmation click submits the full bracket order (entry + stop loss + take profit) to Alpaca.

## Functional requirements

### 1. Trade Card data model

Define a TypeScript type in `src/types/tradeCard.ts`:

```typescript
export interface TradeCard {
  id: string;                    // UUID
  createdAt: string;             // ISO timestamp
  expiresAt: string;             // ISO timestamp, default +5 min
  source: string;                // e.g., "claude-chat", "manual"
  symbol: string;                // e.g., "INTC"
  direction: "LONG" | "SHORT";
  entryType: "MARKET" | "LIMIT" | "STOP";
  entryPrice: number;            // limit price; ignored for MARKET
  stopLoss: number;              // dollar price
  takeProfit1: number;           // dollar price (50% scale)
  takeProfit2?: number;          // dollar price (runner, optional)
  scaleOutPct: number;           // default 50
  notional: number;              // dollar size (e.g., 5000 for "5K")
  shares?: number;               // computed from notional / entryPrice
  rationale: string;             // 1-2 sentences from LLM
  invalidation: string;          // what kills the setup
  riskRewardT1: number;          // computed
  riskRewardT2?: number;         // computed
  regime: "TREND" | "CHOP" | "NEWS_WHIPSAW";
  status: "PENDING" | "ARMED" | "FIRED" | "EXPIRED" | "CANCELED" | "REJECTED";
}
```

### 2. Inbox endpoint

Add an HTTP endpoint in the backend (whatever framework is wired up — check `src/backend/` or `server/`):

- `POST /api/trade-cards` — receives a TradeCard payload, validates, stores in memory (or Redis if available), returns `{ id, status: "PENDING" }`
- `GET /api/trade-cards?status=PENDING` — list pending cards
- `POST /api/trade-cards/:id/fire` — user confirmed; submit to Alpaca; transition `PENDING → ARMED → FIRED`
- `POST /api/trade-cards/:id/cancel` — user dismissed
- `POST /api/trade-cards/:id/expire` — automatic when `expiresAt` passes

Authentication: simple bearer token from `.env` (`VITE_TRADE_CARD_TOKEN`). The external LLM must include this header to post cards. No CSRF needed for the fire/cancel endpoints since they're called from the trusted frontend session.

### 3. UI component — TradeCardInbox

Add `src/frontend/components/Mobile/TradeCardInbox.tsx`:

- Renders as a sticky banner or modal at the top of the mobile UI when at least one PENDING card exists
- Card layout shows:
  - Direction badge (green LONG / red SHORT)
  - Symbol + entry type + entry price
  - SL / T1 / T2 prices with computed $ risk and $ reward
  - Size in shares and notional
  - R:R ratios
  - Regime tag
  - Rationale text (collapsible if long)
  - Countdown timer to expiry
  - **Big "FIRE" button** (filled, requires hold-to-confirm OR 1-sec delay to prevent accidental tap)
  - Smaller "Cancel" button

Poll `/api/trade-cards?status=PENDING` every 2 seconds, or use WebSocket / SSE if the app already has a realtime channel — check `src/frontend/lib/` for existing infra.

### 4. Fire flow

When user clicks FIRE:

1. Compute shares: `Math.floor(notional / entryPrice)`
2. Build Alpaca bracket order using the same code path as the existing OrderPanel:
   - Parent order: side = direction.toLowerCase() (buy/sell), type = entryType.toLowerCase(), qty = shares
   - Take profit leg: limit price = takeProfit1 (use T1, since user scales out manually on the runner)
   - Stop loss leg: stop price = stopLoss
3. Submit via the existing Alpaca client (find it in `src/backend/services/` or similar)
4. On success: mark card status = FIRED, store the Alpaca order ID, show toast "Order submitted: {orderId}"
5. On failure: mark card REJECTED, show the error, leave the card visible for retry/cancel

The user manages T2 (runner) and partial scale-outs manually in the existing UI — Tier 1 only fires the initial bracket.

### 5. Trade card log

Add `src/frontend/components/Mobile/TradeCardLog.tsx` accessible from settings:

- Shows all cards from the last 7 days with outcome (FIRED → P/L from Alpaca fill data, EXPIRED, CANCELED, REJECTED)
- Filterable by status and source
- Used for end-of-day review: "how many of the LLM's calls did I fire, and what was the win rate?"

### 6. Safety constraints (hard-coded, not configurable)

- **Max card notional: $20,000.** Reject incoming cards exceeding this.
- **Symbol allowlist: INTC, QQQ, IREN** (read from `VITE_MOBILE_DEFAULT_TICKERS`). Reject other symbols.
- **Reject card if existing position in the same symbol exists** (prevents accidental pyramiding).
- **Expire cards after 5 minutes by default.** Trade ideas go stale fast in scalping.
- **No card auto-fires.** FIRE button requires explicit human click. There is no auto-execute path in Tier 1.

## Non-goals (do NOT build)

- Auto-firing without human click (that's Tier 2, not now)
- Streaming chart data into the app (separate feature)
- Modifying T2 / runner logic — user keeps managing exits manually
- A chat UI inside the app — the LLM lives in a separate chat (Claude Desktop, web, etc.) and POSTs cards over HTTP

## Deliverables

1. `src/types/tradeCard.ts` — types
2. Backend endpoint files (4 routes above) wired into the existing server
3. `src/frontend/components/Mobile/TradeCardInbox.tsx` — UI
4. `src/frontend/components/Mobile/TradeCardLog.tsx` — UI
5. `.env.example` updated with `VITE_TRADE_CARD_TOKEN`
6. Add `TradeCardInbox` to the mobile shell so it renders globally
7. Brief curl example in a code comment showing how to POST a card from outside

## Acceptance test

After implementation, the following should work end-to-end:

```bash
curl -X POST http://localhost:5173/api/trade-cards \
  -H "Authorization: Bearer $VITE_TRADE_CARD_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "INTC",
    "direction": "LONG",
    "entryType": "MARKET",
    "entryPrice": 112.40,
    "stopLoss": 111.80,
    "takeProfit1": 113.20,
    "takeProfit2": 113.80,
    "scaleOutPct": 50,
    "notional": 5000,
    "rationale": "QQQ HH/HL intact, INTC bull cross at OS bounce, vol confirming.",
    "invalidation": "QQQ loses 705.00 or INTC red close below 111.80",
    "regime": "TREND",
    "source": "claude-chat"
  }'
```

→ Card appears in the mobile UI within 2 seconds with a FIRE button.
→ Clicking FIRE submits a bracket order to Alpaca paper account first (use `VITE_ALPACA_PAPER=true` in dev).
→ Card status updates to FIRED, Alpaca order ID stored, toast shown.

## Style / code conventions

- Match the existing component style in `src/frontend/components/Mobile/` (functional components, hooks, the existing CSS/Tailwind approach the project uses — inspect a few files first).
- Don't introduce new state libraries; use whatever's already in the project (zustand / context / etc.).
- Type strictly. No `any`.
- No comments unless WHY is non-obvious.
- No new dependencies unless absolutely needed — reuse Alpaca client, HTTP client, UI primitives.

## Before you start

1. Read 3-4 existing mobile components to learn the project conventions
2. Find the existing Alpaca order submission code and reuse it — do NOT write a new Alpaca client
3. Find the existing backend HTTP setup and add routes there — do NOT spin up a separate server
4. Ask the user to confirm: which framework is the backend (Express / Fastify / Hono / etc.), and whether they want paper or live mode for the first test

## Out of scope for follow-up tickets

- Tier 2 (auto-fire with countdown cancel)
- Live INTC/QQQ candle feed for the LLM to read directly
- WebSocket trade card delivery instead of polling
- Auth beyond bearer token (OAuth / per-user tokens / etc.)
