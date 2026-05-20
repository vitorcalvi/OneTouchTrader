# PROMPT — Settings cleanup + License Gate

**For:** Laguna
**Date:** 2026-05-20
**Severity:** HIGH — `app-trader.dyagnosys.com` is currently usable WITHOUT any license, defeating the whole Stripe paywall.

---

## Diagnosis (verified by Claude before writing this)

### Issue 1 — Brokerage section is not deployed

User screenshots show Settings drawer with sections: DEFAULTS, MOBILE UI, LADDER, FEES. NO Brokerage section visible.

**Root cause:** Frontend Dokploy code dir is at commit `6d7ed039` (very old). Origin is at `ca4683e1` (your Brokerage commit). You never SSH'd + `git fetch + reset` + redeployed the frontend after committing — only the backend. **Framework Lesson 19 violation, again.**

Verified:
```bash
$ ssh vitor@192.168.1.45 'cd /etc/dokploy/applications/fireuptrader-fireupfrontend-ftw7a5/code && sudo git log --oneline -1 && sudo grep -c "Brokerage" src/frontend/config/settingsSchema.ts'
6d7ed039 fix(docker): use vite build directly to skip pre-existing TS errors
0
```

`grep -c Brokerage` returns 0 on the deployed code. It's not there.

### Issue 2 — Fees section needs full removal

Current schema has 3 fee fields (`src/frontend/config/settingsSchema.ts` lines 65–68):
- `VITE_ALPACA_STOCKS_FEE`
- `VITE_ALPACA_CRYPTO_TAKER_FEE`
- `VITE_ALPACA_CRYPTO_MAKER_FEE`

User wants these gone. Plus anything else fee-related you find (search the codebase for `Fee`, `fee`, `fees`, `stocks_fee`, `taker`, `maker`) — UI components, computation utils, P&L math, etc. Use judgment: if it computes/displays a fee number, delete it.

### Issue 3 — License gate exists in code but is NEVER wired into the app

`src/frontend/services/licensing/index.ts` exports `getLicense`, `setLicense`, `useLicense` — but **nothing imports them from App.tsx, main.tsx, or any other component**. So the app boots and is fully usable even with no JWT in localStorage. Stripe paywall is bypassable by literally just visiting the URL.

---

## User-confirmed decisions (do not re-litigate)

| Decision | Value |
|---|---|
| License gate UX | **Full-screen modal blocking everything**. App shows only paste-license + "Buy" link until a valid JWT is in localStorage. |
| Fees removal | **Remove entire Fees section + any fee-related UI/computation** elsewhere in the app. Use judgment to catch them all. |
| Brokerage position | **Top of Settings drawer**, above Defaults. |

---

## Item 1 — Wire the License Gate (HIGHEST PRIORITY)

### Goal

`https://app-trader.dyagnosys.com/` should be UNUSABLE without a valid license JWT. Full-screen modal overlay until license is present + valid (signature checked + `exp > now`).

### Implementation

