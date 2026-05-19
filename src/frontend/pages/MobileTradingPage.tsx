import { useState, useEffect, useCallback, useRef } from 'react';
import { AlpacaService } from '@/services/stocks';
import { getEnvConfig } from '@/config/envConfig';
import { getTradingConfig } from '@/config/envConfig';
import { isCryptoSymbol } from '@/services/shared/utils/assetClassDetector';
import { useTradeData } from '@/components/Stocks/TradePositions/hooks/useTradeData';
import { useLayeredStops } from '@/components/Stocks/TradePositions/hooks/useLayeredStops';
import { StatusBar } from '@/components/Mobile/StatusBar';
import { MobileQuickAmount } from '@/components/Mobile/MobileQuickAmount';
import { MobileTickerSelect } from '@/components/Mobile/MobileTickerSelect';
import { MobileSizeToggle } from '@/components/Mobile/MobileSizeToggle';
import { MobilePriceAction } from '@/components/Mobile/MobilePriceAction';
import { GlobalPositionManager } from '@/components/Mobile/GlobalPositionManager';
import { MobileControlsPanel } from '@/components/Mobile/MobileControlsPanel';
import { SettingsDrawer } from '@/components/Mobile/SettingsDrawer';
import type { Position, Order, Account } from '@/types';
import { safeParseFloat } from '@/shared/utils/numbers';
import { cancelExistingExitOrders } from '@/utils/stocks/cancelExistingExitOrders';
import { toast } from 'sonner';

function parsePreset(preset: string): number {
  return parseFloat(preset.replace('K', '')) * 1000;
}

function safeErrorMessage(err: unknown, fallback: string): string {
  const raw = (err as { message?: string })?.message ?? '';
  if (!raw || raw.length > 140 || raw.includes('{') || raw.includes('<')) return fallback;
  return raw;
}

type MobileOrderType = 'market' | 'limit' | 'stop_limit';
type PresetId = 'o-sl' | 'ladder' | 'l-and-f' | 'sl-tp';

const LONG_PRESS_MS = 500;

function PresetButton({
  label,
  isOn,
  onTap,
  onLongPress,
  longPressLabel,
}: {
  label: string;
  isOn: boolean;
  onTap: () => void;
  onLongPress?: () => void;
  longPressLabel?: string;
}) {
  const [holding, setHolding] = useState(false);
  const timerRef = useRef<number | null>(null);
  const firedRef = useRef(false);

  const clear = () => {
    if (timerRef.current != null) { window.clearTimeout(timerRef.current); timerRef.current = null; }
    setHolding(false);
  };

  const start = () => {
    if (!onLongPress) return;
    firedRef.current = false;
    setHolding(true);
    timerRef.current = window.setTimeout(() => {
      firedRef.current = true;
      setHolding(false);
      onLongPress();
    }, LONG_PRESS_MS);
  };

  const end = () => {
    const wasHolding = timerRef.current != null;
    clear();
    if (wasHolding && !firedRef.current) onTap();
  };

  return (
    <button
      type="button"
      onPointerDown={() => { if (onLongPress) start(); }}
      onPointerUp={() => { if (onLongPress) end(); else onTap(); }}
      onPointerCancel={clear}
      onPointerLeave={clear}
      onContextMenu={(e) => e.preventDefault()}
      style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
      className={
        holding
          ? 'bg-[#B92B2B] text-white border border-[#FF4B4B] shadow-[0_0_20px_rgba(255,75,75,0.5)] rounded-xl py-2.5 text-[11px] font-bold tracking-wide'
          : isOn
            ? 'bg-[#25D366] text-white border border-[#25D366] shadow-[0_0_20px_rgba(37,211,102,0.4)] rounded-xl py-2.5 text-[11px] font-bold tracking-wide'
            : 'bg-[#242E42] border border-white/5 text-gray-400 rounded-xl py-2.5 text-[11px] font-bold tracking-wide'
      }
    >
      {holding && longPressLabel ? longPressLabel : label}
    </button>
  );
}

function getMobileTimeInForce(
  orderType: MobileOrderType,
  symbol: string,
  configuredTimeInForce?: 'gtc' | 'day' | 'ioc',
  options: { extendedHours?: boolean; hasAdvancedOrder?: boolean } = {},
): 'gtc' | 'day' | 'ioc' {
  if (isCryptoSymbol(symbol)) {
    return configuredTimeInForce === 'ioc' ? 'ioc' : 'gtc';
  }

  if (orderType === 'market' && !isCryptoSymbol(symbol)) {
    return 'day';
  }

  if (options.extendedHours || options.hasAdvancedOrder) {
    return 'day';
  }

  // B-9: Enforce 'day' for stock limit orders without ext-hours
  if (orderType === 'limit' && !options.extendedHours && !options.hasAdvancedOrder) {
    return 'day';
  }

  if (orderType === 'stop_limit') {
    return configuredTimeInForce === 'gtc' ? 'gtc' : 'day';
  }

  return configuredTimeInForce || 'day';
}

