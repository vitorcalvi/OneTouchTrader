import type { Order } from '../../types';

export interface CryptoOrderParams {
  symbol: string;
  qty: string | number;
  side: 'buy' | 'sell';
  type: string;
  time_in_force?: 'gtc' | 'ioc';
  limit_price?: string;
  stop_price?: string;
  stop_loss?: { stop_price: string };
  take_profit?: { limit_price: string };
  trail_price?: string;
  trail_percent?: string;
}

export class CryptoOrderManager {
  async submitOrder(
    order: CryptoOrderParams,
    httpFetch: (url: string, options: RequestInit) => Promise<Response>
  ): Promise<Order> {
    const upperSymbol = order.symbol.toUpperCase();

    let payload: Record<string, unknown> = {
      symbol: upperSymbol.replace('/', ''),
      qty: String(order.qty),
      side: order.side,
      time_in_force: order.time_in_force === 'ioc' ? 'ioc' : 'gtc',
    };

    if (order.type) {
      const type = order.type.toLowerCase();
      if (type === 'stop') {
        payload.type = 'stop_limit';
      } else {
        payload.type = type;
      }
    }

    if (order.limit_price) payload.limit_price = order.limit_price;
    if (order.stop_price) payload.stop_price = order.stop_price;
    if (order.trail_price !== undefined) payload.trail_price = order.trail_price;
    if (order.trail_percent !== undefined) payload.trail_percent = order.trail_percent;

    const url = '/api/alpaca/orders';
    const response = await httpFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    return this.handleResponse(response);
  }

  async submitStopLimitOrder(
    params: {
      symbol: string;
      qty: string | number;
      side: 'buy' | 'sell';
      stop_price: string;
      limit_price: string;
      time_in_force?: 'gtc' | 'ioc';
    },
    httpFetch: (url: string, options: RequestInit) => Promise<Response>
  ): Promise<Order> {
    return this.submitOrder({
      symbol: params.symbol,
      qty: params.qty,
      side: params.side,
      type: 'stop_limit',
      time_in_force: params.time_in_force || 'gtc',
      stop_price: params.stop_price,
      limit_price: params.limit_price,
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

export const cryptoOrderManager = new CryptoOrderManager();