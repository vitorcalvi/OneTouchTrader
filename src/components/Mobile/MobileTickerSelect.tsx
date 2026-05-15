import React, { useState, useRef } from 'react';

const MAX_SYMBOLS = 6;
const LONG_PRESS_MS = 500;

interface MobileTickerSelectProps {
  symbols: string[];
  activeSymbol: string;
  onSymbolSelect: (symbol: string) => void;
  onAddSymbol: () => void;
  onRemoveSymbol: (symbol: string) => void;
}

export const MobileTickerSelect: React.FC<MobileTickerSelectProps> = ({
  symbols,
  activeSymbol,
  onSymbolSelect,
  onAddSymbol,
  onRemoveSymbol,
}) => {
  function TickerButton({
    symbol,
    isActive,
    onTap,
    onLongPress,
  }: {
    symbol: string;
    isActive: boolean;
    onTap: () => void;
    onLongPress?: () => void;
  }) {
    const [holding, setHolding] = useState(false);
    const timerRef = useRef<number | null>(null);
    const firedRef = useRef(false);

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

    return (
      <button
        type="button"
        onPointerDown={() => { if (onLongPress) start(); }}
        onPointerUp={() => { if (onLongPress) end(); else onTap(); }}
        onPointerCancel={clear}
        onPointerLeave={clear}
        onContextMenu={(e) => e.preventDefault()}
        style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
        className={
          holding
            ? 'bg-[#B92B2B] text-white border border-white/5 rounded-xl py-3 font-bold text-base flex-1 min-w-0'
            : isActive
              ? 'bg-[#25D366] text-white border border-[#25D366] shadow-[0_0_20px_rgba(37,211,102,0.4)] rounded-xl py-3 font-bold text-base flex-1 min-w-0'
              : 'bg-[#242E42] border border-white/5 text-[#8B99AE] rounded-xl py-3 font-bold text-base flex-1 min-w-0'
        }
      >
        {symbol}
      </button>
    );
  }

  return (
    <div className="flex gap-2 items-stretch">
      {symbols.map((symbol) => (
        <TickerButton
          key={symbol}
          symbol={symbol}
          isActive={activeSymbol === symbol}
          onTap={() => onSymbolSelect(symbol)}
          onLongPress={() => onRemoveSymbol(symbol)}
        />
      ))}

      {symbols.length < MAX_SYMBOLS && (
        <button
          type="button"
          className="bg-[#242E42] border border-white/5 text-[#8B99AE] rounded-xl py-3 font-bold text-base flex-1 min-w-0"
          onClick={onAddSymbol}
          aria-label="Add symbol"
        >
          +
        </button>
      )}
    </div>
  );
};