export function MobileTradingPage() {
  const env = getEnvConfig();
  const tradingCfg = getTradingConfig();
  const mobileCfg = env.defaults?.mobile;

  const [config, setConfig] = useState(() => env);
  const [service, setService] = useState(() => new AlpacaService(config));
  const [isPaper, setIsPaper] = useState(config.isPaper);
  const [account, setAccount] = useState<Account | null>(null);
  const [paperAvailable, setPaperAvailable] = useState(true);
  const [liveAvailable, setLiveAvailable] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [activeSymbol, setActiveSymbol] = useState(
    tradingCfg.defaultSymbol || (mobileCfg?.tickers[0] ?? 'INTC')
  );
  const [activePreset, setActivePreset] = useState(() => mobileCfg?.defaultPreset ?? '100K');
  const [refreshKey, setRefreshKey] = useState(0); // Forces re-fetch when symbol re-selected
  const [activeTier, setActiveTier] = useState<'M' | 'L' | 'S'>(mobileCfg?.defaultTier ?? 'L');
  const [watchlist, setWatchlist] = useState<string[]>(
    () => mobileCfg?.tickers ?? ['INTC', 'MU', 'MC']
  );
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [limitPrice, setLimitPrice] = useState<number | null>(null);
  const [slActive, setSlActive] = useState(false);
  const [tpActive, setTpActive] = useState(false);
  const [slPrice, setSlPrice] = useState<number | null>(null);
  const [tpPrice, setTpPrice] = useState<number | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [positionSide, setPositionSide] = useState<'long' | 'short'>('long'); // LONG or SHORT mode
  const [tickDirections, setTickDirections] = useState<Record<string, 'up' | 'down' | null>>({});
  const [activePresets, setActivePresets] = useState<Set<PresetId>>(() => {
    const init = new Set<PresetId>();
    if (mobileCfg?.defaultOsl) init.add('o-sl');
    return init;
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const layeredSymbolsRef = useRef(new Set<string>());
  const serviceSwitchIdRef = useRef(0);
  const positionSideRef = useRef(positionSide);
  const prevPricesRef = useRef<Record<string, number>>({});
  const pricePollIdRef = useRef(0);
  useEffect(() => { positionSideRef.current = positionSide; }, [positionSide]);
  const aggressiveMode = false;
  const tradingMode = getTradingConfig().strategy;

  const extraSymbols = Array.from(new Set([...watchlist, activeSymbol].filter(Boolean)));

  const {
    positions,
    realtimePrices,
    loadData,
  } = useTradeData({
    service,
    account,
    isLoading: false,
    aggressiveMode,
    pollingInterval: 1,
    tradingMode,
    extraSymbols,
  });

  const { startLayeredStops } = useLayeredStops({
    service,
    positions,
    realtimePrices,
    layeredSymbolsRef,
  });

  useEffect(() => {
    fetch('/api/alpaca/health', { cache: 'no-store' })
      .then(r => r.json())
      .then(data => {
        setPaperAvailable(data.hasPaperKeys !== false);
        setLiveAvailable(data.hasLiveKeys !== false);
      })
      .catch(() => { /* assume both available on error */ });
  }, []);

  useEffect(() => {
    const handler = (e: CustomEvent<boolean>) => {
      setIsPaper(e.detail);
      setConfig((prev) => ({ ...prev, isPaper: e.detail }));
    };
    window.addEventListener('mobile-paper-live-change', handler as any);
    return () => window.removeEventListener('mobile-paper-live-change', handler as any);
  }, []);

  useEffect(() => {
    serviceSwitchIdRef.current += 1;
    setService(new AlpacaService(config));
  }, [config]);

  // Re-instantiate AlpacaService when settings change (debounced)
  useEffect(() => {
    const handler = () => {
      const debounceId = setTimeout(() => {
        serviceSwitchIdRef.current += 1;
        setService(new AlpacaService(getEnvConfig()));
      }, 250);
      return () => clearTimeout(debounceId);
    };
    window.addEventListener('lean:settings-changed', handler);
    return () => window.removeEventListener('lean:settings-changed', handler);
  }, []);

  const handlePaperLiveChange = useCallback((newIsPaper: boolean) => {
    setIsPaper(newIsPaper);
    setConfig((prev) => ({ ...prev, isPaper: newIsPaper }));
    window.dispatchEvent(new CustomEvent('mobile-paper-live-change', { detail: newIsPaper }));
  }, []);

  const loadOpenOrders = useCallback(async () => {
    const switchId = serviceSwitchIdRef.current;
    if (!service) return;
    try {
      const ords = await service.getOrders('open');
      if (serviceSwitchIdRef.current === switchId) setOrders(ords);
    } catch {
      if (serviceSwitchIdRef.current === switchId) setOrders([]);
    }
  }, [service]);

  useEffect(() => {
    const switchId = serviceSwitchIdRef.current;
    if (service) {
      service.getAccount()
        .then((acc) => { if (serviceSwitchIdRef.current === switchId) setAccount(acc); })
        .catch(() => { if (serviceSwitchIdRef.current === switchId) setAccount(null); });
    }
  }, [service]);

  useEffect(() => {
    void loadOpenOrders();
  }, [loadOpenOrders]);

  useEffect(() => {
    const switchId = serviceSwitchIdRef.current;
    if (service) {
      service.getLatestTrade(activeSymbol)
        .then((price) => { if (serviceSwitchIdRef.current === switchId) setCurrentPrice(price); })
        .catch(() => { if (serviceSwitchIdRef.current === switchId) setCurrentPrice(null); });
    }
  }, [service, activeSymbol, refreshKey]);

  useEffect(() => {
    if (!service || !activeSymbol) return;

    let stopped = false;
    let inFlight = false;
    const pollId = pricePollIdRef.current + 1;
    pricePollIdRef.current = pollId;

    const updateActivePrice = async () => {
      if (stopped || inFlight) return;
      inFlight = true;
      try {
        const quote = await service.getLatestQuote(activeSymbol);
        const quotePrice = quote && quote.ap > 0 && quote.bp > 0
          ? (quote.ap + quote.bp) / 2
          : null;
        const price = quotePrice ?? await service.getLatestTrade(activeSymbol);

        if (!stopped && pricePollIdRef.current === pollId) {
          setCurrentPrice(Math.round(price * 100) / 100);
        }
      } catch {
        // Keep the last displayed price if a single refresh fails.
      } finally {
        inFlight = false;
      }
    };

    void updateActivePrice();
    const timer = window.setInterval(updateActivePrice, 1000);

    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [service, activeSymbol, refreshKey]);

  useEffect(() => {
    const price = realtimePrices[activeSymbol];
    if (price !== undefined) {
      setCurrentPrice(price);
    }
  }, [realtimePrices, activeSymbol]);

  useEffect(() => {
    const next: Record<string, 'up' | 'down' | null> = {};
    let changed = false;
    for (const sym of Object.keys(realtimePrices)) {
      const cur = realtimePrices[sym];
      const prev = prevPricesRef.current[sym];
      if (prev != null && cur !== prev) {
        next[sym] = cur > prev ? 'up' : 'down';
        changed = true;
      }
      prevPricesRef.current[sym] = cur;
    }
    if (!changed) return;
    setTickDirections(p => ({ ...p, ...next }));
    const timers = Object.keys(next).map(sym =>
      window.setTimeout(() => {
        setTickDirections(p => ({ ...p, [sym]: null }));
      }, 250)
    );
    return () => timers.forEach(clearTimeout);
  }, [realtimePrices]);

  useEffect(() => {
    if (currentPrice !== null && limitPrice === null) {
      setLimitPrice(currentPrice);
    }
  }, [currentPrice, limitPrice]);

  useEffect(() => {
    const tradingCfg = getTradingConfig();
    const slPct = (tradingCfg.autoStopLossPct ?? 1) / 100;
    const tpPct = (tradingCfg.autoTakeProfitPct ?? 2) / 100;
    const basePrice = limitPrice ?? currentPrice;
    if (basePrice !== null) {
      // For LONG positions: SL below entry, TP above entry
      // For SHORT positions: SL above entry, TP below entry
      if (positionSide === 'long') {
        setSlPrice(Math.round(basePrice * (1 - slPct) * 100) / 100);
        setTpPrice(Math.round(basePrice * (1 + tpPct) * 100) / 100);
      } else {
        setSlPrice(Math.round(basePrice * (1 + slPct) * 100) / 100);
        setTpPrice(Math.round(basePrice * (1 - tpPct) * 100) / 100);
      }
    }
  }, [currentPrice, limitPrice, positionSide]);

  useEffect(() => {
    if (import.meta.env.DEV) {
      console.info('[mobile] config', {
        tickers: mobileCfg?.tickers ?? [],
        presets: mobileCfg?.presets ?? [],
        defaultPreset: mobileCfg?.defaultPreset ?? '100K',
        defaultTier: mobileCfg?.defaultTier ?? 'L',
        slPct: tradingCfg.autoStopLossPct,
        tpPct: tradingCfg.autoTakeProfitPct,
        bePct: tradingCfg.beStopOffsetPct,
        slOffsetPct: tradingCfg.slStopOffsetPct,
        trailPct: tradingCfg.trailingStopDefaultPct,
        maxPosPct: tradingCfg.maxPositionSizePercent,
        tif: env.defaults?.defaultTimeInForce,
        extHours: env.defaults?.extendedHours,
      });
    }
  }, []);

  const presetValue = parsePreset(activePreset);
  const computedQty = currentPrice
    ? Math.floor(presetValue / currentPrice)
    : tradingCfg.defaultQty || 0;
  const canTrade = computedQty >= 1 && currentPrice != null;

  const handleAddSymbol = useCallback(() => {
    const input = window.prompt('Add symbol (e.g. AAPL):');
    if (!input) return;
    const symbol = input.trim().toUpperCase();
    if (!symbol || watchlist.includes(symbol)) return;
    setWatchlist(prev => [...prev, symbol]);
  }, [watchlist]);

  const handleRemoveSymbol = useCallback((symbol: string) => {
    const idx = watchlist.indexOf(symbol);
    const next = watchlist.filter(s => s !== symbol);
    setWatchlist(next);
    if (symbol === activeSymbol && next.length > 0) {
      const fallback = next[idx] ?? next[idx - 1] ?? next[0];
      setActiveSymbol(fallback);
      setCurrentPrice(null);
      setRefreshKey(k => k + 1);
      setLimitPrice(null);
      setActivePresets(new Set());
    }
  }, [watchlist, activeSymbol]);

  const handlePriceRefresh = useCallback(async (tier: 'M' | 'L' | 'S') => {
    if (!service || !activeSymbol) return;

    try {
      const quote = await service.getLatestQuote(activeSymbol);
      const price = quote ? (quote.ap + quote.bp) / 2 : null;

      if (tier === 'L' && price) {
        // In LIMIT mode, update the limit price to current market price
        setLimitPrice(price);
      }
    } catch (err) {
      // Failed to refresh price
    }
  }, [service, activeSymbol]);

  const handlePriceStep = useCallback((increment: number) => {
    setLimitPrice(prev => {
      const base = prev ?? currentPrice ?? 0;
      const next = Math.round((base + increment) * 100) / 100;
      if (next < 0.01) {
        toast.error('Price cannot go below $0.01');
        return 0.01;
      }
      return next;
    });
  }, [currentPrice]);

  // Preset handlers
  const handleOsl = useCallback(async (side: 'buy' | 'sell') => {
    if (!service || !currentPrice) return;

    const isLongMode = positionSideRef.current === 'long';
    const triggerPrice = limitPrice ?? currentPrice;

    if (triggerPrice == null || !Number.isFinite(triggerPrice) || triggerPrice <= 0) {
      toast.error('Price unavailable — wait for a live quote');
      return;
    }

    if (env.defaults?.extendedHours === true) {
      toast.warning('O-SL disabled: extended hours not supported for bracket orders');
      return;
    }

    let qty = computedQty;
    // Only cap qty when CLOSING a position:
    // - LONG mode + SELL: closing/cover a long position
    // - SHORT mode + BUY: closing/cover a short position
    // For SHORT mode + SELL (SHORT entry), skip position-cap
    if ((isLongMode && side === 'sell') || (!isLongMode && side === 'buy')) {
      const position = positions.find(p => p.symbol === activeSymbol);
      if (!position) { toast.error('No position to close'); return; }
      const positionQty = Math.abs(safeParseFloat(position.qty, 0));
      qty = Math.min(computedQty, positionQty);
      if (qty <= 0) { toast.error('No shares available to close'); return; }
    }

    const slPct = (tradingCfg.autoStopLossPct ?? 1) / 100;
    const slPrice = side === 'buy' ? triggerPrice * (1 - slPct) : triggerPrice * (1 + slPct);

    const orderType: MobileOrderType = activeTier === 'M' ? 'market' : activeTier === 'L' ? 'limit' : 'stop_limit';
    const basePayload: any = {
      symbol: activeSymbol,
      qty: String(qty),
      side,
      time_in_force: getMobileTimeInForce(orderType, activeSymbol, env.defaults?.defaultTimeInForce, { extendedHours: env.defaults?.extendedHours }),
      type: orderType,
      order_class: 'oto',
      stop_loss: { stop_price: slPrice.toFixed(2) },
    };

    if (orderType === 'limit' && triggerPrice) basePayload.limit_price = triggerPrice.toFixed(2);
    if (orderType === 'stop_limit') {
      const slippagePct = 0.001;
      basePayload.stop_price = triggerPrice.toFixed(2);
      basePayload.limit_price = (side === 'buy' ? triggerPrice * (1 + slippagePct) : triggerPrice * (1 - slippagePct)).toFixed(2);
    }

    const switchId = serviceSwitchIdRef.current;
    try {
      await service.submitOrder(basePayload);
      if (serviceSwitchIdRef.current !== switchId) return;
      const sideLabel = isLongMode ? (side === 'buy' ? 'LONG' : 'SHORT') : (side === 'buy' ? 'COVER' : 'EXIT');
      toast.success(`O-SL ${sideLabel} ${qty} ${activeSymbol} @ $${triggerPrice.toFixed(2)}, SL $${slPrice.toFixed(2)}`);
      loadData();
      void loadOpenOrders();
    } catch (err) {
      if (serviceSwitchIdRef.current !== switchId) return;
      toast.error(`O-SL order failed: ${safeErrorMessage(err, 'Order failed')}`);
    }
  }, [service, activeSymbol, currentPrice, limitPrice, activeTier, computedQty, positionSide, positions, account, env, tradingCfg, loadData, loadOpenOrders, presetValue]);

  const handleSlTp = useCallback(async (side: 'buy' | 'sell') => {
    if (!service || !currentPrice) return;

    const triggerPrice = limitPrice ?? currentPrice;

    if (triggerPrice == null || !Number.isFinite(triggerPrice) || triggerPrice <= 0) {
      toast.error('Price unavailable — wait for a live quote');
      return;
    }

    const slPct = (tradingCfg.autoStopLossPct ?? 1) / 100;
    const tpPct = (tradingCfg.autoTakeProfitPct ?? 2) / 100;

    const slPrice = side === 'buy' ? triggerPrice * (1 - slPct) : triggerPrice * (1 + slPct);
    const tpPrice = side === 'buy' ? triggerPrice * (1 + tpPct) : triggerPrice * (1 - tpPct);

    const orderType: MobileOrderType = activeTier === 'M' ? 'market' : activeTier === 'L' ? 'limit' : 'stop_limit';
    
    const basePayload: any = {
      symbol: activeSymbol,
      qty: String(computedQty),
      side,
      time_in_force: 'day',
      type: orderType,
      order_class: 'bracket',
      stop_loss: { stop_price: slPrice.toFixed(2) },
      take_profit: { limit_price: tpPrice.toFixed(2) },
    };

    if (orderType === 'limit' && triggerPrice) basePayload.limit_price = triggerPrice.toFixed(2);
    if (orderType === 'stop_limit') {
      const slippagePct = 0.001;
      basePayload.stop_price = triggerPrice.toFixed(2);
      basePayload.limit_price = (side === 'buy' ? triggerPrice * (1 + slippagePct) : triggerPrice * (1 - slippagePct)).toFixed(2);
    }

    try {
      await service.submitOrder(basePayload);
      toast.success(`SL-TP ${side.toUpperCase()} ${computedQty} ${activeSymbol} @ $${triggerPrice.toFixed(2)}, SL $${slPrice.toFixed(2)}, TP $${tpPrice.toFixed(2)}`);
      loadData();
      void loadOpenOrders();
    } catch (err) {
      toast.error(`SL-TP order failed: ${safeErrorMessage(err, 'Order failed')}`);
    }
  }, [service, activeSymbol, currentPrice, limitPrice, activeTier, computedQty, tradingCfg.autoStopLossPct, tradingCfg.autoTakeProfitPct, loadData, loadOpenOrders]);

  const handleLadder = useCallback(async (side: 'buy' | 'sell') => {
    if (!service || !currentPrice) return;
    if (activeTier === 'M') { toast.error('Ladder requires LIMIT or STOP LIMIT'); return; }

    const triggerPrice = limitPrice ?? currentPrice;

    if (triggerPrice == null || !Number.isFinite(triggerPrice) || triggerPrice <= 0) {
      toast.error('Price unavailable — wait for a live quote');
      return;
    }

    const step = tradingCfg.ladderPriceStep ?? 0.10;
    const count = tradingCfg.ladderOrderCount ?? 3;
    const perOrderQty = Math.floor(computedQty / count);
    const remainder = computedQty - perOrderQty * count;

    if (perOrderQty < 1) { toast.error('Quantity too small to ladder'); return; }

    // Direction depends on order type:
    //   limit: BUY ladders DOWN (buy lower), SELL ladders UP (sell higher).
    //   stop_limit: BUY ladders UP (breakout trigger), SELL ladders DOWN (breakdown trigger).
    //     Required by Alpaca: sell-stop must be below market, buy-stop must be above.
    const direction = activeTier === 'S'
      ? (side === 'buy' ? +1 : -1)
      : (side === 'buy' ? -1 : +1);

    const prices: number[] = [];
    for (let i = 0; i < count; i++) {
      const rawPrice = triggerPrice + direction * i * step;
      if (rawPrice <= 0.01) {
        toast.error('Ladder skipped: price would go ≤ $0.01');
        return;
      }
      prices.push(rawPrice);
    }

    const switchId = serviceSwitchIdRef.current;
    for (let i = 0; i < count; i++) {
      const orderType: MobileOrderType = activeTier === 'L' ? 'limit' : 'stop_limit';
      const legQty = i === count - 1 ? perOrderQty + remainder : perOrderQty;
      const basePayload: any = {
        symbol: activeSymbol,
        qty: String(legQty),
        side,
        time_in_force: getMobileTimeInForce(orderType, activeSymbol, env.defaults?.defaultTimeInForce),
        type: orderType,
      };
      if (orderType === 'limit') {
        basePayload.limit_price = prices[i].toFixed(2);
      } else {
        basePayload.stop_price = prices[i].toFixed(2);
        const slippagePct = 0.001;
        basePayload.limit_price = (side === 'buy' ? prices[i] * (1 + slippagePct) : prices[i] * (1 - slippagePct)).toFixed(2);
      }
      if (env.defaults?.extendedHours && orderType === 'limit') basePayload.extended_hours = true;

      try { await service.submitOrder(basePayload); } catch (err) {
        if (serviceSwitchIdRef.current !== switchId) return;
        toast.error(`Ladder failed at order ${i + 1}: ${safeErrorMessage(err, 'Order failed')}`);
        void loadOpenOrders();
        return;
      }
    }

    if (serviceSwitchIdRef.current !== switchId) return;
    const sideLabel = positionSideRef.current === 'long' ? (side === 'buy' ? 'LONG' : 'SHORT') : (side === 'buy' ? 'COVER' : 'EXIT');
    toast.success(`Ladder ${sideLabel}: ${count} orders of ${perOrderQty} (${remainder > 0 ? `+${remainder} remainder` : 'exact'}) ${activeSymbol}, ${triggerPrice.toFixed(2)} → ${prices[prices.length - 1].toFixed(2)}`);
    loadData();
  }, [service, activeSymbol, currentPrice, limitPrice, activeTier, computedQty, positionSide, env, tradingCfg, loadData, loadOpenOrders]);

  // Live & Forget preset: place single entry then start layered stops via startLayeredStops
  const handleLiveAndForget = useCallback(async (side: 'buy' | 'sell') => {
    if (!service || !currentPrice) return;
    const cfg = getTradingConfig();
    const l2Enabled = cfg.layer2Enabled;
    const l3Enabled = cfg.layer3Enabled;
    if (!l2Enabled && !l3Enabled && !cfg.layer1Enabled) {
      toast.error('L&F has no layers enabled in .env');
      return;
    }

    const triggerPrice = limitPrice ?? currentPrice;
    if (triggerPrice == null || !Number.isFinite(triggerPrice) || triggerPrice <= 0) {
      toast.error('Price unavailable — wait for a live quote');
      return;
    }

    // Build single-entry payload matching active tier
    const orderType: MobileOrderType = activeTier === 'M' ? 'market' : activeTier === 'L' ? 'limit' : 'stop_limit';
    const slippagePct = 0.001;
    const basePayload: any = {
      symbol: activeSymbol,
      qty: String(computedQty),
      side,
      time_in_force: getMobileTimeInForce(orderType, activeSymbol, env.defaults?.defaultTimeInForce),
      type: orderType,
    };
    if (orderType === 'limit') basePayload.limit_price = triggerPrice.toFixed(2);
    if (orderType === 'stop_limit') {
      basePayload.stop_price = triggerPrice.toFixed(2);
      basePayload.limit_price = (side === 'buy' ? triggerPrice * (1 + slippagePct) : triggerPrice * (1 - slippagePct)).toFixed(2);
    }

    /* switchId not required here */
    let entryOrder: any = null;
    try {
      entryOrder = await service.submitOrder(basePayload);
    } catch (err) {
      toast.error(`L&F entry failed: ${safeErrorMessage(err, 'Order failed')}`);
      return;
    }

    // Wait up to 30s for fill
    let entryFillPrice = 0;
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 500));
      try {
        const o = await service.getOrderById(entryOrder.id);
        if (!o || ['canceled', 'rejected', 'expired'].includes(o.status)) {
          toast.error('L&F entry not filled — layers not started');
          return;
        }
        if (o.status === 'filled') {
          entryFillPrice = safeParseFloat((o as any).filled_avg_price, 0);
          break;
        }
      } catch { /* ignore */ }
    }

    if (!entryFillPrice) {
      toast.error('L&F entry not filled — layers not started');
      return;
    }

    // Attempt to find initial stop order id and price
    let initialStopId: string | null = null;
    let initialStopPrice = 0;
    try {
      const open = await service.getOrders('open');
      const stopSide = side === 'buy' ? 'sell' : 'buy';
      const stop = open.find((o: any) => o.symbol === activeSymbol && o.side === stopSide && (o.type === 'stop' || o.type === 'stop_limit'));
      if (stop) {
        initialStopId = stop.id;
        initialStopPrice = safeParseFloat(stop.stop_price ?? stop.stop_limit_price ?? 0, 0);
      }
    } catch { }

    // Start layered stops via shared helper
    try {
      void startLayeredStops({
        symbol: activeSymbol,
        side,
        qty: computedQty,
        isCrypto: isCryptoSymbol(activeSymbol),
        initialStopId,
        initialStopPrice: initialStopPrice || (entryFillPrice * (1 - ((tradingCfg.autoStopLossPct ?? 1) / 100))),
        entryFillPrice,
        l2TrailPct: tradingCfg.layer2TrailPct,
        l3TrailPct: tradingCfg.layer3TrailPct,
        layer2Enabled: tradingCfg.layer2Enabled,
        layer3Enabled: tradingCfg.layer3Enabled,
      });
      toast.success(`L&F armed — L2 chase ${tradingCfg.layer2TrailPct}%, L3 trail ${tradingCfg.layer3TrailPct}%`);
    } catch (err) {
      console.error('L&F start error', err);
      toast.error('Failed to start L&F layered stops');
    }

    // Auto-disarm
    setActivePresets(prev => { const n = new Set(prev); n.delete('l-and-f'); return n; });

  }, [service, activeSymbol, currentPrice, limitPrice, activeTier, computedQty, tradingCfg, startLayeredStops, env]);

  // end handleLiveAndForget

  const handleCancelAllForSymbol = useCallback(async () => {
    if (!service || !activeSymbol) return;
    const switchId = serviceSwitchIdRef.current;
    try {
      const open = await service.getOrders('open');
      const targets = open.filter(o => o.symbol === activeSymbol);
      if (targets.length === 0) { toast.info(`No open orders for ${activeSymbol}`); return; }
      await Promise.all(targets.map(o => service.cancelOrder(o.id).catch(() => {})));
      if (serviceSwitchIdRef.current !== switchId) return;
      toast.success(`Canceled ${targets.length} order${targets.length === 1 ? '' : 's'} for ${activeSymbol}`);
      void loadOpenOrders();
    } catch (err) {
      toast.error(`Cancel all failed: ${safeErrorMessage(err, 'Try again')}`);
    }
  }, [service, activeSymbol, loadOpenOrders]);

  const handleBuyWithPreset = useCallback(async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    const switchId = serviceSwitchIdRef.current;
    try {
      if (activePresets.has('ladder')) return await handleLadder('buy');
      if (activePresets.has('o-sl')) return await handleOsl('buy');
      if (activePresets.has('sl-tp')) return await handleSlTp('buy');
      if (activePresets.has('l-and-f')) return await handleLiveAndForget('buy');
      if (!canTrade || !service || !currentPrice) return;
      const isLongMode = positionSideRef.current === 'long';
      let qty = computedQty;
      if (!isLongMode) {
        const position = positions.find(p => p.symbol === activeSymbol);
        if (!position) { toast.error('No short position to buy back'); return; }
        qty = Math.min(computedQty, Math.abs(safeParseFloat(position.qty, 0)));
        if (qty <= 0) { toast.error('No shares available to buy back'); return; }
      }

      const triggerPrice = limitPrice ?? currentPrice;
      const orderType: MobileOrderType = activeTier === 'M' ? 'market' : activeTier === 'L' ? 'limit' : 'stop_limit';
      const slippagePct = 0.001;
      const useAttachedExit = isLongMode && (orderType === 'market' || orderType === 'limit') && (slActive || tpActive);
      const cost = qty * currentPrice;
      const cash = account?.cash ? parseFloat(account.cash) : 0;
      if (cash < cost) { toast.error(`Insufficient buying power: $${cash.toFixed(2)} available, $${cost.toFixed(2)} required`); return; }

      const basePayload: any = {
        symbol: activeSymbol, qty: String(qty), side: 'buy',
        time_in_force: getMobileTimeInForce(orderType, activeSymbol, env.defaults?.defaultTimeInForce, { extendedHours: env.defaults?.extendedHours, hasAdvancedOrder: useAttachedExit }),
        type: orderType,
      };
      if (env.defaults?.extendedHours && orderType === 'limit') basePayload.extended_hours = true;
      if (orderType === 'limit' && triggerPrice) basePayload.limit_price = triggerPrice.toFixed(2);
      if (orderType === 'stop_limit') { basePayload.stop_price = triggerPrice.toFixed(2); basePayload.limit_price = (triggerPrice * (1 + slippagePct)).toFixed(2); }
      if (useAttachedExit && !env.defaults?.extendedHours) {
        basePayload.order_class = (slActive && tpActive) ? 'bracket' : 'oto';
        if (tpActive && tpPrice) basePayload.take_profit = { limit_price: tpPrice.toFixed(2) };
        if (slActive && slPrice) basePayload.stop_loss = { stop_price: slPrice.toFixed(2) };
      }
      await service.submitOrder(basePayload);
      if (serviceSwitchIdRef.current !== switchId) return;
      const presetLabel = isLongMode ? 'LONG' : 'SHORT';
      if (orderType === 'market') toast.success(`Market BUY ${qty} ${activeSymbol} (${presetLabel})`);
      else if (orderType === 'limit') {
        const slTp = slActive || tpActive ? ` with ${slActive ? 'SL' : ''}${slActive && tpActive ? ' & ' : ''}${tpActive ? 'TP' : ''}` : '';
        toast.success(`Limit BUY ${qty} ${activeSymbol} @ $${triggerPrice.toFixed(2)}${slTp} (${presetLabel})`);
      } else toast.success(`Stop-Limit BUY ${qty} ${activeSymbol} @ $${triggerPrice.toFixed(2)}/${(triggerPrice * (1 + slippagePct)).toFixed(2)} (${presetLabel})`);
      loadData(); void loadOpenOrders();
    } finally {
      setIsSubmitting(false);
    }
  }, [service, activeSymbol, currentPrice, limitPrice, activeTier, computedQty, positionSide, positions, account, slActive, tpActive, slPrice, tpPrice, env, activePresets, handleOsl, handleLadder, loadData, loadOpenOrders, isSubmitting, presetValue]);

  const handleSellWithPreset = useCallback(async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    const switchId = serviceSwitchIdRef.current;
    try {
      if (activePresets.has('ladder')) return await handleLadder('sell');
      if (activePresets.has('o-sl')) return await handleOsl('sell');
      if (activePresets.has('sl-tp')) return await handleSlTp('sell');
      if (activePresets.has('l-and-f')) return await handleLiveAndForget('sell');
      if (!canTrade || !service || !currentPrice) return;
      const isLongMode = positionSideRef.current === 'long';
      let qty = computedQty;
      if (isLongMode) {
        const position = positions.find(p => p.symbol === activeSymbol);
        if (!position) { toast.error('No position to sell'); return; }
        qty = Math.min(computedQty, Math.abs(safeParseFloat(position.qty, 0)));
        if (qty <= 0) { toast.error('No shares available to sell'); return; }
      }

      const triggerPrice = limitPrice ?? currentPrice;
      const orderType: MobileOrderType = activeTier === 'M' ? 'market' : activeTier === 'L' ? 'limit' : 'stop_limit';
      const slippagePct = 0.001;
      const basePayload: any = {
        symbol: activeSymbol, qty: String(qty), side: 'sell',
        time_in_force: getMobileTimeInForce(orderType, activeSymbol, env.defaults?.defaultTimeInForce, { extendedHours: env.defaults?.extendedHours }),
        type: orderType,
      };
      if (env.defaults?.extendedHours && orderType === 'limit') basePayload.extended_hours = true;
      if (orderType === 'limit' && triggerPrice) basePayload.limit_price = triggerPrice.toFixed(2);
      if (orderType === 'stop_limit') { basePayload.stop_price = triggerPrice.toFixed(2); basePayload.limit_price = (triggerPrice * (1 - slippagePct)).toFixed(2); }
      await service.submitOrder(basePayload);
      if (serviceSwitchIdRef.current !== switchId) return;
      const presetLabel = isLongMode ? 'LONG' : 'SHORT';
      if (orderType === 'market') toast.success(`Market SELL ${qty} ${activeSymbol} (${presetLabel})`);
      else if (orderType === 'limit') toast.success(`Limit SELL ${qty} ${activeSymbol} @ $${triggerPrice.toFixed(2)} (${presetLabel})`);
      else toast.success(`Stop-Limit SELL ${qty} ${activeSymbol} @ $${triggerPrice.toFixed(2)}/${(triggerPrice * (1 - slippagePct)).toFixed(2)} (${presetLabel})`);
      loadData(); void loadOpenOrders();
    } finally {
      setIsSubmitting(false);
    }
  }, [service, activeSymbol, currentPrice, limitPrice, activeTier, computedQty, positionSide, positions, account, env, activePresets, handleOsl, handleLadder, loadData, loadOpenOrders, isSubmitting, presetValue]);

  const handleSlClick = useCallback(async (position: Position) => {
    if (!service) return;

    const entryPrice = safeParseFloat(position.avg_entry_price, 0);
    const qty = Math.abs(safeParseFloat(position.qty, 0));
    const slOffsetPct = (tradingCfg.slStopOffsetPct || 0.5) / 100;

    if (!entryPrice || !qty) {
      toast.error('Invalid position data for stop loss');
      return;
    }

    const slPrice = position.side === 'long'
      ? entryPrice * (1 - slOffsetPct)
      : entryPrice * (1 + slOffsetPct);

    try {
      const openOrders = await service.getOrders('open');
      const exitSide = position.side === 'long' ? 'sell' : 'buy';
      const exitOrders = openOrders.filter(o => o.symbol === position.symbol && o.side === exitSide);
      if (exitOrders.length > 0) {
        await Promise.all(exitOrders.map(o => service.cancelOrder(o.id)));
        await new Promise(r => setTimeout(r, 400));
      }

      await service.submitOrder({
        symbol: position.symbol,
        qty: String(qty),
        side: exitSide,
        type: 'stop',
        stop_price: slPrice.toFixed(2),
        time_in_force: 'gtc',
      });
      toast.success(`SL set at $${slPrice.toFixed(2)} for ${position.symbol}`);
      loadData();
      void loadOpenOrders();
    } catch (err) {
      toast.error(`SL order failed: ${safeErrorMessage(err, 'Order failed')}`);
    }
  }, [service, loadData, loadOpenOrders, realtimePrices]);

  const handleBeClick = useCallback(async (position: Position) => {
    if (!service) return;

    const entryPrice = safeParseFloat(position.avg_entry_price, 0);
    const qty = Math.abs(safeParseFloat(position.qty, 0));
    const side = position.side === 'long' ? 'sell' : 'buy';
    const livePrice = realtimePrices[position.symbol] ?? safeParseFloat(position.current_price, 0);
    const beOffsetPct = tradingCfg.beStopOffsetPct || 0.5;

    if (!entryPrice || !qty) {
      toast.error('Invalid position data for break-even');
      return;
    }

    if (position.side === 'long' && entryPrice >= livePrice) {
      toast.error('Position underwater — wait until break-even');
      return;
    }
    if (position.side === 'short' && entryPrice <= livePrice) {
      toast.error('Position underwater — wait until break-even');
      return;
    }

    try {
      const openOrders = await service.getOrders('open');
      const exitSide = position.side === 'long' ? 'sell' : 'buy';
      const exitOrders = openOrders.filter(o => o.symbol === position.symbol && o.side === exitSide);
      if (exitOrders.length > 0) {
        await Promise.all(exitOrders.map(o => service.cancelOrder(o.id)));
        await new Promise(r => setTimeout(r, 400));
      }

      const stopPrice = position.side === 'long'
        ? entryPrice * (1 + beOffsetPct / 100)
        : entryPrice * (1 - beOffsetPct / 100);
      await service.submitOrder({
        symbol: position.symbol,
        qty: String(qty),
        side,
        type: 'stop',
        stop_price: stopPrice.toFixed(2),
        time_in_force: 'gtc',
      });
      toast.success(`Break-even SL set at $${stopPrice.toFixed(2)} for ${position.symbol}`);
      loadData();
      void loadOpenOrders();
    } catch (err) {
      toast.error(`BE order failed: ${safeErrorMessage(err, 'Order failed')}`);
    }
  }, [service, loadData, loadOpenOrders, realtimePrices]);

  const handleExitClick = useCallback(async (position: Position) => {
    if (!service) return;
    try {
      const exitSide = position.side === 'long' ? 'sell' : 'buy';
      const openOrders = await service.getOrders('open');
      const canceled = await cancelExistingExitOrders(service, {
        symbol: position.symbol,
        side: exitSide,
        preFetchedOrders: openOrders,
      });
      if (canceled) {
        await new Promise(r => setTimeout(r, 500));
      }

      await service.closePosition(position.symbol);
      toast.success(`Closed ${position.symbol}`);
      loadData();
      void loadOpenOrders();
    } catch (err) {
      toast.error(`Exit failed: ${safeErrorMessage(err, 'Order failed')}`);
    }
  }, [service, loadData, loadOpenOrders]);

  const handleTrailToggle = useCallback(async (position: Position) => {
    if (!service) return;

    try {
      if (isCryptoSymbol(position.symbol)) {
        toast.error('Trailing Stop is not supported for crypto on Alpaca');
        return;
      }

      const exitSide = position.side === 'long' ? 'sell' : 'buy';
      const openOrders = await service.getOrders('open');
      const existingTsl = openOrders.find(
        o => o.symbol === position.symbol && o.side === exitSide && o.type === 'trailing_stop'
      );

      if (existingTsl) {
        await service.cancelOrder(existingTsl.id);
        toast.success(`Trailing stop deactivated for ${position.symbol}`);
      } else {
        const canceled = await cancelExistingExitOrders(service, {
          symbol: position.symbol,
          side: exitSide,
          preFetchedOrders: openOrders,
        });
        if (canceled) {
          toast.info(`Existing exit orders canceled for ${position.symbol}`);
        }

        const remainingOrders = await service.getOrders('open');
        const remainingExitOrders = remainingOrders.filter(
          o => o.symbol === position.symbol && o.side === exitSide && o.type !== 'trailing_stop'
        );
        if (remainingExitOrders.length > 0) {
          throw new Error(`Wait: ${remainingExitOrders.length} exit order(s) still cancelling for ${position.symbol}`);
        }

        const positionQty = Math.abs(safeParseFloat(position.qty, 0));
        if (positionQty <= 0) {
          toast.error('No position quantity available');
          return;
        }

        const trailPct = tradingCfg.trailingStopDefaultPct || 0.5;
        const finalTrailPct = tradingCfg.trailingStopMinPct > 0
          ? Math.max(trailPct, tradingCfg.trailingStopMinPct)
          : trailPct;

        await service.submitOrder({
          symbol: position.symbol,
          qty: positionQty.toString(),
          side: exitSide,
          type: 'trailing_stop',
          trail_percent: String(finalTrailPct),
          // B-14: Use env default TIF, fallback to 'day' (IOC not supported for trailing stop)
          time_in_force: env.defaults?.defaultTimeInForce === 'ioc' ? 'day' : (env.defaults?.defaultTimeInForce ?? 'day'),
        });
        toast.success(`Trailing stop activated for ${position.symbol}`);
      }
      loadData();
      void loadOpenOrders();
    } catch (err) {
      const message = safeErrorMessage(err, 'Order failed');
      if (message.includes('insufficient qty')) {
        toast.error(`Quantity still locked for ${position.symbol}. Try again in a second.`);
      } else {
        toast.error(`Trail toggle failed: ${message}`);
      }
    }
  }, [service, loadData, loadOpenOrders, realtimePrices, tradingCfg, env]);

  const handleExitAll = useCallback(async () => {
    if (isSubmitting || positions.length === 0) return;
    setIsSubmitting(true);
    let ok = 0; const failures: string[] = [];
    try {
      for (const pos of positions) {
        try { await handleExitClick(pos); ok++; } catch { failures.push(pos.symbol); }
      }
      const msg = `Closed ${ok}/${positions.length}${failures.length ? ` — failed: ${failures.join(', ')}` : ''}`;
      failures.length ? toast.error(msg) : toast.success(msg);
    } finally { setIsSubmitting(false); }
  }, [positions, isSubmitting, handleExitClick]);

  const handleBeAll = useCallback(async () => {
    if (isSubmitting || positions.length === 0) return;
    setIsSubmitting(true);
    let ok = 0; const failures: string[] = [];
    try {
      for (const pos of positions) {
        try { await handleBeClick(pos); ok++; } catch { failures.push(pos.symbol); }
      }
      const msg = `BE ${ok}/${positions.length}${failures.length ? ` — failed: ${failures.join(', ')}` : ''}`;
      failures.length ? toast.error(msg) : toast.success(msg);
    } finally { setIsSubmitting(false); }
  }, [positions, isSubmitting, handleBeClick]);

  const handleSlAll = useCallback(async () => {
    if (isSubmitting || positions.length === 0) return;
    setIsSubmitting(true);
    let ok = 0; const failures: string[] = [];
    try {
      for (const pos of positions) {
        try { await handleSlClick(pos); ok++; } catch { failures.push(pos.symbol); }
      }
      const msg = `SL ${ok}/${positions.length}${failures.length ? ` — failed: ${failures.join(', ')}` : ''}`;
      failures.length ? toast.error(msg) : toast.success(msg);
    } finally { setIsSubmitting(false); }
  }, [positions, isSubmitting, handleSlClick]);

  const handleTrailAll = useCallback(async () => {
    if (isSubmitting || positions.length === 0) return;
    setIsSubmitting(true);
    let ok = 0; const failures: string[] = [];
    try {
      for (const pos of positions) {
        try { await handleTrailToggle(pos); ok++; } catch { failures.push(pos.symbol); }
      }
      const msg = `TRAIL ${ok}/${positions.length}${failures.length ? ` — failed: ${failures.join(', ')}` : ''}`;
      failures.length ? toast.error(msg) : toast.success(msg);
    } finally { setIsSubmitting(false); }
  }, [positions, isSubmitting, handleTrailToggle]);

  const handleCycleActiveSymbol = useCallback(() => {
    if (positions.length === 0) return;
    const idx = positions.findIndex(p => p.symbol === activeSymbol);
    const next = positions[(idx + 1) % positions.length];
    setActiveSymbol(next.symbol);
    setCurrentPrice(null);
    setRefreshKey(k => k + 1);
    setLimitPrice(null);
    setActivePresets(new Set());
  }, [positions, activeSymbol]);

  const activePosition = positions.find(p => p.symbol === activeSymbol) ?? null;
  const activeOrder = orders.find(o =>
    o.symbol === activeSymbol &&
    o.type !== 'trailing_stop' &&
    !['filled', 'canceled', 'expired', 'rejected'].includes(o.status)
  ) ?? null;

  const trailExitSide = activePosition?.side === 'long' ? 'sell' : 'buy';
  const isTrailActive = activePosition
    ? orders.some(o => o.symbol === activePosition.symbol && o.side === trailExitSide && o.type === 'trailing_stop')
    : false;

