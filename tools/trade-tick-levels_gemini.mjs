/**
 * 1-minute scalp bracket order tool — structure + momentum gated auto bias
 * Usage: node tools/trade-tick-levels.mjs --auto|--l|--s [--dry-run|--paper|--live] [--strict] ASSET [QTY]
 *
 * Direction modes (mutually exclusive):
 *   --auto     Direction determined by 3-gate bias system
 *   --l        Force long  — bypasses bias gates
 *   --s        Force short — bypasses bias gates
 *
 * Options:
 *   --strict   Tighten gate thresholds (structure ≥7, momentum ≥1.2)
 *   --dry-run  Calculate levels without submitting order
 *   --paper    Paper trading account (default)
 *   --live     Live trading account
 *
 * --auto gates (ALL must pass):
 *   1. Structure  — last 10 bars: ≥6 HH (buy) or ≥6 LL (sell)  [--strict: ≥7]
 *   2. Momentum   — hot/cool vol ratio ≥1.0                      [--strict: ≥1.2]
 *   3. Regime     — recent/baseline vol ratio ≥1.0
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const PAPER_KEY = process.env.ALPACA_PAPER_KEY || "";
const PAPER_SECRET = process.env.ALPACA_PAPER_SECRET || "";
const LIVE_KEY = process.env.ALPACA_LIVE_KEY || "";
const LIVE_SECRET = process.env.ALPACA_LIVE_SECRET || "";
const PAPER_URL = "https://paper-api.alpaca.markets";
const LIVE_URL = "https://api.alpaca.markets";
const DATA_URL = "https://data.alpaca.markets";

// ─── Config ───────────────────────────────────────────────────────────────────

const BAR_LOOKBACK = 120;
const RECENT_BARS = 20;
const OUTLIER_TRIM = 0.95;
const STRUCTURE_BARS = 10;
const MOMENTUM_HOT_BARS = 5;
const MOMENTUM_COOL_BARS = 10;
const REGIME_MIN_RATIO = 1.0;

// Normal vs strict gate thresholds
const THRESHOLDS = {
  normal: { structure: 6, momentum: 1.0 },
  strict: { structure: 7, momentum: 1.2 },
};

// ─── API helpers ──────────────────────────────────────────────────────────────

async function apiFetch(url, key, secret, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      "APCA-API-KEY-ID": key,
      "APCA-API-SECRET-KEY": secret,
      ...options.headers,
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok)
    throw new Error(`API error (${res.status}): ${await res.text()}`);
  return res.json();
}

async function get1mBars(symbol, key, secret) {
  const start = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
  const params = new URLSearchParams({
    timeframe: "1Min",
    start,
    limit: String(BAR_LOOKBACK),
    feed: "iex",
    sort: "asc",
  });
  const data = await apiFetch(
    `${DATA_URL}/v2/stocks/${symbol}/bars?${params}`,
    key,
    secret,
  );
  return data.bars || [];
}

async function getLastTradePrice(symbol, key, secret) {
  const data = await apiFetch(
    `${DATA_URL}/v2/stocks/${symbol}/trades/latest?feed=iex`,
    key,
    secret,
  );
  return parseFloat(data.trade.p);
}

async function submitBracketOrder(
  symbol,
  side,
  qty,
  sl,
  tp,
  tradeUrl,
  key,
  secret,
) {
  return apiFetch(`${tradeUrl}/v2/orders`, key, secret, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      symbol,
      qty: String(qty),
      side,
      type: "market",
      time_in_force: "day",
      order_class: "bracket",
      stop_loss: { stop_price: sl },
      take_profit: { limit_price: tp },
    }),
  });
}

// ─── Distance stats ───────────────────────────────────────────────────────────

function windowStats(bars, trimOutliers = false) {
  let b = bars.map((x) => ({ volatility: x.h - x.l, momentum: x.c - x.o }));

  if (trimOutliers) {
    b = [...b]
      .sort((a, c) => a.volatility - c.volatility)
      .slice(0, Math.max(1, Math.floor(b.length * OUTLIER_TRIM)));
  }

  const avg = (fn) => b.reduce((s, x) => s + fn(x), 0) / b.length;

  return {
    count: b.length,
    slDist: avg((x) => x.volatility),
    tpDist: avg((x) => Math.abs(x.momentum)),
  };
}

function calcDistances(bars) {
  const full = windowStats(bars, true);
  const recent = windowStats(bars.slice(-RECENT_BARS), false);

  return {
    slDist: Math.max(full.slDist, recent.slDist),
    tpDist: Math.max(full.tpDist, recent.tpDist),
    baseline: full,
    recent,
    regimeRatio: recent.slDist / full.slDist,
    fullCount: full.count,
    recentCount: recent.count,
  };
}

// ─── Auto bias gates ──────────────────────────────────────────────────────────

function detectStructure(bars, threshold) {
  const slice = bars.slice(-STRUCTURE_BARS);
  let higherHighs = 0;
  let lowerLows = 0;

  for (let i = 1; i < slice.length; i++) {
    if (slice[i].h > slice[i - 1].h) higherHighs++;
    if (slice[i].l < slice[i - 1].l) lowerLows++;
  }

  const total = slice.length - 1; // number of comparisons
  const buySignal = higherHighs >= threshold;
  const sellSignal = lowerLows >= threshold;

  // Both or neither → no clean structure
  if (buySignal === sellSignal)
    return { side: null, higherHighs, lowerLows, total, threshold };
  return {
    side: buySignal ? "buy" : "sell",
    higherHighs,
    lowerLows,
    total,
    threshold,
  };
}

function detectMomentum(bars) {
  const hot = bars.slice(-MOMENTUM_HOT_BARS);
  const cool = bars.slice(
    -(MOMENTUM_HOT_BARS + MOMENTUM_COOL_BARS),
    -MOMENTUM_HOT_BARS,
  );
  if (!cool.length) return 0;
  const avgVol = (arr) => arr.reduce((s, b) => s + (b.h - b.l), 0) / arr.length;
  return avgVol(hot) / avgVol(cool);
}

function evalAutoBias(bars, regimeRatio, strict) {
  const t = strict ? THRESHOLDS.strict : THRESHOLDS.normal;
  const structure = detectStructure(bars, t.structure);
  const momentumRatio = detectMomentum(bars);
  const structurePass = structure.side !== null;
  const momentumPass = momentumRatio >= t.momentum;
  const regimePass = regimeRatio >= REGIME_MIN_RATIO;

  const passed = [structurePass, momentumPass, regimePass];
  const score = passed.filter(Boolean).length;

  const gates = {
    structure: {
      passed: structurePass,
      detail: structurePass
        ? `✅ ${structure.side === "buy" ? "🟢 BUY " : "🔴 SELL"}  (HH ${structure.higherHighs}  LL ${structure.lowerLows}  of ${structure.total}  threshold ≥${t.structure})`
        : `❌ choppy  (HH ${structure.higherHighs}  LL ${structure.lowerLows}  of ${structure.total}  need ≥${t.structure} on one side)`,
    },
    momentum: {
      passed: momentumPass,
      detail: momentumPass
        ? `✅ accelerating  (ratio ${momentumRatio.toFixed(2)} ≥ ${t.momentum})`
        : `❌ fading/flat   (ratio ${momentumRatio.toFixed(2)} — need ≥ ${t.momentum})`,
    },
    regime: {
      passed: regimePass,
      detail: regimePass
        ? `✅ active  (recent/baseline ${regimeRatio.toFixed(2)} ≥ ${REGIME_MIN_RATIO})`
        : `❌ too quiet  (recent/baseline ${regimeRatio.toFixed(2)} — need ≥ ${REGIME_MIN_RATIO})`,
    },
  };

  return {
    side: score === 3 ? structure.side : null,
    passed: score === 3,
    score,
    gates,
  };
}

// ─── Args ─────────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  let mode = null; // "auto" | "long" | "short"
  let symbol = null;
  let qty = 10;
  let dryRun = false;
  let useLive = false;
  let strict = false;

  for (const a of args) {
    if (a === "--auto") mode = "auto";
    else if (a === "--l" || a === "--long") mode = "long";
    else if (a === "--s" || a === "--short") mode = "short";
    else if (a === "--dry-run") dryRun = true;
    else if (a === "--live") useLive = true;
    else if (a === "--paper") useLive = false;
    else if (a === "--strict") strict = true;
    else if (!symbol && !a.startsWith("--")) symbol = a.toUpperCase();
    else if (!isNaN(parseFloat(a))) qty = parseFloat(a);
  }

  return { mode, symbol, qty, dryRun, useLive, strict };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const { mode, symbol, qty, dryRun, useLive, strict } = parseArgs();

  if (!mode) {
    console.error(
      "Usage: node tools/trade-tick-levels.mjs --auto|--l|--s [--dry-run|--paper|--live] [--strict] ASSET [QTY]",
    );
    console.error("  --auto     bias-gated direction (recommended)");
    console.error("  --l        force long");
    console.error("  --s        force short");
    console.error("  --strict   tighter gate thresholds");
    process.exit(1);
  }
  if (!symbol) {
    console.error("Error: asset symbol required");
    process.exit(1);
  }

  const key = useLive ? LIVE_KEY : PAPER_KEY;
  const secret = useLive ? LIVE_SECRET : PAPER_SECRET;
  const tradeUrl = useLive ? LIVE_URL : PAPER_URL;

  if (!key || !secret) {
    console.error(
      `Error: ALPACA_${useLive ? "LIVE" : "PAPER"}_KEY/SECRET not set in .env`,
    );
    process.exit(1);
  }

  try {
    console.log(`Fetching data for ${symbol}...`);

    const [bars, livePrice] = await Promise.all([
      get1mBars(symbol, key, secret),
      getLastTradePrice(symbol, key, secret),
    ]);

    if (
      bars.length <
      STRUCTURE_BARS + MOMENTUM_HOT_BARS + MOMENTUM_COOL_BARS + 5
    ) {
      console.error(
        `${symbol}: insufficient bar data (${bars.length} bars) — market may be closed`,
      );
      process.exit(1);
    }

    const dist = calcDistances(bars);
    const entry = parseFloat(livePrice.toFixed(2));

    // ── Determine final side ──
    let finalSide;

    if (mode === "auto") {
      const bias = evalAutoBias(bars, dist.regimeRatio, strict);

      console.log(
        `\n========== ${symbol} AUTO BIAS  [${strict ? "STRICT" : "NORMAL"}]  ${bias.score}/3 gates ==========`,
      );
      console.log(`Gate 1 — Structure:  ${bias.gates.structure.detail}`);
      console.log(`Gate 2 — Momentum:   ${bias.gates.momentum.detail}`);
      console.log(`Gate 3 — Regime:     ${bias.gates.regime.detail}`);
      console.log(`${"=".repeat(60)}`);

      if (!bias.passed) {
        console.log(`\n🚫 NO TRADE — ${bias.score}/3 gates passed`);
        console.log(`   Retry when market structure and momentum align.`);
        console.log(
          `   Use --l or --s to force a direction, --strict to see tighter thresholds.`,
        );
        process.exit(0);
      }

      finalSide = bias.side;
      console.log(
        `\n✅ ALL GATES PASSED — direction: ${finalSide === "buy" ? "🟢 LONG" : "🔴 SHORT"}\n`,
      );
    } else {
      finalSide = mode === "long" ? "buy" : "sell";
    }

    // ── Levels ──
    const sl =
      finalSide === "buy"
        ? (entry - dist.slDist).toFixed(2)
        : (entry + dist.slDist).toFixed(2);
    const tp =
      finalSide === "buy"
        ? (entry + dist.tpDist).toFixed(2)
        : (entry - dist.tpDist).toFixed(2);
    const rr = (dist.tpDist / dist.slDist).toFixed(2);

    console.log(`========== ${symbol} (1m SCALP) ==========`);
    console.log(
      `Bars:         ${bars.length} fetched  |  ${dist.fullCount} analysed  |  ${dist.recentCount} recent`,
    );
    console.log(
      `Regime:       ${dist.regimeRatio >= 1.5 ? "🔥 HOT" : dist.regimeRatio >= 1.0 ? "⚡ ACTIVE" : "😴 CALM"}  (${dist.regimeRatio.toFixed(2)}×)`,
    );
    console.log(
      `SL dist:      $${dist.baseline.slDist.toFixed(4)} baseline  |  $${dist.recent.slDist.toFixed(4)} recent  →  $${dist.slDist.toFixed(4)}`,
    );
    console.log(
      `TP dist:      $${dist.baseline.tpDist.toFixed(4)} baseline  |  $${dist.recent.tpDist.toFixed(4)} recent  →  $${dist.tpDist.toFixed(4)}`,
    );
    console.log(`──────────────────────────────────────────`);
    console.log(
      `Position:     ${finalSide === "buy" ? "🟢 LONG" : "🔴 SHORT"}  ×${qty}`,
    );
    console.log(`Live Entry:   $${entry}`);
    console.log(`Stop Loss:    $${sl}`);
    console.log(`Take Profit:  $${tp}`);
    console.log(`R:R:          ${rr}`);
    console.log(`==========================================\n`);

    if (dryRun) {
      console.log("🔍 DRY RUN — order NOT submitted");
      return;
    }

    console.log(
      `${useLive ? "🚨 LIVE" : "📝 PAPER"} — submitting bracket order...`,
    );
    const order = await submitBracketOrder(
      symbol,
      finalSide,
      qty,
      sl,
      tp,
      tradeUrl,
      key,
      secret,
    );
    console.log(`✅ Order submitted!`);
    console.log(`   ID:     ${order.id}`);
    console.log(`   Status: ${order.status}`);
    console.log(`   Class:  ${order.order_class}`);
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  }
}

main();