Create `src/frontend/components/LicenseGate.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { getLicense, setLicense, clearLicense } from '../services/licensing';

function decodePayload(jwt: string): { exp?: number; tier?: string } | null {
  try {
    const parts = jwt.split('.');
    if (parts.length !== 3) return null;
    return JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
  } catch { return null; }
}

function isLicenseValid(jwt: string | null): boolean {
  if (!jwt) return false;
  const p = decodePayload(jwt);
  if (!p?.exp) return false;
  return p.exp * 1000 > Date.now();
}

export function LicenseGate({ children }: { children: React.ReactNode }) {
  const [license, setLicenseState] = useState<string | null>(getLicense());
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Capture #license=... from URL hash on first load
  useEffect(() => {
    if (window.location.hash.startsWith('#license=')) {
      const fromHash = decodeURIComponent(window.location.hash.slice('#license='.length));
      if (isLicenseValid(fromHash)) {
        setLicense(fromHash);
        setLicenseState(fromHash);
        history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    }
  }, []);

  // Background refresh check every 5 min — if invalid, clear and re-gate
  useEffect(() => {
    if (!license) return;
    const t = setInterval(() => {
      if (!isLicenseValid(getLicense())) {
        clearLicense();
        setLicenseState(null);
      }
    }, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [license]);

  if (isLicenseValid(license)) return <>{children}</>;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#0a0a0a', zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
    }}>
      <div style={{ maxWidth: 560, width: '100%' }}>
        <h1 style={{ color: '#fafafa', fontSize: '2rem', marginBottom: '0.5rem' }}>License required</h1>
        <p style={{ color: '#a1a1aa', marginBottom: '2rem' }}>
          Paste your Fireup Trader license token to continue. Don't have one?{' '}
          <a href="https://trader.dyagnosys.com" style={{ color: '#22c55e' }}>Start a 14-day free trial</a>.
        </p>
        <textarea
          value={input}
          onChange={(e) => { setInput(e.target.value); setError(null); }}
          placeholder="eyJhbGciOiJIUzI1NiJ9…"
          rows={5}
          style={{
            width: '100%', padding: '1rem', borderRadius: 8,
            background: '#111', color: '#fafafa', border: '1px solid #3a3a3a',
            fontFamily: 'monospace', fontSize: '0.85rem', marginBottom: '0.5rem',
          }}
        />
        {error && <p style={{ color: '#fca5a5', marginBottom: '1rem' }}>{error}</p>}
        <button
          className="btn"
          onClick={() => {
            const v = input.trim();
            if (!isLicenseValid(v)) {
              setError('Invalid or expired license. Check the token and try again.');
              return;
            }
            setLicense(v);
            setLicenseState(v);
            setInput('');
          }}
          style={{
            background: '#22c55e', color: '#0a0a0a', padding: '0.75rem 1.5rem',
            border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Unlock app
        </button>
        <p style={{ color: '#666', fontSize: '0.875rem', marginTop: '2rem' }}>
          Lost your license? <a href="https://trader.dyagnosys.com/recover" style={{ color: '#22c55e' }}>Recover it</a>.
        </p>
      </div>
    </div>
  );
}
```

Then wrap the app entry in `src/frontend/main.tsx` (or wherever `<App />` mounts):

```tsx
import { LicenseGate } from './components/LicenseGate';
// ...
root.render(
  <StrictMode>
    <LicenseGate>
      <App />
    </LicenseGate>
  </StrictMode>
);
```

**Important:** the gate ONLY checks signature claims that the client can read (exp, tier) — it does NOT verify HMAC signature client-side (no shared secret on client). That's fine because:
- Faking a JWT with future `exp` lets you SEE the UI but every backend API call still gets verified server-side (the backend already enforces JWT via `jwtVerify`).
- A fake JWT can't trade anything — backend rejects.
- This is just the "show/hide UI" gate. Real enforcement is server-side.

### Verification

After deploy:
1. Open `https://app-trader.dyagnosys.com/` in an incognito window → should see full-screen "License required" modal, NOT the trade card.
2. Open `https://app-trader.dyagnosys.com/#license=<expired-jwt>` → should show the modal (expired = invalid).
3. Paste a valid JWT (from the Stripe test flow) → click "Unlock app" → trade card appears.
4. Open DevTools → Application → Local Storage → confirm `fireup_license` is set.
5. Reload → trade card stays unlocked.
6. Manually clear `fireup_license` in DevTools → reload → modal returns.

---

## Item 2 — Remove all Fees from app

### Files to edit

1. **`src/frontend/config/settingsSchema.ts`** — delete the `// === Fees ===` block (lines 65–68) and remove `| 'Fees'` from the group union type comment on line 7.

2. **Search and destroy** — run:
   ```bash
   grep -rni "fee\|VITE_ALPACA_STOCKS_FEE\|CRYPTO_TAKER_FEE\|CRYPTO_MAKER_FEE" src/frontend src/backend --include="*.ts" --include="*.tsx" --include="*.mjs" --include="*.js"
   ```
   Review every match. Delete fee-related computation, display, props, prop-types. Keep what's not fee-related (e.g. `Coffee` would be a false positive).

