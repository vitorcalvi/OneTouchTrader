import React from 'react';
import { RunningPosition } from './types';

interface RunningPositionCardProps {
  position: RunningPosition;
}

export const RunningPositionCard: React.FC<RunningPositionCardProps> = ({
  position,
}) => {
  const isLong = position.side === 'LONG';
  const sideColorClass = isLong ? 'text-bull' : 'text-bear';
  const pnlColorClass = position.pnl >= 0 ? 'text-bull' : 'text-bear';
  const bePnlColorClass = position.bePnl >= 0 ? 'text-bull' : 'text-bear';

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
        gap-1.5
        transition-all
        duration-300
        hover:border-surface
      "
    >
      <div className="flex items-center gap-2 font-mono text-xs">
        <span className="text-muted">o</span>
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
      </div>

      <div className="flex items-center justify-between font-mono text-xs">
        <span className="text-muted">PnL:</span>
        <span className={`font-bold ${pnlColorClass}`}>
          {position.pnl >= 0 ? '+' : ''}${position.pnl.toFixed(2)} [{position.pnlPercent >= 0 ? '+' : ''}{position.pnlPercent.toFixed(2)}%]
        </span>
      </div>

      <div className="flex items-center justify-between font-mono text-xs">
        <span className="text-muted">Size:</span>
        <span className="font-bold text-primary">
          ${position.positionSize.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </span>
      </div>

      <div className="flex items-center justify-between font-mono text-xs">
        <span className="text-muted">BE-PnL:</span>
        <span className={`font-bold ${bePnlColorClass}`}>
          {position.bePnl >= 0 ? '+' : ''}${position.bePnl.toFixed(2)} ({position.bePnlPercent >= 0 ? '+' : ''}{position.bePnlPercent.toFixed(2)}%)
        </span>
      </div>
    </div>
  );
};
