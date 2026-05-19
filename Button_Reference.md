# Mobile Trading UI - Button Reference

## Top Header (StatusBar)

| Button | Location | Action |
|--------|----------|--------|
| Until Close | Left | Displays market session progress (read-only indicator) |
| PAPER | Center | Click to switch to paper trading mode. Calls `onPaperLiveToggle(true)`, which re-instantiates AlpacaService with paper keys. Disabled if `paperAvailable` is false. |
| LIVE | Center | Click to switch to live trading mode. Calls `onPaperLiveToggle(false)`, which re-instantiates AlpacaService with live keys. Disabled if `liveAvailable` is false. |
| POWER | Right | Displays `account.buying_power` (live value from Alpaca) |

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
| Ticker Symbol (e.g., INTC) | Sets active symbol for trading. |
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
| TP | — | Toggle only. Flips `tpActive`. When ON, the next GO order attaches a take-profit leg at `VITE_AUTO_TAKE_PROFIT_PCT` from entry. |
| SL | — | Toggle only. Flips `slActive`. When ON, the next GO order attaches a stop-loss leg at `VITE_AUTO_STOP_LOSS_PCT` from entry. |
| GO LONG | — | Buy with current preset. Order class depends on toggles (OTO/Bracket). |
| GO SHORT | — | Sell with current preset. Same toggle logic as GO LONG. |

## Strategy Selectors

| Button | Action |
|--------|--------|
| O-SL | Market/limit entry + attached stop-loss only. Uses `VITE_AUTO_STOP_LOSS_PCT` for SL distance. |
| LADDER | Submits `VITE_LADDER_ORDER_COUNT` (default 3) laddered limit orders, each spaced by `VITE_LADDER_PRICE_STEP` (default 0.10) from the working price. |
| L&F | Single entry + layered trailing stops L1/L2/L3. |
| SL-TP | Full bracket: entry + stop-loss + take-profit. Uses `VITE_AUTO_STOP_LOSS_PCT` and `VITE_AUTO_TAKE_PROFIT_PCT`. |

## Account Status (MobileControlsPanel)

Acts on the position for the active symbol only.

| Button | Action |
|--------|--------|
| EXIT | Cleanup existing exit legs via `cancelExistingExitOrders` then close position via market order. |
| BE | Move stop to break-even + `VITE_BE_STOP_OFFSET` (0.1) |
| SL | Re-arm stop-loss at `VITE_SL_STOP_OFFSET` (0.75%) |
| TRAIL | Toggle trailing stop using `VITE_TRAILING_STOP_DEFAULT_PCT` (1.0%), floored by `VITE_TRAILING_STOP_MIN_PCT` (0.5%) |

## Bottom Navigation (GlobalPositionManager)

| Button | Action |
|--------|--------|
| ALL EXIT | Executes cleanup (canceling existing exit legs) and closes all positions via market orders. |
| ALL BE | Set all positions to break-even |
| ALL SL | Set stop-loss on all positions |
| ALL TRAIL | Set trailing stop on all positions |
| Status Indicator | N OPEN/NO POSITIONS: Status-only display. |

## Settings Nav

| Button | Action |
|--------|--------|
| Settings | Opens SettingsDrawer |

## Long-Press Gestures

Implemented via shared `useLongPress` hook. Duration: 500ms.

| Element | Long-Press Action |
|---------|------------------|
| Ticker symbols | Removes symbol from watchlist |
| LADDER button | Cancels all open orders for active symbol |
| Preset buttons (O-SL, L&F, SL-TP) | Toggles preset off |

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
| `VITE_ALPACA_STOCKS_FEE` | 0.0001194 | Stock fee calculation |
| `VITE_ALPACA_CRYPTO_TAKER_FEE` | 0.003 | Crypto taker fee |
| `VITE_ALPACA_CRYPTO_MAKER_FEE` | -0.002 | Crypto maker fee |