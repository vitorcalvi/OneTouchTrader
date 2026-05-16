/**
 * Bars route handler
 */
import { safeParseInt } from "../../shared/numbers.mjs";

export async function handleBars(
  symbols,
  timeframe,
  limit,
  reqHasAlpacaHeaders,
  reqKeyId,
  reqSecretKey,
  alpacaRequest,
) {
  const limitValue = Math.max(1, Math.min(10000, safeParseInt(limit, 10)));
  // Look back far enough to support MA(99) on 15-min bars (~25 trading hours = ~4 sessions).
  // 14 calendar days covers weekends/holidays safely.
  const start = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const bars = await alpacaRequest(
    `/v2/stocks/bars?symbols=${encodeURIComponent(symbols)}&timeframe=${timeframe}&limit=${limitValue}&start=${encodeURIComponent(start)}&feed=iex`,
    "GET",
    reqHasAlpacaHeaders
      ? { __alpacaKeyId: reqKeyId, __alpacaSecretKey: reqSecretKey }
      : null,
    false,
    true,
  );
  return { success: true, data: bars };
}
