# PROMPT — Tier 2: Structured Snapshot + Rule Engine + Cooldown

**Target executor:** Poolside / Laguna-X2.
**Goal:** Give Claude (the AI in the loop) deterministic, numeric inputs and hard guardrails so trade proposals stop being chart-eyeball guesses.
**Out of scope:** UI changes, Postgres, MCP server, auth. This is backend-only — adds 3 endpoints and wires a cooldown check into the existing trade-card POST.

---

## 0. Why this exists (read once, then execute)

Yesterday's losing calls weren't bad luck — they were Claude pattern-matching on screenshot pixels with no ground-truth numbers and no rule constraints. Three upgrades fix this:

1. **`GET /api/snapshot`** — single call returning bars + derived metrics (VWAP, ATR, opening-range, volume ratio, distance-from-key-levels) + open positions + recent cards + cooldown state. One paste replaces five screenshots.
2. **`POST /api/evaluate`** — server-side rule engine that takes a proposed card and returns `{decision: "ALLOW"|"BLOCK", reasons: [...]}`. Rules live in a JSON config so they're editable without redeploy.
3. **Cooldown enforcement** — `POST /api/trade-cards` rejects any card for a symbol whose previous card fired or canceled within the last 30 minutes. Hard wall against flip-flopping.

After this ships, the morning workflow becomes:
- User: `curl https://api.fireup.io/api/snapshot?symbols=QQQ,INTC | pbcopy` then paste into Claude
- Claude: reads numbers, proposes card, calls `/api/evaluate` first → only POSTs if ALLOW
- Cooldown prevents the second-trade-too-soon mistake regardless of what Claude tries

---

## 1. Locked decisions

| Item | Value |
|---|---|
| Snapshot symbols allowlist | `INTC`, `QQQ`, `IREN` (same as `TRADE_CARD_SYMBOL_ALLOWLIST`) |
| Snapshot timeframes returned | `1Min` (last 60), `5Min` (last 60), `1Day` (last 5) |
| Cooldown window | **30 minutes** from last card's `firedAt` OR `canceledAt` (whichever is more recent) per symbol |
| Cooldown bypass | None in v1. Hard rule. |
| Rule config path | `src/backend/alpaca/rules/trade-rules.json` (committed; edit + redeploy) |
| Derived metrics computed | VWAP (session), ATR(14), opening-range (first 5 min), volume vs 20-bar avg, prev-day high/low, distance-from-prev-high, distance-from-prev-low, last 3 swing highs/lows on 5m |
| Auth on snapshot | Bearer `TRADE_CARD_TOKEN` (same as trade-cards POST) |
| Auth on evaluate | Bearer `TRADE_CARD_TOKEN` |
| Caching | None in v1 (Alpaca limits are generous; revisit if rate-limited) |

---

## 2. Files to create / edit

### 2.1 `src/backend/alpaca/lib/indicators.mjs` (new)

```javascript
// Pure functions. No I/O. Easy to unit-test.

export function vwap(bars) {
  let cumPV = 0, cumV = 0;
  for (const b of bars) {
    const typical = (b.h + b.l + b.c) / 3;
    cumPV += typical * b.v;
    cumV += b.v;
  }
  return cumV === 0 ? null : +(cumPV / cumV).toFixed(4);
}

export function atr(bars, period = 14) {
  if (bars.length < period + 1) return null;
  const trs = [];
  for (let i = 1; i < bars.length; i++) {
    const h = bars[i].h, l = bars[i].l, pc = bars[i - 1].c;
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  const recent = trs.slice(-period);
  return +(recent.reduce((a, b) => a + b, 0) / period).toFixed(4);
}

export function openingRange(bars1m, minutes = 5) {
  // bars1m must include the session open in chronological order
  const slice = bars1m.slice(0, minutes);
  if (slice.length === 0) return null;
  return {
    high: +Math.max(...slice.map(b => b.h)).toFixed(2),
    low: +Math.min(...slice.map(b => b.l)).toFixed(2),
    volume: slice.reduce((a, b) => a + b.v, 0),
  };
}

export function volumeRatio(bars, lookback = 20) {
  if (bars.length < lookback + 1) return null;
  const recent = bars[bars.length - 1].v;
  const avg = bars.slice(-lookback - 1, -1).reduce((a, b) => a + b.v, 0) / lookback;
  return avg === 0 ? null : +(recent / avg).toFixed(2);
}

export function swings(bars, lookback = 3) {
  // Returns last N swing highs and lows on the given bars (simple pivot: bar higher/lower than 2 on each side)
  const highs = [], lows = [];
  for (let i = 2; i < bars.length - 2; i++) {
    const b = bars[i];
    if (b.h > bars[i-1].h && b.h > bars[i-2].h && b.h > bars[i+1].h && b.h > bars[i+2].h) {
      highs.push({ t: bars[i].t, price: +b.h.toFixed(2) });
    }
    if (b.l < bars[i-1].l && b.l < bars[i-2].l && b.l < bars[i+1].l && b.l < bars[i+2].l) {
      lows.push({ t: bars[i].t, price: +b.l.toFixed(2) });
    }
  }
  return { highs: highs.slice(-lookback), lows: lows.slice(-lookback) };
}
```

