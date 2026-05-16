import React, { useState, useEffect, useRef } from 'react';
import { Minus, Plus, ChevronDown } from 'lucide-react';

const PINNED_SYMBOL = 'INTC';
const DEFAULT_STACK = ['PLTR', 'MU', 'IREN', 'TQQQ'];

import { isCryptoSymbol } from '@/shared/utils/stocks';
import { getQuantityPresets } from '../entryManager/calculations';
import { getDefaultQtyForSymbol } from './tradeUtils';
import { getTradingConfig } from '@/config/envConfig';

interface Props {
  symbol: string;
  qty: number;
  isSubmitting: boolean;
  selectedSymbolPrice: number | null;
  realtimePrices: Record<string, number>;
  autoStopLossPct: number;
  autoTakeProfitPct: number;
  buyingPower?: number;
  equity?: number;
  onSelectSymbol: (sym: string) => void;
  onSetQty: (value: number) => void;
  onConfirmTrade: (
    side: 'buy' | 'sell',
    symbolOverride?: string,
    orderType?: 'market' | 'limit' | 'stop',
    riskSettings?: { stopLoss?: number; takeProfit?: number; takeProfitPct?: number; entryOffsetPips?: number; entryPrice?: number; trailingStop?: number; stopLossPct?: number }
  ) => void;
}

