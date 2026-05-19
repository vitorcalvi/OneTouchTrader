import { useEffect, useMemo } from 'react';
import { SETTINGS, type SettingDef } from '@/config/settingsSchema';
import { useSettingsOverrides } from '@/hooks/useSettingsOverrides';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function SettingsDrawer({ open, onClose }: Props) {
  const { overrides, set, reset } = useSettingsOverrides();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const groups = useMemo(() => {
    const m = new Map<string, SettingDef[]>();
    SETTINGS.forEach(s => {
      if (!m.has(s.group)) m.set(s.group, []);
      m.get(s.group)!.push(s);
    });
    return Array.from(m.entries());
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col" role="dialog" aria-modal="true">
      <button
        aria-label="Close settings"
        className="flex-1 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="bg-[#0B1120] border-t border-gray-700/50 rounded-t-2xl max-h-[85vh] flex flex-col">
        <header className="flex items-center justify-between px-4 py-3 border-b border-gray-700/50">
          <h2 className="text-white font-bold text-lg">Settings</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { if (confirm('Reset all overrides?')) reset(); }}
              className="text-[#8B99AE] text-xs font-bold px-3 py-1 rounded-full border border-gray-700/50"
            >
              Reset all
            </button>
            <button
              aria-label="Close"
              onClick={onClose}
              className="text-[#8B99AE] hover:text-white text-2xl leading-none px-2"
            >×</button>
          </div>
        </header>

        <div className="overflow-y-auto px-4 py-3 flex-1">
          {groups.map(([group, items]) => (
            <section key={group} className="mb-5">
              <h3 className="text-[#8B99AE] text-xs font-bold uppercase tracking-wider mb-2">{group}</h3>
              <div className="flex flex-col gap-2">
                {items.map(def => (
                  <SettingRow
                    key={def.key}
                    def={def}
                    override={overrides[def.key]}
                    defaultValue={import.meta.env[def.key] as string | undefined}
                    onChange={(v) => set(def.key, v)}
                  />
                ))}
              </div>
            </section>
          ))}
          <p className="text-[#8B99AE] text-[10px] py-3">
            Defaults loaded from .env (build time). Your overrides are stored in this browser only.
          </p>
        </div>
      </div>
    </div>
  );
}

function SettingRow({
  def, override, defaultValue, onChange,
}: {
  def: SettingDef;
  override: string | undefined;
  defaultValue: string | undefined;
  onChange: (v: string | null) => void;
}) {
  const current = override ?? defaultValue ?? '';
  const isOverridden = override != null && override !== '';

  return (
    <div className="bg-[#1A2234] border border-gray-700/50 rounded-xl p-3">
      <div className="flex items-baseline justify-between mb-1">
        <label className="text-white text-sm font-semibold">{def.label}</label>
        <span className="text-[#8B99AE] text-[10px] font-mono">
          {defaultValue ?? '∅'} <span className="opacity-50">(.env)</span>
        </span>
      </div>
      {def.help && <p className="text-[#8B99AE] text-[11px] mb-2">{def.help}</p>}
      <div className="flex items-center gap-2">
        <Editor def={def} value={current} onChange={onChange} />
        {isOverridden && (
          <button
            onClick={() => onChange(null)}
            className="text-[#8B99AE] text-[10px] font-bold px-2 py-1 rounded border border-gray-700/50"
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}

function Editor({
  def, value, onChange,
}: { def: SettingDef; value: string; onChange: (v: string | null) => void }) {
  switch (def.kind) {
    case 'boolean': {
      const on = value.toLowerCase() === 'true';
      return (
        <button
          onClick={() => onChange(on ? 'false' : 'true')}
          className={`px-3 py-1.5 rounded-full text-xs font-bold ${
            on ? 'bg-[#25D366] text-black' : 'bg-[#1A2234] border border-gray-700/50 text-[#8B99AE]'
          }`}
        >{on ? 'ON' : 'OFF'}</button>
      );
    }
    case 'enum':
      return (
        <div className="flex gap-1">
          {def.enumValues!.map(opt => (
            <button
              key={opt}
              onClick={() => onChange(opt)}
              className={`px-3 py-1 rounded-full text-[11px] font-bold ${
                value === opt ? 'bg-[#25D366] text-black' : 'border border-gray-700/50 text-[#8B99AE]'
              }`}
            >{opt}</button>
          ))}
        </div>
      );
    case 'number':
      return (
        <input
          type="number"
          value={value}
          step={def.step}
          min={def.min}
          max={def.max}
          onChange={e => onChange(e.target.value)}
          className="flex-1 bg-[#0B1120] border border-gray-700/50 rounded px-2 py-1 text-white text-sm font-mono"
        />
      );
    case 'csv':
    case 'string':
    default:
      return (
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="flex-1 bg-[#0B1120] border border-gray-700/50 rounded px-2 py-1 text-white text-sm font-mono"
        />
      );
  }
}