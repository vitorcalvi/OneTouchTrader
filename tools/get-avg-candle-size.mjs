/**
 * Get accurate TP/SL levels based on TICK BARS (Raw Transactions)
 * Usage: node tools/get-tick-levels.mjs RGTI
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
const DATA_URL = "https://data.alpaca.markets";

// How many individual trades (ticks) make up one "Candle" for your analysis
// 100 is standard for micro-trend tick trading.
const TICKS_PER_BAR = 100;

async function getRawTicks(symbol) {
  // Fetch the latest trades (ticks) from the last 2 hours.
  // We use limit=10000 to get a massive chunk of the most recent micro-transactions.
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

  // Group raw ticks into chunks (e.g., 100 trades = 1 Tick Candle)
  for (let i = 0; i < ticks.length; i += ticksPerBar) {
    const chunk = ticks.slice(i, i + ticksPerBar);

    // Skip incomplete bars at the very end to keep averages mathematically pure
    if (chunk.length < ticksPerBar) break;

    const prices = chunk.map((t) => t.p); // Extract just the prices

    const open = prices[0];
    const close = prices[prices.length - 1];
    const high = Math.max(...prices);
    const low = Math.min(...prices);

    bars.push({
      o: open,
      h: high,
      l: low,
      c: close,
      volatility: high - low, // The tick wick noise
      momentum: Math.abs(open - close), // The tick body momentum
    });
  }

  return bars;
}

function calculateTickAverages(tickBars) {
  if (!tickBars || tickBars.length === 0) return null;

  // 1. Sort by volatility to find the chaotic anomalies
  tickBars.sort((a, b) => a.volatility - b.volatility);

  // 2. Filter out the top 5% most erratic tick chunks
  const cutoffIndex = Math.floor(tickBars.length * 0.95);
  const safeCutoff = cutoffIndex > 0 ? cutoffIndex : tickBars.length;

  const normalBars = tickBars.slice(0, safeCutoff);

  // 3. Average the remaining pure tick bars
  const totalVol = normalBars.reduce((sum, b) => sum + b.volatility, 0);
  const avgVol = totalVol / normalBars.length;

  const totalMom = normalBars.reduce((sum, b) => sum + b.momentum, 0);
  const avgMom = totalMom / normalBars.length;

  return {
    barCount: normalBars.length,
    volatility: { avg: avgVol }, // SL
    momentum: { avg: avgMom }, // TP
  };
}

async function main() {
  const args = process.argv.slice(2);
  const symbols = args.map((s) => s.toUpperCase());
  const finalSymbols = symbols.length > 0 ? symbols : ["RGTI"];

  if (!PAPER_KEY || !PAPER_SECRET) {
    console.error(
      "Error: ALPACA_PAPER_KEY and ALPACA_PAPER_SECRET must be set in .env",
    );
    process.exit(1);
  }

  try {
    for (const symbol of finalSymbols) {
      console.log(`Fetching raw ticks (trades) for: ${symbol}...`);
      const ticks = await getRawTicks(symbol);

      if (ticks.length === 0) {
        console.log(
          `${symbol}: No tick data returned for the recent window.\n`,
        );
        continue;
      }

      // The exact price of the very last transaction executed in the market right now
      const exactLastTickPrice = ticks[ticks.length - 1].p;

      // Group ticks into candles and calculate stats
      const tickBars = constructTickBars(ticks, TICKS_PER_BAR);

      if (tickBars.length === 0) {
        console.log(
          `${symbol}: Not enough ticks to build a ${TICKS_PER_BAR}-tick bar.\n`,
        );
        continue;
      }

      const stats = calculateTickAverages(tickBars);

      // STRICT TICK MATH
      const takeProfitDist = stats.momentum.avg;
      const stopLossDist = stats.volatility.avg;

      const longTpPrice = exactLastTickPrice + takeProfitDist;
      const longSlPrice = exactLastTickPrice - stopLossDist;

      const shortTpPrice = exactLastTickPrice - takeProfitDist;
      const shortSlPrice = exactLastTickPrice + stopLossDist;

      console.log(`\n========== ${symbol} (TICK CHART ANALYSIS) ==========`);
      console.log(`Raw Ticks Fetched:   ${ticks.length} transactions`);
      console.log(`Tick Bar Size:       ${TICKS_PER_BAR} trades per candle`);
      console.log(
        `Tick Bars Analyzed:  ${stats.barCount} (Top 5% outliers removed)`,
      );
      console.log(`Current Tick Entry:  $${exactLastTickPrice.toFixed(4)}`);
      console.log(`-------------------------------------------------`);
      console.log(
        `Avg Tick Volatility: $${stats.volatility.avg.toFixed(4)} (SL Distance)`,
      );
      console.log(
        `Avg Tick Momentum:   $${stats.momentum.avg.toFixed(4)} (TP Distance)`,
      );

      console.log(`\n🟢 [ LONG POSITION LEVELS ]`);
      console.log(`   Entry:       $${exactLastTickPrice.toFixed(4)}`);
      console.log(
        `   Take Profit: $${longTpPrice.toFixed(4)} (+$${takeProfitDist.toFixed(4)})`,
      );
      console.log(
        `   Stop Loss:   $${longSlPrice.toFixed(4)} (-$${stopLossDist.toFixed(4)})`,
      );

      console.log(`\n🔴 [ SHORT POSITION LEVELS ]`);
      console.log(`   Entry:       $${exactLastTickPrice.toFixed(4)}`);
      console.log(
        `   Take Profit: $${shortTpPrice.toFixed(4)} (-$${takeProfitDist.toFixed(4)})`,
      );
      console.log(
        `   Stop Loss:   $${shortSlPrice.toFixed(4)} (+$${stopLossDist.toFixed(4)})`,
      );
      console.log(`=================================================\n`);
    }
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

main();