### 2.2 `src/backend/alpaca/routes/snapshot.mjs` (new)

```javascript
import { getBars } from "../alpaca-client.mjs"; // adjust import to actual path used by existing /api/alpaca/bars
import { vwap, atr, openingRange, volumeRatio, swings } from "../lib/indicators.mjs";
import { getRecentCards } from "./trade-cards.mjs"; // exported helper, see §2.4

const SYMBOLS = ["INTC", "QQQ", "IREN"];

// Normalize Alpaca bar shape into compact {t,o,h,l,c,v}
function normalize(bar) {
  return {
    t: bar.t || bar.Timestamp,
    o: +bar.o || +bar.OpenPrice,
    h: +bar.h || +bar.HighPrice,
    l: +bar.l || +bar.LowPrice,
    c: +bar.c || +bar.ClosePrice,
    v: +bar.v || +bar.Volume,
  };
}

async function buildSymbolSnapshot(symbol) {
  const [bars1m, bars5m, bars1d] = await Promise.all([
    getBars(symbol, "1Min", 60).then(r => (r.bars?.[symbol] || []).map(normalize)),
    getBars(symbol, "5Min", 60).then(r => (r.bars?.[symbol] || []).map(normalize)),
    getBars(symbol, "1Day", 5).then(r => (r.bars?.[symbol] || []).map(normalize)),
  ]);

  const prev = bars1d.length >= 2 ? bars1d[bars1d.length - 2] : null;
  const last1m = bars1m[bars1m.length - 1] || null;

  return {
    symbol,
    last: last1m ? { price: last1m.c, t: last1m.t } : null,
    bars: {
      "1Min": bars1m,
      "5Min": bars5m,
      "1Day": bars1d,
    },
    derived: {
      vwap: vwap(bars1m),
      atr5m_14: atr(bars5m, 14),
      openingRange1m_5: openingRange(bars1m, 5),
      volumeRatio1m_20: volumeRatio(bars1m, 20),
      prevDay: prev ? { high: +prev.h.toFixed(2), low: +prev.l.toFixed(2), close: +prev.c.toFixed(2) } : null,
      distFromPrevHigh: prev && last1m ? +(last1m.c - prev.h).toFixed(2) : null,
      distFromPrevLow:  prev && last1m ? +(last1m.c - prev.l).toFixed(2) : null,
      swings5m: swings(bars5m, 3),
    },
  };
}

export async function handleGetSnapshot(req, res, searchParams) {
  const requested = (searchParams.get("symbols") || SYMBOLS.join(","))
    .split(",").map(s => s.trim().toUpperCase()).filter(s => SYMBOLS.includes(s));

  if (requested.length === 0) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "no valid symbols requested" }));
    return;
  }

  try {
    const symbols = await Promise.all(requested.map(buildSymbolSnapshot));
    const recentCards = getRecentCards(60 * 60 * 1000); // last 60 min
    const cooldowns = computeCooldowns(recentCards);

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({
      ts: new Date().toISOString(),
      symbols,
      recentCards,
      cooldowns, // { INTC: { activeUntil: "...", reason: "..." }, ... }
    }, null, 2));
  } catch (err) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: err.message }));
  }
}

export function computeCooldowns(recentCards, windowMs = 30 * 60 * 1000) {
  const out = {};
  const now = Date.now();
  for (const card of recentCards) {
    const eventTs = card.firedAt || card.canceledAt;
    if (!eventTs) continue;
    const eventMs = new Date(eventTs).getTime();
    const activeUntil = eventMs + windowMs;
    if (activeUntil > now) {
      const existing = out[card.symbol];
      if (!existing || activeUntil > new Date(existing.activeUntil).getTime()) {
        out[card.symbol] = {
          activeUntil: new Date(activeUntil).toISOString(),
          reason: `last card ${card.firedAt ? "FIRED" : "CANCELED"} at ${eventTs}`,
          cardId: card.id,
        };
      }
    }
  }
  return out;
}
```

