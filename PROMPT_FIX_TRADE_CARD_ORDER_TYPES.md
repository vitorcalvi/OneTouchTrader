# Fix Trade Card Order Types + Pre-Fire Drift Check + Security Hygiene

You are picking up from a live paper-trading session that exposed three concrete bugs in the trade-card system. Implement the three fixes below. **Do not commit anything** — leave changes staged for human review.

---

## Context

`src/backend/alpaca/routes/trade-cards.mjs` implements an in-memory trade-card workflow: POST creates a PENDING card, POST `/fire` builds a bracket order and submits it to `/api/alpaca/orders`. Today's session fired a "SHORT the breakdown of 116.50" thesis on INTC. The order placed was:

```
SELL LIMIT 116.50 (intent: catch continuation if INTC trades below 116.50)
```

What actually happened: a LIMIT SELL @ 116.50 means *"sell at any price ≥ 116.50."* The bid at fill time was 117.69 (spike against the thesis between read and fire), so the order filled marketable at 117.69 and the SL at 117.10 triggered instantly. Net loss small (paper), but the workflow has structural bugs the operator needs fixed before the next live attempt.

Three problems:

1. **No way to express a stop-entry order.** `entryType` only accepts `MARKET` or `LIMIT`. Breakdown shorts and breakout longs cannot be expressed correctly — they need `STOP` or `STOP_LIMIT`.
2. **No drift guard at fire time.** The card is built from a price the operator saw; by the time the operator taps FIRE seconds later, price may have moved against the thesis. The fire path should refetch the live quote and abort if drift exceeds a threshold.
3. **`.env` is tracked in git and there is no `.gitignore`.** The repo was privatized today (good), but `.env` should be untracked going forward.

---

## Task 1 — Add `STOP` and `STOP_LIMIT` entry types

### Files

- `src/shared/tradeCard.ts` — add to the entry-type union
- `src/backend/alpaca/routes/trade-cards.mjs` — extend validation in `handlePostTradeCard`, extend order-body construction in `handleFireTradeCard`

### Schema change

Add a new optional field `stopTriggerPrice: number` to the trade card.

- For `entryType: "STOP"` — `stopTriggerPrice` is REQUIRED. `entryPrice` is unused (set the same value or document as ignored).
- For `entryType: "STOP_LIMIT"` — both `stopTriggerPrice` (the trigger) AND `entryPrice` (the limit price after trigger) are REQUIRED.
- For `entryType: "MARKET"` / `"LIMIT"` — `stopTriggerPrice` should be absent or ignored.

### Validation rules in `handlePostTradeCard`

```
entryType in {MARKET, LIMIT, STOP, STOP_LIMIT}

if entryType in {STOP, STOP_LIMIT}: stopTriggerPrice required, > 0

For SHORT entries:
  STOP / STOP_LIMIT: stopTriggerPrice MUST be < current-quote-bid
    (we only catch breakdowns; rejecting an above-market short-stop
     prevents the exact bug that happened today)
For LONG entries:
  STOP / STOP_LIMIT: stopTriggerPrice MUST be > current-quote-ask
    (breakout longs only)
```

To know "current quote" at POST time, fetch from `http://localhost:5171/api/alpaca/quotes?symbols=<SYMBOL>` and read `data.quotes.<SYMBOL>.bp` (bid) and `.ap` (ask). If the quote endpoint fails or returns no data, accept the card without this check and add a field `quoteUnavailable: true` to the stored card.

### Order-body construction in `handleFireTradeCard`

Today the function builds:
```js
{
  symbol, qty, side, type: entryType.toLowerCase(), time_in_force: "day",
  order_class: "bracket",
  take_profit: { limit_price: String(takeProfit1) },
  stop_loss: { stop_price: String(stopLoss) },
}
// then: if (LIMIT) orderBody.limit_price = entryPrice
```

Extend it so that:

- `MARKET` — unchanged
- `LIMIT` — unchanged
- `STOP` — `type: "stop"`, `orderBody.stop_price = String(stopTriggerPrice)`
- `STOP_LIMIT` — `type: "stop_limit"`, `orderBody.stop_price = String(stopTriggerPrice)`, `orderBody.limit_price = String(entryPrice)`

### Acceptance tests (provide curl outputs in the execution report)

