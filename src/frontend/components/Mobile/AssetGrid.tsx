export interface AssetGridProps {
  symbols: string[];
  activeSymbol: string;
  onSymbolSelect: (s: string) => void;
  onAddSymbol: () => void;
  presets: string[];
  activePreset: string;
  onPresetSelect: (p: string) => void;
}

export function AssetGrid({
  symbols,
  activeSymbol,
  onSymbolSelect,
  onAddSymbol,
  presets,
  activePreset,
  onPresetSelect,
}: AssetGridProps) {
  return (
    <section className="grid grid-cols-4 gap-3">
      {presets.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onPresetSelect(p)}
          className={`aspect-square rounded-[1.25rem] font-bold text-sm flex items-center justify-center ${
            p === activePreset
              ? 'text-[#064e3b] bg-[#22c55e] shadow-[0_0_20px_rgba(34,197,94,0.5)]'
              : 'text-app-textMuted bg-app-button border border-white/5'
          }`}
        >
          {p}
        </button>
      ))}
      {symbols.slice(0, 3).map((sym) => (
        <button
          key={sym}
          type="button"
          onClick={() => sym && onSymbolSelect(sym)}
          className={`aspect-square rounded-[1.25rem] font-bold text-lg flex items-center justify-center ${
            sym === activeSymbol
              ? 'text-[#064e3b] bg-[#22c55e] shadow-[0_0_20px_rgba(34,197,94,0.5)]'
              : 'text-app-textMuted bg-app-button border border-white/5'
          }`}
        >
          {sym}
        </button>
      ))}
      <button
        type="button"
        onClick={onAddSymbol}
        aria-label="Add symbol to watchlist"
        className="aspect-square rounded-[1.25rem] font-bold text-2xl flex items-center justify-center bg-[#2d3748] text-slate-400"
      >
        +
      </button>
    </section>
  );
}