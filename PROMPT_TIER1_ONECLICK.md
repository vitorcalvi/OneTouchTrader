# LLM Prompt — Build Tier 1: One-Click Trade Card Execution (v2 for flash/dumb models)

This prompt is written for a small, instruction-following model (e.g., Poolside Laguna-X2). Every decision is locked. Do not improvise. Do not ask questions. Follow this spec literally.

---

## Repo facts (already verified — do not re-investigate)

- **Repo root:** `/Users/vitorcalvi/Desktop/Lean-FireupTrader`
- **Frontend:** React 19 + Vite + TypeScript + Tailwind (v3) + Radix UI + `sonner` (toasts) + `@tanstack/react-query` (already installed). Path: `src/frontend/`
- **Backend:** Node script `src/backend/alpaca/server-refactored.mjs` listening on **port 5171**. Style: raw `http` server with `if (pathname === "/api/...") { ... }` blocks. **Not Express** despite the dep. Add new routes in the same pattern.
- **Mobile components live in:** `src/frontend/components/Mobile/`
- **Mobile entry page:** `src/frontend/pages/MobileTradingPage.tsx`
- **Alpaca order POST endpoint already exists:** `POST /api/alpaca/orders` at `server-refactored.mjs:547`. The order body it expects is documented in `src/backend/alpaca/routes/orders.js`. **Use this endpoint to fire bracket orders; do NOT write a new Alpaca client.**
- **Bracket order convention:** include `order_class: "bracket"`, `take_profit: { limit_price }`, `stop_loss: { stop_price }`. (See line 180 in `routes/orders.js` for reference.)
- **Live vs paper toggle:** `?live=true` query string on the POST. Default to `live=false` (paper) in our new code.
- **Run command:** `yarn dev` runs both Vite and the backend via `concurrently`.

## Goal

External LLM (Claude in a chat) POSTs a structured **TradeCard** to the backend. The card shows up as a sticky banner in the mobile UI. User reads the card and taps **FIRE** once. The frontend submits the bracket order to the existing `/api/alpaca/orders` endpoint. No auto-fire. No streaming. No new dependencies.

---

## File-by-file deliverables (create exactly these files)

### File 1: `src/shared/tradeCard.ts` (new)

```ts
export type TradeCardStatus =
  | "PENDING"
  | "FIRED"
  | "EXPIRED"
  | "CANCELED"
  | "REJECTED";

export type TradeCardDirection = "LONG" | "SHORT";
export type TradeCardEntryType = "MARKET" | "LIMIT";
export type TradeCardRegime = "TREND" | "CHOP" | "NEWS_WHIPSAW";

export interface TradeCard {
  id: string;
  createdAt: string;
  expiresAt: string;
  source: string;
  symbol: string;
  direction: TradeCardDirection;
  entryType: TradeCardEntryType;
  entryPrice: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2?: number;
  notional: number;
  shares: number;
  rationale: string;
  invalidation: string;
  regime: TradeCardRegime;
  status: TradeCardStatus;
  alpacaOrderId?: string;
  rejectionReason?: string;
  firedAt?: string;
}

export const TRADE_CARD_MAX_NOTIONAL = 20000;
export const TRADE_CARD_SYMBOL_ALLOWLIST = ["INTC", "QQQ", "IREN"] as const;
export const TRADE_CARD_DEFAULT_EXPIRY_MS = 5 * 60 * 1000;
```

### File 2: `src/backend/alpaca/routes/trade-cards.mjs` (new)

In-memory store + 4 pure handler functions. No DB. No Redis.

