import { randomUUID } from "node:crypto";

const MAX_NOTIONAL = 20000;
const SYMBOL_ALLOWLIST = new Set(["INTC", "QQQ", "IREN"]);
const DEFAULT_EXPIRY_MS = 5 * 60 * 1000;

const cards = new Map();

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
  if (body.notional > MAX_NOTIONAL) {
    return { status: 400, body: { error: "notional exceeds max" } };
  }
  if (!["LONG", "SHORT"].includes(body.direction)) {
    return { status: 400, body: { error: "invalid direction" } };
  }
  if (!["MARKET", "LIMIT"].includes(body.entryType)) {
    return { status: 400, body: { error: "invalid entryType" } };
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
    stopLoss: Number(body.stopLoss),
    takeProfit1: Number(body.takeProfit1),
    takeProfit2: body.takeProfit2 != null ? Number(body.takeProfit2) : undefined,
    notional: Number(body.notional),
    shares: Math.floor(Number(body.notional) / Number(body.entryPrice)),
    rationale: String(body.rationale),
    invalidation: String(body.invalidation),
    regime: body.regime,
    status: "PENDING",
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
    }
    const alpacaOrder = await fireOrderFn(orderBody);
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