import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import { AlpacaService } from '@/services/stocks';
import { Account, Position, Order } from '@/types';
import { ErrorBoundary } from '../../../ErrorBoundary';
import { safeParseFloat } from '@/shared/utils/numbers';
import { calculateATR } from '@/utils/stocks/indicators';
import { computeCryptoExitQty } from '@/utils/stocks/crypto-utils';
import {
  EntryManager,
  StopOrderMonitor,
  PositionRiskManagement,
  RecentClosed,
  useTradeData,
  useSymbolAutocomplete,
  vibrate
} from '..';
import type { PositionAction, PositionActionPayload } from '../display/PositionCard';
import { getTradingConfig, getEnvConfig } from '@/config/envConfig';
import { cancelExistingExitOrders as cancelExitOrdersUtil } from '@/utils/stocks/cancelExistingExitOrders';

interface Props {
  service: AlpacaService;
  account: Account | null;
  onRefresh: () => void;
  isLoading?: boolean;
}

const TradePanel: React.FC<Props> = ({ service, account, onRefresh, isLoading }) => {
  const tradingPanelRef = useRef<HTMLDivElement>(null);
  const symbolInputRef = useRef<HTMLInputElement>(null);

const config = useMemo(() => {
    const trading = getTradingConfig();
    const alpacaConfig = getEnvConfig();
    const defaults = alpacaConfig.defaults || {};

    const cfg = {
    aggressiveMode: defaults.aggressiveMode ?? false,
    extendedHours: defaults.extendedHours ?? false,
    timeInForce: defaults.defaultTimeInForce ?? 'gtc',
    pollingInterval: defaults.pollingInterval ?? 3,
    defaultQty: trading.defaultQty ?? 20,
    defaultSymbol: trading.defaultSymbol || 'INTC',
    beStopOffsetPct: trading.beStopOffsetPct ?? 0.1,
    slStopOffsetPct: trading.slStopOffsetPct ?? 0.5,
    trailingStopMinPct: trading.trailingStopMinPct ?? 0.1,
    autoStopLossPct: trading.autoStopLossPct ?? 0.25,
    autoTakeProfitPct: trading.autoTakeProfitPct ?? 1.0,
    layer2TrailPct: trading.layer2TrailPct ?? 0.2,
    layer3TrailPct: trading.layer3TrailPct ?? 0.3,
    layer1Enabled: trading.layer1Enabled ?? true,
    layer2Enabled: trading.layer2Enabled ?? true,
    layer3Enabled: trading.layer3Enabled ?? true,
    strategy: trading.strategy,
  };
   console.log('[TradePanel] Config - BE offset:', cfg.beStopOffsetPct, '| SL offset:', cfg.slStopOffsetPct, '| Auto TP:', cfg.autoTakeProfitPct);
   return cfg;
   }, []);

  // Derived from trading mode
  const aggressiveMode = config.aggressiveMode;

const {
      positions,
      orders,
      recentPositions,
      refreshing,
      realtimePrices,
      loadData
  } = useTradeData({
    service,
    account,
    isLoading,
    aggressiveMode,
    pollingInterval: config.pollingInterval,
    tradingMode: config.strategy
  });

   // Helper to determine asset class (stock vs crypto)
  const getAssetClass = useCallback(async (sym: string) => {
    try {
      const asset = await service.getAsset(sym);
      return asset?.class === 'crypto' ? 'crypto' : 'us_equity';
    } catch {
      return 'us_equity';
    }
  }, [service]);

  const [symbol, setSymbol] = useState(() => {
    // URL param takes precedence
    if (typeof window !== 'undefined') {
      const urlSymbol = new URLSearchParams(window.location.search).get('symbol');
      if (urlSymbol) return urlSymbol.toUpperCase();
    }
    return config.defaultSymbol;
  });
  const [qty, setQty] = useState(config.defaultQty);
  const extendedHours = config.extendedHours;
  const [collapseAllVersion, setCollapseAllVersion] = useState(0);
  const [collapseAllCollapsed, setCollapseAllCollapsed] = useState(true);
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);

  const appliedSymbolRef = useRef<string | null>(null);

  useEffect(() => {
    if (symbol) appliedSymbolRef.current = symbol.toUpperCase();
  }, [symbol]);

  // Move hooks to top level to fix "Invalid hook call" error
  const applySymbol = useCallback((sym: string) => {
    const upperSymbol = sym.toUpperCase();
    if (appliedSymbolRef.current === upperSymbol) return;

    setSymbol(upperSymbol);
    // FIX #4: Notify autocomplete hook of external change
    handleSymbolChange(upperSymbol);

    appliedSymbolRef.current = upperSymbol;

    if (typeof window !== 'undefined' && window.history?.replaceState) {
      const url = new URL(window.location.href);
      url.searchParams.delete('symbol');
      window.history.replaceState({}, '', url.toString());
    }

    // Use requestAnimationFrame for DOM updates to avoid layout thrashing
    requestAnimationFrame(() => {
      if (symbolInputRef.current) {
        symbolInputRef.current.focus();
        symbolInputRef.current.select();
      }
    });
  }, []);

  // Ref for break-even with trailing stop tracking
  const beWithTrailRef = useRef<Set<string>>(new Set());
  const beTrailArmedRef = useRef<Set<string>>(new Set());

  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (beWithTrailRef.current.size === 0) return;

    const checkAndActivate = () => {
      beWithTrailRef.current.forEach(symbol => {
        const pos = positions.find(p => p.symbol === symbol);
        if (!pos) {
          beWithTrailRef.current.delete(symbol);
          return;
        }

        const entryPrice = safeParseFloat(pos.avg_entry_price, 0);
        const currentPrice = realtimePrices[symbol] || safeParseFloat(pos.current_price, 0);
        if (entryPrice <= 0 || currentPrice <= 0) return;

        const profitPct = pos.side === 'long'
          ? ((currentPrice - entryPrice) / entryPrice) * 100
          : ((entryPrice - currentPrice) / entryPrice) * 100;

        if (profitPct >= 3) {
          activateTrailingStopForPosition(pos);
        }
      });
    };

    checkAndActivate();
    const interval = setInterval(checkAndActivate, 2000);
    return () => clearInterval(interval);
  }, [positions, realtimePrices]);

  const {
    selectedSymbolPrice,
    handleSymbolChange,
    selectSymbol,
    fetchPrice
  } = useSymbolAutocomplete(service, (sym: string) => {
    // FIX #22: Callback to update parent symbol state when autocomplete selection is made
    setSymbol(sym.toUpperCase());
  });

  // Abort flag for background layered SL monitors
  const layeredStopsAbortRef = useRef(false);
  // Per-symbol guard: prevents multiple concurrent L2/L3 monitors for the same symbol
  const activeLayeredSymbols = useRef<Set<string>>(new Set());

  const isAlreadyMonitoring = (symbol: string): boolean => {
    return activeLayeredSymbols.current.has(symbol);
  };

  const markMonitoringActive = (symbol: string) => {
    activeLayeredSymbols.current.add(symbol);
  };

  const markMonitoringDone = (symbol: string) => {
    activeLayeredSymbols.current.delete(symbol);
  };

  useEffect(() => {
    layeredStopsAbortRef.current = false;
    return () => {
      layeredStopsAbortRef.current = true;
    };
  }, []);

  // Auto-fetch price for the default symbol on mount / page refresh
  const initialSymbolRef = useRef(symbol);
  useEffect(() => {
    fetchPrice(initialSymbolRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // symbolInputRef moved to top

  const clearOrphanOrders = useCallback(async (excludeOrderIds: string[] = []) => {
     try {
       const [openOrders, openPositions] = await Promise.all([
         service.getOrders('open'),
         service.getPositions()
       ]);
       const normSym = (s: string) => s.replace('/', '').toUpperCase();
       const positionSymbols = new Set(openPositions.map(p => normSym(p.symbol)));
       const excluded = new Set(excludeOrderIds);
       const now = Date.now();
      // Orders > 5s old with no matching open position are considered orphans.
      // We use 5s (not 0) to avoid cancelling orders for positions being opened right now.
      const staleOrphans = openOrders.filter(o => {
        if (excluded.has(o.id)) return false;
        if (positionSymbols.has(normSym(o.symbol))) return false;

        // Don't cancel orders that are partially filled
        if (o.status === 'partially_filled') return false;

        const createdAt = Date.parse(o.created_at || o.submitted_at || '');
        if (!Number.isFinite(createdAt)) return false;

        return now - createdAt > 5000;
      });
       if (staleOrphans.length === 0) return;
       await Promise.all(staleOrphans.map(o => service.cancelOrder(o.id)));
     } catch (err) {
       console.debug('Failed to clear orphan orders:', err instanceof Error ? err.message : String(err));
     }
   }, [service]);



  // FIX #5: Wrap in useCallback to prevent stale closures on symbol, qty, realtimePrices, extendedHours
  /**
   * Helper to wait for an order to fill
   */
  const waitForOrderFill = async (orderId: string, maxAttempts = 35, pollDelay = 500) => {
    let attempts = 0;
    while (attempts < maxAttempts) {
      await new Promise(r => setTimeout(r, pollDelay));
      const allOrders = await service.getOrders('all');
      const checkOrder = allOrders.find(o => o.id === orderId);

      if (checkOrder?.status === 'filled') {
        return checkOrder;
      }

      if (['canceled', 'rejected', 'expired'].includes(checkOrder?.status || '')) {
        throw new Error(`Order ${checkOrder?.status}: ${checkOrder?.status === 'canceled' ? 'Order was canceled' : 'Check order details'}`);
      }
      attempts++;
    }

    // If we reach here, we timed out
    try {
      await service.cancelOrder(orderId);
    } catch (err) {
      console.debug('Failed to cancel order after timeout:', err instanceof Error ? err.message : String(err));
    }
    throw new Error("Timed out waiting for fill");
  };

  const executeSmartEntry = useCallback(async (
    side: 'buy' | 'sell',
    symbolOverride?: string,
    qtyOverride?: number,
    orderTypeOverride?: 'market' | 'limit' | 'stop',
    riskSettings?: { stopLoss?: number; takeProfit?: number; takeProfitPct?: number; entryOffsetPips?: number; entryPrice?: number; trailingStop?: number; stopLossPct?: number }
  ) => {
    const upperSymbol = (symbolOverride || symbol).toUpperCase();
    const effectiveQty = qtyOverride || qty;
    const useExtended = extendedHours;
    const effectiveOrderType = orderTypeOverride || 'limit';
    const effectiveSlPct = riskSettings?.stopLossPct ?? config.autoStopLossPct;
    const effectiveTpPct = riskSettings?.takeProfit ? (riskSettings.takeProfitPct || config.autoTakeProfitPct) : 0;
    const effectiveRisk = {
      stopLoss: config.autoStopLossPct, // Default SL from .env
      ...riskSettings
    };

    let filledPrice = 0;

    try {
      // Check if asset is crypto
      const looksCrypto = upperSymbol.includes('/') || /^[A-Z0-9]{2,15}USD(T)?$/.test(upperSymbol);
      let isCrypto = looksCrypto;
      try {
        const asset = await service.getAsset(upperSymbol);
        if (asset?.class) isCrypto = asset.class === 'crypto';
      } catch (err) {
        console.warn('Failed to check asset class, defaulting to stock behavior', err);
      }

      // For crypto: cancel any orphaned orders for this symbol before placing new entry
      // Prevents "insufficient balance" from stale SL/TP orders reserving balance
      if (isCrypto) {
        try {
          const openOrders = await service.getOrders('open');
          const normSym = (s: string) => s.replace('/', '').toUpperCase();
          const staleOrders = openOrders.filter(o => normSym(o.symbol) === normSym(upperSymbol));
          if (staleOrders.length > 0) {
            await Promise.all(staleOrders.map(o => service.cancelOrder(o.id)));
            await new Promise(r => setTimeout(r, 300)); // Let cancellations settle
          }
        } catch (err) {
          console.debug('[Trade] Failed to clear stale orders before entry:', err);
        }
      }

      const formatCryptoPrice = (value: number) => {
        const fixed = value.toFixed(8);
        return fixed.replace(/\.?0+$/, '');
      };

      const formatPrice = (value: number) => (isCrypto ? formatCryptoPrice(value) : value.toFixed(2));

const startLayeredStops = async ({
         initialStopId,
         initialStopPrice,
         entryFillPrice,
         l2TrailPct,
         l3TrailPct,
         beStopOffsetPct = 0,
         layer2Enabled = true,
         layer3Enabled = true,
       }: {
         initialStopId: string | null;
         initialStopPrice: number;
         entryFillPrice: number;
         l2TrailPct: number;
         l3TrailPct: number;
         beStopOffsetPct?: number;
         layer2Enabled?: boolean;
         layer3Enabled?: boolean;
       }) => {
        const normSym = (s: string) => s.replace('/', '').toUpperCase();
        const hasPos = () => positionsRef.current.some(p => normSym(p.symbol) === normSym(upperSymbol));
        const getLivePrice = async () => {
          const cached = realtimePricesRef.current[upperSymbol];
          if (Number.isFinite(cached)) return cached;
          return await service.getLatestTrade(upperSymbol);
        };

        const priceEpsilon = isCrypto ? 1e-6 : 0.25; // 25¢ minimum move to avoid API flooding on tight ticks
        let slOrderId = initialStopId;
        let currentSlPrice = initialStopPrice;

        const replaceStop = async (newPrice: number) => {
          const stopSide = side === 'buy' ? 'sell' : 'buy';
          const pos = positionsRef.current.find(p => normSym(p.symbol) === normSym(upperSymbol));
          const liveQty = pos ? Math.abs(safeParseFloat(pos.qty, 0)) : effectiveQty;
          const payload = {
            symbol: upperSymbol,
            qty: String(liveQty),
            side: stopSide,
            type: 'stop',
            stop_price: formatPrice(newPrice),
            time_in_force: 'day'
          } as const;

          // Cancel the known stop order (or scan for all stops) then create a new one.
          // Atomic PATCH/replace is avoided because the Alpaca API rejects it when the
          // order is in a non-replaceable state (filled, pending cancel, etc.) and the
          // cancel+create pattern is equally reliable with a shorter error surface.
          try {
            if (slOrderId) {
              await service.cancelOrder(slOrderId).catch(() => {});
              await new Promise(r => setTimeout(r, 200));
            } else {
              const openOrders = await service.getOrders('open');
              const existingStops = openOrders.filter(o =>
                normSym(o.symbol) === normSym(upperSymbol) &&
                o.side === stopSide &&
                (o.type === 'stop' || o.type === 'stop_limit')
              );
              if (existingStops.length > 0) {
                await Promise.all(existingStops.map(o => service.cancelOrder(o.id).catch(() => {})));
                await new Promise(r => setTimeout(r, 400));
              }
            }
          } catch { /* ignore — proceed with submit */ }

          const newOrder = await service.submitOrder(payload as any);
          slOrderId = newOrder.id;
          currentSlPrice = newPrice;
        };

        // If we didn't capture the stop id from legs, try to find it once before starting
        if (!slOrderId) {
          try {
            const openOrders = await service.getOrders('open');
            const stopSide = side === 'buy' ? 'sell' : 'buy';
            const stop = openOrders.find(o =>
              normSym(o.symbol) === normSym(upperSymbol) && o.side === stopSide && o.type === 'stop'
            );
            if (stop) {
              slOrderId = stop.id;
              currentSlPrice = safeParseFloat(stop.stop_price, initialStopPrice);
            }
          } catch { /* ignore */ }
        }

        // ── LAYER 2: chase SL toward BE ──
if (layer2Enabled) {
         let beReached = false;
         let l2Errors = 0;
         let consecutiveNoPos = 0;
         const beTargetPrice = side === 'buy'
           ? entryFillPrice - (beStopOffsetPct / 100) * entryFillPrice
           : entryFillPrice + (beStopOffsetPct / 100) * entryFillPrice;
         while (!beReached) {
           await new Promise(r => setTimeout(r, 5000));
           try {
             if (layeredStopsAbortRef.current) {
               return;
             }
             if (!hasPos()) {
               consecutiveNoPos += 1;
               if (consecutiveNoPos >= 5) {
                 return;
               }
               l2Errors = 0;
               continue;
             }
             consecutiveNoPos = 0;
             const currentPrice = await getLivePrice();
             const rawNewSl = side === 'buy'
               ? currentPrice * (1 - l2TrailPct / 100)
               : currentPrice * (1 + l2TrailPct / 100);
             const newSlPrice = side === 'buy'
               ? Math.min(rawNewSl, beTargetPrice)
               : Math.max(rawNewSl, beTargetPrice);
             const moved = side === 'buy'
               ? newSlPrice > currentSlPrice + priceEpsilon
               : newSlPrice < currentSlPrice - priceEpsilon;
             const cappedAtBE = side === 'buy'
               ? rawNewSl >= beTargetPrice && newSlPrice === beTargetPrice && currentSlPrice < beTargetPrice - 0.001
               : rawNewSl <= beTargetPrice && newSlPrice === beTargetPrice && currentSlPrice > beTargetPrice + 0.001;
             if (moved || cappedAtBE) {
               await replaceStop(newSlPrice);
               beReached = side === 'buy'
                 ? currentSlPrice >= beTargetPrice - 0.001
                 : currentSlPrice <= beTargetPrice + 0.001;
               if (beReached) {
                 toast.success(`SL at BE — risk eliminated ($${formatPrice(beTargetPrice)})`);
               }
             } else {
             }
             l2Errors = 0;
           } catch (err) {
             l2Errors += 1;
             console.error(`[LayeredSL L2] Error #${l2Errors} for ${upperSymbol}:`, err);
             if (l2Errors >= 5) {
               console.error(`[LayeredSL L2] ❌ Stopping after 5 errors for ${upperSymbol}`);
               toast.error(`Stop loss chasing stopped after 5 errors. Check console for details.`);
               return;
             }
             await new Promise(r => setTimeout(r, 1500));
           }
         }
         } else {
        }

        // ── LAYER 3: trail from running high/low ──
        if (layer3Enabled) {
        let highWaterMark = entryFillPrice;
        let l3Errors = 0;
        let consecutiveNoPosL3 = 0;
        while (true) {
          await new Promise(r => setTimeout(r, 5000)); // 5s: match L2 cadence
          try {
            if (layeredStopsAbortRef.current) break;
            if (!hasPos()) {
              consecutiveNoPosL3 += 1;
              if (consecutiveNoPosL3 >= 5) {
                break;
              }
              l3Errors = 0;
              continue;
            }
            consecutiveNoPosL3 = 0;
            const currentPrice = await getLivePrice();
            highWaterMark = side === 'buy'
              ? Math.max(highWaterMark, currentPrice)
              : Math.min(highWaterMark, currentPrice);
            const newSlPrice = side === 'buy'
              ? highWaterMark * (1 - l3TrailPct / 100)
              : highWaterMark * (1 + l3TrailPct / 100);
            const moved = side === 'buy'
              ? newSlPrice > currentSlPrice + priceEpsilon
              : newSlPrice < currentSlPrice - priceEpsilon;
            if (moved) {
              await replaceStop(newSlPrice);
            }
            l3Errors = 0;
          } catch (err) {
            l3Errors += 1;
            if (l3Errors >= 5) break;
            await new Promise(r => setTimeout(r, 1500));
          }
        }
        } else {
        }
      };

      // Snapshot position state BEFORE submitting — used post-fill to decide SL placement
      // (checking after fill is unreliable: Alpaca paper may not have settled yet)
      const preTradePositions = await service.getPositions().catch(() => []);
      const normSym = (s: string) => s.replace('/', '').toUpperCase();
      const prePos = preTradePositions.find(p => normSym(p.symbol) === normSym(upperSymbol));
      const prePosQty = prePos ? Math.abs(safeParseFloat(prePos.qty, 0)) : 0;
      const prePosSide = prePos?.side ?? null; // 'long' | 'short' | null

      // Prepare Order Payload
      const orderPayload: any = {
        symbol: upperSymbol,
        qty: String(effectiveQty),
        side: side,
        time_in_force: isCrypto ? 'gtc' : 'day'
      };

      const latestPrice = realtimePrices[upperSymbol] || await service.getLatestTrade(upperSymbol);
      const pipSize = !isCrypto
        ? 0.01
        : latestPrice >= 1000
          ? 0.1
          : latestPrice >= 100
            ? 0.01
            : latestPrice >= 1
              ? 0.001
              : 0.0001;
      const entryOffsetPips = Number.isFinite(effectiveRisk.entryOffsetPips as number) ? Number(effectiveRisk.entryOffsetPips) : 1;
      const entryOffsetDistance = entryOffsetPips * pipSize;

      if (effectiveOrderType === 'stop') {
        const triggerPrice = Number.isFinite(effectiveRisk.entryPrice as number) && effectiveRisk.entryPrice! > 0
          ? effectiveRisk.entryPrice!
          : (side === 'buy' ? latestPrice + entryOffsetDistance : latestPrice - entryOffsetDistance);

        if (side === 'buy' && triggerPrice <= latestPrice) {
          toast.error( `Buy Stop price (${formatPrice(triggerPrice)}) must be ABOVE current price (${formatPrice(latestPrice)})`);
          return;
        }
        if (side === 'sell' && triggerPrice >= latestPrice) {
          toast.error( `Sell Stop price (${formatPrice(triggerPrice)}) must be BELOW current price (${formatPrice(latestPrice)})`);
          return;
        }

        orderPayload.type = 'stop';
        orderPayload.stop_price = Number(triggerPrice.toFixed(2));
        orderPayload.time_in_force = 'gtc';

      } else if (effectiveOrderType === 'limit') {
        // Use explicitly provided entryPrice (e.g. chase orders) or fall back to offset calculation
        const limitPrice = Number.isFinite(effectiveRisk.entryPrice as number) && effectiveRisk.entryPrice! > 0
          ? effectiveRisk.entryPrice!
          : (side === 'buy'
            ? latestPrice - entryOffsetDistance
            : latestPrice + entryOffsetDistance);

        // Alpaca rule: sell limit must be >= market price, buy limit must be <= market price.
        // When price is on the trigger side (sell below market / buy above market),
        // auto-switch to stop_limit so the order is valid.
        const isStopDirection =
          (side === 'sell' && limitPrice < latestPrice) ||
          (side === 'buy' && limitPrice > latestPrice);

        if (isStopDirection) {
          // stop_limit: stop_price triggers the order, limit_price is the worst acceptable fill
          const limitBuffer = isCrypto ? Math.max(limitPrice * 0.001, pipSize) : 0.02;
          orderPayload.type = 'stop_limit';
          orderPayload.stop_price = formatPrice(limitPrice);
          orderPayload.limit_price = formatPrice(
            side === 'sell' ? limitPrice - limitBuffer : limitPrice + limitBuffer
          );
          orderPayload.time_in_force = isCrypto ? 'gtc' : 'day';
        } else {
          orderPayload.type = 'limit';
          orderPayload.limit_price = formatPrice(limitPrice);
          orderPayload.time_in_force = isCrypto ? 'gtc' : 'day';
          if (!isCrypto && useExtended) {
            orderPayload.extended_hours = true;
          }
          // Use bracket order when TP is enabled (non-crypto, regular hours only)
          // This avoids the two-separate-sell-orders problem that Alpaca rejects
          if (!isCrypto && !useExtended && effectiveTpPct && effectiveTpPct > 0) {
            const slPrice = formatPrice(
              side === 'buy'
                ? limitPrice * (1 - effectiveSlPct / 100)
                : limitPrice * (1 + effectiveSlPct / 100)
            );
            const tpPrice = formatPrice(
              side === 'buy'
                ? limitPrice * (1 + effectiveTpPct / 100)
                : limitPrice * (1 - effectiveTpPct / 100)
            );
            orderPayload.order_class = 'bracket';
            orderPayload.stop_loss = { stop_price: slPrice };
            orderPayload.take_profit = { limit_price: tpPrice };
          }
        }
      } else if (extendedHours) {
        // Extended-hours auto-limit: price set generously to fill like market
        orderPayload.type = 'limit';
        if (isCrypto) {
          orderPayload.time_in_force = 'gtc';
        } else {
          orderPayload.time_in_force = 'day';
          if (useExtended) {
            orderPayload.extended_hours = true;
          }
        }
        const buffer = 0.002;
        const lPrice = side === 'buy'
          ? latestPrice * (1 + buffer)
          : latestPrice * (1 - buffer);
        orderPayload.limit_price = formatPrice(lPrice);
      } else {
        orderPayload.type = 'market';
        // US equity market order: OTO stop loss only for BUY (long entry).
        // SELL market orders must not carry OTO — Alpaca requires short-sell DTBP
        // for the triggered buy-to-cover leg, causing 403 on paper accounts.
        if (!isCrypto && side === 'buy') {
          const slPrice = formatPrice(latestPrice * (1 - effectiveSlPct / 100));
          orderPayload.stop_loss = { stop_price: slPrice };
          if (effectiveTpPct && effectiveTpPct > 0) {
            const tpPrice = formatPrice(
              side === 'buy'
                ? latestPrice * (1 + effectiveTpPct / 100)
                : latestPrice * (1 - effectiveTpPct / 100)
            );
            orderPayload.take_profit = { limit_price: tpPrice };
            orderPayload.order_class = 'bracket';
          } else {
            orderPayload.order_class = 'oto';
          }
        }
      }

      // Place Entry Order
      const entryOrder = await service.submitOrder(orderPayload);

      // Validate order response
      if (!entryOrder || !entryOrder.id) {
        throw new Error('Order submitted but response is invalid. Check order status manually.');
      }

      // OTO market order: SL attached — start Layer 2 monitor then return immediately
      if (!isCrypto && orderPayload.order_class === 'oto') {
        toast.success(`Market order placed | SL @ $${orderPayload.stop_loss.stop_price}`);

        const l2TrailPct = config.layer2TrailPct;
        const l3TrailPct = config.layer3TrailPct;
        const l2InitialSl = safeParseFloat(orderPayload.stop_loss.stop_price, 0);

        void (async () => {
          // wait for parent fill and capture SL id
          let entryFillPrice = 0;
          let slOrderId: string | null = null;

          for (let i = 0; i < 60; i++) {
            await new Promise(r => setTimeout(r, i < 5 ? 200 : 500));
            try {
              const parent = await service.getOrderById(entryOrder.id);
              if (!parent || ['canceled', 'rejected', 'expired'].includes(parent.status)) return;
              if (parent.status === 'filled') {
                entryFillPrice = safeParseFloat(parent.filled_avg_price, 0);
                const legs = parent.legs as Order[] | null;
                if (legs && legs.length > 0) {
                  slOrderId = legs[0].id;
                }
                break;
              }
            } catch { /* ignore */ }
          }

        if (!entryFillPrice) return;

if (config.layer2Enabled || config.layer3Enabled) {
           if (!isAlreadyMonitoring(upperSymbol)) {
             markMonitoringActive(upperSymbol);
             await startLayeredStops({
               initialStopId: slOrderId,
               initialStopPrice: l2InitialSl,
               entryFillPrice,
               l2TrailPct,
               l3TrailPct,
               layer2Enabled: config.layer2Enabled,
               layer3Enabled: config.layer3Enabled,
             }).finally(() => {
               markMonitoringDone(upperSymbol);
             });
          }
        }
      })();

      return { filledPrice: 0 };
      }

      // Pending (limit/stop) entry orders: confirm immediately, schedule SL in background
      if (effectiveOrderType === 'limit' || effectiveOrderType === 'stop') {
        const isStopLimitOrder = orderPayload.type === 'stop_limit';
        const label = effectiveOrderType === 'stop'
          ? (side === 'buy' ? 'Buy Stop' : 'Sell Stop')
          : isStopLimitOrder
            ? (side === 'buy' ? 'Buy Stop-Limit' : 'Sell Stop-Limit')
            : (side === 'buy' ? 'Buy Limit' : 'Sell Limit');
        const entryPrice = (effectiveOrderType === 'stop' || isStopLimitOrder) ? orderPayload.stop_price : orderPayload.limit_price;
        toast.success(`${label} placed @ $${entryPrice}`);

        // Background: wait for fill then place SL (skipped if bracket order handles it)
        const orderId = entryOrder.id;
        const isBracket = orderPayload.order_class === 'bracket';
        const trailPct = effectiveSlPct;
        const stopSide = side === 'buy' ? 'sell' : 'buy';
        void (async () => {
          const maxPollAttempts = 1440; // up to 12 min (1440 × 500ms)
          for (let i = 0; i < maxPollAttempts; i++) {
            await new Promise(r => setTimeout(r, 500));
            try {
              const o = await service.getOrderById(orderId);
              if (!o || ['canceled', 'rejected', 'expired'].includes(o.status)) break;
              if (o.status === 'filled') {
                const fp = safeParseFloat(o.filled_avg_price, 0);
                let fq = safeParseFloat((o as any).filled_qty, effectiveQty);
                // For crypto: fetch position to get actual qty (filled_qty may differ due to fees)
                if (isCrypto) {
                  try {
                    const positions = await service.getPositions();
                    const pos = positions.find(p => p.symbol === upperSymbol);
                    if (pos) {
                      const posQty = Math.abs(safeParseFloat(pos.qty, 0));
                      if (posQty > 0) {
                        const safeQty = computeCryptoExitQty({ requestedQty: effectiveQty, filledQty: posQty, positionQty: posQty });
                        if (safeQty !== null) {
                          fq = parseFloat(safeQty);
                        } else {
                          fq = posQty;
                        }
                      }
                    }
                  } catch (e) {
                    console.warn('[Trade] BG: Could not fetch position qty:', e);
                  }
                }

                if (isBracket) {
                  // Bracket order: SL and TP are already attached — just start layered stops monitor
                  toast.success(`${label} filled @ $${fp} | Bracket active`);
if (!isCrypto && (config.layer2Enabled || config.layer3Enabled) && !activeLayeredSymbols.current.has(upperSymbol)) {
                     const slPrice = side === 'buy'
                       ? fp * (1 - trailPct / 100)
                       : fp * (1 + trailPct / 100);
                     activeLayeredSymbols.current.add(upperSymbol);
                     startLayeredStops({
                       initialStopId: null,
                       initialStopPrice: slPrice,
                       entryFillPrice: fp,
                       l2TrailPct: config.layer2TrailPct,
                       l3TrailPct: config.layer3TrailPct,
                       layer2Enabled: config.layer2Enabled,
                       layer3Enabled: config.layer3Enabled,
                     }).finally(() => { activeLayeredSymbols.current.delete(upperSymbol); });
                   }
                } else {
                  // Non-bracket: manually place SL stop order
                  const sp = side === 'buy'
                    ? formatPrice(fp * (1 - trailPct / 100))
                    : formatPrice(fp * (1 + trailPct / 100));
                  let placedOrder: Order | null = null;
                  let slPlaced = false;
                  for (let attempt = 1; attempt <= 3 && !slPlaced; attempt++) {
                    if (attempt > 1) await new Promise(r => setTimeout(r, 800));
                    try {
                      placedOrder = await service.submitOrder({
                        symbol: upperSymbol, qty: String(fq), side: stopSide,
                        type: 'stop', stop_price: sp, time_in_force: isCrypto ? 'gtc' : 'day'
                      });
                      slPlaced = true;
                    } catch (slErr: any) {
                      console.warn(`[Trade] BG SL attempt ${attempt}/3 failed:`, slErr.message);
                    }
                  }
                if (!slPlaced) {
                  toast.error(`Stop loss failed 3×. Closing position for safety (${upperSymbol}).`);
                  service.getPositions().then(pos => {
                    if (pos.some((p: any) => p.symbol === upperSymbol)) {
                      service.closePosition(upperSymbol).catch((e: any) =>
                        toast.error(`Emergency close failed: ${e.message}. MANUAL ACTION REQUIRED for ${upperSymbol}`)
                      );
                    }
                  }).catch(() => {});
                } else {
                  toast.success(`Stop Loss @ $${sp} (${label})`);
                  if (!isCrypto && (config.layer2Enabled || config.layer3Enabled) && !isAlreadyMonitoring(upperSymbol)) {
                    markMonitoringActive(upperSymbol);
                    startLayeredStops({
                      initialStopId: placedOrder?.id || null,
                      initialStopPrice: safeParseFloat(sp, 0),
                      entryFillPrice: fp,
                      l2TrailPct: config.layer2TrailPct,
                      l3TrailPct: config.layer3TrailPct,
                      layer2Enabled: config.layer2Enabled,
                      layer3Enabled: config.layer3Enabled,
                    }).finally(() => { markMonitoringDone(upperSymbol); });
                  }
                }
                }
                break;
              }
            } catch (_) { /* ignore poll errors */ }
          }
        })();

        return { filledPrice: 0 };
      }

      // Wait for fill (market orders and extended-hours auto-limit)
      const filledOrder = await waitForOrderFill(entryOrder.id);
      filledPrice = safeParseFloat(filledOrder.filled_avg_price, 0);
      let filledQty = safeParseFloat((filledOrder as any).filled_qty, effectiveQty);

    // For crypto: fetch position to get actual qty (filled_qty may differ due to fees)
    if (isCrypto) {
      try {
        const positions = await service.getPositions();
        const pos = positions.find(p => p.symbol === upperSymbol);
        if (pos) {
          const posQty = Math.abs(safeParseFloat(pos.qty, 0));
          if (posQty > 0) {
            const safeQty = computeCryptoExitQty({ requestedQty: effectiveQty, filledQty: posQty, positionQty: posQty });
            if (safeQty !== null) {
              filledQty = parseFloat(safeQty);
            } else {
              filledQty = posQty;
            }
          }
        }
      } catch (e) {
        console.warn('[Trade] Could not fetch position qty after fill — using order filled_qty', e);
        toast.warning(
          `Could not verify position size for ${upperSymbol}. ` +
          `Stop loss qty may be inaccurate — verify manually.`
        );
      }
    }

      // Determine whether this trade opened a new position or closed an existing one.
      // Uses pre-fill snapshot to avoid race conditions (Alpaca paper position may not settle instantly).
      // - sell closed a long → position now flat → skip SL
      // - sell added/opened a short → position now short → place buy SL
      // - buy always opens/adds long → place sell SL
      const isClosingLong = side === 'sell' && prePosSide === 'long' && effectiveQty >= prePosQty;
      if (isClosingLong) {
        return { filledPrice };
      }

      const stopSide = side === 'buy' ? 'sell' : 'buy';
      const slOffsetPct = (config.slStopOffsetPct || config.beStopOffsetPct) / 100;
      const stopPrice = side === 'buy'
        ? formatPrice(filledPrice * (1 - slOffsetPct))
        : formatPrice(filledPrice * (1 + slOffsetPct));

      let placedOrder: Order | null = null;
      let slPlaced = false;
      for (let attempt = 1; attempt <= 3 && !slPlaced; attempt++) {
        if (attempt > 1) await new Promise(r => setTimeout(r, 800));
        try {
          placedOrder = await service.submitOrder({
            symbol: upperSymbol, qty: String(filledQty), side: stopSide,
            type: 'stop', stop_price: stopPrice, time_in_force: isCrypto ? 'gtc' : 'day'
          });
          slPlaced = true;
        } catch (err: any) {
          console.warn(`[Trade] SL attempt ${attempt}/3 failed:`, err.message);
        }
      }

      if (!slPlaced) {
        // All retries failed — verify position still exists before emergency close
        console.error('[Trade] Could not place SL after 3 attempts');
        const emergencyPositions = await service.getPositions().catch(() => []);
        const hasPos = emergencyPositions.some(p => normSym(p.symbol) === normSym(upperSymbol));
        if (hasPos) {
          toast.error('Stop loss failed 3×. Closing position for safety.');
          try {
            await service.closePosition(upperSymbol);
          } catch (closeErr: any) {
            toast.error(`Emergency close failed: ${closeErr.message}. MANUAL ACTION REQUIRED for ${upperSymbol}`);
          }
        } else {
          console.warn(`[Trade] SL failed but no position found for ${upperSymbol} — skipping emergency close`);
}
      } else {
        toast.success(`Stop Loss @ $${stopPrice}`);

        beWithTrailRef.current.add(upperSymbol);

        if (!isCrypto && (config.layer2Enabled || config.layer3Enabled) && !isAlreadyMonitoring(upperSymbol)) {
          markMonitoringActive(upperSymbol);
          startLayeredStops({
            initialStopId: placedOrder?.id || null,
            initialStopPrice: safeParseFloat(stopPrice, 0),
            entryFillPrice: filledPrice,
            l2TrailPct: config.layer2TrailPct,
            l3TrailPct: config.layer3TrailPct,
            layer2Enabled: config.layer2Enabled,
            layer3Enabled: config.layer3Enabled,
          }).finally(() => {
            markMonitoringDone(upperSymbol);
          });
        }
      }

  } finally {
      // errors propagate naturally; filledPrice is returned below
    }

    return { filledPrice };
  }, [symbol, qty, extendedHours, realtimePrices, service]);



  const handleTradeSubmit = async (
    side: 'buy' | 'sell',
    symbolOverride?: string,
    orderType?: 'market' | 'limit' | 'stop',
    riskSettings?: { stopLoss?: number; takeProfit?: number; takeProfitPct?: number; entryOffsetPips?: number; entryPrice?: number; trailingStop?: number; stopLossPct?: number }
  ) => {
    if (isSubmitting) return;
    const targetSymbol = (symbolOverride || symbol).toUpperCase();
    if (!targetSymbol || !account) return;
    setIsSubmitting(true);

    try {
      // Step 0: Validation - Check for existing exit orders (SL/TP/TSL)
      // Skip for limit orders since we're just placing a pending order
      if (orderType !== 'limit' && orderType !== 'stop') {
        const canceled = await cancelExistingExitOrders(targetSymbol);
        if (canceled) {
          toast.info( `Existing exit orders canceled for ${targetSymbol}`);
        }
      }

       const result = await executeSmartEntry(side, symbolOverride, undefined, orderType, riskSettings);
       if (result?.filledPrice && result.filledPrice > 0) {
         toast.success( `Filled @ $${result.filledPrice}`);
       } else if (result?.filledPrice === -1) {
         toast.info('Order accepted — awaiting fill');
       }

      vibrate([50, 50, 50]);
      // Keep symbol populated after execution so the user can re-use it

      // COLLAPSE ALL and EXPAND NEW POSITION
      setCollapseAllCollapsed(true);
      setCollapseAllVersion(v => v + 1);
      setExpandedSymbol(targetSymbol);

      // Small delay to let positions refresh before expanding the new one
      setTimeout(() => {
        applySymbol(targetSymbol);
      }, 500);

      loadData();
      onRefresh();
    } catch (e: any) {
      vibrate([100, 50, 100]);
      const msg: string = e.message || 'Trade failed';
      if (msg.includes('day trading buying power')) {
        toast.error('Insufficient day trading buying power. Reset your paper account or wait until tomorrow for DTBP to refresh.');
      } else {
        toast.error(msg);
      }
    } finally {
      setIsSubmitting(false);
    }
  };


   const executeClosePosition = useCallback(async (position: Position, { manageSubmitting = true, closeQty }: { manageSubmitting?: boolean; closeQty?: number } = {}) => {
     if (manageSubmitting) setIsSubmitting(true);
     try {
       const assetClass = await getAssetClass(position.symbol);
       const positionQty = Math.abs(safeParseFloat(position.qty, 0));

       if (positionQty <= 0) {
         toast.error( `No position to close for ${position.symbol}`);
         return null;
       }

       const qtyToClose = closeQty !== undefined ? Math.min(closeQty, positionQty) : positionQty;

       if (qtyToClose <= 0) {
         toast.error( `Invalid close quantity for ${position.symbol}`);
         return null;
       }

       if (closeQty !== undefined && closeQty > positionQty) {
         toast.info( `Requested ${closeQty} shares exceeds position of ${positionQty}. Closing ${positionQty} instead.`);
       }

       const isPartialClose = qtyToClose < positionQty;
       const percentageLabel = isPartialClose ? ` (${Math.round((qtyToClose / positionQty) * 100)}%)` : '';

       // Step 1: Cancel all open orders for this symbol
       // Normalize symbol for comparison (Alpaca may use BTC/USD vs BTCUSD)
       const normSymbol = (s: string) => s.replace('/', '').replace('-', '').replace('_', '').toUpperCase().trim();
       const posSymbolNorm = normSymbol(position.symbol);
       try {
         const openOrders = await service.getOrders('open');
         const relevantOrders = openOrders.filter(o => normSymbol(o.symbol) === posSymbolNorm);

         if (relevantOrders.length > 0) {
           await Promise.all(relevantOrders.map(o => service.cancelOrder(o.id)));

           // Poll until all orders for this symbol are actually canceled
           for (let i = 0; i < 20; i++) {
             await new Promise(r => setTimeout(r, 500));
             try {
               const remaining = await service.getOrders('open');
               const stillActive = remaining.filter(o => normSymbol(o.symbol) === posSymbolNorm);
               if (stillActive.length === 0) {
                 break;
               }
             } catch { /* continue */ }
           }
           // Extra settle time for balance release
           await new Promise(r => setTimeout(r, 500));
         }
       } catch (err) {
         console.debug('Failed to cancel open orders:', err instanceof Error ? err.message : String(err));
       }

       // Step 2: Close position
       const isLong = position.side === 'long';
       if (assetClass === 'crypto') {
         if (isPartialClose) {
           const closeOrder = await service.submitOrder({
             symbol: position.symbol,
             qty: qtyToClose.toString(),
             side: isLong ? 'sell' : 'buy',
             type: 'market',
             time_in_force: 'day'
           });
           vibrate([50, 50, 50]);
           toast.success( `Partial Close ${position.symbol}${percentageLabel}: ${qtyToClose} shares`);
           loadData();
           return closeOrder;
         }
         await service.closePosition(position.symbol);
         vibrate([50, 50, 50]);
         toast.success( `Closed ${position.symbol}`);
         loadData();
         return null;
       }

       const closeOrder = await service.submitOrder({
         symbol: position.symbol,
         qty: qtyToClose.toString(),
         side: isLong ? 'sell' : 'buy',
         type: 'market',
         time_in_force: 'day'
       });
       vibrate([50, 50, 50]);
       const toastMessage = isPartialClose
         ? `Partial Close ${position.symbol}${percentageLabel}: ${qtyToClose} shares`
         : `Flash Closed ${position.symbol}`;
       toast.success( toastMessage);
       loadData();
       return closeOrder;
     } catch (e: any) {
       toast.error( e.message);
       throw e;
     } finally {
       if (manageSubmitting) setIsSubmitting(false);
     }
    }, [service, loadData]);

  const executeReversal = async (position: Position) => {
    const reversalSymbol = position.symbol;
    const reversalQty = Math.abs(safeParseFloat(position.qty, 0));
    const oppositeSide: 'buy' | 'sell' = position.side === 'long' ? 'sell' : 'buy';

    try {
      // Step 1: Close current position (cancel orders first, then market close)
      setIsSubmitting(true);
      const closeOrder = await executeClosePosition(position, { manageSubmitting: false });

      if (closeOrder?.id) {
        toast.info( `Waiting for ${reversalSymbol} close fill...`);
        await waitForOrderFill(closeOrder.id, 20, 500); // 10s max for market close
      }

      // Robust Wait for Settlement (buying power release & position clear)
      toast.info(`Settling ${reversalSymbol}...`);
      let settled = false;
      const maxSettleAttempts = 15;

      for (let i = 0; i < maxSettleAttempts; i++) {
        await new Promise(r => setTimeout(r, 800)); // 800ms between checks

        const [currentPositions] = await Promise.all([
          service.getPositions(),
        ]);

        const stillHasPosition = currentPositions.some(p => p.symbol === reversalSymbol);

        if (!stillHasPosition) {
          settled = true;
          break;
        }
      }

      if (!settled) {
        throw new Error(`Position for ${reversalSymbol} did not settle in time. Aborting reversal for safety.`);
      }

      toast.success( `Closed ${reversalSymbol}`);

      // Step 2: Open opposite position
      // Extra safety delay
      await new Promise(r => setTimeout(r, 500));

      setSymbol(reversalSymbol);
      setQty(reversalQty);
      await executeSmartEntry(oppositeSide, reversalSymbol, reversalQty);

      vibrate([50, 50, 50]);
      toast.success( `Reversed ${reversalSymbol} to ${oppositeSide === 'buy' ? 'LONG' : 'SHORT'}`);
      loadData();
    } catch (e: any) {
      console.error('[Reversal] Error:', e.message);
      toast.error( e.message || 'Reversal failed');
    } finally {
      setIsSubmitting(false);
    }
  };


  // Strategy Management
  const strategiesRef = useRef<Record<string, any>>({});

    const saveStrategy = useCallback((symbol: string, data: any) => {
    const newStrategies = { ...strategiesRef.current, [symbol]: data };
      strategiesRef.current = newStrategies;
     }, []);

    const removeStrategy = useCallback((symbol: string) => {
    const newStrategies = { ...strategiesRef.current };
    delete newStrategies[symbol];
    strategiesRef.current = newStrategies;
    }, []);

   // FIX #7: Strategy Monitoring Loop - prevent recreation on every tick by stabilizing deps
   // Use ref for latest values to avoid recreating interval
   const positionsRef = useRef(positions);
   const realtimePricesRef = useRef(realtimePrices);
   useEffect(() => {
     positionsRef.current = positions;
     realtimePricesRef.current = realtimePrices;
   }, [positions, realtimePrices]);

    useEffect(() => {
      const interval = setInterval(() => {
        const currentStrategies = strategiesRef.current;
        if (Object.keys(currentStrategies).length === 0) return;
        Object.entries(currentStrategies).forEach(([symbol, strategy]) => {
          const currentPrice = realtimePricesRef.current[symbol];
          if (!currentPrice) return;

          // FIX #7: Create new strategy object instead of mutating ref
          let updated = false;
          const newStrategy = { ...strategy };

          // 2. Crypto Auto-Exit Take Profit Logic
          // If a crypto position has a targetPrice in its strategy metadata, check if currentPrice >= targetPrice
          if (strategy.type === 'crypto_exit' && strategy.targetPrice) {
             const isLong = strategy.side === 'long';
             const targetReached = isLong
               ? currentPrice >= strategy.targetPrice
               : currentPrice <= strategy.targetPrice;

             if (targetReached) {
               const pos = positionsRef.current.find(p => p.symbol === symbol);
               if (pos) {
                 toast.success(`${symbol} Take Profit Hit! Closing.`);
                 executeClosePosition(pos);
                 removeStrategy(symbol);
                 return;
               }
             }
          }

          // Sideways Limit Logic
          if (strategy.type === 'long_sideways') {
             const { bottomLevel, topLevel } = newStrategy;
             const threshold = (topLevel - bottomLevel) * 0.05; // 5% noise buffer

             // Check for Bottom Touch
             if (currentPrice <= bottomLevel + threshold) {
               if (!newStrategy.isTouchingBottom) {
                 newStrategy.touches = (newStrategy.touches || 0) + 1;
                 newStrategy.isTouchingBottom = true;
                 updated = true;

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
                 newStrategy.isTouchingBottom = false; // Reset when moved away
                 updated = true;
               }
             }
          } else if (strategy.type === 'short_sideways') {
             const { bottomLevel, topLevel } = newStrategy;
             const threshold = (topLevel - bottomLevel) * 0.05;

             // Check for Top Touch
             if (currentPrice >= topLevel - threshold) {
               if (!newStrategy.isTouchingTop) {
                 newStrategy.touches = (newStrategy.touches || 0) + 1;
                 newStrategy.isTouchingTop = true;
                 updated = true;

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

          // Only save if changed
          if (updated) {
            saveStrategy(symbol, newStrategy);
          }
        });
      }, 1000);

      return () => clearInterval(interval);
    }, [removeStrategy, executeClosePosition, saveStrategy]);

  const cancelSidewaysLimit = async (sym: string) => {
      const strategy = strategiesRef.current[sym];
      if (!strategy) return;
      if (strategy.orderIds) {
          await Promise.all(strategy.orderIds.map((id: string) => service.cancelOrder(id).catch(() => {})));
      }
      removeStrategy(sym);
      toast.info( `Sideways Limit cancelled for ${sym}`);
      loadData();
  };

  const executeSidewaysLimitStrategy = async (symbol: string, side: 'long' | 'short', price: number, qty: string) => {
      // Prevent duplicate strategies for the same symbol
      const existing = strategiesRef.current[symbol];
      if (existing && (existing.type === 'long_sideways' || existing.type === 'short_sideways')) {
          toast.error( `Sideways Limit already active for ${symbol}. Cancel it first.`);
          return;
      }

      toast.info( `Calculating ATR for ${symbol} Sideways Limit...`);

      try {
        let atr;
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
             // Long Strategy: Buy Limit at Bottom, Stop-Limit Buy at Top
             const order1 = await service.submitOrder({
                  symbol: symbol,
                  qty: qty,
                  side: 'buy',
                  type: 'stop_limit',
                  stop_price: (price + offset).toFixed(2),
                  limit_price: (price + offset + 0.05).toFixed(2),
                  time_in_force: timeInForce
              });

              let order2;
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
                await service.cancelOrder(order1.id).catch(() => {});
                throw err;
              }

              // Register Strategy
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
             // Short Strategy: Sell Limit at Top, Sell Stop Limit at Bottom
             const order1 = await service.submitOrder({
                  symbol: symbol,
                  qty: qty,
                  side: 'sell',
                  type: 'limit',
                  limit_price: (price + offset).toFixed(2),
                  time_in_force: timeInForce
              });

              let order2;
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
                await service.cancelOrder(order1.id).catch(() => {});
                throw err;
              }

              // Register Strategy
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
        loadData();
      } catch (e: any) {
        toast.error( e.message || 'Failed to place Sideways Limit orders');
      }
  };



  const executeSidewaysLimit = async (pos: Position, payload?: any) => {
      const currentPrice = safeParseFloat(pos.current_price);
      const qtyToTrade = payload?.qty ? String(payload.qty) : '1';

      await executeSidewaysLimitStrategy(pos.symbol, pos.side, currentPrice, qtyToTrade);
  };



  const cancelExistingExitOrders = useCallback(async (symbol: string, side?: 'buy' | 'sell', preFetchedOrders?: any[]) => {
    return cancelExitOrdersUtil(service, { symbol, side, preFetchedOrders });
  }, [service]);
  const executeTrailingStop = async (pos: Position, payload?: any) => {
    setIsSubmitting(true);
    try {
      const trailingConfig = getTradingConfig();
      // Cap the minimum floor to the lowest preset (0.1%) so choosing 0.15% works even if env/local config is higher
      const minTrailPct = Math.min(trailingConfig.trailingStopMinPct ?? 0.1, 0.1);
      const defaultTrailPct = trailingConfig.trailingStopDefaultPct ?? 0.5;
      const appliedTrail = payload?.percent ?? defaultTrailPct;
      const exitSide = pos.side === 'long' ? 'sell' : 'buy';
      const assetClass = await getAssetClass(pos.symbol);

      // Check for existing Trailing Stop for toggle-off behavior
      const openOrders = await service.getOrders('open');
      const existingTsl = openOrders.find(o =>
        o.symbol === pos.symbol &&
        o.side === exitSide &&
        o.type === 'trailing_stop'
      );

      if (existingTsl) {
        const existingPercent = safeParseFloat(existingTsl.trail_percent, 0);
        if (existingPercent === appliedTrail) {
          // Same percent clicked — toggle off
          await service.cancelOrder(existingTsl.id);
          toast.info(`Trailing Stop deactivated for ${pos.symbol}`);
          loadData();
          return;
        }
        // Different percent — cancel existing, fall through to create new
        await service.cancelOrder(existingTsl.id);
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Alpaca requirement: Cancel existing exit orders (SL/TP) before submitting new TSL
      // Pass the already fetched openOrders to avoid redundant API call
      const canceled = await cancelExistingExitOrders(pos.symbol, exitSide, openOrders);
      if (canceled) {
        toast.info( `Existing exit orders canceled for ${pos.symbol}`);
        // FIX: Add small delay to let Alpaca process the cancellations
        // and release the "locked" quantity.
        await new Promise(resolve => setTimeout(resolve, 800));

        // Verify they are actually gone
        const verifyOrders = await service.getOrders('open');
        const remaining = verifyOrders.filter(o =>
          o.symbol === pos.symbol && o.side === exitSide && o.type !== 'trailing_stop'
        );
        if (remaining.length > 0) {
           throw new Error(`Wait: ${remaining.length} orders still being cancelled for ${pos.symbol}`);
        }
      }

      const positionQty = Math.abs(safeParseFloat(pos.qty, 0));
      if (positionQty <= 0) {
        throw new Error('No position quantity available to set trailing stop');
      }

      // Submit the new Trailing Stop
      await service.submitOrder({
        symbol: pos.symbol,
        qty: positionQty.toString(),
        side: exitSide,
        type: 'trailing_stop',
        // Alpaca rejects 0% trailing stops; enforce 0.1% floor with 0.5% default for UX.
        trail_percent: Math.max(appliedTrail, minTrailPct).toString(),
        time_in_force: assetClass === 'crypto' ? 'gtc' : 'day'
      });

      toast.success( `Trailing Stop activated (${appliedTrail}%) for ${pos.symbol}`);
      loadData();
    } catch (e: any) {
      const msg = e.message || '';
      if (msg.includes('insufficient qty')) {
        toast.error(`Quantity mismatch for ${pos.symbol}. Try again in a second.`);
      } else if (msg.includes('invalid order type for crypto')) {
        toast.error(`Trailing Stop not supported for Crypto on Alpaca`);
      } else {
        toast.error( msg || 'Failed to update Trailing Stop');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * Cancel All Orders and Set Take Profit
   * Requirement: Atomic-like operation with retries and logging
   */
   const executeCancelAllAndSetTp = async (pos: Position, payload: any) => {
    const { price } = payload;
    const symbol = pos.symbol;
    const logPrefix = `[CancelAllSetTP][${symbol}]`;


    setIsSubmitting(true);
    toast.info( `Processing: Cancelling orders for ${symbol}...`);

    try {
      // 1. Identify all active orders for this symbol
      const allOrders = await service.getOrders('open');
      const symbolOrders = allOrders.filter(o => o.symbol === symbol);


      // Find existing Stop Loss price to preserve in OCO
      // We look for any 'stop' type order or 'stop_loss' leg of a bracket
      let existingStopPrice: string | null = null;

      const stopOrder = symbolOrders.find(o =>
        (o.type === 'stop' || o.type === 'stop_limit') &&
        o.side === (pos.side === 'long' ? 'sell' : 'buy')
      );

      if (stopOrder) {
        existingStopPrice = stopOrder.stop_price || stopOrder.stop_limit_price || null; // Alpaca uses stop_price usually
      }

      // 2. Cancellation with retries
      const cancelOrderWithRetry = async (orderId: string, retries = 2): Promise<boolean> => {
        for (let i = 0; i <= retries; i++) {
          try {
            await service.cancelOrder(orderId);
            return true;
          } catch (e: any) {
            console.error(`${logPrefix} Failed to cancel order ${orderId} (attempt ${i + 1}):`, e.message);
            if (i === retries) return false;
            // Short delay before retry
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        }
        return false;
      };

      if (symbolOrders.length > 0) {
        const results = await Promise.all(symbolOrders.map(o => cancelOrderWithRetry(o.id)));
        const allCancelled = results.every(r => r);

        if (!allCancelled) {
          throw new Error('Failed to cancel some orders after retries. Aborting TP set for safety.');
        }

      }

      // 3. Verify cancellation (Wait a bit for Alpaca to update)
      await new Promise(resolve => setTimeout(resolve, 500));
      const verifyOrders = await service.getOrders('open');
      const remainingOrders = verifyOrders.filter(o => o.symbol === symbol);

      if (remainingOrders.length > 0) {
        throw new Error(`${remainingOrders.length} orders still remain active. Aborting TP set.`);
      }

      // 4. Set Take Profit level
      const oppositeSide = pos.side === 'long' ? 'sell' : 'buy';
      const qty = Math.abs(safeParseFloat(pos.qty, 0)).toString();

      // Check asset class for OCO support
      const assetClass = await getAssetClass(symbol);
      const isCrypto = assetClass === 'crypto';

      // If no existing SL, auto-calculate one at 1R from entry
      const entryPrice = safeParseFloat(pos.avg_entry_price, 0);
      if (!existingStopPrice && entryPrice > 0) {
        const riskPerShare = Math.abs(price - entryPrice); // distance to TP = risk unit
        // For 1R TP: SL = 1R. For 2R TP: SL = 1R (half the TP distance)
        const slDistance = riskPerShare / (price > entryPrice ? 1 : 1); // 1R SL
        const autoSlPrice = pos.side === 'long'
          ? (entryPrice - slDistance).toFixed(2)
          : (entryPrice + slDistance).toFixed(2);
        existingStopPrice = autoSlPrice;
      }

       if (existingStopPrice && !isCrypto) {
          // Submit separate SL and TP orders instead of OCO
          // OCO mutual cancellation is not reliably implemented on Alpaca's side
          // This approach gives more control and is more predictable

          if (existingStopPrice) {
              await service.submitOrder({
                 symbol,
                 qty,
                 side: oppositeSide,
                 type: 'stop',
                 stop_price: existingStopPrice,
                 time_in_force: 'gtc'
              });
          }

          await service.submitOrder({
             symbol,
             qty,
             side: oppositeSide,
             type: 'limit',
             limit_price: price.toFixed(2),
             time_in_force: 'gtc'
          });

          toast.success( existingStopPrice
            ? `TP $${price.toFixed(2)} | SL $${existingStopPrice}`
            : `TP $${price.toFixed(2)} (no SL)`);
       } else {
         // Crypto: submit SL and TP separately
         if (existingStopPrice) {
             await service.submitOrder({
                symbol,
                qty,
                side: oppositeSide,
                type: 'stop',
                stop_price: existingStopPrice,
                time_in_force: 'gtc'
             });
         }

         await service.submitOrder({
            symbol,
            qty,
            side: oppositeSide,
            type: 'limit',
            limit_price: price.toFixed(2),
            time_in_force: 'gtc'
         });

         toast.success( existingStopPrice
           ? `TP $${price.toFixed(2)} | SL $${existingStopPrice}`
           : `TP $${price.toFixed(2)} (no SL)`);
      }


      loadData();
    } catch (e: any) {
      console.error(`${logPrefix} Critical failure:`, e.message);
      toast.error( `Operation failed: ${e.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * Set Stop Loss at specific price
   * Automatically cancels existing exit orders before setting new SL
   */
  const executeSetSl = async (pos: Position, payload: any) => {
    const { price } = payload;
    const symbol = pos.symbol;
    const side = pos.side === 'long' ? 'sell' : 'buy';
    const logPrefix = `[SetSL][${symbol}]`;

    setIsSubmitting(true);
    toast.info( `Setting Stop Loss for ${symbol}...`);

    try {
      // 1. Cancel existing exit orders for this side (SL/TP/TSL)
      await cancelExistingExitOrders(symbol, side);

      // 2. Submit new SL order
      await service.submitOrder({
        symbol,
        qty: Math.abs(safeParseFloat(pos.qty, 0)).toString(),
        side,
        type: 'stop',
        stop_price: price.toFixed(2),
        time_in_force: 'gtc'
      });

      toast.success( `Success: Stop Loss set at $${price.toFixed(2)} for ${symbol}`);
      loadData();
    } catch (e: any) {
      console.error(`${logPrefix} Failure:`, e.message);
      toast.error( `Failed to set SL: ${e.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * Set Stop Loss based on ATR multiplier
   */
  const executeSetSlAtr = async (pos: Position, payload: any) => {
    const { multiplier } = payload;
    const symbol = pos.symbol;
    const side = pos.side === 'long' ? 'sell' : 'buy';
    const isLong = pos.side === 'long';
    const logPrefix = `[SetSL-ATR][${symbol}]`;

    setIsSubmitting(true);
    toast.info( `Calculating ATR for ${symbol}...`);

    try {
      const bars = await service.getBars(symbol, '1D', 50);
      const atr = calculateATR(bars);

      if (!atr) {
        toast.error( `Not enough data for ATR calculation (${bars?.length || 0} bars, need at least 1)`);
        setIsSubmitting(false);
        return;
      }

      const currentPrice = safeParseFloat(pos.current_price, 0);
      const slPrice = isLong ? currentPrice - (atr * multiplier) : currentPrice + (atr * multiplier);

      toast.info( `Setting Stop Loss for ${symbol} at $${slPrice.toFixed(2)} (ATR: ${atr.toFixed(2)})...`);

      await cancelExistingExitOrders(symbol, side);

      await service.submitOrder({
        symbol,
        qty: Math.abs(safeParseFloat(pos.qty, 0)).toString(),
        side,
        type: 'stop',
        stop_price: slPrice.toFixed(2),
        time_in_force: 'gtc'
      });

      toast.success( `Success: ATR SL set at $${slPrice.toFixed(2)} (${multiplier}x ATR) for ${symbol}`);
      loadData();
    } catch (e: any) {
      console.error(`${logPrefix} Failure:`, e.message);
      toast.error( `Failed to set ATR SL: ${e.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const executeQuickOrder = async (position: Position, side: 'buy' | 'sell') => {
    setIsSubmitting(true);
    try {
      // Quick orders add/reduce position by 1 share
      const qty = '1';
      const assetClass = await getAssetClass(position.symbol);
      const quickOrder = await service.submitOrder({
        symbol: position.symbol,
        qty,
        side,
        type: 'market',
        time_in_force: assetClass === 'crypto' ? 'gtc' : 'day'
        // Note: Market orders do NOT support extended_hours in Alpaca API
        // Only limit orders can trade in extended hours
      });
      await clearOrphanOrders([quickOrder.id]);
      vibrate([40, 40]);
      toast.success( `${side === 'buy' ? 'Bought' : 'Sold'} ${qty} ${position.symbol}`);
      loadData();
    } catch (e: any) {
      // Provide helpful error messages for common issues
      if (e.message?.includes('wash trade')) {
        toast.error( 'Wash trade detected - wait before rebuying');
      } else if (e.message?.includes('insufficient')) {
        toast.error( 'Insufficient shares or buying power');
      } else {
        toast.error( e.message || 'Quick order failed');
      }
    } finally {
      setIsSubmitting(false);
    }
  };



  const handleCancelOrder = async (orderId: string, symbol: string) => {
    vibrate(10);
    try {
      await service.cancelOrder(orderId);
      toast.success( `Canceled order for ${symbol}`);
      loadData();
    } catch (e: any) {
      const msg = (e.message || '').toLowerCase();
      if (msg.includes('cancel') || msg.includes('404') || msg.includes('filled')) {
        toast.info( `Order for ${symbol} already completed or cancelled`);
        loadData();
      } else {
        toast.error( e.message || 'Failed to cancel order');
      }
    }
  };

  const handleSelectSymbol = (symbol: string, qty: number) => {
    applySymbol(symbol);
    setQty(qty);
    vibrate(10);
  };


  const executeCancelAll = async (pos: Position) => {
    const symbol = pos.symbol;
    toast.info( `Cancelling all orders for ${symbol}...`);
    try {
        const openOrders = await service.getOrders('open');
        const symbolOrders = openOrders.filter(o => o.symbol === symbol);

        if (symbolOrders.length > 0) {
            await Promise.all(symbolOrders.map(o => service.cancelOrder(o.id)));
            toast.success( `Cancelled ${symbolOrders.length} orders for ${symbol}`);
        } else {
            toast.info( `No open orders found for ${symbol}`);
        }
        loadData();
    } catch (e: any) {
        toast.error( `Failed to cancel orders: ${e.message}`);
    }
  };

  const formatStopPrice = (price: number, symbol: string): string => {
    const isCryptoSym = symbol.includes('/') || symbol.endsWith('USD') || symbol.endsWith('USDT') || symbol.endsWith('BTC');
    if (!isCryptoSym) return price.toFixed(2);
    const pipSize = price >= 1000 ? 0.1 : price >= 100 ? 0.01 : price >= 1 ? 0.0001 : 0.00000001;
    const decimals = pipSize.toString().split('.')[1]?.length ?? 2;
    const rounded = Math.round(price / pipSize) * pipSize;
    return rounded.toFixed(decimals);
  };

  const executeCancelAllAndSetStopLoss = async (pos: Position, stopPrice: number, label: string, logTag: string) => {
    const symbol = pos.symbol;
    const side = pos.side === 'long' ? 'sell' : 'buy';
    const logPrefix = `[${logTag}][${symbol}]`;

    setIsSubmitting(true);
    toast.info(`Cancelling orders & setting ${label} SL for ${symbol}...`);

    try {
      const openOrders = await service.getOrders('open');
      const normSym = (s: string) => s.replace('/', '').replace('-', '').replace('_', '').toUpperCase().trim();
      const symbolOrders = openOrders.filter(o => normSym(o.symbol) === normSym(symbol));

      if (symbolOrders.length > 0) {
        await Promise.all(symbolOrders.map(o => service.cancelOrder(o.id)));
        // Poll until all orders for this symbol are actually cancelled, max 5s
        const deadline = Date.now() + 5000;
        while (Date.now() < deadline) {
          await new Promise(r => setTimeout(r, 200));
          const remaining = await service.getOrders('open');
          const stillActive = remaining.filter(o => normSym(o.symbol) === normSym(symbol));
          if (stillActive.length === 0) {
            break;
          }
        }
      }

      const qty = Math.abs(safeParseFloat(pos.qty, 0)).toString();
      await service.submitOrder({
        symbol, qty, side, type: 'stop',
        stop_price: formatStopPrice(stopPrice, symbol),
        time_in_force: 'gtc',
      });

      toast.success(`${label} SL set at $${stopPrice.toFixed(2)} for ${symbol}`);
      loadData();
    } catch (e: any) {
      console.error(`${logPrefix} Failure:`, e.message);
      toast.error(`Failed to set ${label} SL: ${e.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const executeCancelAllSetSlPrice = async (pos: Position) => {
    const currentPrice = realtimePrices[pos.symbol] || safeParseFloat(pos.current_price, 0);
    if (currentPrice <= 0) {
      toast.error(`Cannot set price-stop: invalid current price for ${pos.symbol}`);
      return;
    }
    const offsetPercent = config.autoStopLossPct / 100;
    const offset = currentPrice * offsetPercent;
const stopPrice = pos.side === 'long' ? currentPrice - offset : currentPrice + offset;
    await executeCancelAllAndSetStopLoss(pos, stopPrice, 'price-stop', 'SL-PRICE');
  };

  const executeCancelAllSetSlBe = async (pos: Position) => {
    const entryPrice = safeParseFloat(pos.avg_entry_price, 0);
    const currentPrice = realtimePrices[pos.symbol] || safeParseFloat(pos.current_price, 0);
    if (entryPrice <= 0) {
      toast.error(`Cannot set break-even SL: invalid entry price for ${pos.symbol}`);
      return;
    }
    // Set stop loss at entry price (break-even)
    const stopPrice = entryPrice;
    // Validation: ensure stop is on the correct side of current price (position must be profitable)
    if (pos.side === 'long') {
      if (stopPrice >= currentPrice) {
        toast.error(`Cannot set BE: position is underwater. Wait until trade returns to entry.`);
        return;
      }
    } else {
      if (stopPrice <= currentPrice) {
        toast.error(`Cannot set BE: position is underwater. Wait until trade returns to entry.`);
        return;
      }
    }
    await executeCancelAllAndSetStopLoss(pos, stopPrice, 'break-even', 'SL-BE');
  };

  const activateTrailingStopForPosition = async (pos: Position) => {
    try {
      const entryPrice = safeParseFloat(pos.avg_entry_price, 0);
      const currentPrice = realtimePrices[pos.symbol] || safeParseFloat(pos.current_price, 0);
      const currentProfit = pos.side === 'long'
        ? ((currentPrice - entryPrice) / entryPrice) * 100
        : ((entryPrice - currentPrice) / entryPrice) * 100;
      const trailPercent = currentProfit >= 5 ? 0.5 : 1.0;
      await executeTrailingStop(pos, { percent: trailPercent });
      beWithTrailRef.current.delete(pos.symbol);
      toast.success(`Trailing stop (${trailPercent}%) activated for ${pos.symbol} at +${currentProfit.toFixed(1)}% profit`);
    } catch (e: any) {
      console.error(`[BE+Trail] Failed to activate trailing for ${pos.symbol}:`, e.message);
      toast.error(`Failed to activate trailing stop for ${pos.symbol}: ${e.message}`);
    }
  };

const executeCancelAllSetSlBeWithTrail = async (pos: Position) => {
    const entryPrice = safeParseFloat(pos.avg_entry_price, 0);
    const currentPrice = realtimePrices[pos.symbol] || safeParseFloat(pos.current_price, 0);
    if (entryPrice <= 0) {
      toast.error(`Cannot set break-even+trail SL: invalid entry price for ${pos.symbol}`);
      return;
    }
    // Determine if position is currently profitable
    const isProfitable = pos.side === 'long'
      ? currentPrice > entryPrice
      : currentPrice < entryPrice;
    if (isProfitable) {
      // Already profitable: submit BE stop immediately (at entry price) and handle trailing
      const stopPrice = entryPrice;
      await executeCancelAllAndSetStopLoss(pos, stopPrice, 'break-even+trail', 'SL-BE-TRAIL');
      // Track for trailing activation at +3%
      beWithTrailRef.current.add(pos.symbol);
      const currentProfit = pos.side === 'long'
        ? ((currentPrice - entryPrice) / entryPrice) * 100
        : ((entryPrice - currentPrice) / entryPrice) * 100;
      if (currentProfit >= 3) {
        toast.info(`${pos.symbol} at +${currentProfit.toFixed(1)}%, activating trailing stop...`);
        await activateTrailingStopForPosition(pos);
      } else {
        toast.success(`Break-even set for ${pos.symbol}. Trailing will activate at +3% (currently ${currentProfit.toFixed(1)}%)`);
      }
} else {
      // Not profitable: arm watcher to submit when position returns to break-even
      beTrailArmedRef.current.add(pos.symbol);
      toast.success(`BE+Trail armed for ${pos.symbol} — will activate when trade returns to break-even`);
      return;
    }
  };

   // Monitor BE+Trail armed positions: when they become profitable, execute BE+Trail
   useEffect(() => {
     if (beTrailArmedRef.current.size === 0) return;

     // Iterate over a copy to avoid mutation during iteration
     Array.from(beTrailArmedRef.current).forEach(symbol => {
       const pos = positions.find(p => p.symbol === symbol);
       if (!pos) {
         beTrailArmedRef.current.delete(symbol);
         return;
       }
       const entryPrice = safeParseFloat(pos.avg_entry_price, 0);
       const currentPrice = realtimePrices[symbol] || safeParseFloat(pos.current_price, 0);
       if (entryPrice <= 0 || currentPrice <= 0) return;
       const isProfitable = pos.side === 'long'
         ? currentPrice > entryPrice
         : currentPrice < entryPrice;
       if (isProfitable) {
         // Remove before calling to prevent re-entry loops
         beTrailArmedRef.current.delete(symbol);
         executeCancelAllSetSlBeWithTrail(pos);
       }
     });
   }, [positions, realtimePrices, executeCancelAllSetSlBeWithTrail]);

   const confirmTradeAction = async (pos: Position, action: string, payload?: any) => {
    vibrate(10);
    if (action === 'market' || action === 'flash-close') {
      const closeQty = payload?.qty;
      await executeClosePosition(pos, { closeQty });
    }
    else if (action === 'reversal') await executeReversal(pos);
    else if (action === 'quick-buy') await executeQuickOrder(pos, 'buy');
    else if (action === 'quick-sell') await executeQuickOrder(pos, 'sell');
     else if (action === 'sideways-limit') await executeSidewaysLimit(pos, payload);
     else if (action === 'cancel-sideways') await cancelSidewaysLimit(pos.symbol);
     else if (action === 'trailing-stop') await executeTrailingStop(pos, payload);
    else if (action === 'cancel-all-set-tp') await executeCancelAllAndSetTp(pos, payload);
    else if (action === 'set-sl') await executeSetSl(pos, payload);
    else if (action === 'set-sl-atr') await executeSetSlAtr(pos, payload);
    else if (action === 'cancel-all') await executeCancelAll(pos);
    else if (action === 'cancel-all-set-sl-price') await executeCancelAllSetSlPrice(pos);
    else if (action === 'cancel-all-set-sl-be') await executeCancelAllSetSlBe(pos);
    else if (action === 'cancel-all-set-sl-be-with-trail') await executeCancelAllSetSlBeWithTrail(pos);
  };

  const typedConfirmTradeAction = confirmTradeAction as (
    pos: Position,
    action: PositionAction,
    payload?: PositionActionPayload
  ) => Promise<void>;

  return (
    <ErrorBoundary>
      <>

        <div
          className="space-y-4 md:space-y-6 animate-[fadeIn_0.3s_ease-out] px-2 sm:px-4 md:px-0 h-full"
          ref={tradingPanelRef}
        >

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start h-full">

            {/* Left Column: Controls - Entry Manager */}
            <div className="lg:col-span-6 space-y-4">
              <EntryManager
                symbol={symbol}
                qty={qty}
                isSubmitting={isSubmitting}
                selectedSymbolPrice={selectedSymbolPrice}
                realtimePrices={realtimePrices}
                autoStopLossPct={config.autoStopLossPct}
                autoTakeProfitPct={config.autoTakeProfitPct}
                buyingPower={account ? parseFloat(account.daytrading_buying_power || account.buying_power) : 0}
                equity={account ? parseFloat(account.equity) : 0}
                onSelectSymbol={selectSymbol}
                onSetQty={setQty}
                onConfirmTrade={handleTradeSubmit}
              />
            </div>

            {/* REFACTORED: Renamed 'Active Positions' to 'OPEN POSITIONS' */}
            {/* Right Column: Trading Data & Monitoring */}
            <div className="lg:col-span-6 space-y-6">
              {/* REFACTORED: Renamed 'Active Positions' to 'OPEN POSITIONS' */}
              <PositionRiskManagement
                positions={positions}
                orders={orders}
                recentPositions={recentPositions}
                isLoading={isLoading || false}
                refreshing={refreshing}
                realtimePrices={realtimePrices}
                onAction={typedConfirmTradeAction}
                onRefresh={() => { vibrate(5); loadData(); }}
                onSelectSymbol={handleSelectSymbol}
                service={service}
                equity={account ? parseFloat(account.equity) : 0}
                collapseAllVersion={collapseAllVersion}
                collapseAllCollapsed={collapseAllCollapsed}
                expandedSymbol={expandedSymbol}
              />

              {/* Secondary Monitoring: Stop Orders & History side-by-side */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <StopOrderMonitor
                  orders={orders}
                  onCancelOrder={handleCancelOrder}
                />
              </div>

              {/* Recent Closed Positions */}
              <div className="grid grid-cols-1">
                <RecentClosed
                  recentPositions={recentPositions}
                  onSelectSymbol={handleSelectSymbol}
                />
              </div>
            </div>

          </div>
        </div>
      </>
    </ErrorBoundary>
  );
};

export default TradePanel;
