# PROMPT — Post-launch polish (4 items)

**For:** Laguna
**Date:** 2026-05-20
**Status of prior rounds:** Stripe checkout + JWT licensing verified working end-to-end by user in browser. JWT delivered, app loaded with license. This round addresses 4 follow-ups the user surfaced after the smoke test.

---

## Items to ship

| # | What | Where | User-action gate? |
|---|---|---|---|
| 1 | `/recover` shows no UI feedback after submit | trader-lp repo | No |
| 2 | Recovery email sender → `recovery@dyagnosys.com` | OneTouchTrader backend + DNS | **YES — ask user** |
| 3 | Swap `RESEND_API_KEY` to the new key user provided | Dokploy backend env | No |
| 4 | Add Brokerage / API Keys section to app Settings (Paper + Live, with localStorage warning) | OneTouchTrader frontend (`src/frontend/config/settingsSchema.ts` + Settings panel) | No |

---

## Item 1 — `/recover` UI feedback

### Symptom

User opened `https://trader.dyagnosys.com/recover/`, submitted email, got no visual confirmation. Backend correctly returned `{"ok":true}` but the page didn't tell the user anything happened.

### Fix

Open `trader-lp/src/pages/recover.astro`. The current form likely posts but doesn't update the DOM. Replace the page with this pattern (client-side fetch + status UI, matching how we did `/license`):

```astro
---
import Base from '../layouts/Base.astro';
---
<Base title="Recover license — Fireup Trader">
  <section style="padding: 4rem 1rem; min-height: 70vh;">
    <div style="max-width: 560px; margin: 0 auto;">
      <h1 style="margin-bottom: 1rem;">Recover your license</h1>
      <p style="color: #a1a1aa; margin-bottom: 2rem;">
        Enter the email you paid with. If a subscription exists, we'll email you a fresh license token.
      </p>

      <form id="recover-form" class="grid gap-4" style="margin-bottom: 2rem;">
        <input
          id="email"
          type="email"
          required
          placeholder="you@example.com"
          style="padding: 1rem; border-radius: 8px; border: 1px solid #3a3a3a; background: #111; color: #fafafa; font-size: 1rem;"
        />
        <button id="submit-btn" type="submit" class="btn">Send recovery email</button>
      </form>

      <div id="status" role="status" aria-live="polite" style="display: none; padding: 1rem; border-radius: 8px;"></div>
    </div>
  </section>

  <script is:inline>
    const form = document.getElementById('recover-form');
    const btn = document.getElementById('submit-btn');
    const statusEl = document.getElementById('status');

    function showStatus(message, kind) {
      statusEl.style.display = 'block';
      statusEl.style.background = kind === 'error' ? '#3f1d1d' : '#1d3f24';
      statusEl.style.color = kind === 'error' ? '#fca5a5' : '#86efac';
      statusEl.textContent = message;
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('email').value.trim();
      if (!email) return;

      btn.disabled = true;
      const original = btn.textContent;
      btn.textContent = 'Sending…';
      statusEl.style.display = 'none';

      try {
        const r = await fetch('https://api-trader.dyagnosys.com/recover-license', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        const data = await r.json().catch(() => ({}));
        if (r.ok && data.ok) {
          showStatus("If a subscription exists for this email, you'll receive a license shortly. Check spam.", 'ok');
          form.reset();
        } else if (r.status === 429) {
          showStatus('Too many attempts. Try again in an hour.', 'error');
        } else {
          showStatus('Could not process request. Try again.', 'error');
        }
      } catch (err) {
        showStatus('Network error. Try again.', 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = original;
      }
    });
  </script>
</Base>
```

Important: the success message is **deliberately ambiguous** about whether the email exists — privacy + prevents email enumeration. Do not change this wording.

### Verify

```bash
cd /Users/vitorcalvi/Desktop/Lean-FireupTrader/trader-lp
npm run build
grep -q "recover-license" dist/recover/index.html && echo "OK: script bundled"
```

---

## Item 2 — Recovery email sender → `recovery@dyagnosys.com`

### Current

Backend code (`src/backend/alpaca/server-refactored.mjs`) sends from `Fireup Trader <noreply@trader.dyagnosys.com>`. User wants:

```
Fireup Trader <recovery@dyagnosys.com>
```

### Why this is a user-action gate

Resend requires the sending domain (`dyagnosys.com`) to be **verified** in their dashboard with the right DNS records (SPF, DKIM, and usually a return-path CNAME) before it'll send from any address on it. Until the user verifies, all recovery emails will silently fail or be rejected.

