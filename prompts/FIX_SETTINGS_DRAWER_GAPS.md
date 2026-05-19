# LLM Prompt — Finish the Settings Drawer (4 gaps)

You are completing a partially-implemented Settings drawer feature in Lean-FireupTrader (`/Users/vitorcalvi/Desktop/Lean-FireupTrader`). The shell is in place but four pieces are missing or broken. **Do not redesign** — finish what's started.

## Current state (already done — do NOT redo)

- `src/frontend/components/Mobile/StatusBar.tsx` — gear button with `onOpenSettings` prop is wired (lines 9, 48-56). Renders `<span class="material-symbols-outlined">settings</span>`.
- `src/frontend/config/envConfig.ts` — overlay layer is in place:
  - `readOverrides()` reads `lean.settings.overrides.v1` from localStorage.
  - `envValue(key)` picks override-first, falls back to `import.meta.env`.
  - All `getEnvConfig()` / `getTradingConfig()` reads go through `envValue()`.
  - A `lean:settings-changed` window event handler increments a `envVersion` counter (currently unused).

## Required spec for the four gaps

Read `prompts/IMPLEMENT_SETTINGS_DRAWER.md` for the full design. The locked decisions are:
- VITE_-prefixed vars only (no server secrets in UI)
- localStorage persistence under key `lean.settings.overrides.v1`
- Live apply (no reload)
- Gear far-right of top header (already done)

## Gaps to fix

### Gap 1 — `index.html`: Material Symbols font is not loaded

The gear icon currently renders as the literal text `settings` because the icon font isn't pulled in.

In `/Users/vitorcalvi/Desktop/Lean-FireupTrader/index.html`, add inside `<head>`, before the existing `<title>`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap" rel="stylesheet" />
```

**Validation:** load `/mobile`, the gear should now render as an icon, not the word "settings".

### Gap 2 — Subscriber hook so overrides actually re-render React

Currently `envVersion++` in `envConfig.ts:48` fires but nothing reacts to it, so changing a setting does nothing visible until full reload.

**a.** In `src/frontend/config/envConfig.ts`, replace the existing event listener block with a subscriber set, and export both a getter and a subscribe function:

```ts
let envVersion = 0;
const subscribers = new Set<() => void>();

if (typeof window !== 'undefined') {
  window.addEventListener('lean:settings-changed', () => {
    envVersion++;
    subscribers.forEach(fn => fn());
  });
}

export function getEnvVersion(): number {
  return envVersion;
}

export function subscribeEnvChanges(fn: () => void): () => void {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}
```

**b.** Create `src/frontend/hooks/useEnvVersion.ts`:

```ts
import { useSyncExternalStore } from 'react';
import { getEnvVersion, subscribeEnvChanges } from '@/config/envConfig';

export function useEnvVersion(): number {
  return useSyncExternalStore(subscribeEnvChanges, getEnvVersion, getEnvVersion);
}
```

**c.** In `src/frontend/pages/MobileTradingPage.tsx`, call `useEnvVersion()` at the top of the component. Use the returned number as a dependency for the memo that builds `env`, `tradingCfg`, `mobileCfg`, and the `service` (debounced 250ms — do not re-instantiate `AlpacaService` on every keystroke).

Sketch:
```tsx
const envVersion = useEnvVersion();

const env = useMemo(() => getEnvConfig(), [envVersion]);
const tradingCfg = useMemo(() => getTradingConfig(), [envVersion]);

