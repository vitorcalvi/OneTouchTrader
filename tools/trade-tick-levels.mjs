/**
 * Get tick-based TP/SL levels AND submit bracket order
 * Usage: node tools/trade-tick-levels.mjs --l|--s|--auto [--dry-run|--paper|--live] ASSET [QTY]
 * Example: node tools/trade-tick-levels.mjs --l RGTI 100
 * Example: node tools/trade-tick-levels.mjs --auto --paper AAPL
 * Options:
 *   --l        Submit long (buy) bracket order
 *   --s        Submit short (sell) bracket order
 *   --long     (alias for --l)
 *   --short    (alias for --s)
 *   --auto     Auto-detect bias from tick momentum direction
 *   --dry-run  Calculate levels without submitting order
 *   --paper    Use paper trading account (default)
 *   --live     Use live trading account
 * Order Type: market (with bracket TP/SL)
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");

// Load .env
dotenv.config({ path: path.join(PROJECT_ROOT, ".env") });

const PAPER_KEY = process.env.ALPACA_PAPER_KEY || "";
const PAPER_SECRET = process.env.ALPACA_PAPER_SECRET || "";
const LIVE_KEY = process.env.ALPACA_LIVE_KEY || "";
const LIVE_SECRET = process.env.ALPACA_LIVE_SECRET || "";
const PAPER_TRADE_URL = "https://paper-api.alpaca.markets";
const LIVE_TRADE_URL = "https://api.alpaca.markets";
const DATA_URL = "https://data.alpaca.markets";

// How many individual trades (ticks) make up one "Candle" for analysis
const TICKS_PER_BAR = 100;

async function getRawTicks(symbol) {
  const startTime = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

  const url = `${DATA_URL}/v2/stocks/${symbol}/trades?start=${startTime}&limit=10000&feed=iex`;

  const response = await fetch(url, {
    headers: {
      "APCA-API-KEY-ID": PAPER_KEY,
      "APCA-API-SECRET-KEY": PAPER_SECRET,
    },
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Alpaca API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data.trades || [];
}

function constructTickBars(ticks, ticksPerBar) {
  const bars = [];

  for (let i = 0; i < ticks.length; i += ticksPerBar) {
    const chunk = ticks.slice(i, i + ticksPerBar);

    if (chunk.length < ticksPerBar) break;

    const prices = chunk.map((t) => t.p);

    const open = prices[0];
    const close = prices[prices.length - 1];
    const high = Math.max(...prices);
    const low = Math.min(...prices);

    bars.push({
      o: open,
      h: high,
      l: low,
      c: close,
      volatility: high - low,
      momentum: open - close,
    });
  }

  return bars;
}

function calculateTickAverages(tickBars) {
  if (!tickBars || tickBars.length === 0) return null;

  tickBars.sort((a, b) => a.volatility - b.volatility);

  const cutoffIndex = Math.floor(tickBars.length * 0.95);
  const safeCutoff = cutoffIndex > 0 ? cutoffIndex : tickBars.length;
  const normalBars = tickBars.slice(0, safeCutoff);

  const totalVol = normalBars.reduce((sum, b) => sum + b.volatility, 0);
  const avgVol = totalVol / normalBars.length;

  const totalMom = normalBars.reduce((sum, b) => sum + b.momentum, 0);
  const avgMom = totalMom / normalBars.length;

  const totalAbsMom = normalBars.reduce((sum, b) => sum + Math.abs(b.momentum), 0);
  const avgAbsMom = totalAbsMom / normalBars.length;

  return {
    barCount: normalBars.length,
    volatility: { avg: avgVol },
    momentum: { avg: avgAbsMom, direction: avgMom },
  };
}

async function submitBracketOrder(symbol, side, qty, stopLossPrice, takeProfitPrice, tradeUrl, apiKey, apiSecret) {
  const url = `${tradeUrl}/v2/orders`;

  const body = {
    symbol: symbol,
    qty: String(qty),
    side: side,
    type: "market",
    time_in_force: "day",
    order_class: "bracket",
    stop_loss: { stop_price: stopLossPrice },
    take_profit: { limit_price: takeProfitPrice },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "APCA-API-KEY-ID": apiKey,
      "APCA-API-SECRET-KEY": apiSecret,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Order failed (${response.status}): ${errorText}`);
  }

  return response.json();
}

function parseArgs() {
  const args = process.argv.slice(2);
  let side = null;
  let symbol = null;
  let qty = 100;
  let dryRun = false;
  let autoBias = false;
  let useLive = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--l" || args[i] === "--s" || args[i] === "--long" || args[i] === "--short") {
      side = (args[i] === "--l" || args[i] === "--long") ? "buy" : "sell";
    } else if (args[i] === "--auto") {
      autoBias = true;
    } else if (args[i] === "--dry-run") {
      dryRun = true;
    } else if (args[i] === "--live") {
      useLive = true;
    } else if (args[i] === "--paper") {
      useLive = false;
    } else if (!symbol && !args[i].startsWith("--")) {
      symbol = args[i].toUpperCase();
    } else if ((side || autoBias) && !isNaN(parseFloat(args[i])) && qty === 100) {
      qty = parseFloat(args[i]);
    }
  }

  return { side, symbol, qty, dryRun, autoBias, useLive };
}

async function main() {
  const { side, symbol, qty, dryRun, autoBias, useLive } = parseArgs();

  if (!side && !autoBias) {
    console.error("Error: --l, --s, or --auto flag required");
    console.error("Usage: node tools/trade-tick-levels.mjs --l|--s|--auto [--dry-run|--paper|--live] ASSET [QTY]");
    console.error("  --l        Submit long (buy) bracket order");
    console.error("  --s        Submit short (sell) bracket order");
    console.error("  --long     (alias for --l)");
    console.error("  --short    (alias for --s)");
    console.error("  --auto     Auto-detect bias from tick momentum direction");
    console.error("  --dry-run  Calculate levels without submitting order");
    console.error("  --paper    Use paper trading account (default)");
    console.error("  --live     Use live trading account");
    console.error("  ASSET      Stock ticker symbol (e.g., AAPL, RGTI)");
    console.error("  QTY        Quantity (default: 100)");
    process.exit(1);
  }

  if (!symbol) {
    console.error("Error: Asset symbol required");
    console.error("Usage: node tools/trade-tick-levels.mjs --l|--s ASSET [QTY]");
    process.exit(1);
  }

  const apiKey = useLive ? LIVE_KEY : PAPER_KEY;
  const apiSecret = useLive ? LIVE_SECRET : PAPER_SECRET;
  const tradeUrl = useLive ? LIVE_TRADE_URL : PAPER_TRADE_URL;

  if (!apiKey || !apiSecret) {
    console.error(
      `Error: ALPACA_${useLive ? "LIVE" : "PAPER"}_KEY and ALPACA_${useLive ? "LIVE" : "PAPER"}_SECRET must be set in .env`,
    );
    process.exit(1);
  }

  try {
    console.log(`Fetching raw ticks for: ${symbol}...`);
    const ticks = await getRawTicks(symbol);

    if (ticks.length === 0) {
      console.log(`${symbol}: No tick data returned for the recent window.`);
      process.exit(1);
    }

    const exactLastTickPrice = ticks[ticks.length - 1].p;
    const tickBars = constructTickBars(ticks, TICKS_PER_BAR);

    if (tickBars.length === 0) {
      console.log(`${symbol}: Not enough ticks to build bars.`);
      process.exit(1);
    }

    const stats = calculateTickAverages(tickBars);
    
    if (!stats) {
      console.error("Failed to calculate tick averages");
      process.exit(1);
    }

    const takeProfitDist = stats.momentum.avg;
    const stopLossDist = stats.volatility.avg;

    // Auto-determine bias from momentum direction
    let finalSide = side;
    if (autoBias) {
      finalSide = stats.momentum.direction >= 0 ? "buy" : "sell";
    }

    // Calculate entry as midpoint of last tick bar or exact last tick
    const entryPrice = parseFloat(exactLastTickPrice.toFixed(2));
    
    let stopLossPrice, takeProfitPrice;

    if (finalSide === "buy") {
      // LONG: SL below, TP above
      stopLossPrice = (entryPrice - stopLossDist).toFixed(2);
      takeProfitPrice = (entryPrice + takeProfitDist).toFixed(2);
    } else {
      // SHORT: SL above, TP below
      stopLossPrice = (entryPrice + stopLossDist).toFixed(2);
      takeProfitPrice = (entryPrice - takeProfitDist).toFixed(2);
    }

    console.log(`\n========== ${symbol} (TICK TRADING) ==========`);
    console.log(`Raw Ticks Fetched:   ${ticks.length}`);
    console.log(`Tick Bars Analyzed:  ${stats.barCount}`);
    console.log(`Current Entry:       $${entryPrice}`);
    console.log(`\nMomentum Direction:  ${stats.momentum.direction >= 0 ? "🟢 Bullish (LONG)" : "🔴 Bearish (SHORT)"}`);
    console.log(`Position: ${finalSide === "buy" ? "🟢 LONG" : "🔴 SHORT"}`);
    console.log(`Qty:                  ${qty}`);
    console.log(`Order Type:          market`);
    console.log(`Stop Loss:           $${stopLossPrice}`);
    console.log(`Take Profit:         $${takeProfitPrice}`);
    console.log(`=================================================\n`);

    if (dryRun) {
      console.log("🔍 DRY RUN - Order NOT submitted");
      console.log(`${useLive ? "🚨 LIVE MODE (not executed)" : "📝 PAPER MODE"}`);
      console.log("Order would have been submitted:");
      console.log(`  symbol: ${symbol}`);
      console.log(`  side: ${finalSide}`);
      console.log(`  qty: ${qty}`);
      console.log(`  type: market`);
      console.log(`  stop_loss: ${stopLossPrice}`);
      console.log(`  take_profit: ${takeProfitPrice}`);
      return;
    }

    console.log(`${useLive ? "🚨 LIVE TRADING MODE" : "Submitting bracket order..."}`);
    const order = await submitBracketOrder(
      symbol,
      finalSide,
      qty,
      stopLossPrice,
      takeProfitPrice,
      tradeUrl,
      apiKey,
      apiSecret
    );
    console.log(`${useLive ? "🚨 LIVE TRADING" : "📝 PAPER TRADING"} - Order ${useLive ? "EXECUTED" : "submitted"} successfully!`);
    console.log(`Order ID: ${order.id}`);
    console.log(`Status: ${order.status}`);
    console.log(`Class: ${order.order_class}`);

  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

main();