3. **`.env` / `.env.example`** — remove the `VITE_ALPACA_*_FEE` lines if present.

4. **Backend env** — if backend reads any FEE envs (probably not, but check), remove from Dokploy backend env via `application.saveEnvironment` (preserve all other vars). 

5. **P&L display** — if there's a "Net P&L (after fees)" calculation anywhere, simplify to just "P&L". Pure P&L from Alpaca prices, no client-side fee math.

### Verification

- `grep -rn "fee\|Fee" src/frontend src/backend --include="*.ts" --include="*.tsx" --include="*.mjs"` returns only false positives (variable names with "Fee" as substring of something else, comments, etc.) — no live fee computation or UI.
- Settings drawer no longer shows the Fees section.
- Build succeeds, tests pass (if any).

---

## Item 3 — Ship Brokerage section (deploy what's already in code) + move to top

### Already done in code (commit `ca4683e1`)

- `src/frontend/config/settingsSchema.ts` has the 4 Brokerage fields.
- `src/frontend/components/Mobile/SettingsDrawer.tsx` has the warning banner code for `def.group === 'Brokerage'`.
- `src/frontend/config/envConfig.ts` reads Alpaca keys from `localStorage` overrides first.

### What's missing

1. **Brokerage doesn't appear in the deployed app** because frontend was never redeployed (Issue 1 root cause). Fix in deploy step below.

2. **Section ordering** — currently appears wherever the schema places it. User wants it at the TOP, above Defaults.

   Find where the SettingsDrawer renders groups in order. If it iterates `SCHEMA` in array order, simply move the Brokerage block to the top of `settingsSchema.ts` (above `// === Defaults ===`). If it has an explicit `SECTION_ORDER` array somewhere, put `'Brokerage'` first.

3. **Warning banner copy** — verify it says something like: "⚠ Your Alpaca API keys are stored ONLY in your browser's localStorage. They never reach our servers. Clearing browser data or switching device requires re-entering them. We cannot recover them for you." Make the warning visually prominent (red/amber border, NOT muted grey).

4. **Header PAPER/LIVE pill must route to the correct key set.** Check `envConfig.ts` — when mode is paper, the Alpaca SDK should be initialized with `alpaca_paper_*` from localStorage. When live, `alpaca_live_*`. If the user only has paper keys and toggles to LIVE, show a blocking modal: "Add your Live API keys in Settings → Brokerage before switching to live trading."

### Verification

- Open Settings → Brokerage is the FIRST section.
- Warning banner is visible and visually loud.
- Enter paper key + secret → save → reload → keys persist.
- Toggle PAPER/LIVE in header → Alpaca SDK uses the corresponding key pair (verify by attempting a small paper order; with valid paper keys it should succeed).

---

## Deploy procedure (use Lesson 19 — DO NOT SKIP)

```bash
# Push any new code changes
cd /Users/vitorcalvi/Desktop/Lean-FireupTrader
git status                       # confirm what you're about to commit
git add <files>
git commit -m "Add LicenseGate + remove Fees + Brokerage to top of Settings

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
git push origin main

# FORCE Dokploy frontend code dir to sync (this is the step you skipped last time)
ssh vitor@192.168.1.45 'cd /etc/dokploy/applications/fireuptrader-fireupfrontend-ftw7a5/code && sudo git fetch origin main && sudo git reset --hard origin/main && sudo git log --oneline -1'

# Trigger frontend redeploy
KEY="BloSEYydevQesKwQvpKrhHvTcRUPmLTQvRHkoipsSrlKObcMUdOGCHvcGLwHYKZW"
curl -sS -X POST -H "x-api-key: $KEY" -H "Content-Type: application/json" \
  http://192.168.1.45:3000/api/trpc/application.deploy \
  -d '{"json":{"applicationId":"KKSW0HrBYJx9OEnyBT4bz"}}'

# Poll until done
until [ "$(curl -sS -H "x-api-key: $KEY" "http://192.168.1.45:3000/api/trpc/application.one?input=%7B%22json%22%3A%7B%22applicationId%22%3A%22KKSW0HrBYJx9OEnyBT4bz%22%7D%7D" | python3 -c "import sys,json;print(json.load(sys.stdin)['result']['data']['json']['applicationStatus'])")" != "running" ]; do sleep 20; done
```