useEffect(() => {
  const t = setTimeout(() => setService(new AlpacaService(getEnvConfig())), 250);
  return () => clearTimeout(t);
}, [envVersion]);
```

**Validation:** open drawer, change `VITE_DEFAULT_SYMBOL` from `INTC` to `MU`. The active symbol pill in the ticker selector should reflect new default on next selection without reloading.

### Gap 3 — Create the three missing files

Files to create exactly as specified in `IMPLEMENT_SETTINGS_DRAWER.md`:

1. `src/frontend/hooks/useSettingsOverrides.ts` — copy the implementation from the parent prompt verbatim.
2. `src/frontend/config/settingsSchema.ts` — copy the `SETTINGS` array verbatim.
3. `src/frontend/components/Mobile/SettingsDrawer.tsx` — implement as below.

**`SettingsDrawer.tsx` — hand-rolled sheet (no new dependencies)**

Do not install `@radix-ui/react-dialog`. Use a fixed-position div with backdrop:

```tsx
import { useEffect, useMemo, useState } from 'react';
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
      <div className="bg-trade-dark border-t border-trade-border rounded-t-2xl max-h-[85vh] flex flex-col">
        <header className="flex items-center justify-between px-4 py-3 border-b border-trade-border">
          <h2 className="text-white font-bold text-lg">Settings</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { if (confirm('Reset all overrides?')) reset(); }}
              className="text-trade-text-dim text-xs font-bold px-3 py-1 rounded-full border border-trade-border"
            >
              Reset all
            </button>
            <button
              aria-label="Close"
              onClick={onClose}
              className="text-trade-text-dim hover:text-white text-2xl leading-none px-2"
            >×</button>
          </div>
        </header>

        <div className="overflow-y-auto px-4 py-3 flex-1">
          {groups.map(([group, items]) => (
            <section key={group} className="mb-5">
              <h3 className="text-trade-text-dim text-xs font-bold uppercase tracking-wider mb-2">{group}</h3>
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
          <p className="text-trade-text-dim text-[10px] py-3">
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
    <div className="bg-trade-surface border border-trade-border rounded-xl p-3">
      <div className="flex items-baseline justify-between mb-1">
        <label className="text-white text-sm font-semibold">{def.label}</label>
        <span className="text-trade-text-dim text-[10px] font-mono">
          {defaultValue ?? '∅'} <span className="opacity-50">(.env)</span>
        </span>
      </div>
      {def.help && <p className="text-trade-text-dim text-[11px] mb-2">{def.help}</p>}
      <div className="flex items-center gap-2">
        <Editor def={def} value={current} onChange={onChange} />
        {isOverridden && (
          <button
            onClick={() => onChange(null)}
            className="text-trade-text-dim text-[10px] font-bold px-2 py-1 rounded border border-trade-border"
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
            on ? 'bg-trade-green text-black' : 'bg-trade-surface border border-trade-border text-trade-text-dim'
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
                value === opt ? 'bg-trade-green text-black' : 'border border-trade-border text-trade-text-dim'
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
          className="flex-1 bg-trade-dark border border-trade-border rounded px-2 py-1 text-white text-sm font-mono"
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
          className="flex-1 bg-trade-dark border border-trade-border rounded px-2 py-1 text-white text-sm font-mono"
        />
      );
  }
}
```

Then in `src/frontend/pages/MobileTradingPage.tsx`:
- Add `const [settingsOpen, setSettingsOpen] = useState(false);`
- Pass `onOpenSettings={() => setSettingsOpen(true)}` to `<StatusBar />` (the prop already exists).
- Render `<SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />` at the end of the component tree.

### Gap 4 — POWER label vs source

`StatusBar.tsx:45` currently shows `account.equity` as POWER. Mockup label is **POWER** → should be **buying power**.

Change line 45 from:
```tsx
${account ? Math.round(parseFloat(account.equity)).toLocaleString() : '—'}
```
to:
```tsx
${account ? Math.round(parseFloat(account.buying_power)).toLocaleString() : '—'}
```

## Validation

After implementation:

- [ ] Gear icon renders as a glyph, not the word "settings".
- [ ] Tap gear → drawer slides up from bottom, semitransparent backdrop above it.
- [ ] All ~30 VITE_ vars listed under 7 groups (Defaults / Mobile UI / Orders / Risk / Layered Stops / Ladder / Fees).
- [ ] Change `VITE_AUTO_STOP_LOSS_PCT` from 0.75 to 0.5 → close drawer → submit an O-SL → new order uses 0.5%, **no page reload**.
- [ ] Per-row "Reset" disappears once override removed.
- [ ] "Reset all" wipes the localStorage key and reverts every row.
- [ ] Escape key and backdrop click both close the drawer.
- [ ] POWER number matches `account.buying_power` from Alpaca, not equity.
- [ ] `grep -E "ALPACA_PAPER|ALPACA_LIVE|STRIPE|FINNHUB" src/frontend/config/settingsSchema.ts` returns 0 matches.
- [ ] `npm run lint` and `npm run build` both pass.

## Out of scope
- Backend persistence
- Editing server secrets
- Tablet/desktop layout
- Per-symbol overrides

## Commit
`feat(mobile): finish settings drawer (subscriber hook, drawer UI, font, buying_power)`

PR description must list:
1. Files created
2. Files modified
3. Before/after screenshots of the header (gear icon working) and the open drawer.
