import React from 'react';
import type { Order, Position } from '@/types';
import { safeParseFloat } from '@/shared/utils/numbers';

interface MobileControlsPanelProps {
  onBeClick: () => void;
  onSlClick: () => void;
  onExitClick: () => void;
  onTrailClick: () => void;
  isTrailActive: boolean;
  positionSide: 'long' | 'short';
  activePosition?: Position | null;
  activeOrder?: Order | null;
}

export const MobileControlsPanel: React.FC<MobileControlsPanelProps> = ({
  onBeClick,
  onSlClick,
  onExitClick,
  onTrailClick,
  isTrailActive: _isTrailActive,
  positionSide,
  activePosition = null,
  activeOrder = null,
}) => {
  const hasPosition = Boolean(activePosition);
  const displaySymbol = activePosition?.symbol ?? activeOrder?.symbol ?? '-';
  const activeSide = activePosition?.side ?? (activeOrder?.side === 'sell' ? 'short' : activeOrder?.side === 'buy' ? 'long' : positionSide);
  const qty = activePosition
    ? Math.abs(safeParseFloat(activePosition.qty, 0))
    : activeOrder
      ? Math.abs(safeParseFloat(activeOrder.qty, 0))
      : 0;
  const pnlValue = activePosition ? safeParseFloat(activePosition.unrealized_pl, 0) : 0;
  const pnlPct = activePosition ? safeParseFloat(activePosition.unrealized_plpc, 0) * 100 : 0;
  const pnlIsPositive = pnlValue >= 0;

  return (
    <section className="flex gap-3 mt-2 h-[150px]">
      {/* EXIT Button */}
      <button
        type="button"
        onClick={onExitClick}
        disabled={!hasPosition}
        className="w-[110px] bg-[#B92B2B] rounded-2xl flex items-center justify-center border border-red-500/30 relative overflow-hidden shadow-[0_0_15px_rgba(185,43,43,0.3)] disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_center,transparent_0,transparent_1px,#000_1px,#000_2px)] bg-[length:4px_4px]"></div>
        <span className="text-white text-xl font-bold tracking-wider drop-shadow-md z-10">EXIT</span>
      </button>

      {/* Middle Controls (BE, SL, TRAIL) */}
      <div className="flex-1 flex flex-col gap-2">
        <button
          type="button"
          onClick={onBeClick}
          disabled={!hasPosition}
          className="bg-[#242E42] border border-white/5 flex-1 rounded-xl flex items-center justify-center text-[#4A90E2] text-base font-bold disabled:opacity-40 disabled:cursor-not-allowed"
        >
          BE
        </button>
        <button
          type="button"
          onClick={onSlClick}
          disabled={!hasPosition}
          className="bg-[#242E42] border border-white/5 flex-1 rounded-xl flex items-center justify-center text-[#4A90E2] text-base font-bold disabled:opacity-40 disabled:cursor-not-allowed"
        >
          SL
        </button>
        <button
          type="button"
          onClick={onTrailClick}
          disabled={!hasPosition}
          className="bg-[#242E42] border border-white/5 flex-[1.5] rounded-xl flex items-center justify-center text-[#4A90E2] text-sm font-bold tracking-wider disabled:opacity-40 disabled:cursor-not-allowed"
        >
          TRAIL
        </button>
      </div>

      {/* Position Card */}
      <div className="w-[120px] bg-[#171E2D] rounded-2xl border border-gray-700/50 flex flex-col items-center justify-center py-2 relative overflow-hidden">
        <div className="text-white text-base font-bold mb-0.5">{displaySymbol}</div>
        <div className="text-[#8B99AE] text-[8px] font-bold tracking-widest mb-0.5">{activeSide.toUpperCase()}</div>
        <div className="text-white text-2xl font-bold leading-none mb-0.5">
          {qty.toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </div>
        <div className="text-[#8B99AE] text-[8px] font-bold tracking-widest mb-2">SHARES</div>
        <div className="text-[#8B99AE] text-[8px] font-bold tracking-widest mb-0.5">PNL</div>
        <div className={`text-base font-bold leading-none mb-0.5 ${pnlIsPositive ? 'text-[#25D366]' : 'text-[#FF4B4B]'}`}>
          {pnlValue >= 0 ? '+' : ''}{pnlValue.toFixed(2)}
        </div>
        <div className={`text-[9px] font-semibold ${pnlIsPositive ? 'text-[#25D366]' : 'text-[#FF4B4B]'}`}>
          {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%
        </div>
      </div>
    </section>
  );
};