### 2.3 `src/backend/alpaca/rules/trade-rules.json` (new)

```json
{
  "version": 1,
  "rules": [
    {
      "id": "cooldown",
      "kind": "hard",
      "description": "30-min cooldown per symbol from last fire/cancel"
    },
    {
      "id": "regime_match_long",
      "kind": "soft",
      "applies": { "direction": "LONG" },
      "require": [
        { "field": "QQQ.derived.vwap", "op": "lt_field", "value": "QQQ.last.price", "msg": "QQQ should be above VWAP for LONG" }
      ]
    },
    {
      "id": "regime_match_short",
      "kind": "soft",
      "applies": { "direction": "SHORT" },
      "require": [
        { "field": "QQQ.derived.vwap", "op": "gt_field", "value": "QQQ.last.price", "msg": "QQQ should be below VWAP for SHORT" }
      ]
    },
    {
      "id": "volume_confirms",
      "kind": "soft",
      "require": [
        { "field": "{symbol}.derived.volumeRatio1m_20", "op": "gte", "value": 1.0, "msg": "entry bar volume should be >= 20-bar avg" }
      ]
    },
    {
      "id": "rr_minimum",
      "kind": "hard",
      "compute": "rr1",
      "op": "gte",
      "value": 1.0,
      "msg": "R:R on T1 must be >= 1.0"
    },
    {
      "id": "stop_distance_sane",
      "kind": "hard",
      "compute": "stop_distance_pct",
      "op": "lte",
      "value": 0.02,
      "msg": "stop distance > 2% of entry — likely a typo"
    }
  ]
}
```

### 2.4 `src/backend/alpaca/routes/trade-cards.mjs` (edit existing)

Add three things:

**a)** Export a helper used by the snapshot route:

```javascript
export function getRecentCards(windowMs = 60 * 60 * 1000) {
  const cutoff = Date.now() - windowMs;
  return Array.from(store.values())
    .filter(c => new Date(c.createdAt).getTime() >= cutoff)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}
```

**b)** In `handlePostTradeCard`, **before** writing to `store`, check cooldown:

```javascript
import { computeCooldowns } from "./snapshot.mjs";

// inside handlePostTradeCard, after symbol validation, before creating card:
const cooldowns = computeCooldowns(getRecentCards(60 * 60 * 1000));
const cd = cooldowns[card.symbol];
if (cd) {
  res.statusCode = 429;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({
    error: "cooldown_active",
    symbol: card.symbol,
    activeUntil: cd.activeUntil,
    reason: cd.reason,
  }));
  return;
}
```

**c)** When a card fires or cancels, write timestamp to `firedAt` / `canceledAt` on the card (snapshot route reads these — confirm both already exist; if not, add them in the corresponding handlers).

### 2.5 `src/backend/alpaca/routes/evaluate.mjs` (new)