```js
import { randomUUID } from "node:crypto";

const MAX_NOTIONAL = 20000;
const SYMBOL_ALLOWLIST = new Set(["INTC", "QQQ", "IREN"]);
const DEFAULT_EXPIRY_MS = 5 * 60 * 1000;

const cards = new Map();

function expireStale() {
  const now = Date.now();
  for (const card of cards.values()) {
    if (card.status === "PENDING" && new Date(card.expiresAt).getTime() < now) {
      card.status = "EXPIRED";
    }
  }
}

function authOk(req, expectedToken) {
  const header = req.headers["authorization"] || "";
  return header === `Bearer ${expectedToken}`;
}

export async function handlePostTradeCard(body, expectedToken, req) {
  if (!authOk(req, expectedToken)) {
    return { status: 401, body: { error: "unauthorized" } };
  }
  const required = [
    "symbol", "direction", "entryType", "entryPrice",
    "stopLoss", "takeProfit1", "notional", "rationale",
    "invalidation", "regime", "source"
  ];
  for (const k of required) {
    if (body[k] === undefined || body[k] === null) {
      return { status: 400, body: { error: `missing field: ${k}` } };
    }
  }
  if (!SYMBOL_ALLOWLIST.has(body.symbol)) {
    return { status: 400, body: { error: "symbol not allowed" } };
  }
  if (body.notional > MAX_NOTIONAL) {
    return { status: 400, body: { error: "notional exceeds max" } };
  }
  if (!["LONG", "SHORT"].includes(body.direction)) {
    return { status: 400, body: { error: "invalid direction" } };
  }
  if (!["MARKET", "LIMIT"].includes(body.entryType)) {
    return { status: 400, body: { error: "invalid entryType" } };
  }

  const id = randomUUID();
  const now = new Date();
  const card = {
    id,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + DEFAULT_EXPIRY_MS).toISOString(),
    source: String(body.source),
    symbol: body.symbol,
    direction: body.direction,
    entryType: body.entryType,
    entryPrice: Number(body.entryPrice),
    stopLoss: Number(body.stopLoss),
    takeProfit1: Number(body.takeProfit1),
    takeProfit2: body.takeProfit2 != null ? Number(body.takeProfit2) : undefined,
    notional: Number(body.notional),
    shares: Math.floor(Number(body.notional) / Number(body.entryPrice)),
    rationale: String(body.rationale),
    invalidation: String(body.invalidation),
    regime: body.regime,
    status: "PENDING",
  };
  cards.set(id, card);
  return { status: 201, body: card };
}

export async function handleGetTradeCards(searchParams) {
  expireStale();
  const status = searchParams.get("status");
  const all = Array.from(cards.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const filtered = status ? all.filter((c) => c.status === status) : all;
  return { status: 200, body: filtered };
}

export async function handleFireTradeCard(id, fireOrderFn) {
  expireStale();
  const card = cards.get(id);
  if (!card) return { status: 404, body: { error: "not found" } };
  if (card.status !== "PENDING") {
    return { status: 409, body: { error: `cannot fire status=${card.status}` } };
  }
  try {
    const orderBody = {
      symbol: card.symbol,
      qty: String(card.shares),
      side: card.direction === "LONG" ? "buy" : "sell",
      type: card.entryType.toLowerCase(),
      time_in_force: "day",
      order_class: "bracket",
      take_profit: { limit_price: String(card.takeProfit1) },
      stop_loss: { stop_price: String(card.stopLoss) },
    };
    if (card.entryType === "LIMIT") {
      orderBody.limit_price = String(card.entryPrice);
    }
    const alpacaOrder = await fireOrderFn(orderBody);
    card.status = "FIRED";
    card.alpacaOrderId = alpacaOrder?.id || null;
    card.firedAt = new Date().toISOString();
    return { status: 200, body: card };
  } catch (err) {
    card.status = "REJECTED";
    card.rejectionReason = err?.message || "unknown error";
    return { status: 502, body: card };
  }
}

export async function handleCancelTradeCard(id) {
  const card = cards.get(id);
  if (!card) return { status: 404, body: { error: "not found" } };
  if (card.status !== "PENDING") {
    return { status: 409, body: { error: `cannot cancel status=${card.status}` } };
  }
  card.status = "CANCELED";
  return { status: 200, body: card };
}
```

### File 3: edits to `src/backend/alpaca/server-refactored.mjs`

Near the top, after existing imports, add:

```js
import {
  handlePostTradeCard,
  handleGetTradeCards,
  handleFireTradeCard,
  handleCancelTradeCard,
} from "./routes/trade-cards.mjs";

const TRADE_CARD_TOKEN = process.env.VITE_TRADE_CARD_TOKEN || "dev-token";
```

Inside the request handler, **before** the final 404 fallback, add these route blocks (match the existing `if (pathname === ...)` style):

