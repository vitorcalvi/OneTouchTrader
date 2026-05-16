import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, X } from 'lucide-react';

interface FilterOption {
  label: string;
  value: string;
}

interface FilterPillProps {
  label: string;
  activeLabel: string | null;
  options: FilterOption[];
  onSelect: (value: string) => void;
  onClear: () => void;
}

export const FilterPill: React.FC<FilterPillProps> = ({
  label,
  activeLabel,
  options,
  onSelect,
  onClear,
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isActive = activeLabel !== null;

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <div
        className={`flex items-center gap-0 rounded-md border text-[10px] font-mono font-bold uppercase tracking-wider cursor-pointer transition-all select-none
          ${isActive
            ? 'border-accent bg-accent/15 text-accent shadow-[0_0_8px_rgba(99,102,241,0.25)]'
            : 'border-border bg-surface text-muted hover:border-accent/40 hover:text-secondary'
          }`}
      >
        <button
          type="button"
          className="flex items-center gap-1 px-2 py-1"
          onClick={() => setOpen(o => !o)}
        >
          {isActive ? (
            <span className="text-accent">{label} › {activeLabel}</span>
          ) : (
            <span>{label}</span>
          )}
          <ChevronDown size={9} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {isActive && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onClear(); setOpen(false); }}
            className="pr-1.5 pl-0.5 text-accent/70 hover:text-accent transition-colors"
          >
            <X size={9} />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-card border border-border rounded-md shadow-lg overflow-hidden min-w-[120px]">
          {options.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onSelect(opt.value); setOpen(false); }}
              className="w-full text-left px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-secondary hover:bg-surface hover:text-primary transition-colors"
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default FilterPill;
