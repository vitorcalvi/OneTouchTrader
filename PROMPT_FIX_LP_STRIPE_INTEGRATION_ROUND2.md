# PROMPT — Fix LP Stripe Integration (Round 2)

**For:** Laguna
**Date:** 2026-05-20
**Severity:** Both bugs block the actual paying-customer flow.

Your round 1 deploy got most things right. Two bugs remain — both verified by curl, with exact root causes and fixes below.

---

## Bug 1 — `/license` is fundamentally broken (Astro SSG misuse)

### What's wrong

`src/pages/license.astro` runs `fetch('/issue-license?session_id=' + session_id)` in the **frontmatter**. Astro frontmatter runs at **build time**, not request time. At build time `session_id` is always `''` (no query string exists). The built static page has a hardcoded empty JWT and shows only "No session found." forever.

When a user actually pays and gets redirected to `https://trader.dyagnosys.com/license?session_id=cs_test_xxx`, the static page they get is the pre-built one — their `session_id` query param is **ignored**.

### Fix — convert to client-side fetch

Replace the entire contents of `src/pages/license.astro` with:

```astro
---
import Base from '../layouts/Base.astro';
---
<Base title="Your license — Fireup Trader">
  <section style="padding: 4rem 1rem; min-height: 70vh;">
    <div style="max-width: 720px; margin: 0 auto;">
      <h1 style="margin-bottom: 1rem;">Your Fireup Trader license</h1>
      <p id="status" style="color: #a1a1aa; margin-bottom: 2rem;">Generating your license token…</p>

      <div id="license-block" style="display: none;">
        <p style="color: #a1a1aa; margin-bottom: 1rem;">Copy this token, then open the app. We also emailed it to you.</p>
        <pre id="jwt" style="background: #111; padding: 1.5rem; border-radius: 8px; word-break: break-all; white-space: pre-wrap; font-size: 0.85rem; line-height: 1.4; margin-bottom: 1rem; color: #fafafa;"></pre>
        <div class="flex gap-4" style="margin-bottom: 2rem;">
          <button id="copy-btn" class="btn">Copy license</button>
          <a id="open-app" class="btn" style="background: #22c55e; color: #0a0a0a;" target="_blank" rel="noopener">Open app</a>
        </div>
        <p style="color: #666; font-size: 0.875rem;">
          Lost this later? Use <a href="/recover">/recover</a> with the email you paid with.
        </p>
      </div>

      <div id="error-block" style="display: none;">
        <p style="color: #f87171; margin-bottom: 1rem;" id="error-msg"></p>
        <a href="/" class="btn">Back to pricing</a>
      </div>
    </div>
  </section>

  <script is:inline>
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const sid = params.get('session_id');
      const statusEl = document.getElementById('status');
      const block = document.getElementById('license-block');
      const errBlock = document.getElementById('error-block');
      const errMsg = document.getElementById('error-msg');

      function showError(msg) {
        statusEl.style.display = 'none';
        block.style.display = 'none';
        errBlock.style.display = 'block';
        errMsg.textContent = msg;
      }

      if (!sid) {
        showError('Missing session_id. You should arrive here from Stripe after payment.');
        return;
      }

      try {
        const r = await fetch('https://api-trader.dyagnosys.com/issue-license?session_id=' + encodeURIComponent(sid));
        const data = await r.json();
        if (!r.ok || !data.jwt) {
          showError(data.error === 'payment_incomplete'
            ? 'Payment is still processing. Refresh in a moment.'
            : ('Could not issue license: ' + (data.error || 'unknown error')));
          return;
        }
        statusEl.style.display = 'none';
        block.style.display = 'block';
        document.getElementById('jwt').textContent = data.jwt;
        document.getElementById('open-app').href = 'https://app-trader.dyagnosys.com/#license=' + encodeURIComponent(data.jwt);

        // auto-copy on success
        try { await navigator.clipboard.writeText(data.jwt); } catch (_) {}

        document.getElementById('copy-btn').addEventListener('click', async () => {
          await navigator.clipboard.writeText(data.jwt);
          document.getElementById('copy-btn').textContent = 'Copied!';
          setTimeout(() => { document.getElementById('copy-btn').textContent = 'Copy license'; }, 1500);
        });
      } catch (e) {
        showError('Network error: ' + e.message);
      }
    })();
  </script>
</Base>
```