```js
if (pathname === "/api/trade-cards" && req.method === "POST") {
  const body = await readJsonBody(req);
  const result = await handlePostTradeCard(body, TRADE_CARD_TOKEN, req);
  return writeJson(res, result.status, result.body);
}
if (pathname === "/api/trade-cards" && req.method === "GET") {
  const result = await handleGetTradeCards(searchParams);
  return writeJson(res, result.status, result.body);
}
const fireMatch = pathname.match(/^\/api\/trade-cards\/([^/]+)\/fire$/);
if (fireMatch && req.method === "POST") {
  const id = fireMatch[1];
  const fireOrderFn = async (orderBody) => {
    const url = `http://localhost:5171/api/alpaca/orders?live=false`;
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(orderBody),
    });
    if (!r.ok) throw new Error(`alpaca order failed: ${r.status} ${await r.text()}`);
    return r.json();
  };
  const result = await handleFireTradeCard(id, fireOrderFn);
  return writeJson(res, result.status, result.body);
}
const cancelMatch = pathname.match(/^\/api\/trade-cards\/([^/]+)\/cancel$/);
if (cancelMatch && req.method === "POST") {
  const result = await handleCancelTradeCard(cancelMatch[1]);
  return writeJson(res, result.status, result.body);
}
```

If `readJsonBody` and `writeJson` helpers don't exist in `server-refactored.mjs`, search for how the existing `POST /api/alpaca/orders` block reads JSON and writes responses, and mirror that exact pattern. **Do not invent new helpers.** Reuse whatever the existing POST handler uses.

If `live=true` is needed later, change the `live=false` querystring above. Default is paper.

### File 4: `src/frontend/services/tradeCards.ts` (new)

```ts
import type { TradeCard, TradeCardStatus } from "../../shared/tradeCard";

const BASE = "http://localhost:5171/api/trade-cards";

export async function fetchTradeCards(status?: TradeCardStatus): Promise<TradeCard[]> {
  const url = status ? `${BASE}?status=${status}` : BASE;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`failed to fetch trade cards: ${r.status}`);
  return r.json();
}

export async function fireTradeCard(id: string): Promise<TradeCard> {
  const r = await fetch(`${BASE}/${id}/fire`, { method: "POST" });
  if (!r.ok) throw new Error(`fire failed: ${r.status} ${await r.text()}`);
  return r.json();
}

export async function cancelTradeCard(id: string): Promise<TradeCard> {
  const r = await fetch(`${BASE}/${id}/cancel`, { method: "POST" });
  if (!r.ok) throw new Error(`cancel failed: ${r.status} ${await r.text()}`);
  return r.json();
}
```

### File 5: `src/frontend/components/Mobile/TradeCardInbox.tsx` (new)

```tsx
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  fetchTradeCards,
  fireTradeCard,
  cancelTradeCard,
} from "../../services/tradeCards";
import type { TradeCard } from "../../../shared/tradeCard";