```bash
# A. valid SHORT stop-entry — should return 201
curl -s -X POST http://localhost:5171/api/trade-cards \
  -H "Authorization: Bearer dev-token-change-me" \
  -H "Content-Type: application/json" \
  -d '{
    "symbol":"INTC","direction":"SHORT","entryType":"STOP",
    "entryPrice":116.30,"stopTriggerPrice":116.30,
    "stopLoss":117.10,"takeProfit1":115.00,"notional":8000,
    "rationale":"breakdown short stop-entry test",
    "invalidation":"reclaim 117.10","regime":"trend","source":"test"
  }'

# B. invalid SHORT stop above market — should return 400
#    (stopTriggerPrice higher than current bid)
# Use a clearly-above-market price like 999.

# C. valid LONG breakout stop_limit — should return 201
#    (stopTriggerPrice above current ask)

# D. POST then GET /api/trade-cards and confirm the stored card
#    contains stopTriggerPrice and entryType correctly.
```

---

## Task 2 — Pre-fire drift guard

### File
`src/backend/alpaca/routes/trade-cards.mjs`, function `handleFireTradeCard`.

### Behavior

Before calling `fireOrderFn(orderBody)`, fetch the current quote for `card.symbol` from `http://localhost:5171/api/alpaca/quotes?symbols=<SYMBOL>`. Compute mid price as `(bid + ask) / 2`.

Compare mid to the card's reference price:
- For `LIMIT` cards — reference = `entryPrice`
- For `STOP` / `STOP_LIMIT` cards — reference = `stopTriggerPrice`
- For `MARKET` cards — reference = `entryPrice` (operator's expected fill)

If `abs(mid − reference) / reference > 0.005` (0.5% drift), abort:
- Set `card.status = "REJECTED"`
- Set `card.rejectionReason = "drift guard: mid X drifted Y% from reference Z"`
- Return `{ status: 409, body: card }`
- DO NOT submit to Alpaca

If the quote fetch fails, log the failure and proceed (do not block trading on a broker-API hiccup). Record `card.driftCheckSkipped = true`.

### Acceptance tests

```bash
# A. Create a LIMIT card with entryPrice far from market (e.g. 1.00 on INTC)
#    then immediately POST /:id/fire → should return 409 with rejectionReason
#    mentioning "drift guard"

# B. Create a LIMIT card at a price within 0.5% of current mid
#    then POST /:id/fire → should attempt order normally
```

Show both curl invocations and their responses in the execution report.

---

## Task 3 — Security hygiene

### Files

- Create `.gitignore` at repo root
- Untrack `.env` (`git rm --cached .env`)

### `.gitignore` contents

```
# Environment
.env
.env.local
.env.*.local

# Node
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Build
dist/
build/
*.tsbuildinfo

# IDE / OS
.DS_Store
.vscode/
.idea/
*.swp
*.swo

# Logs
*.log
logs/
```

Do not commit. After running `git rm --cached .env`, the file remains on disk untouched (verify with a sample read of one line — do NOT print secret contents). The operator will commit manually.

---

## Out of scope (do NOT do)

- Do not add a `live: boolean` field to the trade card. The operator is deferring live trading until the order-type bugs and drift guard are verified on paper. Touching live routing now is explicitly forbidden.
- Do not modify `server-refactored.mjs:1235` (the hard-coded `?live=false`). Leave it alone.
- Do not add new npm dependencies.
- Do not refactor unrelated code.
- Do not commit anything.

---

## Deliverable

Create `EXECUTION_REPORT_FIX_ORDER_TYPES.md` at repo root with:

1. **Summary** — what changed, file by file, with line numbers.
2. **Schema diff** — the exact change to `TradeCardEntryType` and the new `stopTriggerPrice` field.
3. **Acceptance test outputs** — actual curl requests + actual response bodies for every test listed under Tasks 1 and 2 (A, B, C, D for Task 1; A, B for Task 2). Truncate response bodies sensibly; do not omit them.
4. **Security task confirmation** — show that `.gitignore` exists (`cat .gitignore` or equivalent) and that `git ls-files .env` returns empty. Do not print `.env` contents.
5. **Open questions / deviations** — if you had to deviate from this spec, list each deviation with a one-line reason.

The operator will read the report, re-run a subset of the curl tests independently, then resume trading on paper. Stay tight — no decorative prose in the report, just verifiable facts.
