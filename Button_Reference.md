# Mobile Trading UI - Button Reference

## Top Header (StatusBar)

| Button | Location | Action |
|--------|----------|--------|
| Until Close | Left | Displays market session progress (read-only indicator) |
| Account Mode | Center | Read-only badge showing PAPER or LIVE status (from `VITE_ALPACA_IS_PAPER`). Single badge, not a 2-button pill. |
| POWER | Right | Displays `account.buying_power` (live value from Alpaca). The "$36,881" in the mockup is placeholder text only. |

> ⚠ Code/mockup mismatch: The mockup shows a 2-button PAPER/LIVE pill, but the implementation should render as a single read-only badge.

## Position Sizes (MobileQuickAmount)

| Button | Notional Value | Action |
|--------|----------------|--------|
| 5K | $5,000 | Sets notional position size to $5,000. Qty = floor($5,000 / current_price). |
| 10K | $10,000 | Sets notional position size to $10,000. Qty = floor($10,000 / current_price). |
| 20K | $20,000 | Sets notional position size to $20,000. Qty = floor($20,000 / current_price). |
| 40K | $40,000 | Sets notional position size to $40,000. Qty = floor($40,000 / current_price). |

## Ticker Selection (MobileTickerSelect)

| Button | Action |
|--------|--------|
| Ticker Symbol (e.g., INTC) | Sets active symbol for trading. Long-press removes symbol from watchlist. |
| + | Opens add-symbol prompt (window.prompt) |

## Order Type Toggle (MobileSizeToggle)

The canonical field is the `MobileOrderType` union (`'market' | 'limit' | 'stop_limit'`). The legacy tier letter (S/L/M) is used for UI state only.

| Button | Tier | MobileOrderType | Action |
|--------|------|-----------------|--------|
| STOP LIMIT | S | `'stop_limit'` | Sets order type to stop-limit |
| LIMIT | L | `'limit'` | Sets order type to limit |
| MARKET | M | `'market'` | Sets order type to market |

## Trading Main Area (MobilePriceAction)

| Button | Step | Action |
|--------|------|--------|
| +1. | `VITE_MOBILE_PRICE_STEP_LARGE` (1.00) | Increase working price by 1.00 |
| +0.1 | `VITE_MOBILE_PRICE_STEP_MID` (0.10) | Increase working price by 0.10 |
| +.01 | `VITE_MOBILE_PRICE_STEP_SMALL` (0.01) | Increase working price by 0.01 |
| -1. | `VITE_MOBILE_PRICE_STEP_LARGE` (1.00) | Decrease working price by 1.00 |
| -0.1 | `VITE_MOBILE_PRICE_STEP_MID` (0.10) | Decrease working price by 0.10 |
| -.01 | `VITE_MOBILE_PRICE_STEP_SMALL` (0.01) | Decrease working price by 0.01 |
| LONG | — | Toggle position side to LONG |
| SHORT | — | Toggle position side to SHORT |
| TP | — | Toggle take-profit leg for the next GO order. State stored in `tpActive`. Does not submit on its own. When active, displays green fill. |
| SL | — | Toggle stop-loss leg for the next GO order. State stored in `slActive`. Does not submit on its own. When active, displays green fill. |
| GO LONG | — | Buy with current preset. If both SL and TP are active, submits bracket order with both legs attached. |
| GO SHORT | — | Sell with current preset. If both SL and TP are active, submits bracket order with both legs attached. |

## Strategy Selectors

| Button | Action |
|--------|--------|
| O-SL: OTO (one-triggers-other) bracket | Market/limit entry + attached stop-loss only. No take-profit leg. Uses `VITE_AUTO_STOP_LOSS_PCT` for SL distance. |
| LADDER | Submits `VITE_LADDER_ORDER_COUNT` (default 3) laddered limit orders, each spaced by `VITE_LADDER_PRICE_STEP` (default 0.10) from the working price. |
| L&F (Live & Forget) | Single entry, then layered trailing stops L1/L2/L3 (enabled via `VITE_LAYER{1,2,3}_ENABLED`, trail % via `VITE_LAYER2_TRAIL_PCT` and `VITE_LAYER3_TRAIL_PCT`). |
| SL-TP | Full bracket: entry + stop-loss + take-profit. Uses `VITE_AUTO_STOP_LOSS_PCT` and `VITE_AUTO_TAKE_PROFIT_PCT` for SL/TP distances. |