export function TradeCardInbox() {
  const qc = useQueryClient();
  const { data: cards } = useQuery({
    queryKey: ["tradeCards", "PENDING"],
    queryFn: () => fetchTradeCards("PENDING"),
    refetchInterval: 2000,
  });

  const fireMut = useMutation({
    mutationFn: (id: string) => fireTradeCard(id),
    onSuccess: (card) => {
      toast.success(`Order fired: ${card.alpacaOrderId ?? "submitted"}`);
      qc.invalidateQueries({ queryKey: ["tradeCards"] });
    },
    onError: (err: Error) => toast.error(`Fire failed: ${err.message}`),
  });

  const cancelMut = useMutation({
    mutationFn: (id: string) => cancelTradeCard(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tradeCards"] }),
  });

  const pending = cards ?? [];
  if (pending.length === 0) return null;

  return (
    <div className="fixed top-2 left-2 right-2 z-50 flex flex-col gap-2">
      {pending.map((card) => (
        <TradeCardItem
          key={card.id}
          card={card}
          onFire={() => fireMut.mutate(card.id)}
          onCancel={() => cancelMut.mutate(card.id)}
          firing={fireMut.isPending}
        />
      ))}
    </div>
  );
}

function TradeCardItem({
  card,
  onFire,
  onCancel,
  firing,
}: {
  card: TradeCard;
  onFire: () => void;
  onCancel: () => void;
  firing: boolean;
}) {
  const [armed, setArmed] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    const tick = () => {
      const ms = new Date(card.expiresAt).getTime() - Date.now();
      setSecondsLeft(Math.max(0, Math.ceil(ms / 1000)));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [card.expiresAt]);

  useEffect(() => {
    if (!armed) return;
    const id = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(id);
  }, [armed]);

  const risk = Math.abs(card.entryPrice - card.stopLoss) * card.shares;
  const reward1 = Math.abs(card.takeProfit1 - card.entryPrice) * card.shares;
  const rr1 = (reward1 / risk).toFixed(1);

  const dirColor =
    card.direction === "LONG"
      ? "bg-green-600 text-black"
      : "bg-red-600 text-white";

  return (
    <div className="glass-card p-3 border border-yellow-500/50 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded text-xs font-bold ${dirColor}`}>
            {card.direction}
          </span>
          <span className="text-sm font-bold">{card.symbol}</span>
          <span className="text-xs text-app-textMuted">
            {card.entryType} @ {card.entryPrice.toFixed(2)}
          </span>
        </div>
        <span className="text-xs text-app-textMuted">{secondsLeft}s</span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <div className="text-app-textMuted">SL</div>
          <div className="font-mono">{card.stopLoss.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-app-textMuted">T1</div>
          <div className="font-mono">{card.takeProfit1.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-app-textMuted">Size</div>
          <div className="font-mono">{card.shares}sh / ${card.notional}</div>
        </div>
      </div>

      <div className="text-xs text-app-textMuted">
        Risk ${risk.toFixed(0)} → Reward ${reward1.toFixed(0)} ({rr1}:1) · {card.regime}
      </div>

      <div className="text-xs">{card.rationale}</div>

      <div className="flex gap-2 mt-1">
        <button
          onClick={onCancel}
          className="flex-1 py-2 rounded bg-app-button text-xs"
          disabled={firing}
        >
          Cancel
        </button>
        {!armed ? (
          <button
            onClick={() => setArmed(true)}
            className="flex-1 py-2 rounded bg-yellow-500 text-black text-xs font-bold"
            disabled={firing || secondsLeft === 0}
          >
            ARM
          </button>
        ) : (
          <button
            onClick={onFire}
            className="flex-1 py-2 rounded bg-red-600 text-white text-xs font-bold animate-pulse"
            disabled={firing}
          >
            {firing ? "FIRING..." : "FIRE 🔥"}
          </button>
        )}
      </div>
    </div>
  );
}
```

### File 6: edit `src/frontend/pages/MobileTradingPage.tsx`

Add this import near the top with the other Mobile component imports:

```ts
import { TradeCardInbox } from "../components/Mobile/TradeCardInbox";
```

Render `<TradeCardInbox />` once at the **top of the returned JSX**, as a sibling of the existing root container (so the fixed-position banner overlays everything). Do not nest it inside other components.

### File 7: edit `.env`

Append:

```
VITE_TRADE_CARD_TOKEN=dev-token-change-me
```

### File 8: edit `src/frontend/components/Mobile/index.ts`

Add:

```ts
export { TradeCardInbox } from "./TradeCardInbox";
```

---

## What you must NOT do

- Do not install any new npm packages. Use only deps already in `package.json`.
- Do not add Express. Use the existing raw-`http` route style in `server-refactored.mjs`.
- Do not write a new Alpaca client. Call `POST /api/alpaca/orders` via `fetch` from within the fire handler.
- Do not add tests in this ticket.
- Do not auto-fire on a timer. The user must click ARM then FIRE manually.
- Do not modify existing components except `MobileTradingPage.tsx` and `index.ts`.
- Do not change the existing Alpaca order POST handler.
- Do not add comments in code beyond what is shown in the snippets above.

---

## Acceptance test (do this last, after all files created)

1. Run `yarn dev`.
2. In another terminal:
   ```bash
   curl -X POST http://localhost:5171/api/trade-cards \
     -H "Authorization: Bearer dev-token-change-me" \
     -H "Content-Type: application/json" \
     -d '{
       "symbol":"INTC","direction":"LONG","entryType":"MARKET","entryPrice":112.40,
       "stopLoss":111.80,"takeProfit1":113.20,"takeProfit2":113.80,
       "notional":5000,"rationale":"Test card",
       "invalidation":"QQQ loses 705","regime":"TREND","source":"curl-test"
     }'
   ```
3. Open the mobile page in the browser. Within 2 seconds, a yellow-bordered banner appears at the top with LONG INTC details, ARM button.
4. Tap ARM → button changes to red pulsing FIRE.
5. Tap FIRE → bracket order POSTs to `/api/alpaca/orders?live=false` (paper). Toast shows "Order fired".
6. The card disappears from PENDING list.
7. Repeat with `notional: 25000` → backend rejects with 400.
8. Repeat with `symbol: "TSLA"` → backend rejects with 400.

If any step fails, debug it before claiming completion.

---

## Done = all 8 files match this spec + acceptance test passes
