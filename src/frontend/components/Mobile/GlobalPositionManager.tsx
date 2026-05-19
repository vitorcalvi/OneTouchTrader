import React from 'react';
import type { Position } from '@/types';
import { safeParseFloat } from '@/shared/utils/numbers';

interface GlobalPositionManagerProps {
  positions: Position[];
  onExitAll: () => void;
  onBeAll: () => void;
  onSlAll: () => void;
  onTrailAll: () => void;
  onCycleActive: () => void;
  isSubmitting?: boolean;
}

const LONG_PRESS_MS = 500;

function useLongPress(onTap: () => void, onLongPress?: () => void) {
  const [holding, setHolding] = React.useState(false);
  const timerRef = React.useRef<number | null>(null);
  const firedRef = React.useRef(false);

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

  return { holding, start, end, clear };
}

export function GlobalPositionManager({
  positions,
  onExitAll,
  onBeAll,
  onSlAll,
  onTrailAll,
  onCycleActive,
  isSubmitting,
}: GlobalPositionManagerProps) {
  const exitLP = useLongPress(() => {}, onExitAll);
  const trailLP = useLongPress(() => {}, onTrailAll);

  const disabled = positions.length === 0 || !!isSubmitting;
  const colorClass = positions.length > 0 ? 'text-white' : 'text-white';

  const totalPnl = positions.reduce((s, p) => s + safeParseFloat(p.unrealized_pl, 0), 0);
  const totalCost = positions.reduce((s, p) => s + Math.abs(safeParseFloat(p.cost_basis, 0)), 0);
  const totalPct = totalCost === 0 ? 0 : (totalPnl / totalCost) * 100;

  return (
    <section className="flex gap-2 mt-2 items-stretch h-12">
      <button
        type="button"
        onPointerDown={() => exitLP.start()}
        onPointerUp={() => exitLP.end()}
        onPointerCancel={exitLP.clear}
        onPointerLeave={exitLP.clear}
        onContextMenu={(e) => e.preventDefault()}
        style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
        disabled={disabled}
        className={
          exitLP.holding
            ? 'bg-[#B92B2B] text-white border border-white/5 flex-1 rounded-xl flex items-center justify-center text-[11px] font-bold disabled:opacity-40 disabled:cursor-not-allowed'
            : `bg-[#242E42] border border-white/5 flex-1 rounded-xl flex items-center justify-center text-[11px] font-bold ${colorClass} disabled:opacity-40 disabled:cursor-not-allowed`
        }
      >
        {exitLP.holding ? 'CONFIRM' : 'ALL EXIT'}
      </button>

      <button
        type="button"
        onClick={onBeAll}
        disabled={disabled}
        className={`bg-[#242E42] border border-white/5 flex-1 rounded-xl flex items-center justify-center text-[11px] font-bold ${colorClass} disabled:opacity-40 disabled:cursor-not-allowed`}
      >
        ALL BE
      </button>

      <button
        type="button"
        onClick={onSlAll}
        disabled={disabled}
        className={`bg-[#242E42] border border-white/5 flex-1 rounded-xl flex items-center justify-center text-[11px] font-bold ${colorClass} disabled:opacity-40 disabled:cursor-not-allowed`}
      >
        ALL SL
      </button>

      <button
        type="button"
        onPointerDown={() => trailLP.start()}
        onPointerUp={() => trailLP.end()}
        onPointerCancel={trailLP.clear}
        onPointerLeave={trailLP.clear}
        onContextMenu={(e) => e.preventDefault()}
        style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
        disabled={disabled}
        className={
          trailLP.holding
            ? 'bg-[#B92B2B] text-white border border-white/5 flex-1 rounded-xl flex items-center justify-center text-[11px] font-bold disabled:opacity-40 disabled:cursor-not-allowed'
            : `bg-[#242E42] border border-white/5 flex-1 rounded-xl flex items-center justify-center text-[11px] font-bold ${colorClass} disabled:opacity-40 disabled:cursor-not-allowed`
        }
      >
        {trailLP.holding ? 'CONFIRM' : 'ALL TRAIL'}
      </button>

      <div
        className={`bg-[#171E2D] flex-[2] rounded-xl border border-gray-700/50 px-3 flex items-center justify-between ${positions.length === 0 ? 'cursor-default' : 'cursor-pointer'}`}
        onClick={() => { if (positions.length > 0) onCycleActive(); }}
      >
        {positions.length === 0 ? (
          <div className="text-white text-sm font-bold leading-tight">NO POSITIONS</div>
        ) : (
          <>
            <div className="flex flex-col">
              <span className="text-white text-sm font-bold leading-tight">{positions.length} {positions.length === 1 ? 'POSITION' : 'POSITIONS'}</span>
            </div>
            <div className="flex flex-col items-end">
              <div className="flex items-baseline gap-1">
                <span className="text-white text-[8px] font-bold">PNL</span>
                <span className={`text-sm font-bold leading-tight ${totalPnl >= 0 ? 'text-[#25D366]' : 'text-[#FF4B4B]'}`}>
                  {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(2)}
                </span>
              </div>
              <span className={`text-[8px] font-semibold ${totalPct >= 0 ? 'text-[#25D366]' : 'text-[#FF4B4B]'}`}>{totalPct >= 0 ? '+' : ''}{totalPct.toFixed(2)}%</span>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
