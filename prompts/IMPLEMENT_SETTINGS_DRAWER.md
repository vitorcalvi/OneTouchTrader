# LLM Prompt — Implement Settings Drawer (`.env` config overrides)

You are adding an in-app **Settings drawer** to the Lean-FireupTrader mobile UI that lets the user override every client-side (`VITE_`-prefixed) env value at runtime. Source of truth is layered: **`.env` is the default → user overrides (localStorage) win when present**. Server-side secrets (Alpaca keys, Finnhub, Stripe) are **out of scope** and must never appear in this UI.

Repo root: `/Users/vitorcalvi/Desktop/Lean-FireupTrader`

## Decisions (locked — do not re-prompt the user)

| Topic | Choice |
|---|---|
| Editable vars | **`VITE_`-prefixed only.** Hide all server secrets. |
| Persistence | **`localStorage`** key `lean.settings.overrides.v1`, JSON-encoded `Record<string, string>`. |
| Icon placement | **Far-right of top header**, after the POWER block. |
| Apply mode | **Live** — changes flow through React state; no reload required. |
| Backend changes | **None.** Pure frontend feature. |

## Scope

### Create
- `src/frontend/components/Mobile/SettingsDrawer.tsx`
- `src/frontend/hooks/useSettingsOverrides.ts`
- `src/frontend/config/settingsSchema.ts`

### Modify
- `src/frontend/components/Mobile/StatusBar.tsx` — add gear icon slot
- `src/frontend/config/envConfig.ts` — overlay overrides on top of `import.meta.env` reads
- `src/frontend/pages/MobileTradingPage.tsx` — render `<SettingsDrawer />`, pass overrides context

### Do NOT touch
- `src/backend/**`
- `.env` itself (never write to disk)
- Any file under `services/` (they read from `envConfig.ts` already)

## Architecture

```
.env (build-time)                    localStorage (runtime overrides)
       │                                       │
       └──────────► envConfig.ts ◄─────────────┘
                          │
                          ▼
                   getEnvConfig()
                          │
                          ▼
                  React components
```

### 1. `useSettingsOverrides.ts`

```ts
const KEY = 'lean.settings.overrides.v1';

export function useSettingsOverrides() {
  const [overrides, setOverrides] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem(KEY) ?? '{}'); } catch { return {}; }
  });

  const set = useCallback((k: string, v: string | null) => {
    setOverrides(prev => {
      const next = { ...prev };
      if (v === null || v === '') delete next[k]; else next[k] = v;
      localStorage.setItem(KEY, JSON.stringify(next));
      window.dispatchEvent(new CustomEvent('lean:settings-changed', { detail: next }));
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    localStorage.removeItem(KEY);
    setOverrides({});
    window.dispatchEvent(new CustomEvent('lean:settings-changed', { detail: {} }));
  }, []);

  return { overrides, set, reset };
}
```

### 2. `envConfig.ts` — overlay helper

Add at the top of the file:

```ts
function readOverrides(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem('lean.settings.overrides.v1') ?? '{}'); }
  catch { return {}; }
}

function envValue(key: string): string | undefined {
  const o = readOverrides();
  if (o[key] != null && o[key] !== '') return o[key];
  return (import.meta.env as Record<string, string | undefined>)[key];
}
```

Then replace every `import.meta.env.VITE_X` read inside `getEnvConfig()` / `getTradingConfig()` with `envValue('VITE_X')`. Server-side reads (no `VITE_`) stay as-is.

`getEnvConfig()` must also subscribe to `lean:settings-changed` so memoized consumers can invalidate. Easiest: bump a module-level version counter on the event, and have a hook `useEnvVersion()` that React components subscribe to and re-read.

### 3. `settingsSchema.ts` — what shows in the UI

