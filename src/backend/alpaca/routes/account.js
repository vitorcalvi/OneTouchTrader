/**
 * Account and position routes
 */
import { safeParseFloat } from "../../shared/numbers.mjs";

export async function handleAccount(
  req,
  res,
  corsHeaders,
  searchParams,
  reqHasAlpacaHeaders,
  reqKeyId,
  reqSecretKey,
  alpacaRequest,
  alpacaPaper,
  alpacaLive,
  hasLiveKeys,
) {
  const isLive = searchParams.get("live") === "true";
  const effectiveIsLive = isLive && hasLiveKeys ? true : false;

  let account, positions;
  if (!reqHasAlpacaHeaders) {
    const sdk = effectiveIsLive ? alpacaLive : alpacaPaper;
    [account, positions] = await Promise.all([
      sdk.getAccount(),
      sdk.getPositions().catch(() => []),
    ]);
  } else {
    [account, positions] = await Promise.all([
      alpacaRequest(
        "/v2/account",
        "GET",
        { __alpacaKeyId: reqKeyId, __alpacaSecretKey: reqSecretKey },
        effectiveIsLive,
      ),
      alpacaRequest(
        "/v2/positions",
        "GET",
        { __alpacaKeyId: reqKeyId, __alpacaSecretKey: reqSecretKey },
        effectiveIsLive,
      ).catch(() => []),
    ]);
  }

  const totalUnrealizedPl = (positions || []).reduce((sum, pos) => {
    return sum + safeParseFloat(pos.unrealized_pl, 0);
  }, 0);
  const totalUnrealizedPlpc = (positions || []).reduce((sum, pos) => {
    return sum + safeParseFloat(pos.unrealized_plpc, 0);
  }, 0);

  const enrichedAccount = {
    ...account,
    buying_power: safeParseFloat(account.buying_power, 0),
    daytrading_buying_power: safeParseFloat(account.daytrading_buying_power, 0),
    equity: safeParseFloat(account.equity, 0),
    cash: safeParseFloat(account.cash, 0),
    unrealized_pl: totalUnrealizedPl.toFixed(2),
    unrealized_plpc: totalUnrealizedPlpc.toFixed(4),
  };

  return { success: true, data: enrichedAccount };
}

export async function handleGetPositions(
  searchParams,
  corsHeaders,
  reqHasAlpacaHeaders,
  reqKeyId,
  reqSecretKey,
  alpacaRequest,
  alpacaPaper,
  alpacaLive,
  hasLiveKeys,
) {
  const isLive = searchParams.get("live") === "true";
  const positions = await alpacaRequest(
    "/v2/positions",
    "GET",
    reqHasAlpacaHeaders
      ? { __alpacaKeyId: reqKeyId, __alpacaSecretKey: reqSecretKey }
      : null,
    isLive,
  );
  return { success: true, data: positions };
}

export async function handleGetPosition(
  symbol,
  searchParams,
  corsHeaders,
  reqHasAlpacaHeaders,
  reqKeyId,
  reqSecretKey,
  alpacaRequest,
  alpacaPaper,
  alpacaLive,
  hasLiveKeys,
) {
  const isLive = searchParams.get("live") === "true";
  const effectiveIsLive = isLive && hasLiveKeys ? true : false;

  let position;
  if (!reqHasAlpacaHeaders) {
    const sdk = effectiveIsLive ? alpacaLive : alpacaPaper;
    position = await sdk.getPosition(symbol);
  } else {
    position = await alpacaRequest(
      `/v2/positions/${symbol}`,
      "GET",
      { __alpacaKeyId: reqKeyId, __alpacaSecretKey: reqSecretKey },
      isLive,
    );
  }
  return { success: true, data: position };
}

export async function handleClosePosition(
  symbol,
  searchParams,
  corsHeaders,
  reqHasAlpacaHeaders,
  reqKeyId,
  reqSecretKey,
  alpacaRequest,
  alpacaPaper,
  alpacaLive,
  hasLiveKeys,
) {
  const isLive = searchParams.get("live") === "true";
  const effectiveIsLive = isLive && hasLiveKeys ? true : false;

  const result = await alpacaRequest(
    `/v2/positions/${symbol}`,
    "DELETE",
    reqHasAlpacaHeaders
      ? { __alpacaKeyId: reqKeyId, __alpacaSecretKey: reqSecretKey }
      : null,
    effectiveIsLive,
  );
  return { success: true, data: result };
}