return (
    <div className="w-[390px] h-[844px] bg-[#121826] px-4 pt-6 pb-4 flex flex-col gap-2 relative overflow-hidden shadow-2xl">
      <StatusBar
        isPaper={isPaper}
        onPaperLiveToggle={handlePaperLiveChange}
        account={account}
        paperAvailable={paperAvailable}
        liveAvailable={liveAvailable}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {/* Size & Ticker Selection */}
      <section className="flex flex-col gap-2">
        <MobileQuickAmount
          presets={mobileCfg?.presets ?? ['10K', '20K', '30K', '50K']}
          activePreset={activePreset}
          onPresetSelect={setActivePreset}
        />

        <MobileTickerSelect
          symbols={watchlist}
          activeSymbol={activeSymbol}
          onSymbolSelect={(sym) => {
            setActiveSymbol(sym);
            setCurrentPrice(null);
            setRefreshKey(k => k + 1);
            setSlActive(false);
            setTpActive(false);
            setSlPrice(null);
            setTpPrice(null);
            setLimitPrice(null);
            setActivePresets(new Set());
          }}
          onAddSymbol={handleAddSymbol}
          onRemoveSymbol={handleRemoveSymbol}
        />
      </section>

      <MobileSizeToggle
        activeTier={activeTier}
        onTierChange={setActiveTier}
      />

       <MobilePriceAction
         service={service}
         activeSymbol={activeSymbol}
         price={currentPrice}
         limitPrice={limitPrice}
         activeTier={activeTier}
         positionSide={positionSide}
         onSideToggle={() => {
           setPositionSide(prev => prev === 'long' ? 'short' : 'long');
         }}
         onPriceStep={handlePriceStep}
         onBuy={handleBuyWithPreset}
         onSell={handleSellWithPreset}
         canTrade={canTrade}
         isSubmitting={isSubmitting}
         tickDirection={tickDirections[activeSymbol] ?? null}
         priceSteps={env.defaults?.mobilePriceSteps}
         onPriceRefresh={handlePriceRefresh}
         onSlTpClick={() => handleSlTp(positionSide === 'long' ? 'buy' : 'sell')}
       />

      {/* Presets */}
      <section className="grid grid-cols-4 gap-2">
        {(['o-sl', 'ladder', 'l-and-f', 'sl-tp'] as PresetId[]).map((id) => {
          const isOn = activePresets.has(id);
          const label = id === 'o-sl' ? 'O-SL' : id === 'ladder' ? 'LADDER' : id === 'l-and-f' ? 'L&F' : id === 'sl-tp' ? 'SL-TP' : 'PRE-SET';
          const isLadder = id === 'ladder';
          return (
            <PresetButton
              key={id}
              label={label}
              isOn={isOn}
              onTap={() => {
                const newSet = new Set(activePresets);
                const isOn = newSet.has(id);
                const EXCLUSIVE_PRESETS: ReadonlyArray<PresetId> = ['o-sl', 'ladder', 'l-and-f', 'sl-tp'];
                if (isOn) {
                  newSet.delete(id);
                } else {
                  if (EXCLUSIVE_PRESETS.includes(id)) {
                    EXCLUSIVE_PRESETS.forEach(p => newSet.delete(p));
                  }
                  newSet.add(id);
                  if (id === 'sl-tp') {
                    // SL/TP logic using env variables
                    // The preset activation is enough to set the mode, 
                    // the order execution happens in handleBuyWithPreset/handleSellWithPreset
                  }
                }
                setActivePresets(newSet);
              }}
              onLongPress={isLadder ? handleCancelAllForSymbol : undefined}
              longPressLabel={isLadder ? 'CANCEL ALL' : undefined}
            />
          );
        })}
      </section>

      <MobileControlsPanel
        onBeClick={() => activePosition && handleBeClick(activePosition)}
        onSlClick={() => activePosition && handleSlClick(activePosition)}
        onExitClick={() => activePosition && handleExitClick(activePosition)}
        onTrailClick={() => activePosition && handleTrailToggle(activePosition)}
        isTrailActive={isTrailActive}
        positionSide={positionSide}
        activePosition={activePosition}
        activeOrder={activeOrder}
      />

      <GlobalPositionManager
        positions={positions}
        onExitAll={handleExitAll}
        onBeAll={handleBeAll}
        onSlAll={handleSlAll}
        onTrailAll={handleTrailAll}
        onCycleActive={handleCycleActiveSymbol}
        isSubmitting={isSubmitting}
      />

      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}