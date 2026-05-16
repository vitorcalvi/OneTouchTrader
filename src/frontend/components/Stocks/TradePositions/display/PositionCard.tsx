import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Order, Position } from '../../../../types';
import type { SlTpState } from '../../../../utils/stocks/orderState';
import { deriveOrderState } from '../../../../utils/stocks/orderState';
import { safeParseFloat } from '../../../../shared/utils/numbers';
import { ChevronDown, Shield, Target, AlertCircle } from 'lucide-react';
import { vibrate } from '..';
import { toast } from 'sonner';
import type { PositionRisk } from '../../../../utils/stocks/portfolioRisk';
import { isCryptoSymbol } from '../../../../shared/utils/stocks';

export type PositionAction =
  | 'market'
  | 'reversal'
  | 'quick-buy'
  | 'quick-sell'
  | 'flash-close'
  | 'sideways-limit'
  | 'trailing-stop'
  | 'cancel-all-set-tp'
  | 'set-sl'
  | 'set-sl-atr'
  | 'cancel-all'
  | 'cancel-all-set-sl-price'
  | 'cancel-all-set-sl-be'
  | 'cancel-all-set-sl-be-with-trail';

export interface PositionActionPayload {
  action?: PositionAction;
  price?: number;
  percent?: number;
  qty?: number;
  stopPrice?: number;
  limitPrice?: number;
  label?: string;
  multiplier?: number;
}

interface Props {
  position: Position;
  orders?: Order[];
  realtimePrice?: number;
  onAction: (pos: Position, action: PositionAction, payload?: PositionActionPayload) => Promise<void>;
  onSelectSymbol?: (symbol: string, qty: number) => void;
  isSelected?: boolean;
  collapseAllVersion?: number;
  collapseAllCollapsed?: boolean;
  portfolioRisk?: PositionRisk | null;
  portfolioVaR?: number;
  totalEquity?: number;
}

