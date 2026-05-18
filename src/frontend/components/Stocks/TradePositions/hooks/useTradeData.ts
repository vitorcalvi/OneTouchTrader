import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { toast } from 'sonner';
import { AlpacaService, OrderUpdate } from '@/services/stocks';
import { Account, Position, Order } from '@/types';
import type { TradingMode, ClosedPosition } from '../index';

interface UseTradeDataProps {
   service: AlpacaService;
   account: Account | null;
   isLoading?: boolean;
   aggressiveMode: boolean;
   pollingInterval?: number;
   tradingMode: TradingMode;
   extraSymbols?: string[];
}

export const useTradeData = ({
   service,
   account,
   isLoading,
   aggressiveMode,
   pollingInterval = 3,
   tradingMode,
   extraSymbols,
 }: UseTradeDataProps) => {
  const [positions, setPositions] = useState<Position[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [recentPositions, setRecentPositions] = useState<ClosedPosition[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [realtimePrices, setRealtimePrices] = useState<{[key: string]: number}>({});
  const initialLoadDone = useRef(false);
const wsConnecting = useRef(false);
  const prevPositionsRef = useRef<Position[]>([]);
  const [consecutiveErrors, setConsecutiveErrors] = useState(0);
  const [isDataStale, setIsDataStale] = useState(false);
  const recordedKeysRef = useRef<string[]>([]);
  const entryMeta = useRef<{[key: string]: {entry_time: string; account_equity: number; position_pct: string}}>({});

  // P4-2: Move side effects out of setPositions updater
  useEffect(() => {
    const prevPositions = prevPositionsRef.current;
if (prevPositions.length === 0 && positions.length === 0) return;

    // Detect newly opened positions and store entry metadata
    const newPositions = positions.filter(p => !prevPositions.find(prev => prev.symbol === p.symbol));
    if (newPositions.length > 0 && account) {
      newPositions.forEach(p => {
        if (!entryMeta.current[p.symbol]) {
          const marketValue = parseFloat(p.market_value);
          const accountEquity = parseFloat(account.equity);

          entryMeta.current[p.symbol] = {
            entry_time: new Date().toISOString(),
            account_equity: accountEquity,
            position_pct: ((marketValue / accountEquity) * 100).toFixed(2)
          };
        }
      });
    }

    // Detect closed positions
    const closedSymbols = prevPositions
      .filter(prev => !positions.find(p => p.symbol === prev.symbol))
      .slice(0, 10); // Handle up to 10 simultaneous closes

    if (closedSymbols.length > 0) {
      // Cancel orphaned orders for closed positions
      const normSym = (s: string) => s.replace('/', '').replace('-', '').replace('_', '').toUpperCase().trim();
      const closedSymbolSet = new Set(closedSymbols.map(p => normSym(p.symbol)));
      const orphanedOrders = orders.filter(o =>
        closedSymbolSet.has(normSym(o.symbol)) &&
        ['new', 'accepted', 'pending_new', 'partially_filled'].includes(o.status)
      );
      if (orphanedOrders.length > 0) {
        console.log(`[TradeData] Canceling ${orphanedOrders.length} orphaned orders for closed positions:`,
          orphanedOrders.map(o => `${o.symbol} ${o.type} ${o.side} ${o.id}`));
        orphanedOrders.forEach(o => {
          service.cancelOrder(o.id).catch(err =>
            console.debug(`[TradeData] Failed to cancel orphan ${o.id}:`, err)
          );
        });
      }

      let recent: ClosedPosition[] = [];

      const recordedKeys = recordedKeysRef.current;
      // Record each closed position with deduplication key
      for (const p of closedSymbols) {
        const meta = entryMeta.current[p.symbol];
        const entryTime = meta && typeof meta.entry_time === 'string' ? meta.entry_time : '';
        const tradeKey = `${p.symbol}:${entryTime}:${p.avg_entry_price}:${p.qty}`;
        if (recordedKeys.includes(tradeKey)) continue;
        
        // Add to deduplication set
        recordedKeysRef.current = [tradeKey, ...recordedKeys].slice(0, 200);
      }

      // Convert closed positions to ClosedPosition type with analytics
      const closedWithAnalytics: ClosedPosition[] = closedSymbols.map(p => {
        const entryPrice = parseFloat(p.avg_entry_price);
        const exitPrice = parseFloat(p.current_price);
        const qty = Math.abs(parseFloat(p.qty));
        const isLong = p.side === 'long';
        const pl = parseFloat(p.unrealized_pl);

        let entryTime = '';
        let accountEquity = 0;
        let positionPct = 0;
        const meta = entryMeta.current[p.symbol];
        if (meta) {
          entryTime = typeof meta.entry_time === 'string' ? meta.entry_time : '';
          accountEquity = typeof meta.account_equity === 'number' ? meta.account_equity : 0;
          positionPct = typeof meta.position_pct === 'string' ? parseFloat(meta.position_pct) : 0;
        }

        const avgTrail = (aggressiveMode ? 0.5 : 1.5) / 100;
        const stopDistance = entryPrice * avgTrail;
        const stopPrice = isLong ? entryPrice - stopDistance : entryPrice + stopDistance;
        const riskAmount = stopDistance * qty;
        const riskRMultiple = riskAmount > 0 ? pl / riskAmount : 0;
        const strategyId = `${tradingMode}_${aggressiveMode ? 'scalper' : 'standard'}`;

        return {
          symbol: p.symbol,
          qty: p.qty,
          side: p.side,
          unrealized_pl: p.unrealized_pl,
          current_price: p.current_price,
          asset_id: p.asset_id,
          tradingMode: tradingMode,
          closedAt: new Date().toISOString(),
          strategy_id: strategyId,
          entry_time: entryTime,
          entry_price: p.avg_entry_price,
          exit_price: exitPrice.toFixed(2),
          stop_price: stopPrice.toFixed(2),
          risk_amount: riskAmount,
          risk_r_multiple: riskRMultiple,
          account_equity_at_entry: accountEquity,
          position_pct_equity: positionPct,
          duration_minutes: entryTime
            ? Math.floor((Date.now() - new Date(entryTime).getTime()) / 60000)
            : 0
        };
      });

      const merged = [...closedWithAnalytics, ...recent];
      const seenKeys = new Set<string>();
      const updated = merged.filter(p => {
        const key = p.asset_id || `${p.symbol}:${p.entry_price}`;
        if (seenKeys.has(key)) return false;
        seenKeys.add(key);
        return true;
      }).slice(0, 10);
      setRecentPositions(updated);

closedSymbols.forEach(p => {
         delete entryMeta.current[p.symbol];
       });
     }

    prevPositionsRef.current = positions;
  }, [positions, account, aggressiveMode, tradingMode, orders, service]);

  const loadData = useCallback(async () => {
    if (!account) return;

    setRefreshing(true);
    try {
      // Fetch positions and orders SEPARATELY so that if one fails, the other still loads
      let fetchedPositions: Position[] = [];
      let fetchedOrders: Order[] = [];
      
      // Always try to fetch positions FIRST - this is critical
      try {
        const pos = await service.getPositions();
        fetchedPositions = Array.isArray(pos) ? pos : [];
      } catch (posErr) {
        console.error('[TradeData] Failed to fetch positions:', posErr instanceof Error ? posErr.message : posErr);
      }
      
      // Try to fetch orders, but don't fail the whole load if orders fail
      try {
        const ord = await service.getOrders('all', 50);
        fetchedOrders = Array.isArray(ord) ? ord : [];
      } catch (ordErr) {
        console.warn('[TradeData] Failed to fetch orders (positions still loaded):', ordErr instanceof Error ? ordErr.message : ordErr);
        // Still proceed - orders are non-critical
      }

      // Always update positions
      setPositions(fetchedPositions);
      setOrders(fetchedOrders);

      // Reset consecutive errors only if positions loaded successfully
      if (fetchedPositions.length > 0 || fetchedPositions !== null) {
        setConsecutiveErrors(0);
        setIsDataStale(false);
      }
    } catch (err) {
      const errorCount = consecutiveErrors + 1;
      setConsecutiveErrors(errorCount);
      console.error(`[TradeData] Poll error #${errorCount}:`, err instanceof Error ? err.message : err);

      if (errorCount >= 5) {
        setIsDataStale(true);
        console.warn('[TradeData] Data stale — 5 consecutive errors');
      }
    } finally {
      setRefreshing(false);
    }
  }, [service, account, consecutiveErrors]);

  // Polling with exponential backoff on errors and circuit breaker
  useEffect(() => {
    if (!account) return;

    const MAX_CONSECUTIVE_ERRORS = 8;
    if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
      console.error('[TradeData] Circuit breaker tripped — stopping data polling');
      toast.error(
        'Live data polling stopped after repeated failures. Refresh to reconnect.',
        { duration: Infinity, id: 'circuit-breaker' }
      );
      return;
    }

    // Calculate backoff delay: start at 3s, double each error, cap at 30s
    const baseInterval = aggressiveMode ? 3 : pollingInterval;
    const baseMs = Math.max(3, baseInterval) * 1000;
    const backoffMs = consecutiveErrors > 0
      ? Math.min(30000, baseMs * Math.pow(2, Math.min(consecutiveErrors, 5)))
      : baseMs;

    if (consecutiveErrors > 0) {
      console.log(`[TradeData] Exponential backoff: ${backoffMs}ms after ${consecutiveErrors} errors`);
    }

    const pollTimer = setInterval(() => {
      loadData();
    }, backoffMs);

    return () => {
      clearInterval(pollTimer);
    };
  }, [pollingInterval, account, aggressiveMode, loadData, consecutiveErrors]);

  useEffect(() => {
    if (account) {
      setPositions([]);
      setOrders([]);
      setRealtimePrices({});
      initialLoadDone.current = false;
      // Reset WebSocket connection flag when account/service changes
      wsConnecting.current = false;
      loadData();
    }
  }, [service, account, loadData]);

  // Expose loadData to window for manual refresh debugging
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).refreshPositions = loadData;
    }
  }, [loadData]);