```javascript
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RULES_PATH = join(__dirname, "..", "rules", "trade-rules.json");

function loadRules() {
  return JSON.parse(readFileSync(RULES_PATH, "utf-8"));
}

function resolveField(path, ctx, symbol) {
  // "{symbol}.derived.vwap" → ctx[symbol].derived.vwap
  // "QQQ.last.price" → ctx.QQQ.last.price
  const resolved = path.replace("{symbol}", symbol);
  return resolved.split(".").reduce((acc, k) => (acc == null ? null : acc[k]), ctx);
}

function evalRule(rule, card, snapshot) {
  const reasons = [];
  if (rule.applies && rule.applies.direction && rule.applies.direction !== card.direction) {
    return { ok: true, skipped: true };
  }

  if (rule.compute === "rr1") {
    const risk = Math.abs(card.entryPrice - card.stopLoss);
    const reward = Math.abs(card.takeProfit1 - card.entryPrice);
    const rr = risk === 0 ? 0 : reward / risk;
    const ok = compareOp(rr, rule.op, rule.value);
    if (!ok) reasons.push(`${rule.id}: rr1=${rr.toFixed(2)} ${rule.op} ${rule.value} → ${rule.msg}`);
    return { ok, reasons };
  }

  if (rule.compute === "stop_distance_pct") {
    const pct = Math.abs(card.entryPrice - card.stopLoss) / card.entryPrice;
    const ok = compareOp(pct, rule.op, rule.value);
    if (!ok) reasons.push(`${rule.id}: stop_distance_pct=${(pct*100).toFixed(2)}% ${rule.op} ${(rule.value*100).toFixed(2)}% → ${rule.msg}`);
    return { ok, reasons };
  }

  if (rule.require) {
    for (const r of rule.require) {
      const lhs = resolveField(r.field, snapshotIndex(snapshot), card.symbol);
      let rhs = r.value;
      if (typeof r.value === "string" && r.value.includes(".")) {
        rhs = resolveField(r.value, snapshotIndex(snapshot), card.symbol);
      }
      const ok = compareOp(lhs, r.op, rhs);
      if (!ok) reasons.push(`${rule.id}: ${r.field}=${lhs} ${r.op} ${r.value}(${rhs}) → ${r.msg}`);
    }
    return { ok: reasons.length === 0, reasons };
  }

  return { ok: true };
}

function compareOp(lhs, op, rhs) {
  if (lhs == null || rhs == null) return false;
  switch (op) {
    case "gte": return lhs >= rhs;
    case "gt":  return lhs > rhs;
    case "lte": return lhs <= rhs;
    case "lt":  return lhs < rhs;
    case "eq":  return lhs === rhs;
    case "gt_field": return lhs > rhs;
    case "lt_field": return lhs < rhs;
    default: return false;
  }
}

function snapshotIndex(snapshot) {
  // snapshot.symbols is an array; index by symbol for resolveField
  const idx = {};
  for (const s of snapshot.symbols) idx[s.symbol] = s;
  return idx;
}

export async function handleEvaluate(req, res, body) {
  try {
    const { card, snapshot } = JSON.parse(body);
    if (!card || !snapshot) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "card and snapshot required" }));
      return;
    }

    const rules = loadRules().rules;
    const results = rules.map(r => ({ id: r.id, kind: r.kind, ...evalRule(r, card, snapshot) }));

    const hardFails = results.filter(r => !r.ok && !r.skipped && r.kind === "hard");
    const softFails = results.filter(r => !r.ok && !r.skipped && r.kind === "soft");

    const decision = hardFails.length === 0 ? "ALLOW" : "BLOCK";

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({
      decision,
      hardFails: hardFails.flatMap(r => r.reasons || []),
      softWarnings: softFails.flatMap(r => r.reasons || []),
      passed: results.filter(r => r.ok && !r.skipped).map(r => r.id),
    }, null, 2));
  } catch (err) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: err.message }));
  }
}
```

### 2.6 Wire routes into `src/backend/alpaca/server-refactored.mjs`

Near existing trade-card route imports:

```javascript
import { handleGetSnapshot } from "./routes/snapshot.mjs";
import { handleEvaluate } from "./routes/evaluate.mjs";
```

Add routes (before the 404 fallback, alongside trade-cards routes). Use the same Bearer-token gate that `POST /api/trade-cards` uses:

```javascript
if (pathname === "/api/snapshot" && req.method === "GET") {
  if (!checkTradeCardBearer(req, res)) return;
  await handleGetSnapshot(req, res, searchParams);
  return;
}

if (pathname === "/api/evaluate" && req.method === "POST") {
  if (!checkTradeCardBearer(req, res)) return;
  const body = await readBody(req);
  await handleEvaluate(req, res, body);
  return;
}
```

If `checkTradeCardBearer` and `readBody` don't exist as named helpers, copy the inline pattern from the existing `POST /api/trade-cards` handler — do not invent new helpers.

---

## 3. Tests (mandatory, in order)

### Test 1 — Indicators unit sanity

Create `src/backend/alpaca/lib/indicators.test.mjs`:

```javascript
import { vwap, atr, openingRange, volumeRatio } from "./indicators.mjs";

const bars = Array.from({ length: 20 }, (_, i) => ({
  t: `2026-05-20T13:${30 + i}:00Z`,
  o: 100 + i * 0.1, h: 100.5 + i * 0.1, l: 99.5 + i * 0.1, c: 100.2 + i * 0.1,
  v: 1000 + i * 50,
}));

console.assert(vwap(bars) > 99 && vwap(bars) < 102, "vwap in range");
console.assert(atr(bars, 14) > 0, "atr positive");
console.assert(openingRange(bars, 5).high >= openingRange(bars, 5).low, "OR shape");
console.assert(volumeRatio(bars) > 0.9, "volume ratio sane");
console.log("INDICATORS OK");
```

Run: `node src/backend/alpaca/lib/indicators.test.mjs` → must print `INDICATORS OK`.

### Test 2 — Snapshot returns shape