```ts
export type SettingKind = 'string' | 'number' | 'boolean' | 'enum' | 'csv';

export interface SettingDef {
  key: string;              // e.g. 'VITE_AUTO_STOP_LOSS_PCT'
  label: string;            // 'Auto Stop Loss %'
  kind: SettingKind;
  group: string;            // 'Risk' | 'Mobile UI' | 'Orders' | 'Layered Stops' | 'Ladder' | 'Fees' | 'Defaults'
  enumValues?: string[];    // for kind:'enum'
  min?: number; max?: number; step?: number; // for kind:'number'
  help?: string;
}

export const SETTINGS: SettingDef[] = [
  // === Defaults ===
  { key: 'VITE_DEFAULT_SYMBOL',        label: 'Default Symbol',        kind: 'string',  group: 'Defaults' },
  { key: 'VITE_DEFAULT_QTY',           label: 'Default Qty',           kind: 'number',  group: 'Defaults', min: 1 },
  { key: 'VITE_DEFAULT_TIME_IN_FORCE', label: 'Time In Force',         kind: 'enum',    group: 'Defaults', enumValues: ['day','gtc','ioc'] },
  { key: 'VITE_EXTENDED_HOURS',        label: 'Extended Hours',        kind: 'boolean', group: 'Defaults' },
  { key: 'VITE_ALPACA_IS_PAPER',       label: 'Paper Trading',         kind: 'boolean', group: 'Defaults', help: 'Same toggle as the PAPER/LIVE pill in the header.' },

  // === Mobile UI ===
  { key: 'VITE_MOBILE_DEFAULT_TICKERS', label: 'Watchlist Tickers',    kind: 'csv',     group: 'Mobile UI', help: 'Comma-separated, e.g. INTC,IREN' },
  { key: 'VITE_MOBILE_DEFAULT_PRESETS', label: 'Notional Presets ($)', kind: 'csv',     group: 'Mobile UI', help: 'e.g. 5K,10K,20K,40K' },
  { key: 'VITE_MOBILE_DEFAULT_PRESET',  label: 'Default Preset',       kind: 'string',  group: 'Mobile UI' },
  { key: 'VITE_MOBILE_DEFAULT_TIER',    label: 'Default Order Tier',   kind: 'enum',    group: 'Mobile UI', enumValues: ['M','L','S'] },
  { key: 'VITE_MOBILE_DEFAULT_OSL',     label: 'Default O-SL On',      kind: 'boolean', group: 'Mobile UI' },
  { key: 'VITE_MOBILE_PRICE_STEP_LARGE',label: 'Price Step Large',     kind: 'number',  group: 'Mobile UI', step: 0.01 },
  { key: 'VITE_MOBILE_PRICE_STEP_MID',  label: 'Price Step Mid',       kind: 'number',  group: 'Mobile UI', step: 0.01 },
  { key: 'VITE_MOBILE_PRICE_STEP_SMALL',label: 'Price Step Small',     kind: 'number',  group: 'Mobile UI', step: 0.001 },
  { key: 'VITE_ORDER_TYPE',             label: 'Order Type Order',     kind: 'csv',     group: 'Mobile UI', help: 'e.g. STOP,MARKET,LIMIT' },

  // === Orders ===
  { key: 'VITE_AGGRESSIVE_MODE',        label: 'Aggressive Mode',      kind: 'boolean', group: 'Orders' },
  { key: 'VITE_POLLING_INTERVAL',       label: 'Polling Interval (s)', kind: 'number',  group: 'Orders', min: 1, max: 60 },
  { key: 'VITE_STOP_SLIPPAGE_PCT',      label: 'Stop Slippage %',      kind: 'number',  group: 'Orders', step: 0.01 },

  // === Risk ===
  { key: 'VITE_AUTO_TAKE_PROFIT_PCT',   label: 'Auto TP %',            kind: 'number',  group: 'Risk', step: 0.05 },
  { key: 'VITE_AUTO_STOP_LOSS_PCT',     label: 'Auto SL %',            kind: 'number',  group: 'Risk', step: 0.05 },
  { key: 'VITE_BE_STOP_OFFSET',         label: 'BE Stop Offset',       kind: 'number',  group: 'Risk', step: 0.01 },
  { key: 'VITE_SL_STOP_OFFSET',         label: 'SL Stop Offset',       kind: 'number',  group: 'Risk', step: 0.01 },
  { key: 'VITE_TRAILING_STOP_DEFAULT_PCT', label: 'Trailing Stop %',   kind: 'number',  group: 'Risk', step: 0.05 },
  { key: 'VITE_TRAILING_STOP_MIN_PCT',  label: 'Trailing Min %',       kind: 'number',  group: 'Risk', step: 0.05 },
  { key: 'VITE_MAX_POSITION_SIZE_PERCENT', label: 'Max Position %',    kind: 'number',  group: 'Risk', min: 1, max: 100 },

  // === Layered Stops (L&F) ===
  { key: 'VITE_LAYER1_ENABLED',         label: 'L1 Enabled',           kind: 'boolean', group: 'Layered Stops' },
  { key: 'VITE_LAYER2_ENABLED',         label: 'L2 Enabled',           kind: 'boolean', group: 'Layered Stops' },
  { key: 'VITE_LAYER3_ENABLED',         label: 'L3 Enabled',           kind: 'boolean', group: 'Layered Stops' },
  { key: 'VITE_LAYER2_TRAIL_PCT',       label: 'L2 Trail %',           kind: 'number',  group: 'Layered Stops', step: 0.05 },
  { key: 'VITE_LAYER3_TRAIL_PCT',       label: 'L3 Trail %',           kind: 'number',  group: 'Layered Stops', step: 0.05 },

  // === Ladder ===
  { key: 'VITE_LADDER_PRICE_STEP',      label: 'Ladder Step',          kind: 'number',  group: 'Ladder', step: 0.01 },
  { key: 'VITE_LADDER_ORDER_COUNT',     label: 'Ladder Orders',        kind: 'number',  group: 'Ladder', min: 1, max: 10 },

  // === Fees ===
  { key: 'VITE_ALPACA_STOCKS_FEE',          label: 'Stocks Fee',         kind: 'number', group: 'Fees', step: 0.00001 },
  { key: 'VITE_ALPACA_CRYPTO_TAKER_FEE',    label: 'Crypto Taker Fee',   kind: 'number', group: 'Fees', step: 0.0001 },
  { key: 'VITE_ALPACA_CRYPTO_MAKER_FEE',    label: 'Crypto Maker Fee',   kind: 'number', group: 'Fees', step: 0.0001 },
];
```

