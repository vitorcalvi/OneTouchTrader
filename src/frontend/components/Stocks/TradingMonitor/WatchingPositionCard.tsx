import React from 'react';
import { WatchingPosition } from './types';
import { ArrowRight } from 'lucide-react';

interface WatchingPositionCardProps {
  position: WatchingPosition;
  onMoveToRunning: (id: string) => void;
}

export const WatchingPositionCard: React.FC<WatchingPositionCardProps> = ({
  position,
  onMoveToRunning,
}) => {
  const isLong = position.side === 'LONG';
  const sideColorClass = isLong ? 'text-bull' : 'text-bear';
  const pnlColorClass = position.pnl >= 0 ? 'text-bull' : 'text-bear';
  const pnlPercentColorClass = position.pnlPercent >= 0 ? 'text-bull' : 'text-bear';

  return (
    <div
      className="
        bg-card
        border
        border-border
        rounded-lg
        p-3
        flex
        flex-col
        gap-2
        min-w-[220px]
        flex-1
        transition-all
        duration-300
        hover:border-surface
        hover:shadow-lg
      "
    >
      <div className="flex items-center gap-2 font-mono text-xs">
        <span
          className={`font-black uppercase tracking-wider ${sideColorClass}`}
        >
          {position.side}
        </span>
        <span className="font-black text-primary tracking-wider">
          {position.ticker}
        </span>
        <span className="text-muted font-bold">
          x{position.leverage}
        </span>
        <span
          className={`ml-auto font-bold ${pnlColorClass}`}
        >
          {position.pnl >= 0 ? '+' : ''}${position.pnl.toFixed(2)}
        </span>
      </div>

      <div className="flex items-center justify-between font-mono text-xs">
        <span className="font-bold text-primary">
          ${position.currentPrice.toFixed(2)}
        </span>
        <span
          className={`font-bold ${pnlPercentColorClass}`}
        >
          [{position.pnlPercent >= 0 ? '+' : ''}{position.pnlPercent.toFixed(2)}%]
        </span>
      </div>

      <button
        type="button"
        onClick={() => onMoveToRunning(position.id)}
        className="
          w-full
          flex
          items-center
          justify-center
          gap-1.5
          px-3
          py-2
          bg-input
          hover:bg-surface
          border
          border-surface
          hover:border-accent
          rounded-md
          text-[10px]
          font-black
          uppercase
          tracking-widest
          text-secondary
          hover:text-accent
          transition-all
          duration-200
        "
      >
        <span>[ MOVE TO LEFT ]</span>
        <ArrowRight size={12} />
      </button>
    </div>
  );
};
