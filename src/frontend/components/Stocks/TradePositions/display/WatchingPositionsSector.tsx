import React, { useState } from 'react';
import { Position } from '../../../../types';
import { Eye, ArrowRight, GripVertical } from 'lucide-react';
import { safeParseFloat } from '../../../../shared/utils/numbers';

interface WatchingPositionsSectorProps {
  positions: Position[];
  onMoveToRunning: (positionId: string) => void;
  className?: string;
}

export const WatchingPositionsSector: React.FC<WatchingPositionsSectorProps> = ({
  positions,
  onMoveToRunning,
  className = '',
}) => {
  const [draggedPosition, setDraggedPosition] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, position: Position) => {
    e.dataTransfer.setData('text/plain', position.asset_id);
    e.dataTransfer.setData('application/json', JSON.stringify({
      asset_id: position.asset_id,
      symbol: position.symbol,
      side: position.side,
      qty: position.qty,
    }));
    e.dataTransfer.effectAllowed = 'move';
    setDraggedPosition(position.asset_id);
  };

  const handleDragEnd = () => {
    setDraggedPosition(null);
  };

  if (positions.length === 0) {
    return (
      <div className={`border-b-2 border-accent bg-gradient-to-b from-accent/20 to-surface ${className}`}>
        <div className="px-4 py-2 flex items-center gap-2">
          <Eye size={14} className="text-accent" />
          <span className="px-2 py-0.5 bg-accent text-base text-[8px] font-black uppercase tracking-widest rounded">
            TOP PRIORITY
          </span>
          <h2 className="text-[10px] font-black uppercase tracking-widest text-secondary">
            WATCHING POSITIONS
          </h2>
          <span className="text-[10px] text-accent font-bold">(0)</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`border-b-2 border-accent bg-gradient-to-b from-accent/20 to-surface ${className}`}>
      <div className="px-4 py-2 flex items-center gap-2">
        <Eye size={14} className="text-accent" />
        <span className="px-2 py-0.5 bg-accent text-base text-[8px] font-black uppercase tracking-widest rounded">
          TOP PRIORITY
        </span>
        <h2 className="text-[10px] font-black uppercase tracking-widest text-secondary">
          WATCHING POSITIONS
        </h2>
        <span className="text-[10px] text-accent font-bold">({positions.length})</span>
        <span className="text-[9px] text-muted ml-2 italic">drag to chart to view · click button to trade</span>
      </div>
      <div className="px-4 pb-4 flex gap-3 overflow-x-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
        {positions.map((position) => {
          const isLong = position.side === 'long';
          const currentPrice = safeParseFloat(position.current_price, 0);
          const entryPrice = safeParseFloat(position.avg_entry_price, 0);
          const qty = Math.abs(safeParseFloat(position.qty, 0));
          const pnl = isLong 
            ? (currentPrice - entryPrice) * qty 
            : (entryPrice - currentPrice) * qty;
          const pnlPercent = entryPrice > 0 
            ? (pnl / (entryPrice * qty)) * 100 
            : 0;
          const isDragging = draggedPosition === position.asset_id;

          return (
            <div
              key={position.asset_id}
              draggable
              onDragStart={(e) => handleDragStart(e, position)}
              onDragEnd={handleDragEnd}
              className={`
                bg-card
                border
                border-border
                rounded-lg
                p-3
                flex
                flex-col
                gap-2
                min-w-[220px]
                flex-shrink-0
                transition-all
                duration-300
                hover:border-surface
                hover:shadow-lg
                cursor-grab
                active:cursor-grabbing
                ${isDragging ? 'opacity-50 border-accent' : ''}
              `}
            >
              <div className="flex items-center gap-2 font-mono text-xs">
                <GripVertical size={10} className="text-muted flex-shrink-0" />
                <span
                  className={`font-black uppercase tracking-wider ${isLong ? 'text-bull' : 'text-bear'}`}
                >
                  {isLong ? 'LONG' : 'SHORT'}
                </span>
                <span className="font-black text-primary tracking-wider">
                  {position.symbol}
                </span>
                <span className="text-muted font-bold">
                  x{Number.isInteger(qty) ? qty : qty.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')}
                </span>
                <span
                  className={`ml-auto font-bold ${pnl >= 0 ? 'text-bull' : 'text-bear'}`}
                >
                  {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                </span>
              </div>

              <div className="flex items-center justify-between font-mono text-xs">
                <span className="font-bold text-primary">
                  ${currentPrice.toFixed(2)}
                </span>
                <span
                  className={`font-bold ${pnl >= 0 ? 'text-bull' : 'text-bear'}`}
                >
                  [{pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%]
                </span>
              </div>

              <button
                type="button"
                onClick={() => onMoveToRunning(position.asset_id)}
                className="
                  w-full
                  flex
                  items-center
                  justify-center
                  gap-1.5
                  px-3
                  py-2
                  bg-surface
                  hover:bg-card
                  border
                  border-border
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
        })}
      </div>
    </div>
  );
};
