/**
 * Levels endpoint - computes derived intraday levels
 */
import { getBars } from "../screener.mjs";
import { loadEnv, getAlpacaCredentials } from "../../shared/env-loader.mjs";

loadEnv();

const CACHE_TTL_MS = 5000;
const cache = new Map();

function calculateEMA(prices, period) {
  if (prices.length < period) return null;
  const k = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  return ema;
}

function calculateATR(dailyBars, period = 14) {
  if (dailyBars.length < period + 1) return null;
  const trs = [];
  for (let i = 1; i < dailyBars.length; i++) {
    const prevClose = dailyBars[i - 1].c;
    const h = dailyBars[i].h;
    const l = dailyBars[i].l;
    const tr = Math.max(h - l, Math.abs(h - prevClose), Math.abs(l - prevClose));
    trs.push(tr);
  }
  const recentATR = trs.slice(-period);
  return recentATR.reduce((a, b) => a + b, 0) / period;
}

function calculateVWAP(bars) {
  let sumPV = 0;
  let sumV = 0;
  for (const bar of bars) {
    const typical = (bar.h + bar.l + bar.c) / 3;
    sumPV += typical * bar.v;
    sumV += bar.v;
  }
  return sumV > 0 ? sumPV / sumV : null;
}

function isPreMarket(timeStr) {
  const t = new Date(timeStr);
  const hours = t.getUTCHours();
  const mins = t.getUTCMinutes();
  const totalMins = hours * 60 + mins;
  return totalMins >= 8 * 60 && totalMins < 13 * 60 + 30;
}

function isRegularHours(timeStr) {
  const t = new Date(timeStr);
  const hours = t.getUTCHours();
  const mins = t.getUTCMinutes();
  const totalMins = hours * 60 + mins;
  return totalMins >= 13 * 60 + 30 && totalMins < 20 * 60;
}

export async function handleLevels(symbol, options = {}) {
  const { live = false } = options;
  const cacheKey = `${symbol}_${live}`;
  const cached = cache.get(cacheKey);
  const now = Date.now();

  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const creds = getAlpacaCredentials(true);
    const [bars1m, bars5m, quoteData] = await Promise.all([
      getBars(symbol, "1Min", 500).catch(() => ({})),
      getBars(symbol, "5Min", 200).catch(() => ({})),
      fetch(`https://data.alpaca.markets/v2/stocks/quotes/latest?symbols=${symbol}&feed=iex`, {
        headers: {
          "APCA-API-KEY-ID": creds.key,
          "APCA-API-SECRET-KEY": creds.secret,
        },
      }).then(r => r.json()).catch(() => ({})),
    ]);

    const symbolBars1m = bars1m[symbol] || [];
    const symbolBars5m = bars5m[symbol] || [];
    const quote = quoteData?.quotes?.[symbol] || {};

    // Fetch daily bars WITHOUT feed=iex (sip only has daily)
    const dailyResp = await fetch(`https://data.alpaca.markets/v2/stocks/bars?symbols=${symbol}&timeframe=1Day&start=2026-01-01T00:00:00Z&limit=30`, {
      headers: {
        "APCA-API-KEY-ID": creds.key,
        "APCA-API-SECRET-KEY": creds.secret,
      },
    }).then(r => r.json()).catch(() => ({}));
    const symbolDaily = dailyResp?.bars?.[symbol] || [];

    const regularBars = symbolBars1m.filter(b => isRegularHours(b.t));
    const premarketBars = symbolBars1m.filter(b => isPreMarket(b.t));

    const session = {
      open: regularBars[0]?.o || null,
      high: Math.max(...regularBars.map(b => b.h), 0) || null,
      low: Math.min(...regularBars.map(b => b.l), Infinity) || null,
      vwap: calculateVWAP(regularBars),
      volume: regularBars.reduce((sum, b) => sum + b.v, 0),
    };

    const priorDay = symbolDaily.length >= 2 ? symbolDaily[1] : (symbolDaily.length >= 1 ? symbolDaily[0] : null);

    const preMarket = premarketBars.length > 0 ? {
      high: Math.max(...premarketBars.map(b => b.h)),
      low: Math.min(...premarketBars.map(b => b.l)),
    } : { high: null, low: null };

    const atr14d = calculateATR(symbolDaily);

    const recentHigh5m = symbolBars5m.slice(-12);
    const recentLow5m = symbolBars5m.slice(-12);
    const recentHigh1m = symbolBars5m.slice(-30);
    const recentLow1m = symbolBars5m.slice(-30);

    const swings = {
      recentHigh5m: recentHigh5m.length ? Math.max(...recentHigh5m.map(b => b.h)) : null,
      recentLow5m: recentLow5m.length ? Math.min(...recentLow5m.map(b => b.l)) : null,
      recentHigh1m: recentHigh1m.length ? Math.max(...recentHigh1m.map(b => b.h)) : null,
      recentLow1m: recentLow1m.length ? Math.min(...recentLow1m.map(b => b.l)) : null,
    };

    const prices1m = symbolBars1m.map(b => b.c).filter(Boolean);
    const prices5m = symbolBars5m.map(b => b.c).filter(Boolean);

    const ema = {
      ema9_1m: calculateEMA(prices1m, 9),
      ema20_1m: calculateEMA(prices1m, 20),
      ema20_5m: calculateEMA(prices5m, 20),
    };

    const mid = quote.b && quote.a ? (quote.b + quote.a) / 2 : (session.vwap || 0);
    const roundNumbers = [];
    for (let i = Math.floor(mid) - 3; i <= Math.ceil(mid) + 3; i++) {
      if (i > 0) roundNumbers.push(i);
    }

    const result = {
      success: true,
      data: {
        symbol,
        asOf: new Date().toISOString(),
        quote: {
          bid: quote.b || null,
          ask: quote.a || null,
          mid: mid,
          spread: quote.b && quote.a ? quote.a - quote.b : null,
        },
        session,
        priorDay: priorDay ? {
          open: priorDay.o,
          high: priorDay.h,
          low: priorDay.l,
          close: priorDay.c,
        } : null,
        preMarket,
        atr14d,
        swings,
        ema,
        roundNumbers,
      },
      timestamp: new Date().toISOString(),
    };

    cache.set(cacheKey, { data: result, timestamp: now });
    return result;
  } catch (error) {
    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    };
  }
}

export async function handleSnapshot(symbols, options = {}) {
  const symbolList = symbols.split(",").map(s => s.trim()).filter(Boolean);
  const results = {};

  for (const sym of symbolList) {
    const result = await handleLevels(sym, options);
    results[sym] = result.data || result;
  }

  return {
    success: true,
    data: results,
    timestamp: new Date().toISOString(),
  };
}