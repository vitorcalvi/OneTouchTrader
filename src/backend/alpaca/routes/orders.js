/**
 * Order management routes
 */
import { safeParseInt, safeParseFloat } from "../../shared/numbers.mjs";

export async function handleGetOrders(
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
  const status = searchParams.get("status") || "all";
  const limit = Math.max(
    1,
    Math.min(500, safeParseInt(searchParams.get("limit"), 100)),
  );
  const effectiveIsLive = isLive && hasLiveKeys ? true : false;

  let orders;
  if (!reqHasAlpacaHeaders) {
    const sdk = effectiveIsLive ? alpacaLive : alpacaPaper;
    orders = await sdk.getOrders({
      status,
      limit,
      symbol: searchParams.get("symbol") || undefined,
      after: searchParams.get("after") || undefined,
      until: searchParams.get("until") || undefined,
      nested: searchParams.get("nested") === "true",
    });
  } else {
    const queryParams = new URLSearchParams();
    queryParams.set("status", status);
    queryParams.set("limit", String(limit));
    if (searchParams.has("symbol"))
      queryParams.set("symbol", searchParams.get("symbol"));
    if (searchParams.has("side"))
      queryParams.set("side", searchParams.get("side"));
    if (searchParams.has("after"))
      queryParams.set("after", searchParams.get("after"));
    if (searchParams.has("until"))
      queryParams.set("until", searchParams.get("until"));
    if (searchParams.has("nested"))
      queryParams.set("nested", searchParams.get("nested"));

    orders = await alpacaRequest(
      `/v2/orders?${queryParams.toString()}`,
      "GET",
      { __alpacaKeyId: reqKeyId, __alpacaSecretKey: reqSecretKey },
      isLive,
    );
  }
  return { success: true, data: orders };
}

export async function handleGetOrder(
  orderId,
  searchParams,
  corsHeaders,
  reqHasAlpacaHeaders,
  reqKeyId,
  reqSecretKey,
  alpacaRequest,
) {
  const isLive = searchParams.get("live") === "true";
  const order = await alpacaRequest(
    `/v2/orders/${orderId}`,
    "GET",
    reqHasAlpacaHeaders
      ? { __alpacaKeyId: reqKeyId, __alpacaSecretKey: reqSecretKey }
      : null,
    isLive,
  );
  return { success: true, data: order };
}

export async function handlePatchOrder(
  orderId,
  body,
  searchParams,
  corsHeaders,
  reqHasAlpacaHeaders,
  reqKeyId,
  reqSecretKey,
  alpacaRequest,
) {
  const isLive = searchParams.get("live") === "true";
  const updated = await alpacaRequest(
    `/v2/orders/${orderId}`,
    "PATCH",
    reqHasAlpacaHeaders
      ? {
          ...body,
          __alpacaKeyId: reqKeyId,
          __alpacaSecretKey: reqSecretKey,
        }
      : body,
    isLive,
  );
  return { success: true, data: updated };
}

export async function handleDeleteOrder(
  orderId,
  searchParams,
  corsHeaders,
  reqHasAlpacaHeaders,
  reqKeyId,
  reqSecretKey,
  alpacaRequest,
) {
  const isLive = searchParams.get("live") === "true";
  await alpacaRequest(
    `/v2/orders/${orderId}`,
    "DELETE",
    reqHasAlpacaHeaders
      ? { __alpacaKeyId: reqKeyId, __alpacaSecretKey: reqSecretKey }
      : null,
    isLive,
  );
  return { success: true, data: { id: orderId, status: "cancelled" } };
}

export async function handleCancelAllOrders(
  searchParams,
  corsHeaders,
  reqHasAlpacaHeaders,
  reqKeyId,
  reqSecretKey,
  alpacaRequest,
) {
  const isLive = searchParams.get("live") === "true";
  const result = await alpacaRequest(
    "/v2/orders",
    "DELETE",
    reqHasAlpacaHeaders
      ? { __alpacaKeyId: reqKeyId, __alpacaSecretKey: reqSecretKey }
      : null,
    isLive,
  );
  const cancelledIds = Array.isArray(result)
    ? result.map((item) => item?.id).filter(Boolean)
    : [];
  return { success: true, data: cancelledIds };
}

export async function handleCreateOrder(
  body,
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

  // Guard: Strip invalid OTO from SELL market orders
  let order = body;
  if (
    body.side === "sell" &&
    body.type === "market" &&
    (body.order_class === "oto" || body.order_class === "bracket")
  ) {
    const { order_class, stop_loss, take_profit, ...cleanOrder } = body;
    order = cleanOrder;
  }

  // Normalize order parameters - Alpaca expects qty as number or string
  const normalizedOrder = {
    ...order,
    qty: order.qty !== undefined ? String(order.qty) : undefined,
    notional: order.notional !== undefined ? order.notional : undefined,
  };

  const effectiveIsLive = isLive && hasLiveKeys ? true : false;

  // Use direct API (alpacaRequest) for both auth methods
  // The @alpacahq/alpaca-trade-api SDK wraps errors without proper statusCode
  // alpacaRequest preserves the actual HTTP status from Alpaca's API
  if (!reqHasAlpacaHeaders) {
    const result = await alpacaRequest(
      "/v2/orders",
      "POST",
      normalizedOrder,
      effectiveIsLive,
    );
    return { success: true, data: result };
  } else {
    const result = await alpacaRequest(
      "/v2/orders",
      "POST",
      {
        ...normalizedOrder,
        __alpacaKeyId: reqKeyId,
        __alpacaSecretKey: reqSecretKey,
      },
      effectiveIsLive,
    );
    return { success: true, data: result };
  }
}
