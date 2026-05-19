import React, { useCallback } from 'react';
import { SETTINGS, type SettingDef } from '@/config/settingsSchema';
import { useSettingsOverrides } from '@/hooks/useSettingsOverrides';

interface SettingsDrawerProps {
  open: boolean;
  onClose: () => void;
}

export const SettingsDrawer: React.FC<SettingsDrawerProps> = ({ open, onClose }) => {
  const { overrides, set, reset } = useSettingsOverrides();

  // Group settings by group
  const groupedSettings = SETTINGS.reduce((acc, setting) => {
    if (!acc[setting.group]) {
      acc[setting.group] = [];
    }
    acc[setting.group].push(setting);
    return acc;
  }, {} as Record<string, SettingDef[]>);

  // Get default value from import.meta.env
  const getDefaultValue = useCallback((key: string): string => {
    const value = (import.meta.env as Record<string, string | undefined>)[key];
    return value ?? '';
  }, []);

  // Render editor based on kind
  const renderEditor = (setting: SettingDef) => {
    const value = overrides[setting.key] ?? getDefaultValue(setting.key);

    const handleChange = (newValue: string) => {
      set(setting.key, newValue);
    };

    switch (setting.kind) {
      case 'boolean':
        return (
          <button
            onClick={() => handleChange(value === 'true' ? 'false' : 'true')}
            className={`px-3 py-1 rounded-full text-xs font-bold ${value === 'true' ? 'bg-[#FF4B4B] text-white' : 'bg-[#242E42] text-[#8B99AE]'}`}
          >
            {value === 'true' ? 'ON' : 'OFF'}
          </button>
        );
      case 'number':
        return (
          <input
            type="number"
            value={value}
            onChange={(e) => handleChange(e.target.value)}
            step={setting.step ?? 1}
            min={setting.min}
            max={setting.max}
            className="w-20 px-2 py-1 text-right text-sm bg-[#1A2234] border border-gray-700/50 rounded text-white"
          />
        );
      case 'enum':
        return (
          <div className="flex gap-1">
            {setting.enumValues?.map((opt) => (
              <button
                key={opt}
                onClick={() => handleChange(opt)}
                className={`px-2 py-1 text-xs font-bold rounded ${value === opt ? 'bg-[#FF4B4B] text-white' : 'bg-[#242E42] text-[#8B99AE]'}`}
              >
                {opt}
              </button>
            ))}
          </div>
        );
      case 'csv':
      case 'string':
      default:
        return (
          <input
            type="text"
            value={value}
            onChange={(e) => handleChange(e.target.value)}
            className="flex-1 px-2 py-1 text-sm bg-[#1A2234] border border-gray-700/50 rounded text-white"
          />
        );
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50" onClick={onClose}>
      <div
        className="w-full bg-[#171E2D] rounded-t-3xl border-t border-gray-700/50 max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700/50">
          <h2 className="text-white text-lg font-bold">Settings</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={reset}
              className="text-xs text-[#8B99AE] hover:text-white"
            >
              Reset all
            </button>
            <button
              onClick={onClose}
              className="text-white text-xl"
            >
              ×
            </button>
          </div>
        </div>

        {/* Body - Scrollable groups */}
        <div className="flex-1 overflow-y-auto p-4">
          {Object.entries(groupedSettings).map(([group, settings]) => (
            <div key={group} className="mb-6">
              <h3 className="text-[#8B99AE] text-xs font-bold uppercase tracking-wider mb-3">{group}</h3>
              <div className="flex flex-col gap-3">
                {settings.map((setting) => (
                  <div key={setting.key} className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="text-white text-sm font-medium">{setting.label}</div>
                      <div className="text-[#8B99AE] text-xs">
                        Default: {getDefaultValue(setting.key) || '(empty)'}
                      </div>
                      {setting.help && (
                        <div className="text-[#8B99AE] text-xs mt-0.5">{setting.help}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {overrides[setting.key] !== undefined && (
                        <button
                          onClick={() => set(setting.key, null)}
                          className="text-xs text-[#FF4B4B]"
                        >
                          Reset
                        </button>
                      )}
                      {renderEditor(setting)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-700/50">
          <div className="text-[#8B99AE] text-xs">
            Defaults loaded from .env (build time). Your overrides are stored in this browser only.
          </div>
        </div>
      </div>
    </div>
  );
};