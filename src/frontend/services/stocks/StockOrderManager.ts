import type { Order } from '../../types';

export interface StockOrderParams {
  symbol: string;
  qty: string | number;
  side: 'buy' | 'sell';
  type: string;
  time_in_force?: string;
  limit_price?: string;
  stop_price?: string;
  order_class?: 'simple' | 'bracket' | 'oco' | 'oto';
  extended_hours?: boolean;
  stop_loss?: { stop_price: string };
  take_profit?: { limit_price: string };
  trail_price?: string;
  trail_percent?: string;
}

import { portfolioRiskService } from './portfolioRiskService';

export class StockOrderManager {
  async submitOrder(
    order: StockOrderParams,
    httpFetch: (url: string, options: RequestInit) => Promise<Response>
  ): Promise<Order> {
    // P0: Check Daily Loss Cap
    if (!portfolioRiskService.checkDailyLossCap()) {
      throw new Error("Daily loss cap reached. Trading halted.");
    }

    // P1: Check Max Position Size
    const currentWeight = portfolioRiskService.getPositionWeight(order.symbol);
    if (currentWeight * 100 > 25) { // Using 25% threshold as default
      throw new Error(`Position size for ${order.symbol} exceeds maximum concentration limit.`);
    }

    console.log('[StockOrderManager] submitOrder called with:', JSON.stringify(order));
    const payload: Record<string, unknown> = {
      symbol: order.symbol.toUpperCase(),
      qty: String(order.qty),
      side: order.side,
      time_in_force: order.time_in_force || 'day',
    };

    if (order.type) payload.type = order.type;
    if (order.limit_price !== undefined) payload.limit_price = order.limit_price;
    if (order.stop_price !== undefined) payload.stop_price = order.stop_price;
    if (order.order_class !== undefined) payload.order_class = order.order_class;
    if (order.extended_hours !== undefined) payload.extended_hours = order.extended_hours;
    if (order.stop_loss !== undefined) payload.stop_loss = order.stop_loss;
    if (order.take_profit !== undefined) payload.take_profit = order.take_profit;
    if (order.trail_price !== undefined) payload.trail_price = order.trail_price;
    if (order.trail_percent !== undefined) payload.trail_percent = order.trail_percent;

    console.log('[StockOrderManager] Payload:', JSON.stringify(payload));

    const url = '/api/alpaca/orders';
    const response = await httpFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    return this.handleResponse(response);
  }

  async submitBracketOrder(
    params: {
      symbol: string;
      qty: string | number;
      side: 'buy' | 'sell';
      limit_price?: string;
      extended_hours?: boolean;
    },
    stopLoss: { stop_price: string },
    takeProfit: { limit_price: string },
    httpFetch: (url: string, options: RequestInit) => Promise<Response>
  ): Promise<Order> {
    return this.submitOrder({
      symbol: params.symbol,
      qty: params.qty,
      side: params.side,
      type: 'limit',
      time_in_force: 'day',
      limit_price: params.limit_price,
      extended_hours: params.extended_hours,
      order_class: 'bracket',
      stop_loss: stopLoss,
      take_profit: takeProfit,
    }, httpFetch);
  }

  async submitOtoOrder(
    params: {
      symbol: string;
      qty: string | number;
      side: 'buy' | 'sell';
    },
    stopLoss: { stop_price: string },
    httpFetch: (url: string, options: RequestInit) => Promise<Response>
  ): Promise<Order> {
    return this.submitOrder({
       symbol: params.symbol,
       qty: params.qty,
       side: params.side,
       type: 'market',
       time_in_force: 'ioc',
       stop_loss: stopLoss,
     }, httpFetch);
  }

  private async handleResponse(response: Response): Promise<Order> {
    if (response.status === 204) return null as any;
    const text = await response.text();
    if (!response.ok) {
      try {
        const json = JSON.parse(text);
        throw new Error(json.message || json.error || text);
      } catch {
        throw new Error(text || `HTTP ${response.status}`);
      }
    }
    return JSON.parse(text);
  }
}

export const stockOrderManager = new StockOrderManager();
