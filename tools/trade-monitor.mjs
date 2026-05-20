#!/usr/bin/env node
// trade-monitor.mjs — watches a trade card's lifecycle and emits event lines.
// usage: node tools/trade-monitor.mjs <cardId>
// emits key=value lines on state changes. silent between events.

const API = process.env.API_BASE_URL || "http://localhost:5171";
const POLL_MS = 5000;
const MAX_RUNTIME_MS = 60 * 60 * 1000; // safety: 60 min max
const NEAR_TP_PCT = 0.003;  // 0.3%
const NEAR_SL_PCT = 0.003;
const STALE_MS = 15 * 60 * 1000;

const cardId = process.argv[2];
if (!cardId) {
  console.error("usage: node tools/trade-monitor.mjs <cardId>");
  process.exit(1);
}

async function getJson(path) {
  const r = await fetch(`${API}${path}`);
  if (!r.ok) throw new Error(`${path} -> ${r.status}`);
  return r.json();
}

function emit(evt) {
  const ts = new Date().toISOString().slice(11, 19);
  const parts = Object.entries(evt).map(([k, v]) => `${k}=${v}`).join(" ");
  console.log(`[${ts}] ${parts}`);
}

function parseInvalidation(text) {
  // best-effort parser for forms like:
  //   "QQQ rolls below 705"   -> { sym:"QQQ", op:"<", level:705 }
  //   "INTC 1m close below 117.85" -> { sym:"INTC", op:"<", level:117.85 }
  const rules = [];
  const re = /(QQQ|INTC|SMH|IREN)[^0-9]+(below|above)[^0-9]*([0-9]+\.?[0-9]*)/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    rules.push({
      sym: m[1].toUpperCase(),
      op: /below/i.test(m[2]) ? "<" : ">",
      level: parseFloat(m[3]),
    });
  }
  return rules;
}

