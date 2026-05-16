/**
 * Market data routes - quotes, trades, news, earnings, assets
 */
import { safeParseInt } from "../../shared/numbers.mjs";

const ALPACA_DATA_URL = "https://data.alpaca.markets";

function normalizeCryptoSymbol(sym) {
  if (sym.includes("/")) return sym;
  if (sym.endsWith("USDT")) return `${sym.slice(0, -4)}/USDT`;
  if (sym.endsWith("USD")) return `${sym.slice(0, -3)}/USD`;
  return sym;
}

function isCryptoSymbol(sym) {
  return sym.includes("/") || /^[A-Z0-9]{2,15}USD(T)?$/.test(sym);
}

export async function handleQuotes(
  symbols,
  searchParams,
  corsHeaders,
  reqHasAlpacaHeaders,
  reqKeyId,
  reqSecretKey,
  alpacaRequest,
) {
  const requested = symbols
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const stockSymbols = [];
  const cryptoSymbols = [];
  const cryptoNormalizedByOriginal = new Map();

  for (const sym of requested) {
    if (isCryptoSymbol(sym)) {
      const normalized = normalizeCryptoSymbol(sym);
      cryptoSymbols.push(normalized);
      cryptoNormalizedByOriginal.set(sym, normalized);
    } else {
      stockSymbols.push(sym);
    }
  }

  const out = { quotes: {} };

  if (stockSymbols.length > 0) {
    const encodedSymbols = encodeURIComponent(stockSymbols.join(","));
    const stockQuotes = await alpacaRequest(
      `/v2/stocks/quotes/latest?symbols=${encodedSymbols}&feed=iex`,
      "GET",
      reqHasAlpacaHeaders
        ? { __alpacaKeyId: reqKeyId, __alpacaSecretKey: reqSecretKey }
        : null,
      false,
      true,
    );
    if (stockQuotes?.quotes) {
      for (const sym of stockSymbols) {
        if (stockQuotes.quotes[sym]) out.quotes[sym] = stockQuotes.quotes[sym];
      }
    }
  }

  if (cryptoSymbols.length > 0) {
    const encodedSymbols = encodeURIComponent(cryptoSymbols.join(","));
    let cryptoQuotes;
    try {
      cryptoQuotes = await alpacaRequest(
        `/v1beta3/crypto/us/latest/quotes?symbols=${encodedSymbols}`,
        "GET",
        reqHasAlpacaHeaders
          ? { __alpacaKeyId: reqKeyId, __alpacaSecretKey: reqSecretKey }
          : null,
        false,
        true,
      );
    } catch {
      cryptoQuotes = await alpacaRequest(
        `/v1beta2/crypto/us/latest/quotes?symbols=${encodedSymbols}`,
        "GET",
        reqHasAlpacaHeaders
          ? { __alpacaKeyId: reqKeyId, __alpacaSecretKey: reqSecretKey }
          : null,
        false,
        true,
      );
    }

    const quotes = cryptoQuotes?.quotes || cryptoQuotes?.data?.quotes || {};
    for (const [orig, norm] of cryptoNormalizedByOriginal.entries()) {
      if (quotes[norm]) out.quotes[orig] = quotes[norm];
    }
  }

  return { success: true, data: out };
}

export async function handleTrades(
  symbols,
  searchParams,
  corsHeaders,
  reqHasAlpacaHeaders,
  reqKeyId,
  reqSecretKey,
  alpacaRequest,
) {
  const requested = symbols
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const stockSymbols = [];
  const cryptoSymbols = [];
  const cryptoNormalizedByOriginal = new Map();

  for (const sym of requested) {
    if (isCryptoSymbol(sym)) {
      const normalized = normalizeCryptoSymbol(sym);
      cryptoSymbols.push(normalized);
      cryptoNormalizedByOriginal.set(sym, normalized);
    } else {
      stockSymbols.push(sym);
    }
  }

  const out = { trades: {} };

  if (stockSymbols.length > 0) {
    const encodedSymbols = encodeURIComponent(stockSymbols.join(","));
    const stockTrades = await alpacaRequest(
      `/v2/stocks/trades/latest?symbols=${encodedSymbols}&feed=iex`,
      "GET",
      reqHasAlpacaHeaders
        ? { __alpacaKeyId: reqKeyId, __alpacaSecretKey: reqSecretKey }
        : null,
      false,
      true,
    );
    if (stockTrades?.trades) {
      for (const sym of stockSymbols) {
        if (stockTrades.trades[sym]) out.trades[sym] = stockTrades.trades[sym];
      }
    }
  }

  if (cryptoSymbols.length > 0) {
    const encodedSymbols = encodeURIComponent(cryptoSymbols.join(","));
    let cryptoTrades;
    try {
      cryptoTrades = await alpacaRequest(
        `/v1beta3/crypto/us/latest/trades?symbols=${encodedSymbols}`,
        "GET",
        reqHasAlpacaHeaders
          ? { __alpacaKeyId: reqKeyId, __alpacaSecretKey: reqSecretKey }
          : null,
        false,
        true,
      );
    } catch {
      cryptoTrades = await alpacaRequest(
        `/v1beta2/crypto/us/latest/trades?symbols=${encodedSymbols}`,
        "GET",
        reqHasAlpacaHeaders
          ? { __alpacaKeyId: reqKeyId, __alpacaSecretKey: reqSecretKey }
          : null,
        false,
        true,
      );
    }

    const trades = cryptoTrades?.trades || cryptoTrades?.data?.trades || {};
    for (const [orig, norm] of cryptoNormalizedByOriginal.entries()) {
      if (trades[norm]) out.trades[orig] = trades[norm];
    }
  }

  return { success: true, data: out };
}