Key changes:
- Frontmatter no longer does `fetch` — runs in the browser after page load.
- `<script is:inline>` reads `window.location.search` at runtime.
- Shows clear loading / success / error states.
- Auto-copy on success (clipboard API).
- "Open app" deeplink with the JWT in the URL hash (consumed by the app's existing license module).
- Inline script — no module bundling, ships in the static HTML.

### Verify locally before commit

```bash
cd /Users/vitorcalvi/Desktop/Lean-FireupTrader/trader-lp
npm run build
# Build must succeed. Then:
grep -o "window.location.search" dist/license/index.html
# Expect: 1 match (the script is bundled into the static HTML)
```

---

## Bug 2 — `/signup` (and any unknown path) returns the homepage instead of 404

### What's wrong

The Caddyfile has `try_files {path} {path}/ /index.html` — that's an SPA fallback pattern. For a multi-page Astro site, it means any unknown path silently serves the homepage. So `/signup` (which you deleted from `src/pages/`) still returns 200 with the homepage HTML. This is bad for SEO, bad UX, and confused the user.

### Fix — generate a 404 page and update Caddyfile

**Step A — Create `src/pages/404.astro`:**

```astro
---
import Base from '../layouts/Base.astro';
---
<Base title="404 — Fireup Trader">
  <section style="padding: 6rem 1rem; min-height: 60vh; text-align: center;">
    <div style="max-width: 600px; margin: 0 auto;">
      <h1 style="font-size: 4rem; margin-bottom: 0.5rem;">404</h1>
      <p style="color: #a1a1aa; font-size: 1.25rem; margin-bottom: 2rem;">This page doesn't exist.</p>
      <a href="/" class="btn">Back to home</a>
    </div>
  </section>
</Base>
```

Astro builds this to `dist/404.html`.

**Step B — Update `Caddyfile`:**

```
:80 {
    root * /usr/share/caddy
    encode gzip zstd
    file_server
    handle_errors {
        @404 expression {http.error.status_code} == 404
        rewrite @404 /404.html
        file_server
    }
    header {
        Strict-Transport-Security "max-age=31536000"
        X-Content-Type-Options "nosniff"
        Referrer-Policy "strict-origin-when-cross-origin"
    }
    @html path *.html /
    header @html Cache-Control "no-cache"
}
```

Notes:
- Removed `try_files {path} {path}/ /index.html` — no more SPA fallback.
- Astro generates per-page HTML (`/license/index.html`, `/recover/index.html`), so `file_server` finds them naturally with the implicit trailing-slash directory index.
- `handle_errors` routes any 404 to `/404.html` so the user sees a real 404 page with the correct status code.
- Removed the aggressive long-term `Cache-Control: immutable` on everything — that broke HTML cache invalidation. Per-HTML `no-cache` retained.

### Verify locally

```bash
npm run build
ls dist/404.html  # must exist
```

---

## Deploy procedure (use Lesson 19, do not skip)

```bash
cd /Users/vitorcalvi/Desktop/Lean-FireupTrader/trader-lp
git add src/pages/license.astro src/pages/404.astro Caddyfile
git status                      # MUST show all three changes staged, nothing unexpected
git commit -m "Fix /license SSG bug + add real 404 page

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
git push origin main

ssh vitor@192.168.1.45 'cd /etc/dokploy/applications/trader-lp-ag6kzp/code && sudo git fetch origin main && sudo git reset --hard origin/main && sudo git log --oneline -1'

KEY="BloSEYydevQesKwQvpKrhHvTcRUPmLTQvRHkoipsSrlKObcMUdOGCHvcGLwHYKZW"
curl -sS -X POST -H "x-api-key: $KEY" -H "Content-Type: application/json" \
  http://192.168.1.45:3000/api/trpc/application.deploy \
  -d '{"json":{"applicationId":"t266R-pA5Ez_Ij4MUuTbs"}}'
```

Poll until `applicationStatus: done`, then run smoke tests.

---

## Smoke tests (all must pass)

```bash
# 1. /license without session_id shows error UI (not blank)
curl -sSL https://trader.dyagnosys.com/license/ | grep -oE "Missing session_id|license|Your Fireup Trader" | head -3
# Expect: matches showing the page rendered with content

# 2. /license inlines the runtime fetch script
curl -sSL https://trader.dyagnosys.com/license/ | grep -oE "window\.location\.search|api-trader\.dyagnosys\.com/issue-license" | head -2
# Expect: both matches

# 3. /recover unchanged
curl -sSL https://trader.dyagnosys.com/recover/ | grep -oE "<h2>[^<]+|recover-license" | head -3

# 4. /signup is a REAL 404 now (not the homepage)
curl -sS -o /dev/null -w "%{http_code}\n" https://trader.dyagnosys.com/signup
# Expect: 404
curl -sSL https://trader.dyagnosys.com/signup | grep -oE "404|This page doesn't exist" | head -2
# Expect: matches

# 5. Hero CTA still works
curl -sSL https://trader.dyagnosys.com/ | grep -oE "api-trader\.dyagnosys\.com/checkout" | head -1
# Expect: 1 match

# 6. Backend /checkout still returns Stripe URL
curl -sS -X POST -H 'Content-Type: application/json' -d '{"tier":"pro"}' https://api-trader.dyagnosys.com/checkout | grep -oE "checkout\.stripe\.com" | head -1
```

If any test fails, **DO NOT report done** — fix and re-run.

---

## When to ask the user

After all 6 CLI tests pass, **ask the user to run the browser e2e**:

> All CLI smoke tests pass. Please:
> 1. Open https://trader.dyagnosys.com in a browser
> 2. Click "Start 14-day free trial"
> 3. Pay with Stripe test card `4242 4242 4242 4242` / `12/34` / `123`
> 4. Confirm you land on `/license` and see:
>    - The JWT token displayed
>    - A "Copy license" button that works
>    - An "Open app" button that opens app-trader.dyagnosys.com with the license
> 5. Check email — Resend should have delivered the same JWT
>
> Paste a screenshot or describe what you see.

DO NOT close this round until the user confirms the browser flow works.

---

## Documentation

Add to `PROMPT_DEPLOY_DOKPLOY_FRAMEWORK.md`:

> **Lesson — Astro frontmatter runs at BUILD time, not request time.** Any `await fetch(...)` in the `---` frontmatter block executes once during `astro build`, and the result is baked into the static HTML. To read query strings, cookies, or do per-request fetches, use `<script is:inline>` (or `<script>`) in the page body. This is a common bug when porting from server-rendered frameworks.

> **Lesson — Caddy `try_files /index.html` is for SPAs. Multi-page Astro sites need `handle_errors` → `/404.html` instead.** Otherwise every unknown path silently serves the homepage with 200 status — bad for SEO and confuses users.

Update `EXECUTION_REPORT_DEPLOY_V2.md` §8c with: "Round 2 LP fixes — `/license` SSG bug + 404 page" and the commit hash + smoke test outputs.

---

## Rules

- Rule 9b: no `docker run` fallback.
- Do NOT skip `npm run build` locally.
- Do NOT skip the SSH `git fetch + reset` step.
- Do NOT report success until smoke tests AND user's browser confirmation are both green.
