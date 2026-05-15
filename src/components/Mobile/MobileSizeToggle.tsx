import React from 'react';

interface MobileSizeToggleProps {
  activeTier: 'M' | 'L' | 'S';
  onTierChange: (tier: 'M' | 'L' | 'S') => void;
}

export const MobileSizeToggle: React.FC<MobileSizeToggleProps> = ({ 
  activeTier, 
  onTierChange 
}) => {
  return (
    <div className="flex bg-[#1A2234] rounded-xl border border-gray-700/50 p-1 w-full">
      <button
        type="button"
        onClick={() => onTierChange('S')}
        className={`flex-1 text-[11px] font-bold tracking-widest py-2.5 rounded-lg transition-colors ${
          activeTier === 'S' 
            ? 'bg-[#25D366] text-white border border-[#25D366] shadow-[0_0_15px_rgba(37,211,102,0.3)]' 
            : 'text-[#8B99AE]'
        }`}
      >
        STOP LIMIT
      </button>
      <button
        type="button"
        onClick={() => onTierChange('L')}
        className={`flex-1 text-[11px] font-bold tracking-widest py-2.5 rounded-lg transition-colors ${
          activeTier === 'L' 
            ? 'bg-[#25D366] text-white border border-[#25D366] shadow-[0_0_15px_rgba(37,211,102,0.3)]' 
            : 'text-[#8B99AE]'
        }`}
      >
        LIMIT
      </button>
      <button
        type="button"
        onClick={() => onTierChange('M')}
        className={`flex-1 text-[11px] font-bold tracking-widest py-2.5 rounded-lg transition-colors ${
          activeTier === 'M' 
            ? 'bg-[#25D366] text-white border border-[#25D366] shadow-[0_0_15px_rgba(37,211,102,0.3)]' 
            : 'text-[#8B99AE]'
        }`}
      >
        MARKET
      </button>
    </div>
  );
};