export const PositionCard: React.FC<Props> = React.memo(
  ({
    position: pos,
    orders = [],
    realtimePrice,
    onAction,
    onSelectSymbol,
    isSelected = false,
    collapseAllVersion,
    collapseAllCollapsed,
    portfolioRisk: _portfolioRisk,
    portfolioVaR: _portfolioVaR = 0,
  }) => {
    const livePrice = realtimePrice || safeParseFloat(pos.current_price, 0);
    const entryPrice = safeParseFloat(pos.avg_entry_price, 0);
    const positionQty = Math.abs(safeParseFloat(pos.qty, 0));
    const displayQty = Number.isInteger(positionQty)
      ? String(positionQty)
      : positionQty.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
    const isLong = pos.side === 'long';
    const isCrypto = isCryptoSymbol(pos.symbol);

    const [updatingLevel, setUpdatingLevel] = useState<string | null>(null);
    const [collapsed, setCollapsed] = useState(true);

    // useRef guards for toast notifications on state transitions
    const prevSlStateRef = useRef<SlTpState>('none');
    const prevTslStateRef = useRef<SlTpState>('none');

useEffect(() => {
  if (typeof collapseAllCollapsed !== 'boolean') return;
  setCollapsed(collapseAllCollapsed);
}, [collapseAllCollapsed, collapseAllVersion]);

    useEffect(() => {
      if (isSelected) setCollapsed(false);
    }, [isSelected]);

    const oppositeSide = isLong ? 'sell' : 'buy';

    // ── SL order: stop or stop_limit on opposite side ──
    const slOrder = orders.find(
      (o) => (o.type === 'stop' || o.type === 'stop_limit') && o.side === oppositeSide
    );

    // ── Trailing SL order ──
    const trailingStopOrder = orders.find((o) => o.type === 'trailing_stop' && o.side === oppositeSide);

    const slState: SlTpState = deriveOrderState(slOrder);
    const tslState: SlTpState = deriveOrderState(trailingStopOrder);

    useEffect(() => {
      if (prevSlStateRef.current === 'active' && slState === 'triggered') {
        toast.error(`SL TRIGGERED — ${pos.symbol}`, {
          description: `Filled @ $${safeParseFloat(slOrder?.filled_avg_price, 0).toFixed(2)}`,
          duration: 8000,
        });
        vibrate(100);
      }
      prevSlStateRef.current = slState;
    }, [slState, slOrder?.filled_avg_price, pos.symbol]);

    useEffect(() => {
      if (prevTslStateRef.current === 'active' && tslState === 'triggered') {
        toast.warning(`TSL TRIGGERED — ${pos.symbol}`, {
          description: `Filled @ $${safeParseFloat(trailingStopOrder?.filled_avg_price, 0).toFixed(2)}`,
          duration: 8000,
        });
        vibrate(80);
      }
      prevTslStateRef.current = tslState;
    }, [tslState, trailingStopOrder?.filled_avg_price, pos.symbol]);

    // Convenience booleans
    const isTslActive = tslState === 'active';

    const activeTrailPercent = trailingStopOrder
      ? safeParseFloat(trailingStopOrder.trail_percent, 0)
      : null;

    const rawPl = isLong ? (livePrice - entryPrice) * positionQty : (entryPrice - livePrice) * positionQty;
    const posSize = livePrice * positionQty;
    const displayPosSize = posSize.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const plPc = isLong ? ((livePrice - entryPrice) / entryPrice) * 100 : ((entryPrice - livePrice) / entryPrice) * 100;

    const tslConfig = useMemo(() => {
      let percent = 0.5;
      let colorClass = 'bg-[var(--color-info)] border-[var(--color-info-light)]';
      // REFACTORED: Label already 'TRAIL STOP LOSS' - confirmed correct per user requirement
      let label = 'TRAIL STOP LOSS';
      let state: 'low' | 'high' | 'normal' = 'normal';

      if (plPc < 0.1) {
        percent = 0.1;
        colorClass = 'bg-[var(--color-warning)] border-[var(--color-warning-light)]';
        // REFACTORED: Label 'TRAIL STOP LOSS' confirmed correct per user requirement
        label = 'TRAIL STOP LOSS';
        state = 'low';
      } else if (plPc < 0.15) {
        percent = 0.15;
        colorClass = 'bg-[var(--color-warning)] border-[var(--color-warning-light)]';
        label = 'TRAIL STOP LOSS';
        state = 'low';
      } else if (plPc < 0.25) {
        percent = 0.25;
        colorClass = 'bg-[var(--color-warning)] border-[var(--color-warning-light)]';
        label = 'TRAIL STOP LOSS';
        state = 'low';
      } else if (plPc > 1.0) {
        percent = 1.0;
        colorClass = 'bg-[var(--color-bullish)] border-[var(--color-bullish-light)]';
        label = 'TRAIL STOP LOSS';
        state = 'high';
      }

      return { percent, colorClass, label, state };
    }, [plPc]);

    const prevState = useRef(tslConfig.state);
    useEffect(() => {
      if (prevState.current !== tslConfig.state) {
        vibrate(15);
        prevState.current = tslConfig.state;
      }
    }, [tslConfig.state]);

    const handleSetTsl = async (percent: number, label: string) => {
      if (!onAction || updatingLevel) return;
      setUpdatingLevel(label);
      try {
        await onAction(pos, 'trailing-stop', { percent });
      } catch (error) {
        console.error('Failed to set TSL:', error);
      } finally {
         setUpdatingLevel(null);
      }
    };

    const symbolKey = encodeURIComponent(pos.symbol);

    

    return (
      <div
        className={`
          bg-[var(--color-bg-primary)] 
          rounded-xl 
          border 
          shadow-lg 
          transition-all 
          duration-300
          ${collapsed ? 'px-4 py-3' : 'p-4'}
          ${
            isSelected
              ? 'border-[var(--color-info)] ring-1 ring-[var(--color-info-border)] bg-[var(--color-bg-secondary)]'
              : 'border-[var(--color-border-default)]'
          }
        `}
      >
        <header className="select-none">
          <button
            type="button"
            aria-expanded={!collapsed}
            aria-controls={`position-details-${symbolKey}`}
            onClick={(e) => {
              e.stopPropagation();
              setCollapsed((v) => !v);
            }}
            className="w-full text-left"
            aria-label={collapsed ? 'Expand position details' : 'Collapse position details'}
          >
            <div className="flex items-start gap-3">
              <div className="flex items-center min-w-0">
                <span
                  className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-sm ${
                    isLong ? 'bg-[var(--color-bullish)]' : 'bg-[var(--color-bearish)]'
                  } text-[var(--color-text-primary)]`}
                >
                  {isLong ? 'LONG' : 'SHORT'}
                </span>
                <h3
                  className="text-2xl font-black tracking-wider text-[var(--color-text-primary)] ml-2 truncate"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectSymbol?.(pos.symbol, positionQty);
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter' && e.key !== ' ') return;
                    e.preventDefault();
                    e.stopPropagation();
                    onSelectSymbol?.(pos.symbol, positionQty);
                  }}
                  title={pos.symbol}
                >
                  {pos.symbol}
                </h3>
              </div>

              <div className="ml-auto flex items-center gap-3">
                <div className="text-right">
                  <div
                    className={`text-3xl font-black font-mono ${
                      rawPl >= 0 ? 'text-[var(--color-bullish-light)]' : 'text-[var(--color-bearish-light)]'
                    }`}
                  >
                    {rawPl >= 0 ? '+' : ''}${rawPl.toFixed(2)}
                  </div>
                  <div className="text-xs font-bold uppercase tracking-widest text-[var(--color-text-muted)] whitespace-nowrap">
                    SHARES {displayQty} • SIZE ${displayPosSize}
                  </div>
                </div>

                <span
                  className={`text-xs font-black font-mono px-2 py-0.5 rounded-sm border ${
                    rawPl >= 0
                      ? 'text-[var(--color-bullish-light)] border-[var(--color-bullish-border)]'
                      : 'text-[var(--color-bearish-light)] border-[var(--color-bearish-border)]'
                  }`}
                >
                  {plPc >= 0 ? '+' : ''}
                  {plPc.toFixed(2)}%
                </span>

                <ChevronDown
                  size={18}
                  aria-hidden="true"
                  className="text-[var(--color-text-muted)] transition-transform duration-300 motion-reduce:transition-none"
                  style={{ transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)' }}
                />
              </div>
            </div>
          </button>
        </header>

        <div
          id={`position-details-${symbolKey}`}
          aria-hidden={collapsed ? true : undefined}
          className={`
            grid 
            transition-[grid-template-rows,opacity] 
            duration-300 
            ease-in-out 
            motion-reduce:transition-none
            ${collapsed ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'}
            mt-3
          `}
        >
          <div className="overflow-hidden min-h-0">
            <div className="flex flex-col gap-4">
              {/* Trailing Stop Toggle Row */}
              <div className={`flex items-center justify-between p-4 border rounded-2xl ${
                isCrypto 
                  ? 'bg-muted/10 border-border opacity-60' 
                  : 'bg-[#052e16] border-[#065f46]'
              }`}>
                <div className="flex items-center gap-3">
                  <Shield className={isCrypto ? 'text-muted' : 'text-[#4ade80]'} size={20} />
                  <div className="flex flex-col">
                    <span className="text-white font-black text-sm tracking-widest uppercase">
                      TRAILING STOP
                      {isCrypto && <span className="ml-2 text-[8px] text-bear bg-bear/10 px-1 rounded">NOT FOR CRYPTO</span>}
                    </span>
                    <span className={`${isCrypto ? 'text-muted' : 'text-[#4ade80]'} font-bold text-xs uppercase tracking-widest`}>
                      {isCrypto ? 'UNAVAILABLE' : `@ ${activeTrailPercent || tslConfig.percent}% OFFSET`}
                    </span>
                  </div>
                </div>
                {isCrypto ? (
                  <div className="p-2 text-muted" title="Trailing Stop is not supported for Crypto on Alpaca">
                    <AlertCircle size={20} />
                  </div>
                ) : (
                  <button 
                    type="button"
                    disabled={!!updatingLevel}
                    onClick={() => handleSetTsl(activeTrailPercent || tslConfig.percent, 'TRAILING STOP')}
                    className={`w-14 h-8 rounded-full transition-all relative ${isTslActive ? 'bg-[#4ade80]' : 'bg-[#1e293b]'}`}
                  >
                    <div className={`w-6 h-6 bg-white rounded-full absolute top-1 transition-all ${isTslActive ? 'right-1' : 'left-1'}`} />
                  </button>
                )}
              </div>

              {/* TSL Presets Row */}
              {!isCrypto && (
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    disabled={!!updatingLevel}
                    onClick={() => handleSetTsl(0.1, 'TSL 0.1%')}
                    className={`py-3 bg-[#1e293b] rounded-xl text-white font-black text-sm tracking-tighter uppercase hover:bg-[#2d3748] transition-colors disabled:opacity-50 border-2 ${activeTrailPercent === 0.1 ? 'border-[#4ade80]' : 'border-transparent'}`}
                  >
                    .10%
                  </button>
                  <button
                    type="button"
                    disabled={!!updatingLevel}
                    onClick={() => handleSetTsl(0.15, 'TSL 0.15%')}
                    className={`py-3 bg-[#1e293b] rounded-xl text-white font-black text-sm tracking-tighter uppercase hover:bg-[#2d3748] transition-colors disabled:opacity-50 border-2 ${activeTrailPercent === 0.15 ? 'border-[#4ade80]' : 'border-transparent'}`}
                  >
                    .15%
                  </button>
                  <button
                    type="button"
                    disabled={!!updatingLevel}
                    onClick={() => handleSetTsl(0.25, 'TSL 0.25%')}
                    className={`py-3 bg-[#1e293b] rounded-xl text-white font-black text-sm tracking-tighter uppercase hover:bg-[#2d3748] transition-colors disabled:opacity-50 border-2 ${activeTrailPercent === 0.25 ? 'border-[#4ade80]' : 'border-transparent'}`}
                  >
                    .25%
                  </button>
                </div>
              )}

{/* BE-STOP, BE+TRAIL, and PRICE-STOP Buttons */}
<div className="grid grid-cols-3 gap-4">
<button
  type="button"
  onClick={() => onAction(pos, 'cancel-all-set-sl-be')}
  disabled={!!updatingLevel || plPc <= 0}
  title={plPc <= 0 ? 'Position is underwater — wait until break-even' : undefined}
  className="flex items-center justify-center gap-2 py-6 bg-[#1e293b] rounded-2xl text-white font-black text-lg tracking-widest uppercase hover:bg-[#2d3748] transition-colors disabled:opacity-50"
>
  <Target className="text-[#4ade80]" size={20} />
  BE
</button>
<button
  type="button"
  onClick={() => onAction(pos, 'cancel-all-set-sl-be-with-trail')}
  disabled={!!updatingLevel}
  className="flex items-center justify-center gap-2 py-6 bg-[#064e3b] rounded-2xl text-white font-black text-lg tracking-widest uppercase hover:bg-[#065f46] transition-colors disabled:opacity-50 border border-[#4ade80]/30"
>
  <Target className="text-[#4ade80]" size={20} />
  <span className="text-[#4ade80]">BE+</span>TRAIL
</button>
<button
  type="button"
  onClick={() => onAction(pos, 'cancel-all-set-sl-price')}
  disabled={!!updatingLevel}
  className="flex items-center justify-center gap-2 py-6 bg-[#1e293b] rounded-2xl text-white font-black text-lg tracking-widest uppercase hover:bg-[#2d3748] transition-colors disabled:opacity-50"
>
  <Shield className="text-[#4ade80]" size={20} />
  PRICE
</button>
</div>
              {/* FLATTEN Button */}
              <button 
                type="button"
                onClick={() => onAction(pos, 'flash-close')}
                disabled={!!updatingLevel}
                className="w-full py-8 bg-[#4ade80] rounded-3xl text-[#052e16] flex flex-col items-center justify-center hover:bg-[#22c55e] transition-colors disabled:opacity-50"
              >
                <span className="text-5xl font-black tracking-[0.2em] uppercase">FLATTEN</span>
                <span className="text-sm font-bold tracking-widest uppercase mt-1">EXIT ALL IMMEDIATELY</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
);

