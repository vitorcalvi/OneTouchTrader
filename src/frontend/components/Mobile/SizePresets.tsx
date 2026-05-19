interface SizePresetsProps {
  presets: string[];
  activePreset: string;
  onSelect: (preset: string) => void;
}

export function SizePresets({ presets, activePreset, onSelect }: SizePresetsProps) {
  return (
    <div className="flex gap-2 px-4 py-2 bg-gray-900">
      {presets.map((preset) => (
        <button
          key={preset}
          type="button"
          onClick={() => onSelect(preset)}
          className={`flex-1 px-3 py-2 rounded-md text-sm font-bold transition-colors ${
            activePreset === preset
              ? 'bg-green-600 text-white'
              : 'bg-gray-800 text-white border border-gray-700 hover:bg-gray-700'
          }`}
        >
          {preset}
        </button>
      ))}
    </div>
  );
}