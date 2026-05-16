import React, { useState, useMemo } from 'react';
import { Position, Order } from '../../../../types';
import { Shield, AlertTriangle, RefreshCw, X } from 'lucide-react';
import { safeParseFloat } from '../../../../shared/utils/numbers';
import { calculateBreakEven } from '../controls/tradeUtils';
import { isCryptoSymbol } from '../../../../shared/utils/stocks';
import type { PositionAction, PositionActionPayload } from './PositionCard';

interface PositionControlPanelProps {
  position: Position;
  orders?: Order[];
  realtimePrice?: number;
  onAction?: (pos: Position, action: PositionAction, payload?: PositionActionPayload) => Promise<void>;
}

export const PositionControlPanel: React.FC<PositionControlPanelProps> = ({
  position: pos,
  orders = [],
  realtimePrice,
  onAction,
}) => {
  const [updatingLevel] = useState<string | null>(null);

  const livePrice = realtimePrice || safeParseFloat(pos.current_price, 0);
  const entryPrice = safeParseFloat(pos.avg_entry_price, 0);
  const positionQty = Math.abs(safeParseFloat(pos.qty, 0));
  const displayQty = Number.isInteger(positionQty)
    ? String(positionQty)
    : positionQty.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
  const isLong = pos.side === 'long';
  const isCrypto = isCryptoSymbol(pos.symbol);
  const breakEvenPrice = calculateBreakEven(entryPrice, isCrypto, 'market');

  const oppositeSide = isLong ? 'sell' : 'buy';
  const slOrder = orders.find(
    (o) => (o.type === 'stop' || o.type === 'stop_limit') && o.side === oppositeSide
  );

  const isSlActive = !!slOrder;
  const activeSlPrice = slOrder ? safeParseFloat(slOrder.stop_price, 0) : null;

  const rawPl = isLong ? (livePrice - entryPrice) * positionQty : (entryPrice - livePrice) * positionQty;
  const posSize = livePrice * positionQty;
  const displayPosSize = posSize.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const plPc = isLong ? ((livePrice - entryPrice) / entryPrice) * 100 : ((entryPrice - livePrice) / entryPrice) * 100;

  const tslConfig = useMemo(() => {
    let percent = 0.5;
    if (plPc < 0.1) {
      percent = 0.1;
    } else if (plPc < 0.15) {
      percent = 0.15;
    } else if (plPc < 0.25) {
      percent = 0.25;
    } else if (plPc > 1.0) {
      percent = 1.0;
    }
    return { percent };
  }, [plPc]);

  const slRiskPerShare = isLong ? entryPrice - (livePrice - 0.1) : (livePrice + 0.1) - entryPrice;
  const activeSlRiskPerShare = activeSlPrice !== null
    ? (isLong ? entryPrice - activeSlPrice : activeSlPrice - entryPrice)
    : slRiskPerShare;

  return (
    <div className="w-full max-w-md bg-surface border border-border rounded-xl p-4">
      {/* Header */}
      <div className="mb-3 pb-3 border-b border-border">
        <div className="flex items-center gap-2 mb-2">
          <span
            className={`w-2 h-2 rounded-full ${isLong ? 'bg-bull' : 'bg-bear'}`}
          />
          <span
            className={`text-[10px] font-black uppercase tracking-widest ${isLong ? 'text-bull' : 'text-bear'}`}
          >
            {isLong ? 'LONG' : 'SHORT'}
          </span>
          <h3 className="text-lg font-black text-primary tracking-wider font-mono">
            {pos.symbol}
          </h3>
          <span className="text-xs font-bold text-muted">
            ×{displayQty}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <span
              className={`font-mono font-bold text-sm ${rawPl >= 0 ? 'text-bull' : 'text-bear'}`}
            >
              {rawPl >= 0 ? '+' : ''}${rawPl.toFixed(2)}
            </span>
            <span
              className={`text-xs font-bold px-2 py-0.5 rounded ${rawPl >= 0 ? 'text-bull bg-bull/10' : 'text-bear bg-bear/10'}`}
            >
              {plPc >= 0 ? '+' : ''}{plPc.toFixed(2)}%
            </span>
          </div>
        </div>
      </div>

      {/* Position Details */}
      <div className="flex items-center gap-4 mb-4 text-xs flex-wrap">
        <div>
          <span className="text-muted">Entry:</span>
          <span className="ml-1 font-mono font-bold text-primary">${entryPrice.toFixed(2)}</span>
        </div>
        <div>
          <span className="text-muted">Now:</span>
          <span className="ml-1 font-mono font-bold text-primary">${livePrice.toFixed(2)}</span>
        </div>
        <div>
          <span className="text-muted">Size:</span>
          <span className="ml-1 font-mono font-bold text-primary">${displayPosSize}</span>
        </div>
        <div>
          <span className="text-muted">BE-PnL:</span>
          <span className="ml-1 font-mono font-bold text-warn">
            +${(breakEvenPrice - entryPrice).toFixed(isCrypto ? 4 : 2)} ({(((breakEvenPrice - entryPrice) / entryPrice) * 100).toFixed(2)}%)
          </span>
        </div>
      </div>

      {/* Risk Shields */}
      <div className="mb-4">
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-2">
            <Shield size={14} className="text-accent" />
            <span className="text-[10px] font-black uppercase tracking-wider text-muted">Risk Shields</span>
          </div>
          <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-warn/10 border border-warn/30">
            <AlertTriangle size={12} className="text-warn" />
            <span className="text-xs font-bold text-warn">
              ${Math.abs(isSlActive ? activeSlRiskPerShare : slRiskPerShare).toFixed(2)}
            </span>
          </div>
        </div>

        <div className="bg-surface border border-accent/30 rounded-xl p-4 flex items-center justify-between shadow-sm">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
              <span className="text-[10px] font-black uppercase tracking-widest text-primary">
                Auto Exit Active
              </span>
            </div>
            <span className="text-[10px] font-bold text-muted uppercase">
              Trailing Stop Loss
            </span>
          </div>
          <div className="bg-accent/10 border border-accent/20 rounded-lg px-3 py-1.5 font-black text-accent text-lg">
            {tslConfig.percent}%
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mt-4 pt-4 border-t border-border">
        <div className="flex justify-between items-center mb-3">
          <span className="text-[10px] font-black uppercase tracking-wider text-muted">Quick Actions</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onAction?.(pos, 'reversal')}
            disabled={!!updatingLevel}
            className="px-4 py-2.5 rounded-lg bg-accent hover:bg-accent/80 text-white font-bold text-xs transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
          >
            <RefreshCw size={14} />
            <span>REVERSE</span>
          </button>

          <button
            type="button"
            onClick={() => onAction?.(pos, 'flash-close', { qty: Math.ceil(positionQty * 0.5) })}
            disabled={!!updatingLevel}
            className="px-4 py-2.5 rounded-lg bg-warn hover:bg-warn/80 text-white font-bold text-xs transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex flex-col items-center justify-center"
          >
            <span>CLOSE 50%</span>
            <span className="text-[10px] font-medium opacity-80">({Math.ceil(positionQty * 0.5)})</span>
          </button>

          <button
            type="button"
            onClick={() => onAction?.(pos, 'flash-close')}
            disabled={!!updatingLevel}
            className="px-4 py-2.5 rounded-lg bg-bear hover:bg-bear/80 text-white font-bold text-xs transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 col-span-2"
          >
            <X size={14} />
            <span>FULL CLOSE</span>
          </button>
        </div>
      </div>
    </div>
  );
};
