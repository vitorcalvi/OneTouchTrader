# Pre-Trade Plan — 1 Card

Fill this out **before** clicking GO. No plan → no trade.

---

## Card

**Date / Time:** _______________
**Symbol:** _______________ (default: INTC)
**Side:** LONG / SHORT
**Preset / Size:** 5K / 10K / 20K / 40K   →   Qty: _______ shares

### Regime check (mandatory)
- [ ] QQQ direction last 5 min: UP / DOWN / CHOP
- [ ] QQQ agrees with my side? (90% rule) YES / NO  →  if NO, **stop here**
- [ ] WT on 1m: bull cross / bear cross / neutral

### Levels (write the numbers, not "around")
- **Entry trigger:** $_______  (what price + signal makes me click)
- **SL (hard):** $_______      (% from entry: _____%, must be ≤ 0.75%)
- **T1:** $_______             (R:R = _____ : 1, must be ≥ 1.5:1)
- **T2 / runner:** $_______
- **Invalidation:** what makes the thesis wrong? _____________________

### Exit discipline
- [ ] **No exit before T1** unless: SL hit, QQQ regime flip, or 15-min time-stop with zero progress
- [ ] At T1: scale 50%, move stop to BE on the rest
- [ ] At T2: trail runner with L3 (1.5%)

### Post-trade fields (fill after close)
- Captured P&L: $_______
- Available P&L (entry → T2 peak): $_______
- **Efficiency %:** ______%
- Rule broken (if any): _____________________

---

## Execution Sequence in the App

Maps to actual UI in `src/frontend/components/Mobile/` and `src/frontend/pages/MobileTradingPage.tsx`.

### 0. Pre-market (once, before 9:30)
1. `npm run dev` — confirm both Vite (5173) + backend (5171) are up.
2. Open `/mobile` route → `MobileTradingPage`.
3. **StatusBar** — verify PAPER/LIVE toggle is on the right account, equity loads.
4. **MobileTickerSelect** — INTC + IREN already in `VITE_MOBILE_DEFAULT_TICKERS`. Add QQQ to watchlist for regime read.
5. Open TradingView side panel: INTC 1m + QQQ 1m.

### 1. Pre-trade (fill the card above)
1. Write entry / SL / T1 / T2 on the card. Refuse to click GO until all four are numbers.
2. Tick the **QQQ regime** box. If NO → close the app tab for 5 min.

### 2. Arming the order
1. **MobileTickerSelect** → tap symbol (INTC).
2. **MobileQuickAmount / SizePresets** → tap preset (default 10K).
3. **MobileSizeToggle** → choose tier:
   - **M** (Market) — only if QQQ is ripping and you're chasing a confirmed breakout.
   - **L** (Limit) — default. Set price at the card's Entry level via **MobilePriceAction** +/− buttons.
   - **S** (Stop-Limit) — for breakout entries above resistance / below support.
4. **OrderPanel** → confirm SL/TP toggles match the card:
   - SL on, value matches `VITE_AUTO_STOP_LOSS_PCT=0.75`.
   - TP on, value matches `VITE_AUTO_TAKE_PROFIT_PCT=1.5`.
5. Choose preset behavior:
   - **O-SL** for single-target scalps (most morning trades).
   - **L&F** for runner trades with layered trail (L1/L2/L3).
   - **LADDER** only if you've planned multi-level entries.

### 3. Pulling the trigger
1. **LONG/SHORT toggle** matches the card's Side.
2. **MobilePriceAction → GO** button. Eyes on fill confirmation in **PositionCardMobile**.

### 4. In-trade management
- **PositionCardMobile** shows live PnL — *do not stare at it*. Look at the chart.
- **MobileControlsPanel** buttons:
  - **BE** — only after T1 prints, never before.
  - **SL** — re-arms stop at configured offset.
  - **TRAIL** — toggle L&F trail at T2.
  - **EXIT** — only on invalidation, SL touch, or T2 hit.
- **GlobalPositionManager** for batch ops (rarely used solo).

### 5. Post-trade (within 2 min of close)
1. Screenshot the chart + entry/exit markers.
2. Fill the post-trade fields on the card.
3. Append the card to `JOURNAL_YYYY-MM-DD.md`.
4. If efficiency < 50% **or** any rule broken → write one sentence on why, before next trade.

---

## Hard stops (no exceptions)
- **2 losers in a row** → walk away 30 min.
- **Daily loss limit hit** → close app, day is done.
- **No card filled** → no GO press. Period.