## Account Status (MobileControlsPanel)

Acts on the position for the active symbol only.

| Button | Action |
|--------|--------|
| EXIT | Close the entire position for the active symbol via market order |
| BE | Move stop to break-even + `VITE_BE_STOP_OFFSET` (currently 0.1) |
| SL | Re-arm stop-loss at `VITE_SL_STOP_OFFSET` (currently 0.75%) |
| TRAIL | Toggle trailing stop using `VITE_TRAILING_STOP_DEFAULT_PCT` (currently 1.0%), floored by `VITE_TRAILING_STOP_MIN_PCT` (0.5%) |

## Bottom Navigation (GlobalPositionManager)

| Button | Action |
|--------|--------|
| ALL EXIT | Close all positions |
| ALL BE | Set all positions to break-even |
| ALL SL | Set stop-loss on all positions |
| ALL TRAIL | Set trailing stop on all positions |
| NO POSITIONS / N OPEN | Status-only display (not a button). Should render as `<div>` or disabled button despite mockup styling. |

> ⚠ Code/mockup mismatch: The mockup styles this as a button but it should be a status-only element in the implementation.

## Settings Nav (Fixed Bottom)

| Button | Action |
|--------|--------|
| Settings (gear icon) | Opens SettingsDrawer (stub component) |

## Long-Press Gestures

The following elements support long-press (500ms hold):
- **Ticker symbols** in MobileTickerSelect: Long-press removes symbol from watchlist
- **Preset buttons** (O-SL, LADDER, L&F, SL-TP): Long-press toggles the preset off

## Open Questions for Vitor

1. The `+` button in ticker selection uses `window.prompt()` - should this be replaced with a symbol screener modal?
2. The PAPER/LIVE display in the mockup shows a 2-button pill but the spec calls for a single badge - which is the intended final design?
3. The NO POSITIONS / N OPEN element in GlobalPositionManager.tsx currently renders as a `<button>` - should it be changed to a `<div>` or disabled button?

## Environment Variables Referenced

| Variable | Default | Purpose |
|----------|---------|---------|
| `VITE_MOBILE_DEFAULT_PRESETS` | 5K,10K,20K,40K | Default position size options |
| `VITE_MOBILE_PRICE_STEP_LARGE` | 1.00 | Large price increment |
| `VITE_MOBILE_PRICE_STEP_MID` | 0.10 | Medium price increment |
| `VITE_MOBILE_PRICE_STEP_SMALL` | 0.01 | Small price increment |
| `VITE_AUTO_STOP_LOSS_PCT` | 0.75 | Stop-loss percentage for SL-TP preset |
| `VITE_AUTO_TAKE_PROFIT_PCT` | 1.5 | Take-profit percentage for SL-TP preset |
| `VITE_BE_STOP_OFFSET` | 0.1 | Break-even stop offset |
| `VITE_SL_STOP_OFFSET` | 0.75 | Stop-loss re-arm offset |
| `VITE_TRAILING_STOP_DEFAULT_PCT` | 1.0 | Default trailing stop percentage |
| `VITE_TRAILING_STOP_MIN_PCT` | 0.5 | Minimum trailing stop percentage |
| `VITE_LADDER_PRICE_STEP` | 0.10 | Ladder order spacing |
| `VITE_LADDER_ORDER_COUNT` | 3 | Number of ladder orders |
| `VITE_LAYER2_TRAIL_PCT` | 0.5 | Layer 2 trailing percentage |
| `VITE_LAYER3_TRAIL_PCT` | 1.5 | Layer 3 trailing percentage |