export const EntryManager: React.FC<Props> = ({
  symbol,
  qty,
  isSubmitting,
  selectedSymbolPrice,
  realtimePrices,
  autoStopLossPct,
  autoTakeProfitPct,
  buyingPower = 0,
  equity = 0,
  onSelectSymbol,
  onSetQty,
  onConfirmTrade,
}) => {
  const [lastPresetSymbol, setLastPresetSymbol] = useState<string>('');
  const [stopEntryPrice, setStopEntryPrice] = useState<string>('');

  const tradingConfig = getTradingConfig();
  const maxPositionPct = tradingConfig.maxPositionSizePercent ?? 2;
  const calculatedNotional = equity > 0 ? equity * (maxPositionPct / 100) : null;
  const [notionalSize, setNotionalSize] = useState<number | null>(calculatedNotional);
  const [isBpSelected, setIsBpSelected] = useState(false);
  const [tpEnabled, setTpEnabled] = useState(false);
  const [tpOffsetPct, setTpOffsetPct] = useState<number>(autoTakeProfitPct);
  const [slPct, setSlPct] = useState<number>(autoStopLossPct);
  

  // Custom Symbol State
  const [custSymbolActive, setCustSymbolActive] = useState(false);
  const [customSymbolValue, setCustomSymbolValue] = useState('');
  const custSymbolInputRef = useRef<HTMLInputElement>(null);

  // Recent symbols stack
  const [recentSymbols, setRecentSymbols] = useState<string[]>(DEFAULT_STACK);

  // Filter out INTC if it ever ends up in the stack, take first 3 for visible slots
  const stackSymbols = recentSymbols.filter(s => s !== PINNED_SYMBOL);
  const visibleStack = stackSymbols.slice(0, 3);
  const overflowStack = stackSymbols.slice(3);
  const [showRecentStack, setShowRecentStack] = useState(false);
  const recentStackRef = useRef<HTMLDivElement>(null);

  const [orderType, setOrderType] = useState<'market' | 'limit' | 'stop_limit'>('limit');

  // Close recent stack on outside click
  useEffect(() => {
    if (!showRecentStack) return;
    const handler = (e: MouseEvent) => {
      if (recentStackRef.current && !recentStackRef.current.contains(e.target as Node)) {
        setShowRecentStack(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showRecentStack]);

  const isCrypto = isCryptoSymbol(symbol);
  const currentPrice = realtimePrices[symbol.toUpperCase()] || selectedSymbolPrice || 0;
  const hasPrice = typeof currentPrice === 'number' && Number.isFinite(currentPrice) && currentPrice > 0;
  const formatPrice = (value: number) => {
    if (!Number.isFinite(value)) return '—';
    const fixed = isCrypto ? value.toFixed(8) : value.toFixed(2);
    return fixed.replace(/\.?0+$/, '');
  };

  useEffect(() => {
    if (hasPrice && currentPrice > 0) {
      setStopEntryPrice(formatPrice(currentPrice));
    }
  }, [symbol, currentPrice, hasPrice]);

   // Note: do NOT auto-save to recent stack on symbol change — that reorders tabs on every click.

  useEffect(() => {
    if (currentPrice > 0 && symbol && symbol.toUpperCase() !== lastPresetSymbol) {
      setLastPresetSymbol(symbol.toUpperCase());
      if (isBpSelected) {
        handleNotionalSelect(buyingPower);
      } else if (notionalSize !== null) {
        const calculatedQty = isCrypto
          ? parseFloat((notionalSize / currentPrice).toFixed(6))
          : Math.floor(notionalSize / currentPrice);
        onSetQty(calculatedQty);
      } else {
        const presets = getQuantityPresets(currentPrice, isCrypto);
        const next = getDefaultQtyForSymbol(presets, symbol);
        if (next !== null) onSetQty(next);
      }
      setOrderType('market');
    }
  }, [currentPrice, symbol, isCrypto, buyingPower, isBpSelected]);

  // Update quantity when BP changes and BP is selected
  useEffect(() => {
    if (isBpSelected && currentPrice > 0) {
      const calculatedQty = isCrypto 
        ? parseFloat((buyingPower / currentPrice).toFixed(6))
        : Math.floor(buyingPower / currentPrice);
      onSetQty(calculatedQty);
    }
  }, [buyingPower, isBpSelected, currentPrice, isCrypto]);

  const handleNotionalSelect = (amount: number) => {
    setNotionalSize(amount);
    setIsBpSelected(false);
    if (currentPrice > 0) {
      const calculatedQty = isCrypto 
        ? parseFloat((amount / currentPrice).toFixed(6))
        : Math.floor(amount / currentPrice);
      onSetQty(calculatedQty);
    }
  };

  const confirmCustomSymbol = (val: string) => {
    if (!val) return;
    const upper = val.toUpperCase();
    onSelectSymbol(upper);
    if (upper !== PINNED_SYMBOL) {
      setRecentSymbols(prev => [upper, ...prev.filter(s => s !== upper)].slice(0, 8));
    }
    if (equity > 0) {
      handleNotionalSelect(equity * (maxPositionPct / 100));
    } else {
      handleNotionalSelect(null as any);
    }
  };

  const adjustPrice = (amount: number) => {
    const current = parseFloat(stopEntryPrice) || currentPrice;
    setStopEntryPrice(formatPrice(current + amount));
    setOrderType(prev => prev === 'market' ? 'limit' : prev);
  };

  return (
    <div className="rounded-2xl bg-[#0a0a0a] border border-[#1e293b] p-4 space-y-4 h-full flex flex-col font-sans select-none">
      {/* Symbol Selection Row */}
      <div className="grid grid-cols-5 gap-1.5">
        {/* Slot 1: INTC — always pinned */}
        <button
          key={PINNED_SYMBOL}
          type="button"
          onClick={() => {
            onSelectSymbol(PINNED_SYMBOL);
            setCustSymbolActive(false);
          }}
          className={`py-3 rounded-xl text-sm font-black transition-all uppercase tracking-widest ${
            symbol.toUpperCase() === PINNED_SYMBOL && !custSymbolActive
              ? 'bg-[#064e3b] text-[#4ade80]'
              : 'bg-[#1e293b] text-[#94a3b8]'
          }`}
        >
          {PINNED_SYMBOL}
        </button>

        {/* Slots 2–4: rolling stack */}
        {visibleStack.map(sym => (
          <button
            key={sym}
            type="button"
          onClick={() => {
            onSelectSymbol(sym);
            setCustSymbolActive(false);
            // Note: intentionally NOT calling saveRecentSymbol here — clicking an existing tab should NOT reorder it
          }}
            className={`py-3 rounded-xl text-sm font-black transition-all uppercase tracking-widest ${
              symbol.toUpperCase() === sym && !custSymbolActive
                ? 'bg-[#064e3b] text-[#4ade80]'
                : 'bg-[#1e293b] text-[#94a3b8]'
            }`}
          >
            {sym}
          </button>
        ))}

        {/* Fill empty slots so grid stays 5 columns */}
        {Array.from({ length: 3 - visibleStack.length }).map((_, i) => (
          <div key={`empty-${i}`} className="py-3 rounded-xl bg-[#1e293b]/30 border border-dashed border-[#1e293b]" />
        ))}

        {/* Slot 5: + button with overflow dropdown */}
        <div ref={recentStackRef} className="relative">
          {custSymbolActive ? (
            <input
              ref={custSymbolInputRef}
              type="text"
              value={customSymbolValue}
              placeholder="SYM"
              onChange={(e) => setCustomSymbolValue(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  confirmCustomSymbol(customSymbolValue);
                  setCustSymbolActive(false);
                }
              }}
              onBlur={() => {
                confirmCustomSymbol(customSymbolValue);
                setCustSymbolActive(false);
              }}
              className="w-full h-full rounded-xl bg-[#1e293b] text-[#4ade80] text-center font-black text-sm outline-none ring-2 ring-[#4ade80] uppercase"
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                if (overflowStack.length > 0) {
                  setShowRecentStack(prev => !prev);
                } else {
                  setCustomSymbolValue('');
                  setCustSymbolActive(true);
                  setTimeout(() => custSymbolInputRef.current?.focus(), 0);
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                setCustomSymbolValue('');
                setCustSymbolActive(true);
                setShowRecentStack(false);
                setTimeout(() => custSymbolInputRef.current?.focus(), 0);
              }}
              className="w-full py-3 rounded-xl text-sm font-black uppercase transition-all flex items-center justify-center gap-0.5 bg-[#1e293b] text-[#94a3b8]"
            >
              <Plus size={16} />
              {overflowStack.length > 0 && (
                <ChevronDown size={12} className={`transition-transform ${showRecentStack ? 'rotate-180' : ''}`} />
              )}
            </button>
          )}

          {/* Overflow dropdown */}
          {showRecentStack && overflowStack.length > 0 && (
            <div className="absolute top-full right-0 mt-1 z-50 min-w-[130px] bg-[#0f172a] border border-[#1e293b] rounded-xl overflow-hidden shadow-xl">
              <button
                type="button"
                onClick={() => {
                  setCustomSymbolValue('');
                  setCustSymbolActive(true);
                  setShowRecentStack(false);
                  setTimeout(() => custSymbolInputRef.current?.focus(), 0);
                }}
                className="w-full py-2 text-xs font-black text-[#94a3b8] hover:bg-[#1e293b] transition-all text-center tracking-widest"
              >
                + NEW
              </button>
              {overflowStack.map(sym => (
                <div key={sym} className="flex items-center border-t border-[#1e293b]">
                  <button
                    type="button"
                    onClick={() => {
                      confirmCustomSymbol(sym);
                      setCustSymbolActive(false);
                      setShowRecentStack(false);
                    }}
                    className={`flex-1 py-2 text-xs font-black uppercase tracking-widest transition-all text-center ${
                      symbol.toUpperCase() === sym
                        ? 'bg-[#064e3b] text-[#4ade80]'
                        : 'hover:bg-[#1e293b] text-[#94a3b8]'
                    }`}
                  >
                    {sym}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const next = recentSymbols.filter(s => s !== sym);
                      setRecentSymbols(next);
                      if (overflowStack.length <= 1) setShowRecentStack(false);
                    }}
                    className="px-2 py-2 text-[#ef4444] hover:bg-[#1e293b] transition-all text-xs font-black"
                  >
                    −
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* US Size Row */}
      <div className="grid grid-cols-4 gap-2">
        {[10000,30000,50000,100000].map(amount => (
          <button
            key={amount}
            type="button"
            onClick={() => handleNotionalSelect(amount)}
            className={`py-4 rounded-xl text-sm font-black transition-all uppercase tracking-widest ${
              notionalSize === amount
                ? 'bg-[#064e3b] text-[#4ade80]'
                : 'bg-[#1e293b] text-[#94a3b8]'
            }`}
          >
            ${amount / 1000}K
          </button>
        ))}
      </div>

      {/* REFACTORED: Renamed order type button 'MKT' to 'MARKET' for full words in ALL CAPS */}
      {/* Order Type Toggle */}
      <div className="grid grid-cols-3 gap-1.5">
        {(['market', 'limit', 'stop_limit'] as const).map(type => (
          <button
            key={type}
            type="button"
            onClick={() => setOrderType(type)}
            className={`py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
              orderType === type
                ? 'bg-[#1e40af] text-[#93c5fd] border border-[#3b82f6]/40'
                : 'bg-[#1e293b] text-[#94a3b8]'
            }`}
          >
            {/* REFACTORED: Changed 'MKT' to 'MARKET' per user requirement for FULL WORDS in ALL CAPS */}
            {type === 'market' ? 'MARKET' : type === 'limit' ? 'LIMIT' : 'STOP'}
          </button>
        ))}
      </div>

      {/* BUY/SELL MKT or LIMIT Row */}
      <div className="flex flex-col gap-2 flex-1 items-stretch">
        <div className="grid grid-cols-2 gap-4 flex-1 items-stretch">
          <button
            type="button"
            disabled={isSubmitting || !symbol}
            onClick={() => {
              const price = parseFloat(stopEntryPrice) || currentPrice;
              orderType === 'market'
                ? onConfirmTrade('sell', undefined, 'market', { stopLossPct: slPct })
                : onConfirmTrade('sell', undefined, orderType === 'stop_limit' ? 'stop' : 'limit', {
                    entryPrice: price,
                    takeProfitPct: tpEnabled ? tpOffsetPct : undefined,
                    stopLossPct: slPct,
                  });
            }}
            className="rounded-2xl bg-[#ef4444] hover:bg-[#dc2626] text-white font-black text-base uppercase tracking-tighter transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center min-h-[107px]"
          >
            {{ market: 'SELL MKT', limit: 'SELL LIMIT', stop_limit: 'SELL STOP' }[orderType]}
            </button>

          <button
            type="button"
            disabled={isSubmitting || !symbol}
            onClick={() => {
              const price = parseFloat(stopEntryPrice) || currentPrice;
              orderType === 'market'
                ? onConfirmTrade('buy', undefined, 'market', { stopLossPct: slPct })
                : onConfirmTrade('buy', undefined, orderType === 'stop_limit' ? 'stop' : 'limit', {
                    entryPrice: price,
                    takeProfitPct: tpEnabled ? tpOffsetPct : undefined,
                    stopLossPct: slPct,
                  });
            }}
            className="rounded-2xl bg-[#4ade80] hover:bg-[#22c55e] text-[#052e16] font-black text-base uppercase tracking-tighter transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center min-h-[107px]"
          >
            {{ market: 'BUY MKT', limit: 'BUY LIMIT', stop_limit: 'BUY STOP' }[orderType]}
            </button>
        </div>
      </div>

      {/* Auto STOP LOSS — editable */}
      {/* REFACTORED: Changed 'AUTO STOP LOSS' to 'STOP LOSS' per user requirement */}
      <div className="flex items-center justify-between bg-[#1e293b]/30 border border-[#1e293b] rounded-xl px-4 py-2">
        <span className="text-[#94a3b8] font-black text-xs tracking-widest uppercase">STOP LOSS</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSlPct(p => Math.max(0.1, parseFloat((p - 0.1).toFixed(1))))}
            className="w-6 h-6 rounded bg-[#1e293b] text-[#94a3b8] flex items-center justify-center text-sm font-black hover:bg-[#2d3748] transition-colors"
          >−</button>
          <span className="text-white font-black text-xs min-w-[36px] text-center">
            {slPct.toFixed(1)}%
          </span>
          <button
            type="button"
            onClick={() => setSlPct(p => parseFloat((p + 0.1).toFixed(1)))}
            className="w-6 h-6 rounded bg-[#1e293b] text-[#94a3b8] flex items-center justify-center text-sm font-black hover:bg-[#2d3748] transition-colors"
          >+</button>
          <span className="text-[#f59e0b] font-black text-xs tracking-widest uppercase">SL</span>
          <span className="text-white font-black text-xs">
            {hasPrice
              ? `$${formatPrice(currentPrice * (1 - slPct / 100))}`
              : `${slPct.toFixed(1)}% below fill`}
          </span>
        </div>
      </div>

      {/* Take Profit Row */}
      <div className="flex items-center justify-between bg-[#1e293b]/30 border border-[#1e293b] rounded-xl px-4 py-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTpEnabled(e => !e)}
            className={`relative w-8 h-4 rounded-full transition-colors shrink-0 ${tpEnabled ? 'bg-[#22c55e]' : 'bg-[#374151]'}`}
            aria-pressed={tpEnabled}
            aria-label="Toggle take profit"
          >
            <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${tpEnabled ? 'left-4' : 'left-0.5'}`} />
          </button>
          <span className={`font-black text-xs tracking-widest uppercase ${tpEnabled ? 'text-[#94a3b8]' : 'text-[#475569]'}`}>
            TAKE PROFIT
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTpOffsetPct(p => Math.max(0.1, parseFloat((p - 0.1).toFixed(1))))}
            className="w-6 h-6 rounded bg-[#1e293b] text-[#94a3b8] flex items-center justify-center text-sm font-black hover:bg-[#2d3748] transition-colors"
          >−</button>
          <span className={`font-black text-xs min-w-[36px] text-center ${tpEnabled ? 'text-white' : 'text-[#475569]'}`}>
            {tpOffsetPct.toFixed(1)}%
          </span>
          <button
            type="button"
            onClick={() => setTpOffsetPct(p => parseFloat((p + 0.1).toFixed(1)))}
            className="w-6 h-6 rounded bg-[#1e293b] text-[#94a3b8] flex items-center justify-center text-sm font-black hover:bg-[#2d3748] transition-colors"
          >+</button>
          <span className="text-[#22c55e] font-black text-xs tracking-widest uppercase">TP</span>
          <span className={`font-black text-xs ${tpEnabled ? 'text-white' : 'text-[#475569]'}`}>
            {hasPrice
              ? `$${formatPrice(currentPrice * (1 + tpOffsetPct / 100))}`
              : `${tpOffsetPct.toFixed(1)}% above fill`}
          </span>
        </div>
      </div>

      {orderType !== 'market' && (
        <div className="bg-[#1e293b]/30 border border-[#1e293b] rounded-3xl p-6 space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-[#94a3b8] font-black text-sm tracking-widest uppercase">LIMIT PRICE</span>
            <div className="text-right">
              <div className="text-[#4ade80] font-black text-sm tracking-widest uppercase leading-tight">Market: ${formatPrice(currentPrice)}</div>
              <div className="text-[#94a3b8] font-black text-[10px] tracking-widest uppercase mt-0.5 leading-tight">
                Pos Size: ${(qty * (parseFloat(stopEntryPrice) || currentPrice)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <button 
              type="button"
              onClick={() => adjustPrice(-0.01)}
              className="w-16 h-16 bg-[#1e293b] rounded-xl flex items-center justify-center text-[#4ade80] hover:bg-[#2d3748] transition-colors"
            >
              <Minus size={32} strokeWidth={3} />
            </button>
            
            <input
              type="text"
              value={stopEntryPrice}
              onChange={(e) => {
                setStopEntryPrice(e.target.value.replace(/[^0-9.]/g, ''));
                setOrderType(prev => prev === 'market' ? 'limit' : prev);
              }}
              onFocus={() => setOrderType(prev => prev === 'market' ? 'limit' : prev)}
              className="bg-transparent text-center font-black text-white text-5xl outline-none w-full"
            />

            <button 
              type="button"
              onClick={() => adjustPrice(0.01)}
              className="w-16 h-16 bg-[#1e293b] rounded-xl flex items-center justify-center text-[#4ade80] hover:bg-[#2d3748] transition-colors"
            >
              <Plus size={32} strokeWidth={3} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