### 4. `SettingsDrawer.tsx` — UI

- Slide-up sheet (use Radix Dialog or a CSS-only sheet — match existing dark theme).
- Header bar inside drawer:
  - Title: **Settings**
  - Right: **Reset all** button (clears localStorage overrides via `useSettingsOverrides().reset()`).
  - Far right: close (×).
- Body: grouped scrollable list. One section per `group`. Each row shows:
  - Label (bold)
  - `.env` default value in dim text (read from `import.meta.env[key]` directly, bypassing overrides)
  - Editor by `kind`:
    - `string` / `csv`: text input
    - `number`: numeric input with step
    - `boolean`: toggle switch
    - `enum`: pill segmented control
  - "Reset" mini-button per row (only visible if an override exists for that key)
- Footer: small note: `Defaults loaded from .env (build time). Your overrides are stored in this browser only.`

Styling: use the trade-* Tailwind tokens added in `prompts/UPDATE_MOBILE_UI.md` (`bg-trade-surface`, `border-trade-border`, `text-trade-text-dim`, `bg-trade-green`).

### 5. `StatusBar.tsx` — add gear

Append a 4th slot after the POWER block:

```tsx
<button
  aria-label="Settings"
  onClick={onOpenSettings}
  className="ml-2 p-2 -mr-2 text-trade-text-dim hover:text-white transition-colors"
>
  <span className="material-symbols-outlined text-xl">settings</span>
</button>
```

Pass `onOpenSettings` from `MobileTradingPage.tsx`. Add the Material Symbols font link to `index.html` if not already present:
```html
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet"/>
```

### 6. `MobileTradingPage.tsx` integration

```tsx
const [settingsOpen, setSettingsOpen] = useState(false);
// ...
<StatusBar ... onOpenSettings={() => setSettingsOpen(true)} />
// ...
<SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
```

Also: when overrides change, services that cached env (e.g. `AlpacaService`) need to be re-instantiated. Subscribe to `lean:settings-changed` at the page level and call `setService(new AlpacaService(getEnvConfig()))`. Don't re-instantiate on every keystroke — debounce 250ms.

## Validation checklist

After implementation, verify:

- [ ] Open `/mobile`. Gear icon visible far-right of header.
- [ ] Tap gear → drawer slides up showing 7 groups.
- [ ] Change `VITE_AUTO_STOP_LOSS_PCT` from `0.75` to `0.5`. Close drawer. Open O-SL preview → SL now uses 0.5%.
- [ ] Reload page → override persists.
- [ ] Per-row "Reset" returns the field to `.env` value.
- [ ] Drawer-level "Reset all" clears all overrides.
- [ ] Server secrets (ALPACA_PAPER_KEY etc.) are NOT in the drawer. Grep the schema file — must return 0 hits for non-VITE keys.
- [ ] `npm run lint` passes.
- [ ] No `any` types. Strong typing on `SettingDef` discriminated by `kind`.

## Out of scope

- Editing server-side secrets
- Per-symbol overrides
- Export/import settings JSON
- Backend persistence
- Tablet/desktop layout

## Commit

Single commit titled: `feat(mobile): add settings drawer for runtime .env overrides`.

PR description must list:
1. New files
2. Modified files
3. localStorage key used
4. Screenshot of drawer open
