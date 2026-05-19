# LLM Prompt — Make TP and SL Buttons Toggle-Only

You are fixing a UX bug in Lean-FireupTrader (`/Users/vitorcalvi/Desktop/Lean-FireupTrader`). The mobile UI has TP and SL buttons inside the trading panel (`MobilePriceAction.tsx`). Today they have two conflicting roles:

1. **Toggle** `tpActive` / `slActive` state — desired.
2. **Fire** a one-click bracket order via `onSlTpClick` → `handleSlTp()` — **must be removed**.

Goal: the TP and SL buttons modify *only* the next GO LONG / GO SHORT order. They never submit an order on their own.

## Semantics after fix

- Tap **SL** alone → next GO submits OTO (entry + stop-loss).
- Tap **TP** alone → next GO submits OTO (entry + take-profit).
- Tap **SL** + **TP** → next GO submits full bracket.
- Neither → plain entry, no attached exits.
- Tapping a toggle a second time turns it OFF.
- GO LONG / GO SHORT remain the only submit buttons.

SL/TP distances continue to come from `VITE_AUTO_STOP_LOSS_PCT` and `VITE_AUTO_TAKE_PROFIT_PCT`.

## Changes

### 1. `src/frontend/components/Mobile/MobilePriceAction.tsx`

- Remove the prop `onSlTpClick?: () => void;` from `MobilePriceActionProps` (line 20).
- Remove `onSlTpClick` from the destructured props (line 40).
- Add four new props:
  ```ts
  slActive: boolean;
  tpActive: boolean;
  onToggleSl: () => void;
  onToggleTp: () => void;
  ```
- The two TP/SL buttons (lines 129–137 and 157–165) must:
  - Call `onToggleTp` or `onToggleSl` based on which slot they're in (top is TP for long / SL for short; bottom is SL for long / TP for short — same as today's label logic).
  - **Not** be disabled by `isSubmitting` (toggles should respond instantly even mid-submit).
  - Show an active visual state when the corresponding flag is true. Use:
    - Active SL: `bg-[#FF4B4B]/20 border-[#FF4B4B] text-[#FF4B4B]`
    - Active TP: `bg-[#25D366]/20 border-[#25D366] text-[#25D366]`
    - Inactive (either): keep current `bg-[#1A2234] text-[#8B99AE] border-gray-700/50` plus the hover class.
  - Keep `type="button"`.

### 2. `src/frontend/pages/MobileTradingPage.tsx`

- Line ~1153, remove the prop on `<MobilePriceAction>`:
  ```tsx
  onSlTpClick={() => handleSlTp(positionSide === 'long' ? 'buy' : 'sell')}
  ```
  Replace with:
  ```tsx
  slActive={slActive}
  tpActive={tpActive}
  onToggleSl={() => setSlActive(v => !v)}
  onToggleTp={() => setTpActive(v => !v)}
  ```
- Leave `handleSlTp` in place — it is still used by the **SL-TP strategy preset** path (line 743 and 797: `if (activePresets.has('sl-tp')) return await handleSlTp(...)`). Do not delete that function.
- The bracket-leg attachment logic at lines 758–774 already reads `slActive` / `tpActive` correctly. No change needed there.

### 3. `Button_Reference.md`

Already updated to describe TP/SL as toggle-only. No further change.

## Out of scope

- Visual indicator on the GO button showing which legs will attach (nice-to-have, not required).
- Persisting toggle state across symbol changes.
- Long-press behavior on SL/TP.
- Any change to the SL-TP strategy preset (in `StrategySelectors`) — that one keeps firing immediately, which is correct.

## Validation

- [ ] Tap SL: button turns red-tinted. No order is submitted. Open orders list does not change.
- [ ] Tap TP: button turns green-tinted. No order is submitted.
- [ ] Tap SL again: button returns to neutral. No order is submitted.
- [ ] With SL on only, tap GO LONG → exactly one OTO order appears in Alpaca with stop-loss attached, no take-profit.
- [ ] With TP on only, tap GO LONG → exactly one OTO order with take-profit attached, no stop-loss.
- [ ] With both on, tap GO LONG → one bracket order with both legs.
- [ ] With neither on, tap GO LONG → one plain entry, no children.
- [ ] `grep -n onSlTpClick src/frontend` returns zero matches.
- [ ] `npm run lint` and `npm run build` pass.

## Commit

`fix(mobile): make TP/SL buttons toggle-only, remove one-click fire path`

PR description should include before/after screenshots of the TP/SL buttons in active and inactive states.
