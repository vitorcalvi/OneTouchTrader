/**
 * Bars route handler
 */
import { safeParseInt } from "../../shared/numbers.mjs";

function getTodayStartET() {
  const now = new Date();
  const etYear = now.getUTCFullYear();
  const etMonth = now.getUTCMonth();
  const etDate = now.getUTCDate();
  const et = new Date(Date.UTC(etYear, etMonth, etDate, 8, 0, 0, 0));
  return et;
}

export async function handleBars(
  symbols,
  timeframe,
  limit,
  reqHasAlpacaHeaders,
  reqKeyId,
  reqSecretKey,
  alpacaRequest,
  options = {},
) {
  const { start, end, live } = options;
  const limitValue = Math.max(1, Math.min(10000, safeParseInt(limit, 10)));

  let startTime, endTime;

  if (start && end) {
    startTime = start;
    endTime = end;
  } else {
    const todayStart = getTodayStartET();
    startTime = todayStart.toISOString();
    endTime = new Date().toISOString();
  }

  const alpacaParams = new URLSearchParams({
    symbols: symbols,
    timeframe: timeframe,
    limit: String(limitValue),
    start: startTime,
    end: endTime,
    feed: "iex",
  });

  const bars = await alpacaRequest(
    `/v2/stocks/bars?${alpacaParams.toString()}`,
    "GET",
    reqHasAlpacaHeaders
      ? { __alpacaKeyId: reqKeyId, __alpacaSecretKey: reqSecretKey }
      : null,
    live === true,
    true,
  );
  return { success: true, data: bars };
}
