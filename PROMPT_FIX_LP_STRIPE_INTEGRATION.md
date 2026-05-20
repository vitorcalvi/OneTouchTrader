# PROMPT — Fix Landing Page Stripe Integration (NEVER DEPLOYED)

**For:** Laguna
**Date:** 2026-05-20
**Severity:** HIGH — your previous report claimed this was done. It is NOT done. The deployed LP is still the pre-Stripe version.

---

## Audit findings

Live `https://trader.dyagnosys.com` is **still serving the old LP** without any Stripe integration. Evidence:

- `https://trader.dyagnosys.com/license` → returns the homepage HTML, not a license page (Caddy `try_files` falls through to `/index.html` because `license/index.html` was never built/deployed).
- `https://trader.dyagnosys.com/signup/` → still shows "Join the waitlist" (the original placeholder).
- The deployed homepage hero CTA still says `<a href="/signup" class="btn">Start 14-day free trial</a>` — no `/checkout` integration.
- The deployed pricing section has NO buy buttons / forms — just static read-only cards.

**Root cause:** You modified the local files but **never committed or pushed them.** Verified via `git status` in `/Users/vitorcalvi/Desktop/Lean-FireupTrader/trader-lp`:

```
On branch main
Your branch is up to date with 'origin/main'.
Changes not staged for commit:
        modified:   src/pages/index.astro
Untracked files:
        src/pages/license.astro
        src/pages/recover.astro
```

Local has the new code. Origin does not. Dokploy's code dir (`/etc/dokploy/applications/trader-lp-ag6kzp/code`) is at the same old commit `11060dd` as origin. So the production container is built from code that knows nothing about Stripe.

**Lesson (add to PROMPT_DEPLOY_DOKPLOY_FRAMEWORK.md):** Before claiming a deploy is done, run `git status` in EVERY repo you touched. Untracked or unstaged files mean nothing reached production. Then verify the actual deployed artifact matches expectations (`curl <url>/<new-page>` and grep for new content). "I wrote the file locally" is not "I deployed it."

---

## What needs to happen

### Step 1 — Audit the local LP changes (read-only, do not edit yet)

```bash
cd /Users/vitorcalvi/Desktop/Lean-FireupTrader/trader-lp
git status
git diff src/pages/index.astro
cat src/pages/license.astro
cat src/pages/recover.astro
```

Confirm the changes look correct against `PROMPT_DEPLOY_STRIPE_LICENSING.md` §3. If anything is missing or wrong, fix it before step 2.

**Known issues to verify and fix in the local code:**

a. **Hero CTA still points to `/signup`** — should trigger checkout for the recommended tier (Pro $29 is the default trial entry). Replace with:
   ```html
   <form action="https://api-trader.dyagnosys.com/checkout" method="POST" style="display: inline-block;">
     <input type="hidden" name="tier" value="pro" />
     <button type="submit" class="btn">Start 14-day free trial <span class="badge">Beta</span></button>
   </form>
   ```
   **However** — vanilla form-POST will send `tier=pro` as URL-encoded, but the backend `/checkout` handler expects JSON. Two options:
   - **A (preferred):** make the CTA a `<button>` that runs a tiny `<script>`:
     ```html
     <button class="btn" onclick="fetch('https://api-trader.dyagnosys.com/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tier:'pro'})}).then(r=>r.json()).then(d=>location.href=d.url)">Start 14-day free trial <span class="badge">Beta</span></button>
     ```
   - **B:** update the backend `/checkout` to also accept URL-encoded form data. More work.
   
   Use option A. Apply the same script pattern to the two tier-card buy buttons too — vanilla `<form>` POSTing JSON content-type isn't a thing.

b. **`signup.astro` still exists** with the old "Join the waitlist" content. Decide:
   - **Delete it entirely.** Update any internal links pointing to `/signup`. The new entry point is the buy buttons → Stripe → `/license`.
   - The footer's "Recover license" link already points to `/recover` which is correct.

c. **Verify `license.astro`** reads `session_id` from query string, calls `GET /issue-license?session_id=...`, displays JWT, has Copy button + "Open App" deeplink (`https://app-trader.dyagnosys.com/#license=<jwt>`). Per §3 of PROMPT_DEPLOY_STRIPE_LICENSING.md.

d. **Verify `recover.astro`** has an email input + Submit that POSTs to `/recover-license` and shows the privacy-preserving response.

### Step 2 — Local build verification (DO NOT SKIP)

```bash
cd /Users/vitorcalvi/Desktop/Lean-FireupTrader/trader-lp
npm install   # in case deps changed
npm run build
# Verify the dist has the new pages:
ls dist/license/ dist/recover/
# Should contain index.html
cat dist/index.html | grep -oE 'fetch.*checkout|api-trader\.dyagnosys'
# Should show the checkout call in the bundled HTML
```

If `npm run build` fails, fix locally and re-run. **DO NOT push until local build is green.**

### Step 3 — Commit + push

```bash
cd /Users/vitorcalvi/Desktop/Lean-FireupTrader/trader-lp
git add src/pages/index.astro src/pages/license.astro src/pages/recover.astro
git rm src/pages/signup.astro    # if you decided to delete it
git status   # MUST show all expected changes staged
git commit -m "Wire Stripe checkout into LP (hero + pricing tiers, license + recover pages)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
git push origin main
```

### Step 4 — Force Dokploy to pull + rebuild (FRAMEWORK LESSON 19)

`application.deploy` does NOT re-pull from GitHub on API-triggered redeploys. You must SSH and fast-forward the local code dir:

```bash
ssh vitor@192.168.1.45 'cd /etc/dokploy/applications/trader-lp-ag6kzp/code && sudo git fetch origin main && sudo git reset --hard origin/main && sudo git log --oneline -1'
```

Verify the output matches your new commit hash.

### Step 5 — Trigger redeploy via API

```bash
KEY="BloSEYydevQesKwQvpKrhHvTcRUPmLTQvRHkoipsSrlKObcMUdOGCHvcGLwHYKZW"
curl -sS -X POST -H "x-api-key: $KEY" -H "Content-Type: application/json" \
  http://192.168.1.45:3000/api/trpc/application.deploy \
  -d '{"json":{"applicationId":"t266R-pA5Ez_Ij4MUuTbs"}}'
```

Poll until `applicationStatus: done`:
```bash
until [ "$(curl -sS -H "x-api-key: $KEY" "http://192.168.1.45:3000/api/trpc/application.one?input=%7B%22json%22%3A%7B%22applicationId%22%3A%22t266R-pA5Ez_Ij4MUuTbs%22%7D%7D" | python3 -c "import sys,json;print(json.load(sys.stdin)['result']['data']['json']['applicationStatus'])")" != "running" ]; do sleep 15; done
```

### Step 6 — Smoke tests (all must pass — NO EXCEPTIONS)

```bash
# 1. License page exists and is a real page, not the homepage
curl -sS https://trader.dyagnosys.com/license | grep -iE "license|jwt|copy|paste" | head -3
# Expect: visible matches. If it returns homepage HTML, the build/deploy failed.

# 2. Recover page exists
curl -sS https://trader.dyagnosys.com/recover | grep -iE "email|recover|license" | head -3

# 3. Hero CTA triggers /checkout (not /signup)
curl -sS https://trader.dyagnosys.com/ | grep -oE "checkout|api-trader\.dyagnosys" | head -3
# Expect: at least one match

# 4. Pricing tier buy buttons exist
curl -sS https://trader.dyagnosys.com/ | grep -oE "tier.*pro_ai|tier.*['\"]pro['\"]" | head -3

# 5. Old /signup waitlist is gone (404 or repurposed)
curl -sS -o /dev/null -w "%{http_code}\n" https://trader.dyagnosys.com/signup
# Expect: 404 (if you deleted signup.astro) OR a redirect

# 6. End-to-end checkout — confirm the script works (no JSON parse errors)
# Open https://trader.dyagnosys.com/ in a browser, open DevTools Network tab,
# click "Start 14-day free trial", verify:
#   - POST to api-trader.dyagnosys.com/checkout returns 200 with {url:"https://checkout.stripe.com/..."}
#   - Browser navigates to that Stripe URL
# (This step needs the user — see §"When to ask user" below.)
```

### Step 7 — Documentation

Update:
1. **`PROMPT_DEPLOY_DOKPLOY_FRAMEWORK.md`** — add the lesson about verifying `git status` and `curl <new-page>` before claiming done.
2. **`EXECUTION_REPORT_DEPLOY_V2.md`** — append a §8b "LP Stripe wiring fix (originally claimed done, actually not deployed)" with the commit hash of the fix push and outputs of smoke tests 1–5.

---

## When to ask user (DO NOT skip the user check)

Per user's instruction: stop and ask the user when you need a real human action. Specifically:

1. **Smoke test #6 (browser e2e)** — you cannot verify this from CLI. After steps 1–5 pass, tell the user: "All 5 CLI smoke tests pass. Please open https://trader.dyagnosys.com in your browser, click 'Start 14-day free trial', and confirm you land on Stripe Checkout. Paste a screenshot or the URL you land on."

2. **If `signup.astro` deletion is ambiguous** — if you think the user might want to keep a waitlist for a future free tier, ask: "Delete `/signup` entirely or repurpose it as a backup waitlist for the Hosted AI tier (Coming Soon)?" Default: **delete it**.

3. **If the local code is broken** (build fails, missing logic in license.astro, etc.) — tell the user exactly what you found and propose the fix before applying.

4. **If you discover the backend `/issue-license` or `/checkout` endpoints don't match what license.astro expects** — verify against the live backend with a curl, then either fix the LP page to match the API, or fix the API. Do NOT silently change contracts.

Do NOT ask the user about:
- The script-based fetch CTA approach (option A in Step 1a). Just do it.
- Whether to commit + push. Just do it.
- Whether to run smoke tests. Just do it.
- Whether to force-pull on the Dokploy code dir (Lesson 19). Just do it.

---

## Hard rules

1. Rule 9b: no `docker run` fallback.
2. Do NOT claim the LP is fixed until smoke tests 1–5 pass AND the user confirms test 6 in a browser.
3. Do NOT push code without running `npm run build` locally first.
4. Do NOT trigger `application.deploy` before SSH-pulling on the Dokploy code dir.
5. After pushing, ALWAYS run `git status` to confirm working tree is clean.
6. Always `curl` the live URL after deploy to verify the bytes match expectations.

---

## What success looks like

- `curl https://trader.dyagnosys.com/license` returns a real license page with JWT-display markup.
- `curl https://trader.dyagnosys.com/recover` returns a real recovery form.
- `curl https://trader.dyagnosys.com/` shows checkout-wired CTAs (matches grep "checkout" or "api-trader").
- `curl https://trader.dyagnosys.com/signup` returns 404 (or whatever you decided).
- User confirms browser flow works end-to-end with Stripe test card.

Final report: commit hash + the 5 curl outputs + user's confirmation message for test 6.
