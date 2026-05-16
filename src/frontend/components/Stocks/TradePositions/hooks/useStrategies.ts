import { useRef, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { AlpacaService } from '@/services/stocks';
import { Order, Position } from '@/types';
import { safeParseFloat } from '@/shared/utils/numbers';
import { calculateATR } from '@/utils/stocks/indicators';

interface Strategy {
  type: string;
  side?: string;
  targetPrice?: number;
  bottomLevel?: number;
  topLevel?: number;
  touches?: number;
  isTouchingBottom?: boolean;
  isTouchingTop?: boolean;
  orderIds?: string[];
  createdAt?: number;
}

interface UseStrategiesParams {
  service: AlpacaService;
  positions: Position[];
  realtimePrices: Record<string, number>;
  executeClosePosition: (pos: Position) => Promise<unknown>;
  getAssetClass: (symbol: string) => Promise<'crypto' | 'us_equity'>;
}

export function useStrategies({
  service,
  positions,
  realtimePrices,
  executeClosePosition,
  getAssetClass,
}: UseStrategiesParams) {
  const strategiesRef = useRef<Record<string, Strategy>>({});
  const positionsRef = useRef(positions);
  const realtimePricesRef = useRef(realtimePrices);

  useEffect(() => {
    positionsRef.current = positions;
  }, [positions]);

  useEffect(() => {
    realtimePricesRef.current = realtimePrices;
  }, [realtimePrices]);

  const saveStrategy = useCallback((symbol: string, data: Strategy) => {
    const newStrategies = { ...strategiesRef.current, [symbol]: data };
    strategiesRef.current = newStrategies;
  }, []);

  const removeStrategy = useCallback((symbol: string) => {
    const newStrategies = { ...strategiesRef.current };
    delete newStrategies[symbol];
    strategiesRef.current = newStrategies;
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const currentStrategies = strategiesRef.current;
      if (Object.keys(currentStrategies).length === 0) return;
      Object.entries(currentStrategies).forEach(([symbol, strategy]) => {
        const currentPrice = realtimePricesRef.current[symbol];
        if (!currentPrice) return;

        let updated = false;
        const newStrategy = { ...strategy };

        if (strategy.type === 'crypto_exit' && strategy.targetPrice) {
           const isLong = strategy.side === 'long';
           const targetReached = isLong 
             ? currentPrice >= strategy.targetPrice 
             : currentPrice <= strategy.targetPrice;

           if (targetReached) {
             const pos = positionsRef.current.find(p => p.symbol === symbol);
             if (pos) {
               console.log(`[Strategy] ${symbol} Crypto TP Target reached ($${strategy.targetPrice}). Closing position.`);
               toast.success(`${symbol} Take Profit Hit! Closing.`);
               executeClosePosition(pos);
               removeStrategy(symbol);
               return;
             }
           }
        }

        if (strategy.type === 'long_sideways') {
           const { bottomLevel, topLevel } = newStrategy;
           if (bottomLevel === undefined || topLevel === undefined) return;
           const threshold = (topLevel - bottomLevel) * 0.05;
           
           if (currentPrice <= bottomLevel + threshold) {
             if (!newStrategy.isTouchingBottom) {
               newStrategy.touches = (newStrategy.touches || 0) + 1;
               newStrategy.isTouchingBottom = true;
               updated = true;
               console.log(`[Strategy] ${symbol} Touch Bottom #${newStrategy.touches}`);
               
               if (newStrategy.touches >= 2) {
                  toast.info( `${symbol} Sideways Limit Trigger: 2nd Bottom Touch - Closing!`);
                  const pos = positionsRef.current.find(p => p.symbol === symbol);
                 if (pos) {
                    executeClosePosition(pos);
                    removeStrategy(symbol);
                    return;
                 }
               }
             }
           } else {
             if (newStrategy.isTouchingBottom && currentPrice > bottomLevel + threshold * 2) {
               newStrategy.isTouchingBottom = false;
               updated = true;
             }
           }
        } else if (strategy.type === 'short_sideways') {
           const { bottomLevel, topLevel } = newStrategy;
           if (bottomLevel === undefined || topLevel === undefined) return;
           const threshold = (topLevel - bottomLevel) * 0.05;
           
           if (currentPrice >= topLevel - threshold) {
             if (!newStrategy.isTouchingTop) {
               newStrategy.touches = (newStrategy.touches || 0) + 1;
               newStrategy.isTouchingTop = true;
               updated = true;
               console.log(`[Strategy] ${symbol} Touch Top #${newStrategy.touches}`);
               
               if (newStrategy.touches >= 2) {
                  toast.info( `${symbol} Sideways Limit Trigger: 2nd Top Touch - Closing!`);
                  const pos = positionsRef.current.find(p => p.symbol === symbol);
                 if (pos) {
                    executeClosePosition(pos);
                    removeStrategy(symbol);
                    return;
                 }
               }
             }
           } else {
             if (newStrategy.isTouchingTop && currentPrice < topLevel - threshold * 2) {
               newStrategy.isTouchingTop = false;
               updated = true;
             }
           }
        }

        if (updated) {
          saveStrategy(symbol, newStrategy);
        }
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [removeStrategy, executeClosePosition, saveStrategy]);

  const cancelSidewaysLimit = useCallback(async (sym: string) => {
    const strategy = strategiesRef.current[sym];
    if (!strategy) return;
    if (strategy.orderIds) {
      await Promise.all(strategy.orderIds.map((id: string) => service.cancelOrder(id).catch((err) => console.error('[useStrategies]', err.message))));
    }
    removeStrategy(sym);
    toast.info( `Sideways Limit cancelled for ${sym}`);
  }, [service, removeStrategy]);

  const executeSidewaysLimitStrategy = useCallback(async (symbol: string, side: 'long' | 'short', price: number, qty: string) => {
    const existing = strategiesRef.current[symbol];
    if (existing && (existing.type === 'long_sideways' || existing.type === 'short_sideways')) {
      toast.error( `Sideways Limit already active for ${symbol}. Cancel it first.`);
      return;
    }

    toast.info( `Calculating ATR for ${symbol} Sideways Limit...`);

    try {
      let atr: number | undefined;
      const bars = await service.getBars(symbol, '1D', 50);
      const calculated = calculateATR(bars);
      atr = calculated ?? undefined;

      if (!atr) {
        toast.error( `Not enough data for ATR (${bars?.length || 0} bars, need at least 1)`);
        return;
      }

      const offset = atr * 1.25;
      const assetClass = await getAssetClass(symbol);
      const timeInForce = assetClass === 'crypto' ? 'gtc' : 'day';

      if (side === 'long') {
        const order1 = await service.submitOrder({
          symbol: symbol,
          qty: qty,
          side: 'buy',
          type: 'stop_limit',
          stop_price: (price + offset).toFixed(2),
          limit_price: (price + offset + 0.05).toFixed(2),
          time_in_force: timeInForce
        });

        let order2: Order;
        try {
          order2 = await service.submitOrder({
            symbol: symbol,
            qty: qty,
            side: 'buy',
            type: 'limit',
            limit_price: (price - offset).toFixed(2),
            time_in_force: timeInForce
          });
        } catch (err) {
          await service.cancelOrder(order1.id).catch((e) => console.error('[useStrategies]', e.message));
          throw err;
        }

        saveStrategy(symbol, {
          type: 'long_sideways',
          bottomLevel: price - offset,
          topLevel: price + offset,
          touches: 0,
          isTouchingBottom: false,
          orderIds: [order1.id, order2.id],
          createdAt: Date.now()
        });

      } else {
        const order1 = await service.submitOrder({
          symbol: symbol,
          qty: qty,
          side: 'sell',
          type: 'limit',
          limit_price: (price + offset).toFixed(2),
          time_in_force: timeInForce
        });

        let order2: Order;
        try {
          order2 = await service.submitOrder({
            symbol: symbol,
            qty: qty,
            side: 'sell',
            type: 'stop_limit',
            stop_price: (price - offset).toFixed(2),
            limit_price: (price - offset - 0.05).toFixed(2),
            time_in_force: timeInForce
          });
        } catch (err) {
          await service.cancelOrder(order1.id).catch((e) => console.error('[useStrategies]', e.message));
          throw err;
        }

        saveStrategy(symbol, {
          type: 'short_sideways',
          bottomLevel: price - offset,
          topLevel: price + offset,
          touches: 0,
          isTouchingTop: false,
          orderIds: [order1.id, order2.id],
          createdAt: Date.now()
        });
      }
      toast.success( `Sideways Limit Active for ${symbol} (ATR: ${atr.toFixed(2)})`);
    } catch (e: any) {
      toast.error( e.message || 'Failed to place Sideways Limit orders');
    }
  }, [service, getAssetClass, saveStrategy]);

  const executeSidewaysLimit = useCallback(async (pos: Position, payload?: { qty?: number }) => {
    const currentPrice = safeParseFloat(pos.current_price);
    const qtyToTrade = payload?.qty ? String(payload.qty) : '1';
    await executeSidewaysLimitStrategy(pos.symbol, pos.side, currentPrice, qtyToTrade);
  }, [executeSidewaysLimitStrategy]);

  return {
    strategiesRef,
    saveStrategy,
    removeStrategy,
    cancelSidewaysLimit,
    executeSidewaysLimit,
    executeSidewaysLimitStrategy,
  };
}
