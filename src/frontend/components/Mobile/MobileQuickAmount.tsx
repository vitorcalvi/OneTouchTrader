import { type FC } from 'react';

interface MobileQuickAmountProps {
  presets: string[];
  activePreset: string;
  onPresetSelect: (preset: string) => void;
}

const MobileQuickAmount: FC<MobileQuickAmountProps> = ({
  presets,
  activePreset,
  onPresetSelect,
}) => {
  return (
    <div className="grid grid-cols-4 gap-2">
      {presets.map((preset) => (
        <button
          key={preset}
          type="button"
          className={`rounded-xl py-3 font-bold text-base ${
            preset === activePreset
              ? 'bg-[#25D366] text-white border border-[#25D366] shadow-[0_0_20px_rgba(37,211,102,0.4)]'
              : 'bg-[#242E42] border border-white/5 text-[#8B99AE]'
          }`}
          onClick={() => onPresetSelect(preset)}
        >
          {preset}
        </button>
      ))}
    </div>
  );
};

export { MobileQuickAmount };