**Before changing any code, ask the user:**

> "To send recovery emails from `recovery@dyagnosys.com`, the `dyagnosys.com` domain must be verified in your Resend account. This requires adding ~3 DNS records (SPF/DKIM/return-path CNAME) to the `dyagnosys.com` Cloudflare zone (zone_id `6bfab97085a8ff18be42968855a0cdc8`). Two options:
>
> **A)** You add the domain in Resend Dashboard → Domains → Add Domain → paste the records they show; I can add them via Cloudflare API once you give me the values.
>
> **B)** I add the domain to Resend via their API (needs a Resend admin token, not just the send-key), then add DNS records via Cloudflare API automatically.
>
> Which?"

After user picks an option and the domain is verified in Resend:

1. Update the two `resend.emails.send({ from: ... })` calls in `src/backend/alpaca/server-refactored.mjs`:
   ```js
   from: 'Fireup Trader <recovery@dyagnosys.com>',
   ```
   (Both the post-payment email and the recovery email — keep them consistent.)
2. Commit + push, SSH `git fetch + reset` on `/etc/dokploy/applications/app-override-cross-platform-hard-drive-9da7r9/code`, `application.deploy`.
3. Send a test recovery and verify the From: header in the received email.

**Do NOT change the From: address until the user confirms domain verification is done.** Sending from an unverified domain will silently break recovery.

---

## Item 3 — Swap `RESEND_API_KEY` env var

User provided a new key: `re_8fpv7ZFe_ERb3qaSoxAc7s5gdVKamw7St` (var name they used: `RESEND_TRADER_CLAUDEAI`, but inside the backend code the variable is `process.env.RESEND_API_KEY` — keep that name, just swap the value).

**Do this AFTER item 2's domain verification is done** — otherwise you'll cut over to a key that can't send from the new From: address anyway, and you won't know whether failures are due to the key or the domain.

Steps:

1. Read current backend env via `application.one` (or `project.one`). Preserve ALL existing vars.
2. Build new env block — only `RESEND_API_KEY` value changes:
   ```
   RESEND_API_KEY=re_8fpv7ZFe_ERb3qaSoxAc7s5gdVKamw7St
   ```
3. `application.saveEnvironment` with all 4 fields (env, buildArgs, buildSecrets, createEnvFile) — framework lesson 11b.
4. `application.deploy`. Backend restarts and uses the new key — no rebuild needed since env is runtime-injected.
5. Trigger a test recovery email; verify it arrives.

---

## Item 4 — Brokerage / API Keys in Settings

### Current state

The user's screenshot shows the existing Settings panel has tabs `DEFAULTS`, `MOBILE UI` with fields like Default Symbol, Default Qty, Time In Force, Extended Hours, Paper Trading (toggle), Watchlist Tickers, Notional Presets. There's no Alpaca-keys section visible — keys are currently set via the prebuilt `.env` (`VITE_ALPACA_*`).

The schema lives at `src/frontend/config/settingsSchema.ts`. The Settings UI reads from there.

### What to add

Add a new section / tab labeled **"Brokerage"** (or extend DEFAULTS) with four password-style inputs:

| Field | Purpose | localStorage key |
|---|---|---|
| Paper API Key ID | Alpaca paper trading key | `alpaca_paper_key_id` |
| Paper API Secret | Alpaca paper trading secret | `alpaca_paper_secret` |
| Live API Key ID | Alpaca live trading key | `alpaca_live_key_id` |
| Live API Secret | Alpaca live trading secret | `alpaca_live_secret` |

Plus a **prominent warning banner** at the top of the Brokerage section:

> ⚠ Your Alpaca API keys are stored ONLY in your browser's localStorage on this device. They never reach our servers. If you clear browser data, switch device, or use private/incognito mode, you'll need to re-enter them. We cannot recover them for you.

Behavior:
- Inputs are `<input type="password">` with a "show/hide" toggle next to each.
- Save button persists to `localStorage` (no API call — the keys are used client-side by the existing Alpaca SDK calls).
- Whichever pair is "active" depends on the existing PAPER/LIVE toggle at the top of the trade card. The trade-firing code should `localStorage.getItem('alpaca_paper_key_id')` (or `_live_`) based on that toggle, replacing whatever currently uses `VITE_ALPACA_*` envs.
- If both pairs are empty AND the user clicks "Go Long" / etc., show a modal: "Add your Alpaca keys in Settings → Brokerage first."

