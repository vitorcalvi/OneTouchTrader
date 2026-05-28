/**
 * Tick-Levels endpoint - computes SL/TP from raw tick data
 * Uses tick-bar analysis (100 trades per candle) for accurate levels
 */
import { getAlpacaCredentials } from "../../shared/env-loader.mjs";

const DATA_URL = "https://data.alpaca.markets";
const TICKS_PER_BAR = 100;

function getAlpacaHeaders() {
  const creds = getAlpacaCredentials(true);
  return {
    "APCA-API-KEY-ID": creds.key,
    "APCA-API-SECRET-KEY": creds.secret,
    "Content-Type": "application/json",
  };
}

async function getRawTicks(symbol) {
  const startTime = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const url = `${DATA_URL}/v2/stocks/${symbol}/trades?start=${startTime}&limit=10000&feed=iex`;

  const response = await fetch(url, {
    headers: getAlpacaHeaders(),
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
      momentum: Math.abs(open - close),
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

  return {
    barCount: normalBars.length,
    volatility: { avg: avgVol },
    momentum: { avg: avgMom },
  };
}

export async function handleTickLevels(symbol) {
  try {
    const ticks = await getRawTicks(symbol);

    if (ticks.length === 0) {
      return {
        success: false,
        error: `No tick data returned for ${symbol}`,
        symbol,
        timestamp: new Date().toISOString(),
      };
    }

    const exactLastTickPrice = ticks[ticks.length - 1].p;
    const tickBars = constructTickBars(ticks, TICKS_PER_BAR);

    if (tickBars.length === 0) {
      return {
        success: false,
        error: `Not enough ticks to build a ${TICKS_PER_BAR}-tick bar`,
        symbol,
        timestamp: new Date().toISOString(),
      };
    }

    const stats = calculateTickAverages(tickBars);
    const takeProfitDist = stats.momentum.avg;
    const stopLossDist = stats.volatility.avg;

    return {
      success: true,
      data: {
        symbol,
        entryPrice: exactLastTickPrice,
        slDistance: stopLossDist,
        tpDistance: takeProfitDist,
        long: {
          entry: exactLastTickPrice,
          tp: exactLastTickPrice + takeProfitDist,
          sl: exactLastTickPrice - stopLossDist,
        },
        short: {
          entry: exactLastTickPrice,
          tp: exactLastTickPrice - takeProfitDist,
          sl: exactLastTickPrice + stopLossDist,
        },
        stats: {
          ticksAnalyzed: ticks.length,
          barsAnalyzed: stats.barCount,
          avgVolatility: stats.volatility.avg,
          avgMomentum: stats.momentum.avg,
        },
      },
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      symbol,
      timestamp: new Date().toISOString(),
    };
  }
}