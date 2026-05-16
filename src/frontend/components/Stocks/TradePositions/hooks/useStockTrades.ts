// useStockTrades - Hook for stock trading execution
// Handles smart entry, manual orders, stop management, position closing

import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { AlpacaService } from '@/services/stocks';
import { Position, Order } from '@/types';
import { vibrate } from '..';
import { cancelExistingExitOrders as cancelExitOrdersUtil } from '@/utils/stocks/cancelExistingExitOrders';

interface ScalperConfig {
  priceBufferPct: number;
  minTrailPct: number;
  maxTrailPct: number;
  exitBufferPct: number;
  microTrailPct: number;
}

interface TradeConfig {
  orderType: string;
  aggressiveMode: boolean;
  useAtr: boolean;
  atrMultiplier: number;
  manualTrailPercent: number;
  extendedHours: boolean;
  timeInForce: string;
  scalper: ScalperConfig;
}

interface UseStockTradesOptions {
  service: AlpacaService;
  config: TradeConfig;
  positions: Position[];
  orders: Order[];
  loadData: () => Promise<void>;
}

interface ManualOrderParams {
  side: 'buy' | 'sell';
  symbol: string;
  qty: number;
  orderType: string;
  limitPrice?: string;
  manualTrail: number;
  extendedHours: boolean;
}

export function useStockTrades(options: UseStockTradesOptions) {
  const {
    service,
    config,
    loadData
  } = options;

  const [isSubmitting, setIsSubmitting] = useState(false);

  const aggressiveMode = config.aggressiveMode;

  const cancelExistingExitOrders = useCallback(async (symbol: string, side?: 'buy' | 'sell') => {
    return cancelExitOrdersUtil(service, { symbol, side });
  }, [service]);

  // Manual order execution
  const executeManualOrder = useCallback(async (params: ManualOrderParams) => {
    const { side, symbol, qty, orderType, limitPrice, extendedHours } = params;
    const upperSymbol = symbol.toUpperCase();

    const orderPayload: any = {
      symbol: upperSymbol,
      qty: qty,
      side: side,
      time_in_force: aggressiveMode ? 'ioc' : config.timeInForce
    };

    if (orderType === 'limit') {
      orderPayload.type = 'limit';
      orderPayload.limit_price = limitPrice;
      if (extendedHours) orderPayload.extended_hours = true;
    } else {
      orderPayload.type = 'market';
      // Note: extended_hours is only valid for limit orders on Alpaca
    }

    await service.submitOrder(orderPayload);
    return { filledPrice: 0, trailPct: 0 };
  }, [service, config, aggressiveMode]);

  // Cancel order
  const cancelOrder = useCallback(async (orderId: string, symbol: string) => {
    vibrate(10);
    setIsSubmitting(true);
    try {
      await service.cancelOrder(orderId);
      toast.success(`Canceled order for ${symbol}`);
      loadData();
    } catch (e: any) {
      toast.error(e.message || 'Failed to cancel');
    } finally {
      setIsSubmitting(false);
    }
  }, [service, loadData]);

  return {
    isSubmitting,
    setIsSubmitting,
    cancelExistingExitOrders,
    executeManualOrder,
    cancelOrder
  };
}
