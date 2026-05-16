import type { Order, Position } from '../../types';

export interface IOrderManager {
  submitOrder(order: {
    symbol: string;
    qty: string | number;
    side: 'buy' | 'sell';
    type: string;
    time_in_force: string;
    limit_price?: string;
    stop_price?: string;
    order_class?: 'simple' | 'bracket' | 'oco' | 'oto';
    extended_hours?: boolean;
    stop_loss?: { stop_price: string };
    take_profit?: { limit_price: string };
    trail_price?: string;
    trail_percent?: string;
  }): Promise<Order>;

  cancelOrder(orderId: string): Promise<void>;
  cancelAllOrders(): Promise<void>;
  getOrders(status?: string): Promise<Order[]>;
  getOrderById(orderId: string): Promise<Order>;
  getPositions(): Promise<Position[]>;
  closePosition(symbol: string): Promise<void>;
  getLatestTrade(symbol: string): Promise<number>;
}

export interface StockOrderManager extends IOrderManager {
  submitBracketOrder(params: {
    symbol: string;
    qty: string | number;
    side: 'buy' | 'sell';
    limit_price?: string;
    stop_loss: { stop_price: string };
    take_profit: { limit_price: string };
    extended_hours?: boolean;
  }): Promise<Order>;

  submitOtoOrder(params: {
    symbol: string;
    qty: string | number;
    side: 'buy' | 'sell';
    stop_loss: { stop_price: string };
  }): Promise<Order>;
}

export interface CryptoOrderManager extends IOrderManager {
  submitStopLimitOrder(params: {
    symbol: string;
    qty: string | number;
    side: 'buy' | 'sell';
    stop_price: string;
    limit_price: string;
    time_in_force?: 'gtc' | 'ioc';
  }): Promise<Order>;
}