If backend also changes (e.g. you delete a fee env or modify backend code), repeat for backend `buvl-yIURNK0jWIGSGj03` with the same SSH + deploy dance.

---

## CLI smoke tests (must pass before claiming done)

```bash
# 1. Frontend now actually contains the new code
curl -sSL https://app-trader.dyagnosys.com/ | grep -oE "LicenseGate|License required|Brokerage|alpaca_paper_key_id" | sort -u | head -5
# Expect: at least "License required" or "Brokerage" matches

# 2. No fee strings left in served bundle
curl -sSL https://app-trader.dyagnosys.com/ > /tmp/app.html
node -e "const fs=require('fs'); const html=fs.readFileSync('/tmp/app.html','utf8'); console.log('fee matches:', (html.match(/Fee|fee/g)||[]).length)"
# Expect: 0 or only minor false positives (e.g. "feed", "feedback")

# 3. Backend healthy
curl -sS https://api-trader.dyagnosys.com/healthz

# 4. LP unaffected
curl -sS -o /dev/null -w "%{http_code}\n" https://trader.dyagnosys.com/
```

---

## Browser e2e (ASK USER after CLI tests pass)

Tell the user:

> Three things to verify in a browser:
>
> **A — License gate works.** Open https://app-trader.dyagnosys.com/ in an incognito window. You should see ONLY a "License required" modal — no trade card visible. Confirm.
>
> **B — Paste-license unlock works.** Paste your existing JWT (from the prior Stripe test) into the modal, click Unlock. Trade card should appear. Reload — should stay unlocked.
>
> **C — Brokerage section is visible.** Open Settings → confirm "Brokerage" is the TOP section, has 4 password fields (Paper key/secret + Live key/secret), and a prominent localStorage warning banner. No "Fees" section anywhere.
>
> Reply with what you see / where it breaks.

---

## Documentation to update

1. **`PROMPT_DEPLOY_DOKPLOY_FRAMEWORK.md`** — add a new lesson:
   > **Lesson — Frontend and backend are separate Dokploy applications.** Pushing code that touches BOTH does not deploy both. You must SSH `git fetch + reset` AND `application.deploy` for EACH affected appId. Catalogue your changes by file path, map paths to appIds, redeploy each. Frontend appId: `KKSW0HrBYJx9OEnyBT4bz` (`/src/frontend/`), Backend appId: `buvl-yIURNK0jWIGSGj03` (`/src/backend/`), LP appId: `t266R-pA5Ez_Ij4MUuTbs` (separate repo `dyagnosys-trader-lp`).

2. **`EXECUTION_REPORT_DEPLOY_V2.md`** — add §9 "Settings cleanup + license gate" with commit hash, smoke test outputs, and user's browser confirmation.

---

## Rules

- Rule 9b: no `docker run` fallback.
- Run `npm run build` (or whatever the frontend build is) locally before pushing. Catch TS errors before Dokploy.
- SSH `git fetch + reset` before EVERY `application.deploy` — frontend AND backend if you touched both.
- Don't claim Brokerage section is "deployed" because it's in the source code. Verify the served bundle contains the strings.
- Don't ship the license gate without testing in incognito. localStorage from your own browser will mask whether the gate actually blocks new visitors.
- Don't change the license-gate logic to bypass with a magic env var "for testing". Real gate or no gate.

---

## What success looks like

- `https://app-trader.dyagnosys.com/` in incognito = full-screen License Required modal, nothing else.
- After pasting a valid JWT → trade card appears.
- Settings drawer: Brokerage at top (4 password fields + loud warning), no Fees section anywhere.
- All grep checks for "fee" in served HTML return only false positives.
- User confirms A + B + C in browser.

Estimated time: ~3h for all three items, including the deploy dance and smoke tests.
