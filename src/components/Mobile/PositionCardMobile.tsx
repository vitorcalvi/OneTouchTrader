import type { Position } from '@/types';

interface PositionCardMobileProps {
  position: Position | null;
  onBeClick: () => void;
  onSlClick: () => void;
  onExitClick: () => void;
  onTrailClick: () => void;
  unrealizedPl: number;
  plPercent: number;
  notional: number;
  isTrailActive?: boolean;
}

export function PositionCardMobile({
  position,
  onBeClick,
  onSlClick,
  onExitClick,
  onTrailClick,
  unrealizedPl,
  plPercent,
  notional,
  isTrailActive = false,
}: PositionCardMobileProps) {
  const isLong = position?.side === 'long';
  const isEmpty = !position;

  return (
    <section className="bg-[#1e2533] rounded-[2rem] p-6 flex flex-col gap-4">
      <div className="flex justify-between items-center gap-4">
        <button
          onClick={onBeClick}
          disabled={isEmpty}
          className="flex-1 py-5 rounded-3xl bg-[#4A90E2] text-white text-2xl font-black disabled:opacity-50 disabled:cursor-not-allowed">BE</button>
        <button
          onClick={onSlClick}
          disabled={isEmpty}
          className="flex-1 py-5 rounded-3xl bg-[#4A90E2] text-white text-2xl font-black disabled:opacity-50 disabled:cursor-not-allowed">SL</button>
        <div className="text-right">
          <div className="flex items-baseline gap-2 justify-end">
            <span className="text-[10px] text-slate-500 font-bold uppercase">{isEmpty ? 'LONG' : isLong ? 'LONG' : 'SHORT'}</span>
            <span className={`text-2xl font-bold ${isEmpty ? 'text-slate-500' : unrealizedPl >= 0 ? 'text-[#25D366]' : 'text-[#FF4B4B]'}`}>
              {isEmpty ? '—' : `$${unrealizedPl >= 0 ? '+' : ''}${unrealizedPl.toFixed(0)}`}
            </span>
          </div>
          <div className={`text-xs font-bold leading-none ${isEmpty ? 'text-slate-500' : plPercent >= 0 ? 'text-[#25D366]' : 'text-[#FF4B4B]'}`}>
            {isEmpty ? '—' : `(${plPercent >= 0 ? '+' : ''}${plPercent.toFixed(0)}%)`}
          </div>
        </div>
      </div>
      <div className="flex justify-between items-center">
        <div className="flex gap-2 w-1/2">
          <button onClick={onExitClick}
            disabled={isEmpty}
            className="flex-1 py-3 rounded-2xl bg-[#B92B2B] text-white text-xs font-black uppercase tracking-widest italic disabled:opacity-50 disabled:cursor-not-allowed">EXIT</button>
          <button onClick={onTrailClick}
            disabled={isEmpty}
            className={`flex-1 py-3 rounded-2xl text-xs font-black uppercase tracking-widest italic disabled:opacity-50 disabled:cursor-not-allowed ${
              isTrailActive ? 'bg-[#25D366] text-black' : 'bg-[#25D366]/20 text-[#25D366]'
            }`}>TRAIL</button>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-[10px] text-slate-500 font-bold uppercase">Size</span>
          <span className="text-2xl font-bold">{isEmpty ? '—' : `$${(notional / 1000).toFixed(0)}K`}</span>
        </div>
      </div>
    </section>
  );
}