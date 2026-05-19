import type { TradeCard, TradeCardStatus } from "../../shared/tradeCard";

const BASE = "http://localhost:5171/api/trade-cards";

export async function fetchTradeCards(status?: TradeCardStatus): Promise<TradeCard[]> {
  const url = status ? `${BASE}?status=${status}` : BASE;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`failed to fetch trade cards: ${r.status}`);
  return r.json();
}

export async function fireTradeCard(id: string): Promise<TradeCard> {
  const r = await fetch(`${BASE}/${id}/fire`, { method: "POST" });
  if (!r.ok) throw new Error(`fire failed: ${r.status} ${await r.text()}`);
  return r.json();
}

export async function cancelTradeCard(id: string): Promise<TradeCard> {
  const r = await fetch(`${BASE}/${id}/cancel`, { method: "POST" });
  if (!r.ok) throw new Error(`cancel failed: ${r.status} ${await r.text()}`);
  return r.json();
}