```bash
TOKEN=<TRADE_CARD_TOKEN>
curl -fsS "http://localhost:5171/api/snapshot?symbols=INTC,QQQ" \
  -H "Authorization: Bearer $TOKEN" | jq '{
    ts,
    intcLast: .symbols[0].last.price,
    intcVwap: .symbols[0].derived.vwap,
    qqqVwap:  .symbols[1].derived.vwap,
    cooldowns
  }'
```

**Pass:** All four values non-null, `cooldowns` is an object (empty if no recent cards).

### Test 3 — Evaluate ALLOW path

POST a card that meets all rules (T1 R:R ≥ 1, stop < 2%, QQQ alignment fakeable via direction):

```bash
SNAPSHOT=$(curl -fsS "http://localhost:5171/api/snapshot?symbols=INTC,QQQ" -H "Authorization: Bearer $TOKEN")

curl -fsS -X POST http://localhost:5171/api/evaluate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"card\":{\"symbol\":\"INTC\",\"direction\":\"LONG\",\"entryPrice\":100.00,\"stopLoss\":99.60,\"takeProfit1\":100.80,\"takeProfit2\":101.20,\"shares\":10},\"snapshot\":$SNAPSHOT}" | jq .
```

**Pass:** `decision: "ALLOW"` (soft warnings ok depending on real QQQ state).

### Test 4 — Evaluate BLOCK on bad R:R

```bash
curl -fsS -X POST http://localhost:5171/api/evaluate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"card\":{\"symbol\":\"INTC\",\"direction\":\"LONG\",\"entryPrice\":100.00,\"stopLoss\":99.00,\"takeProfit1\":100.50,\"takeProfit2\":101.00,\"shares\":10},\"snapshot\":$SNAPSHOT}" | jq .
```

**Pass:** `decision: "BLOCK"` with `hardFails` containing `rr_minimum`.

### Test 5 — Cooldown blocks second card

Post + cancel a card, then immediately post another for the same symbol:

```bash
RESP=$(curl -fsS -X POST http://localhost:5171/api/trade-cards \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"symbol":"INTC","direction":"LONG","entryType":"LIMIT","entryPrice":100,"stopLoss":99.6,"takeProfit1":100.8,"takeProfit2":101.2,"shares":10,"notional":1000,"regime":"TREND","rationale":"cooldown test 1"}')
CARD_ID=$(echo "$RESP" | jq -r .id)
curl -fsS -X POST "http://localhost:5171/api/trade-cards/$CARD_ID/cancel" >/dev/null

# Immediately try again
curl -i -X POST http://localhost:5171/api/trade-cards \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"symbol":"INTC","direction":"LONG","entryType":"LIMIT","entryPrice":100,"stopLoss":99.6,"takeProfit1":100.8,"takeProfit2":101.2,"shares":10,"notional":1000,"regime":"TREND","rationale":"cooldown test 2"}'
```

**Pass:** Second POST returns `429` with body `{"error":"cooldown_active",...}`.

### Test 6 — Snapshot reflects active cooldown

```bash
curl -fsS "http://localhost:5171/api/snapshot?symbols=INTC" -H "Authorization: Bearer $TOKEN" | jq .cooldowns
```

**Pass:** Object contains `INTC` key with `activeUntil` ~30 min in the future.

### Test 7 — Rule config hot-reload (sanity)

Edit `trade-rules.json` → set `rr_minimum.value` from `1.0` to `2.0`. Re-run Test 3. Without restarting the server, evaluate should now BLOCK the previously-allowed card (rules are read per request — confirm this behavior, do not cache).

**Pass:** Decision flips to BLOCK without server restart. Revert the file after.

---

## 4. Acceptance criteria

- All 7 tests pass
- No new npm dependencies
- No changes to existing endpoints other than the cooldown check in `POST /api/trade-cards`
- Rule config edits take effect without redeploy
- `EXECUTION_REPORT_TIER2.md` written at repo root with files created, tests pass/fail, and any deviations from this spec

---

## 5. Rules for Laguna

1. **Do not improvise file contents.** Copy §2 verbatim. The only inference allowed is matching `getBars` and bearer-token helper names to whatever the existing codebase actually uses — if the import paths in §2.2 don't resolve, grep the existing `/api/alpaca/bars` route handler and copy its exact imports.
2. **Run tests in order.** Stop at first failure, diagnose, fix, re-run.
3. **No Postgres, no auth changes, no UI changes** — those are separate prompts.
4. **Report shape:** match `EXECUTION_REPORT.md`. List files, test outputs, deviations.
5. **If a rule in `trade-rules.json` seems wrong, ship it as-is.** Rules are config — the user will tune them after seeing real cards evaluated.

---

— Plan v1, 2026-05-19
