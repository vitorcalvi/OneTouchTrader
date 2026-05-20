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

  // For daily timeframe, don't restrict to today - get most recent bars
  // For intraday, default to today if no range specified
  const isDaily = timeframe === "1Day";

  let startTime, endTime;

  if (start && end) {
    startTime = start;
    endTime = end;
  } else if (isDaily) {
    // Daily bars require an explicit start. Look back ~45 calendar days to cover ~30 trading days.
    // Omit `end` for daily — Alpaca free-tier SIP rejects "recent" (today's in-progress) data.
    startTime = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
    endTime = undefined;
  } else {
    const todayStart = getTodayStartET();
    startTime = todayStart.toISOString();
    endTime = new Date().toISOString();
  }

  const alpacaParams = new URLSearchParams({
    symbols: symbols,
    timeframe: timeframe,
    limit: String(limitValue),
  });

  // Only add time range for non-daily or when explicitly provided
  if (startTime) alpacaParams.set("start", startTime);
  if (endTime) alpacaParams.set("end", endTime);

  // Daily bars require SIP feed (IEX doesn't have daily)
  if (isDaily) {
    // No feed param - use SIP for daily
  } else {
    alpacaParams.set("feed", "iex");
  }

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
