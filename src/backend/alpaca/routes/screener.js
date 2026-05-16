/**
 * Screener routes
 */
import { safeParseInt } from "../../shared/numbers.mjs";

export async function handleScanPresets() {
  return {
    presets: [
      {
        id: "gappers",
        name: "Gappers",
        description: "Stocks with largest price gaps",
      },
      {
        id: "momentum",
        name: "Momentum Leaders",
        description: "Stocks with strongest upward momentum",
      },
      {
        id: "volume_leaders",
        name: "Volume Leaders",
        description: "Stocks with highest trading volume",
      },
      {
        id: "high_volatility",
        name: "High Volatility",
        description: "Stocks with largest intraday range",
      },
      {
        id: "top_gainers",
        name: "Top Gainers",
        description: "Stocks with highest percentage gains",
      },
      {
        id: "top_losers",
        name: "Top Losers",
        description: "Stocks with highest percentage losses",
      },
    ],
  };
}

export async function handleScanStocks(
  preset,
  searchParams,
  includeMeta = false,
) {
  // This will be called with the scanStocks function from screener.mjs
  // The actual implementation is in screener.mjs
  return { preset, includeMeta };
}

export async function handleScanCrypto(preset) {
  // This will be called with the scanCrypto function from crypto-screener.mjs
  return { preset };
}

export async function handleGetQuote(
  symbol,
  reqHasAlpacaHeaders,
  reqKeyId,
  reqSecretKey,
  alpacaRequest,
) {
  const quote = await alpacaRequest(
    `/v2/stocks/quotes/latest?symbols=${encodeURIComponent(symbol)}&feed=iex`,
    "GET",
    reqHasAlpacaHeaders
      ? { __alpacaKeyId: reqKeyId, __alpacaSecretKey: reqSecretKey }
      : null,
    false,
    true,
  );
  return { success: true, data: quote };
}

export async function handleGetBars(
  symbols,
  timeframe,
  limit,
  reqHasAlpacaHeaders,
  reqKeyId,
  reqSecretKey,
  alpacaRequest,
) {
  const limitValue = Math.max(1, Math.min(10000, safeParseInt(limit, 10)));
  const bars = await alpacaRequest(
    `/v2/stocks/bars?symbols=${encodeURIComponent(symbols)}&timeframe=${timeframe}&limit=${limitValue}&feed=iex`,
    "GET",
    reqHasAlpacaHeaders
      ? { __alpacaKeyId: reqKeyId, __alpacaSecretKey: reqSecretKey }
      : null,
    false,
    true,
  );
  return { success: true, data: bars };
}