export async function handleNews(
  searchParams,
  corsHeaders,
  reqHasAlpacaHeaders,
  reqKeyId,
  reqSecretKey,
  alpacaRequest,
) {
  const symbols = searchParams.get("symbols");
  const limit = searchParams.get("limit") || "10";
  const start = searchParams.get("start");
  const end = searchParams.get("end");

  let url = `/v1beta1/news?limit=${encodeURIComponent(limit)}`;
  if (symbols) url += `&symbols=${encodeURIComponent(symbols)}`;
  if (start) url += `&start=${encodeURIComponent(start)}`;
  if (end) url += `&end=${encodeURIComponent(end)}`;

  const news = await alpacaRequest(
    url,
    "GET",
    reqHasAlpacaHeaders
      ? { __alpacaKeyId: reqKeyId, __alpacaSecretKey: reqSecretKey }
      : null,
    false,
    true,
  );
  return { success: true, data: news.news || [] };
}

function generateMockEarnings(from, to, symbol) {
  const startDate = new Date(from);
  const endDate = new Date(to);
  const symbols = symbol ? [symbol] : ["AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA", "TSLA", "NFLX"];
  const earnings = [];

  const daysDiff = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
  const numItems = Math.min(Math.max(3, daysDiff / 5), 20);

  for (let i = 0; i < numItems; i++) {
    const sym = symbols[i % symbols.length];
    const reportDate = new Date(startDate);
    reportDate.setDate(startDate.getDate() + Math.floor(i * daysDiff / numItems));
    const dateStr = reportDate.toISOString().split("T")[0];

    const epsEstimate = 1.0 + Math.random() * 2;
    const epsActual = epsEstimate + (Math.random() - 0.5) * 0.5;
    const surprisePercent = ((epsActual - epsEstimate) / epsEstimate) * 100;

    earnings.push({
      id: `${sym}-${dateStr}`,
      symbol: sym,
      name: sym,
      reportDate: dateStr,
      timeOfDay: ["bmo", "amc", "dmh"][i % 3],
      epsEstimate: Number(epsEstimate.toFixed(2)),
      epsActual: Number(epsActual.toFixed(2)),
      revenueEstimate: Number((5000 + Math.random() * 10000).toFixed(0)),
      revenueActual: Number((5000 + Math.random() * 10000).toFixed(0)),
      surprisePercent: Number(surprisePercent.toFixed(2)),
      fiscalQuarter: `Q${Math.floor(dateStr.split("-")[1] / 3) + 1} ${dateStr.split("-")[0]}`,
    });
  }

  return earnings;
}

export async function handleEarnings(searchParams, corsHeaders) {
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const symbol = searchParams.get("symbol");

  if (!from || !to) {
    throw new Error(
      "Missing required parameters: from and to (YYYY-MM-DD format)",
    );
  }

  if (!process.env.FINNHUB_API_KEY) {
    return { success: true, data: generateMockEarnings(from, to, symbol) };
  }

  const baseUrl = "https://finnhub.io/api/v1/calendar/earnings";
  let url = `${baseUrl}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&token=${process.env.FINNHUB_API_KEY}`;

  if (symbol) {
    url += `&symbol=${encodeURIComponent(symbol)}`;
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Finnhub API error: ${response.status}`);
  }

  const data = await response.json();

  const transformedEarnings = (data.earningsCalendar || []).map((item) => {
    let surprisePercent = null;
    if (
      item.epsActual != null &&
      item.epsEstimate != null &&
      item.epsEstimate !== 0
    ) {
      surprisePercent =
        ((item.epsActual - item.epsEstimate) / Math.abs(item.epsEstimate)) * 100;
    }

    return {
      id: `${item.symbol}-${item.date}`,
      symbol: item.symbol,
      name: item.symbol,
      reportDate: item.date,
      timeOfDay: item.hour || "dmh",
      epsEstimate: item.epsEstimate ?? null,
      epsActual: item.epsActual ?? null,
      revenueEstimate: item.revenueEstimate
        ? item.revenueEstimate / 1_000_000
        : null,
      revenueActual: item.revenueActual
        ? item.revenueActual / 1_000_000
        : null,
      surprisePercent: surprisePercent,
      fiscalQuarter: item.quarter || null,
    };
  });

  return { success: true, data: transformedEarnings };
}

export async function handleAssets(
  searchParams,
  corsHeaders,
  reqHasAlpacaHeaders,
  reqKeyId,
  reqSecretKey,
  alpacaRequest,
) {
  const status = searchParams.get("status") || "active";
  const assetClass = searchParams.get("asset_class") || "us_equity";

  const assets = await alpacaRequest(
    `/v2/assets?status=${status}&asset_class=${assetClass}`,
    "GET",
    reqHasAlpacaHeaders
      ? { __alpacaKeyId: reqKeyId, __alpacaSecretKey: reqSecretKey }
      : null,
    false,
  );
  return { success: true, data: assets };
}

export async function handleGetAsset(
  symbol,
  reqHasAlpacaHeaders,
  reqKeyId,
  reqSecretKey,
  alpacaRequest,
) {
  const asset = await alpacaRequest(
    `/v2/assets/${encodeURIComponent(symbol)}`,
    "GET",
    reqHasAlpacaHeaders
      ? { __alpacaKeyId: reqKeyId, __alpacaSecretKey: reqSecretKey }
      : null,
    false,
  );
  return { success: true, data: asset };
}
