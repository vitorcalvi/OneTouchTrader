interface OrderPanelProps {
  price: number | null;
  limitPrice: number | null;
  onBuy: () => void;
  onSell: () => void;
  onSideToggle?: () => void;
  positionSide: 'long' | 'short';
  onPriceStep?: (increment: number) => void;
  slPrice?: number | null;
  tpPrice?: number | null;
  onSlPriceChange?: (price: number) => void;
  onTpPriceChange?: (price: number) => void;
  activeTier?: 'M' | 'L' | 'S';
  onTierChange?: (tier: 'M' | 'L' | 'S') => void;
  canTrade?: boolean;
  tickDirection?: 'up' | 'down' | null;
  priceSteps?: { large: number; mid: number; small: number };
}

export function OrderPanel({
  price,
  limitPrice,
  onBuy,
  onSell,
  onSideToggle,
  positionSide = 'long',
  onPriceStep,
  slPrice: _slPrice,
  tpPrice: _tpPrice,
  onSlPriceChange: _onSlPriceChange,
  onTpPriceChange: _onTpPriceChange,
  activeTier = 'L',
  onTierChange,
  canTrade = true,
  tickDirection = null,
  priceSteps = { large: 1, mid: 0.1, small: 0.01 },
}: OrderPanelProps) {

  const fmtLarge = (n: number) => Number.isInteger(n) ? `${n}.` : n.toString();
  const fmtMid = (n: number) => n.toString();
  const fmtSmall = (n: number) => {
    const s = n.toString();
    return s.startsWith('0.') ? s.slice(1) : s;
  };

  const stepBtnClass = "w-12 h-14 rounded-lg bg-app-button border border-white/5 flex flex-col items-center justify-center text-app-textMuted text-xs gap-1 active:bg-app-buttonHover disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <div className="glass-card p-6 flex flex-col gap-6">
      <div className="bg-black/30 rounded-full p-1 flex justify-between">
        {(['long','short'] as const).map(mode => (
          <button key={mode} onClick={() => onSideToggle?.()}
            aria-pressed={positionSide === mode}
            className={`flex-1 py-1 rounded-full text-xs font-bold ${
              positionSide === mode
                ? mode === 'long'
                  ? 'text-black bg-[#25D366]'
                  : 'text-white bg-[#B92B2B]'
                : 'text-white'
            }`}>
            {mode.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="bg-black/30 rounded-full p-1 flex justify-between">
        {(() => {
          const raw = (import.meta.env.VITE_ORDER_TYPE as string | undefined) || '';
          const parsed = raw.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
          const mapToTier = (s: string): 'M' | 'L' | 'S' | null => {
            if (s === 'MARKET' || s === 'M') return 'M';
            if (s === 'LIMIT' || s === 'L') return 'L';
            if (s === 'STOP' || s === 'S') return 'S';
            return null;
          };
          const orderTypes = parsed.map(mapToTier).filter(Boolean) as ('M'|'L'|'S')[];
          const finalTypes = orderTypes.length > 0 ? orderTypes : (['M','L','S'] as const);
          return finalTypes.map(t => {
            const sub = t === 'M' ? 'MARKET' : t === 'L' ? 'LIMIT' : 'STOP LIMIT';
            return (
              <button key={t} onClick={() => onTierChange?.(t)}
                aria-pressed={activeTier === t}
                className={`flex-1 py-2 rounded-full text-center ${
                  activeTier === t ? 'font-bold text-black bg-[#25D366]' : 'font-bold text-white'
                }`}>
                <span className="text-xs">{sub}</span>
              </button>
            );
          });
        })()}
      </div>

      <div className="flex gap-4">
        <div className="flex flex-col justify-between items-center gap-4">
          <div className="flex gap-2">
            {[
              { val: priceSteps.large, label: fmtLarge(priceSteps.large) },
              { val: priceSteps.mid, label: fmtMid(priceSteps.mid) },
              { val: priceSteps.small, label: fmtSmall(priceSteps.small) },
            ].map(({ val, label }, i) => (
              <button key={`up-${i}`} onClick={() => onPriceStep?.(val)}
                disabled={activeTier === 'M' || price == null}
                aria-label={`Increase by $${val}`}
                title={`+$${val}`}
                className={stepBtnClass}>
                <span className="leading-none">+</span>
                <span className="text-[10px] leading-none opacity-70">{label}</span>
              </button>
            ))}
          </div>
          <div
            className={`text-6xl font-bold tracking-tighter leading-none transition-colors duration-200 ${
              tickDirection === 'up' ? 'text-[#25D366]' :
              tickDirection === 'down' ? 'text-[#FF4B4B]' : ''
            }`}
>
             {activeTier === 'M' ? (price ? price.toFixed(2) : '--') : (limitPrice != null ? limitPrice.toFixed(2) : price ? price.toFixed(2) : '--')}
           </div>
           <div className="text-[8px] uppercase font-bold text-slate-500 -mt-1">
             {activeTier === 'S' ? 'Stop trigger' : activeTier === 'L' ? 'Limit price' : 'Market'}
           </div>
           <div className="flex gap-2">
             {[
               { val: priceSteps.large, label: fmtLarge(priceSteps.large) },
               { val: priceSteps.mid, label: fmtMid(priceSteps.mid) },
               { val: priceSteps.small, label: fmtSmall(priceSteps.small) },
             ].map(({ val, label }, i) => (
               <button key={`down-${i}`} onClick={() => onPriceStep?.(-val)}
                 disabled={activeTier === 'M' || price == null}
                 aria-label={`Decrease by $${val}`}
                 title={`-$${val}`}
                 className={stepBtnClass}>
                 <span className="leading-none">-</span>
                 <span className="text-[10px] leading-none opacity-70">{label}</span>
               </button>
             ))}
           </div>
         </div>

         <div className="flex-1 flex flex-col gap-3">
           <button
             type="button"
             onClick={positionSide === 'long' ? onBuy : onSell}
             disabled={!canTrade}
             className="flex-1 aspect-square rounded-3xl bg-[#25D366] text-black font-black text-2xl flex items-center justify-center shadow-lg shadow-green-500/40 disabled:opacity-50"
           >
             {positionSide === 'long' ? 'BUY' : 'SELL'}
           </button>
           <button
             type="button"
             onClick={positionSide === 'long' ? onSell : onBuy}
             disabled={!canTrade}
             className="flex-1 aspect-square rounded-3xl bg-[#B92B2B] text-white font-black text-2xl flex items-center justify-center shadow-lg shadow-red-500/40 disabled:opacity-50"
           >
             {positionSide === 'long' ? 'SELL' : 'BUY'}
           </button>
         </div>
       </div>
     </div>
   );
 }