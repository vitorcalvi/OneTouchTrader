import { randomUUID } from "node:crypto";

const SYMBOL_ALLOWLIST = new Set(["INTC", "QQQ", "IREN"]);
const DEFAULT_EXPIRY_MS = 5 * 60 * 1000;

const cards = new Map();

// Phase cap from env (Task 4)
const DEFAULT_PHASE_CAP = 10000;
const phaseCapStr = process.env.MAX_NOTIONAL_PHASE;
const PHASE_CAP = phaseCapStr ? Number(phaseCapStr) : DEFAULT_PHASE_CAP;

function expireStale() {
  const now = Date.now();
  for (const card of cards.values()) {
    if (card.status === "PENDING" && new Date(card.expiresAt).getTime() < now) {
      card.status = "EXPIRED";
    }
  }
}

function authOk(req, expectedToken) {
  const header = req.headers["authorization"] || "";
  return header === `Bearer ${expectedToken}`;
}

export async function handlePostTradeCard(body, expectedToken, req) {
  if (!authOk(req, expectedToken)) {
    return { status: 401, body: { error: "unauthorized" } };
  }
  const required = [
    "symbol", "direction", "entryType", "entryPrice",
    "stopLoss", "takeProfit1", "notional", "rationale",
    "invalidation", "regime", "source"
  ];
  for (const k of required) {
    if (body[k] === undefined || body[k] === null) {
      return { status: 400, body: { error: `missing field: ${k}` } };
    }
  }
  if (!SYMBOL_ALLOWLIST.has(body.symbol)) {
    return { status: 400, body: { error: "symbol not allowed" } };
  }

  // Daily loss circuit breaker
  const maxDailyLossStr = process.env.MAX_DAILY_LOSS_USD;
  const maxDailyLoss = maxDailyLossStr ? Number(maxDailyLossStr) : 300;
  const targetLive = body.live === true;
  let dailyLossCheckSkipped = false;
  try {
    const acctRes = await fetch(`http://localhost:5171/api/alpaca/account?live=${targetLive}`);
    const acctData = await acctRes.json();
    const equity = Number(acctData?.data?.equity);
    const lastEquity = Number(acctData?.data?.last_equity);
    if (Number.isFinite(equity) && Number.isFinite(lastEquity)) {
      const todayPnL = equity - lastEquity;
      if (todayPnL < -maxDailyLoss) {
        return {
          status: 400,
          body: { error: "daily loss limit breached", todayPnL: Number(todayPnL.toFixed(2)), cap: maxDailyLoss },
        };
      }
    } else {
      dailyLossCheckSkipped = true;
    }
  } catch (e) {
    console.error("daily loss check failed", e);
    dailyLossCheckSkipped = true;
  }

  if (body.notional > PHASE_CAP) {
    return { status: 400, body: { error: "notional exceeds phase cap", cap: PHASE_CAP, attempted: body.notional } };
  }
  if (!["LONG", "SHORT"].includes(body.direction)) {
    return { status: 400, body: { error: "invalid direction" } };
  }
  if (!["MARKET", "LIMIT", "STOP", "STOP_LIMIT"].includes(body.entryType)) {
    return { status: 400, body: { error: "invalid entryType" } };
  }

  // R:R minimum (Task 4)
  const minRR = Number(process.env.MIN_RR_RATIO || "2.0");
  const isLong = body.direction === "LONG";
  const entryRef = body.entryType === "STOP" || body.entryType === "STOP_LIMIT"
    ? Number(body.stopTriggerPrice) : Number(body.entryPrice);
  const risk = isLong ? entryRef - Number(body.stopLoss) : Number(body.stopLoss) - entryRef;
  const reward = isLong ? Number(body.takeProfit1) - entryRef : entryRef - Number(body.takeProfit1);
if (risk <= 0 || reward <= 0) {
    return { status: 400, body: { error: "invalid risk/reward: bad SL or TP relative to entry" } };
  }
  const rr = reward / risk;
  if (rr < minRR) {
    return { status: 400, body: { error: `R:R ${rr.toFixed(2)} below minimum ${minRR}`, risk, reward } };
  }

  const isStopEntry = body.entryType === "STOP" || body.entryType === "STOP_LIMIT";
  if (isStopEntry) {
    if (body.stopTriggerPrice == null || body.stopTriggerPrice <= 0) {
      return { status: 400, body: { error: "stopTriggerPrice required for stop entries" } };
    }
  }

  let quote = null;
  let quoteUnavailable = false;
  try {
    const res = await fetch(`http://localhost:5171/api/alpaca/quotes?symbols=${body.symbol}`);
    const data = await res.json();
    quote = data?.data?.quotes?.[body.symbol];
  } catch (e) {
    console.error("Quote fetch failed", e);
    quoteUnavailable = true;
  }

  if (quote && isStopEntry) {
    if (body.direction === "SHORT" && body.stopTriggerPrice >= quote.bp) {
      return { status: 400, body: { error: "SHORT stop price must be < bid" } };
    }
    if (body.direction === "LONG" && body.stopTriggerPrice <= quote.ap) {
      return { status: 400, body: { error: "LONG stop price must be > ask" } };
    }
  }

  const referencePriceForShares =
    body.entryType === "STOP" ? Number(body.stopTriggerPrice)
    : body.entryType === "STOP_LIMIT" ? Number(body.entryPrice)
    : body.entryType === "LIMIT" ? Number(body.entryPrice)
    : Number(body.entryPrice);

  if (!Number.isFinite(referencePriceForShares) || referencePriceForShares <= 0) {
    return { status: 400, body: { error: "invalid reference price for share calculation" } };
  }

  const id = randomUUID();
  const now = new Date();
  const card = {
    id,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + DEFAULT_EXPIRY_MS).toISOString(),
    source: String(body.source),
    symbol: body.symbol,
    direction: body.direction,
    entryType: body.entryType,
    entryPrice: Number(body.entryPrice),
    stopTriggerPrice: isStopEntry ? Number(body.stopTriggerPrice) : undefined,
    stopLoss: Number(body.stopLoss),
    takeProfit1: Number(body.takeProfit1),
    takeProfit2: body.takeProfit2 != null ? Number(body.takeProfit2) : undefined,
    notional: Number(body.notional),
    shares: Math.floor(Number(body.notional) / referencePriceForShares),
    rationale: String(body.rationale),
    invalidation: String(body.invalidation),
    regime: body.regime,
    status: "PENDING",
    quoteUnavailable,
    live: body.live === true,
    dailyLossCheckSkipped: dailyLossCheckSkipped || undefined,
  };
  cards.set(id, card);
  return { status: 201, body: card };
}