async function main() {
  const cards = await getJson(`/api/trade-cards`);
  const card = cards.find((c) => c.id === cardId);
  if (!card) {
    console.error(`card not found: ${cardId}`);
    process.exit(1);
  }

  const live = card.live === true;
  const sym = card.symbol;
  const isLong = card.direction === "LONG";
  const sl = card.stopLoss;
  const tp = card.takeProfit1;
  const entryRef = card.entryType === "STOP" || card.entryType === "STOP_LIMIT"
    ? card.stopTriggerPrice : card.entryPrice;
  const invalidationRules = parseInvalidation(card.invalidation || "");

  emit({
    EVENT: "watch_start",
    CARD: cardId.slice(0, 8),
    SYM: sym, DIR: card.direction,
    ENTRY_REF: entryRef, SL: sl, TP: tp,
    LIVE: live,
    INVALIDATION_RULES: invalidationRules.length,
  });

  const startedAt = Date.now();
  let fillTime = null;
  let lastQty = 0;
  let lastAvg = null;
  const emitted = new Set();
  const queryStr = `?live=${live}`;
  const symbolsToFetch = ["INTC", "QQQ"];

  while (Date.now() - startedAt < MAX_RUNTIME_MS) {
    try {
      const [posResp, ordResp, quoteResp] = await Promise.all([
        getJson(`/api/alpaca/positions${queryStr}`),
        getJson(`/api/alpaca/orders?status=all&limit=10&live=${live}`),
        getJson(`/api/alpaca/quotes?symbols=${symbolsToFetch.join(",")}`),
      ]);
      const positions = posResp.data || [];
      const orders = ordResp.data || [];
      const quotes = quoteResp?.data?.quotes || {};
      const symQuote = quotes[sym];
      const mid = symQuote ? (symQuote.bp + symQuote.ap) / 2 : null;

      const pos = positions.find((p) => p.symbol === sym);
      const qty = pos ? Math.abs(parseFloat(pos.qty)) : 0;
      const avg = pos ? parseFloat(pos.avg_entry_price) : null;
      const upnl = pos ? parseFloat(pos.unrealized_pl) : 0;

      // 1. Fill detection (qty went 0 -> >0)
      if (lastQty === 0 && qty > 0) {
        fillTime = Date.now();
        lastAvg = avg;
        emit({
          EVENT: "fill", SIDE: card.direction, QTY: qty, AVG: avg.toFixed(2),
          NOW: mid?.toFixed(2), UPNL: upnl.toFixed(2), ELAPSED: "0:00",
        });
      }

      // 2. Close detection (qty went >0 -> 0)
      if (lastQty > 0 && qty === 0) {
        // Determine cause via recent orders
        const recent = orders.filter((o) => o.symbol === sym && o.filled_qty !== "0" && o.filled_qty !== null);
        const lastFill = recent.sort((a, b) =>
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        )[0];
        let reason = "manual";
        if (lastFill) {
          if (lastFill.order_type === "limit" && lastFill.side === (isLong ? "sell" : "buy"))
            reason = "tp1";
          else if (lastFill.order_type === "stop" && lastFill.side === (isLong ? "sell" : "buy"))
            reason = "sl";
        }
        const exitPx = lastFill ? parseFloat(lastFill.filled_avg_price) : (mid || lastAvg);
        const realizedShares = lastFill ? parseFloat(lastFill.filled_qty) : 0;
        const realized = lastAvg && exitPx
          ? (isLong ? (exitPx - lastAvg) : (lastAvg - exitPx)) * realizedShares
          : 0;
        emit({
          EVENT: `closed_${reason}`, EXIT: exitPx?.toFixed(4),
          REALIZED: realized.toFixed(2),
          ELAPSED: fillTime ? `${Math.round((Date.now() - fillTime) / 1000)}s` : "n/a",
        });
        emit({ EVENT: "monitor_exit", REASON: `position_flat` });
        process.exit(0);
      }

      // While in position: derived alerts
      if (qty > 0 && mid != null) {
        const elapsedMs = Date.now() - (fillTime || startedAt);
        const elapsedFmt = `${Math.floor(elapsedMs / 60000)}:${String(Math.floor((elapsedMs % 60000) / 1000)).padStart(2, "0")}`;
        const risk = isLong ? (lastAvg - sl) * qty : (sl - lastAvg) * qty;
        const tpDist = isLong ? (tp - lastAvg) * qty : (lastAvg - tp) * qty;

        // 3. near TP
        const nearTp = isLong ? mid >= tp * (1 - NEAR_TP_PCT) : mid <= tp * (1 + NEAR_TP_PCT);
        if (nearTp && !emitted.has("near_tp")) {
          emit({ EVENT: "near_tp", NOW: mid.toFixed(2), TP: tp, UPNL: upnl.toFixed(2), ELAPSED: elapsedFmt });
          emitted.add("near_tp");
        }

        // 4. near SL
        const nearSl = isLong ? mid <= sl * (1 + NEAR_SL_PCT) : mid >= sl * (1 - NEAR_SL_PCT);
        if (nearSl && !emitted.has("near_sl")) {
          emit({ EVENT: "near_sl", NOW: mid.toFixed(2), SL: sl, UPNL: upnl.toFixed(2), ELAPSED: elapsedFmt });
          emitted.add("near_sl");
        }

        // 5. milestone +50% risk
        if (risk > 0 && upnl >= risk * 0.5 && !emitted.has("milestone_50r")) {
          emit({ EVENT: "milestone_50r", UPNL: upnl.toFixed(2), RISK: risk.toFixed(2), SUGGEST: "move_sl_to_breakeven", ELAPSED: elapsedFmt });
          emitted.add("milestone_50r");
        }

        // 6. milestone +75% of TP distance
        if (tpDist > 0 && upnl >= tpDist * 0.75 && !emitted.has("milestone_75tp")) {
          emit({ EVENT: "milestone_75tp", UPNL: upnl.toFixed(2), TP_DIST: tpDist.toFixed(2), SUGGEST: "trail_sl_or_partial", ELAPSED: elapsedFmt });
          emitted.add("milestone_75tp");
        }

        // 7. invalidation rules
        for (const rule of invalidationRules) {
          const k = `inv_${rule.sym}_${rule.op}_${rule.level}`;
          if (emitted.has(k)) continue;
          const q = quotes[rule.sym];
          if (!q) continue;
          const m = (q.bp + q.ap) / 2;
          const tripped = rule.op === "<" ? m < rule.level : m > rule.level;
          if (tripped) {
            emit({ EVENT: "invalidation", RULE: `${rule.sym}${rule.op}${rule.level}`, NOW: m.toFixed(2), UPNL: upnl.toFixed(2), SUGGEST: "consider_cut", ELAPSED: elapsedFmt });
            emitted.add(k);
          }
        }

        // 8. stale
        if (elapsedMs > STALE_MS && !emitted.has("stale")) {
          emit({ EVENT: "stale", ELAPSED: elapsedFmt, UPNL: upnl.toFixed(2), SUGGEST: "tighten_or_cut" });
          emitted.add("stale");
        }
      }

      lastQty = qty;
      if (avg != null) lastAvg = avg;
    } catch (e) {
      emit({ EVENT: "error", MSG: e.message.slice(0, 80) });
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }

  emit({ EVENT: "monitor_exit", REASON: "max_runtime" });
}

main().catch((e) => {
  console.error("fatal", e);
  process.exit(1);
});