const positionSymbols = useMemo(() => {
     return positions.map(p => p.symbol).sort().join(',');
   }, [positions]);

   const extraSymbolsKey = useMemo(
     () => (extraSymbols ?? []).map(s => s.toUpperCase()).sort().join(','),
     [extraSymbols]
   );

useEffect(() => {
     if (isLoading) {
       return;
     }

     // Need either positions or extraSymbols to connect
     const hasPositions = positions.length > 0;
     const hasExtraSymbols = (extraSymbols?.length ?? 0) > 0;
     if (!hasPositions && !hasExtraSymbols) {
       return;
     }

     const positionSyms = positions.map(p => p.symbol);
     const extras = (extraSymbols ?? []).map(s => s.toUpperCase());
     const symbols = Array.from(new Set([...positionSyms, ...extras]))
       .filter(sym => !sym.includes('/') && !/^[A-Z0-9]{2,15}USD(T)?$/.test(sym));

    if (symbols.length === 0) {
      return;
    }

    const handleQuote = (symbol: string, price: number) => {
      setRealtimePrices(prev => ({
        ...prev,
        [symbol]: price
      }));
    };

    const handleError = () => {
      wsConnecting.current = false;
    };

    const handleOrderUpdate = (update: OrderUpdate) => {
      console.log('[WebSocket] Order update:', update);
      setOrders(prev => {
        const updatedOrder = update.order;
        const existingIdx = prev.findIndex(o => o.id === updatedOrder.id);
        if (existingIdx >= 0) {
          const updated = [...prev];
          updated[existingIdx] = { ...prev[existingIdx], ...updatedOrder };
          return updated;
        }
        return [updatedOrder, ...prev];
      });
    };

    service.connectWebSocket(symbols, handleQuote, handleOrderUpdate, handleError);

    // Use ref to track current service for cleanup
    const currentService = service;

return () => {
       wsConnecting.current = false;
       currentService.disconnectWebSocket();
     };
   }, [service, isLoading, positionSymbols, extraSymbolsKey]);

  return {
    positions,
    orders,
    recentPositions,
    refreshing,
    realtimePrices,
    loadData,
    isDataStale
  };
};