export async function handleGetTradeCards(searchParams) {
  expireStale();
  const status = searchParams.get("status");
  const all = Array.from(cards.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const filtered = status ? all.filter((c) => c.status === status) : all;
  return { status: 200, body: filtered };
}

export async function handleFireTradeCard(id, fireOrderFn) {
  expireStale();
  const card = cards.get(id);
  if (!card) return { status: 404, body: { error: "not found" } };
  if (card.status !== "PENDING") {
    return { status: 409, body: { error: `cannot fire status=${card.status}` } };
  }

  try {
    const res = await fetch(`http://localhost:5171/api/alpaca/quotes?symbols=${card.symbol}`);
    const data = await res.json();
    const quote = data?.data?.quotes?.[card.symbol];
    if (quote) {
      const mid = (quote.bp + quote.ap) / 2;
      const ref = ["STOP", "STOP_LIMIT"].includes(card.entryType) ? card.stopTriggerPrice : card.entryPrice;
      const drift = Math.abs(mid - ref) / ref;
      if (drift > 0.005) {
        card.status = "REJECTED";
        card.rejectionReason = `drift guard: mid ${mid.toFixed(2)} drifted ${(drift * 100).toFixed(2)}% from reference ${ref.toFixed(2)}`;
        return { status: 409, body: card };
      }
    } else {
      card.driftCheckSkipped = true;
    }
  } catch (e) {
    console.error("Drift check fetch failed", e);
    card.driftCheckSkipped = true;
  }

  try {
    const orderBody = {
      symbol: card.symbol,
      qty: String(card.shares),
      side: card.direction === "LONG" ? "buy" : "sell",
      type: card.entryType.toLowerCase(),
      time_in_force: "day",
      order_class: "bracket",
      take_profit: { limit_price: String(card.takeProfit1) },
      stop_loss: { stop_price: String(card.stopLoss) },
    };
    if (card.entryType === "LIMIT") {
      orderBody.limit_price = String(card.entryPrice);
    } else if (card.entryType === "STOP") {
      orderBody.type = "stop";
      orderBody.stop_price = String(card.stopTriggerPrice);
    } else if (card.entryType === "STOP_LIMIT") {
      orderBody.type = "stop_limit";
      orderBody.stop_price = String(card.stopTriggerPrice);
      orderBody.limit_price = String(card.entryPrice);
    }

    const alpacaOrder = await fireOrderFn(orderBody, card.live === true);
    card.status = "FIRED";
    card.alpacaOrderId = alpacaOrder?.id || null;
    card.firedAt = new Date().toISOString();
    return { status: 200, body: card };
  } catch (err) {
    card.status = "REJECTED";
    card.rejectionReason = err?.message || "unknown error";
    return { status: 502, body: card };
  }
}

export async function handleCancelTradeCard(id) {
  const card = cards.get(id);
  if (!card) return { status: 404, body: { error: "not found" } };
  if (card.status !== "PENDING") {
    return { status: 409, body: { error: `cannot cancel status=${card.status}` } };
  }
  card.status = "CANCELED";
  return { status: 200, body: card };
}