### Where to wire it

1. **Schema**: extend `src/frontend/config/settingsSchema.ts` with the 4 entries (group: 'brokerage', type: 'password', storage: 'localStorage').
2. **Settings component**: render a new section/tab using the existing pattern (find the file that renders DEFAULTS / MOBILE UI — same component).
3. **Alpaca client wiring**: find where the app currently reads `VITE_ALPACA_API_KEY` / `VITE_ALPACA_API_SECRET`. Replace those reads with a helper:
   ```ts
   // src/frontend/lib/alpacaKeys.ts
   export function getAlpacaKeys(mode: 'paper' | 'live') {
     return {
       keyId:  localStorage.getItem(`alpaca_${mode}_key_id`)  || '',
       secret: localStorage.getItem(`alpaca_${mode}_secret`)  || '',
     };
   }
   export function hasAlpacaKeys(mode: 'paper' | 'live') {
     const k = getAlpacaKeys(mode);
     return Boolean(k.keyId && k.secret);
   }
   ```
4. **Backend env cleanup**: remove `VITE_ALPACA_IS_PAPER` from backend env via `application.saveEnvironment`? Probably leave it as a default for paper mode and let user-localStorage override at runtime. Decide based on existing app behavior — don't break anything.

### What NOT to do

- Don't send keys to any backend endpoint, ever. They stay client-side.
- Don't add a "remember on server" option.
- Don't encrypt them in localStorage (XSS would compromise either way — the localStorage warning is the right honest disclosure).
- Don't add a "validate keys" button that calls Alpaca — that's nice UX but defer to v2; first ship the storage + warning.

### Verify

- After deploy, open Settings → Brokerage → see the 4 fields + warning.
- Enter paper keys → reload page → keys persist (check via DevTools → Application → Local Storage).
- Toggle PAPER/LIVE in header → trade card uses the corresponding key pair (verify by attempting a small paper order with valid keys).

---

## Deploy order (do these in sequence, not in parallel)

1. **Item 1** (LP recover feedback) — quick, ship first.
2. **Item 4** (Brokerage settings) — frontend app change; ship before email cutover so user can actually start using the app while you wait for the Resend domain.
3. **Item 2** (ask user about Resend domain) — block here until user picks A or B.
4. **Item 3** (swap RESEND_API_KEY) — only after item 2 is unblocked.

For each item:

- Commit + push to the correct repo (`dyagnosys-trader-lp` for #1; `OneTouchTrader` for #3 + #4; #2 has a code change in OneTouchTrader).
- SSH `git fetch + reset` on the corresponding Dokploy code dir (framework lesson 19).
- `application.deploy` via API.
- Run the verify step listed in each item.
- Report curl/verification output. Don't claim success on guesswork.

---

## Smoke tests after all items shipped

```bash
# Item 1: recover page has interactive script
curl -sSL https://trader.dyagnosys.com/recover/ | grep -oE "recover-license|aria-live|Sending…" | head -3

# Item 3: backend still healthy after env swap
curl -sS https://api-trader.dyagnosys.com/healthz

# Item 4: Settings panel exposes Brokerage fields (eyeball test — needs user)
# Ask user: open https://app-trader.dyagnosys.com/ → Settings → confirm Brokerage section with 4 password inputs + localStorage warning
```

---

## When to ask the user

**Item 2:** Required. Ask BEFORE touching code. See prompt text above.

**Item 4 verification:** After deploy, ask user to:
> "Open https://app-trader.dyagnosys.com → click Settings → confirm you see a 'Brokerage' section with 4 password fields (paper key/secret + live key/secret) and a warning that they're stored in browser localStorage only. Enter your paper keys and confirm a paper order still fires."

Do NOT ask user about:
- LP recover UI design — just ship the version above.
- Schema field names / localStorage key names — ship the names above; user can rename later.
- Whether to keep VITE_ALPACA_IS_PAPER env var — use your judgment; default to leaving it.

---

## Rules

- Rule 9b: no `docker run` fallback.
- Run `npm run build` locally before pushing trader-lp changes.
- Run `npm run build` locally before pushing OneTouchTrader frontend changes (check `package.json` for the build script).
- SSH `git fetch + reset` before every `application.deploy` (lesson 19).
- Don't change the From: email until Resend domain is verified (item 2 gate).
- Don't claim done until each item's verify step passes.
