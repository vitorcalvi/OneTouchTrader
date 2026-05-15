import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import type { AlpacaService } from "@/services/stocks";
import { safeParseFloat } from "@/shared/utils/numbers";
import type { Position } from "@/types";
import { formatPrice } from "@/utils/stocks/tradeExecutionUtils";
import {
  type LayeredStopsLayer,
  useLayeredStopsMachine,
} from "./useLayeredStopsMachine";

interface LayeredStopsParams {
  symbol: string;
  side: "buy" | "sell";
  qty: number;
  isCrypto: boolean;
  initialStopId: string | null;
  initialStopPrice: number;
  entryFillPrice: number;
  l2TrailPct: number;
  l3TrailPct: number;
  layer2Enabled?: boolean;
  layer3Enabled?: boolean;
}

interface UseLayeredStopsParams {
  service: AlpacaService;
  positions: Position[];
  realtimePrices: Record<string, number>;
  layeredSymbolsRef: React.MutableRefObject<Set<string>>;
}

export function useLayeredStops({
  service,
  positions,
  realtimePrices,
  layeredSymbolsRef,
}: UseLayeredStopsParams) {
  const layeredStopsAbortRef = useRef(false);
  const positionsRef = useRef(positions);
  const realtimePricesRef = useRef(realtimePrices);

  useEffect(() => {
    positionsRef.current = positions;
  }, [positions]);

  useEffect(() => {
    realtimePricesRef.current = realtimePrices;
  }, [realtimePrices]);

  useEffect(() => {
    layeredStopsAbortRef.current = false;
    return () => {
      layeredStopsAbortRef.current = true;
    };
  }, []);

  const normSym = useCallback((s: string) => {
    return s
      .replace("/", "")
      .replace("-", "")
      .replace("_", "")
      .toUpperCase()
      .trim();
  }, []);
  const isPositionOpen = useCallback(
    (symbol: string) => {
      const normalizedSymbol = normSym(symbol);
      return positionsRef.current.some(
        (p) => normSym(p.symbol) === normalizedSymbol,
      );
    },
    [normSym],
  );

  const activeSymbolRef = useRef<string | null>(null);

  const machine = useLayeredStopsMachine({
    isPositionOpen: () => {
      const symbol = activeSymbolRef.current;
      return symbol ? isPositionOpen(symbol) : false;
    },
  });

  const startLayeredStops = useCallback(
    async ({
      symbol: symParam,
      side,
      qty: qtyParam,
      isCrypto: isCryptoParam,
      initialStopId,
      initialStopPrice,
      entryFillPrice,
      l2TrailPct,
      l3TrailPct,
      layer2Enabled = true,
      layer3Enabled = true,
    }: LayeredStopsParams) => {
      const upperSymbol = symParam.toUpperCase();
      const formatLocalPrice = (v: number) => formatPrice(v, isCryptoParam);
      activeSymbolRef.current = upperSymbol;
      const hasPos = () => isPositionOpen(upperSymbol);
      const startReplacingIfOpen = (layer: LayeredStopsLayer) => {
        if (machine.isAborted.current || layeredStopsAbortRef.current)
          return false;
        const canReplace = machine.startReplacing(layer);
        if (!canReplace) {
          layeredStopsAbortRef.current = true;
        }
        return canReplace;
      };

      const getLivePrice = async () => {
        const cached = realtimePricesRef.current[upperSymbol];
        if (Number.isFinite(cached)) return cached;
        return await service.getLatestTrade(upperSymbol);
      };

      const priceEpsilon = isCryptoParam ? 1e-6 : 0.02;
      let slOrderId = initialStopId;
      let currentSlPrice = initialStopPrice;

      const replaceStop = async (
        newPrice: number,
        layer: LayeredStopsLayer,
      ) => {
        if (!startReplacingIfOpen(layer)) {
          return;
        }
        console.log(
          `[LayeredSL replaceStop] Attempting to update SL for ${upperSymbol} to ${newPrice} (current orderId: ${slOrderId})`,
        );
        const stopSide = side === "buy" ? "sell" : "buy";
        const pos = positionsRef.current.find(
          (p) => normSym(p.symbol) === normSym(upperSymbol),
        );
        const liveQty = pos
          ? Math.abs(safeParseFloat(pos.qty, qtyParam))
          : qtyParam;
        const payload = {
          symbol: upperSymbol,
          qty: String(liveQty),
          side: stopSide,
          type: "stop",
          stop_price: formatLocalPrice(newPrice),
          time_in_force: "day",
        } as const;

        if (slOrderId) {
          try {
            console.log(
              `[LayeredSL replaceStop] Replacing order ${slOrderId} with stop_price=${payload.stop_price}`,
            );
            const updated = await service.replaceOrder(slOrderId, {
              stop_price: payload.stop_price,
            });
            slOrderId = updated.id;
            currentSlPrice = newPrice;
            machine.confirmReplacement(layer);
            console.log(
              `[LayeredSL replaceStop] ✅ Successfully replaced order ${slOrderId}`,
            );
            return;
          } catch (err) {
            console.warn(
              "[LayeredSL replaceStop] ⚠️ Replace failed, falling back to new order:",
              err,
            );
          }
        }

        console.log(
          `[LayeredSL replaceStop] Canceling existing stops for ${upperSymbol} before new order`,
        );
        try {
          const openOrders = await service.getOrders("open");
          const existingStops = openOrders.filter(
            (o) =>
              normSym(o.symbol) === normSym(upperSymbol) &&
              o.side === stopSide &&
              (o.type === "stop" || o.type === "stop_limit"),
          );
          await Promise.all(
            existingStops.map((o) =>
              service
                .cancelOrder(o.id)
                .catch((err) =>
                  console.error("[useLayeredStops]", err.message),
                ),
            ),
          );
          if (existingStops.length > 0) {
            await new Promise((r) => setTimeout(r, 400));
          }
        } catch {}

        if (!hasPos()) {
          machine.abort(layer);
          layeredStopsAbortRef.current = true;
          return;
        }

        console.log(
          `[LayeredSL replaceStop] Creating new stop order for ${upperSymbol}`,
        );
        const newOrder = await service.submitOrder(
          payload as Parameters<AlpacaService["submitOrder"]>[0],
        );
        slOrderId = newOrder.id;
        currentSlPrice = newPrice;
        machine.confirmReplacement(layer);
        console.log(
          `[LayeredSL replaceStop] ✅ Created new order ${slOrderId}`,
        );
      };

      machine.reset("L1");
      machine.startWatching("L1");

      if (!slOrderId) {
        try {
          const openOrders = await service.getOrders("open");
          const stopSide = side === "buy" ? "sell" : "buy";
          const matchingStops = openOrders.filter(
            (o) =>
              normSym(o.symbol) === normSym(upperSymbol) &&
              o.side === stopSide &&
              o.type === "stop",
          );
          if (matchingStops.length > 1) {
            console.warn(
              `[LayeredStops] Multiple stop orders found for ${upperSymbol} — using most recent`,
              matchingStops.map((o) => o.id),
            );
          }
          // Use most recently created
          const stop = matchingStops.sort(
            (a, b) =>
              Date.parse(b.created_at || "0") - Date.parse(a.created_at || "0"),
          )[0];
          if (stop) {
            slOrderId = stop.id;
            currentSlPrice = safeParseFloat(stop.stop_price, initialStopPrice);
          }
        } catch {}
      }

      // Skip L2 and L3 entirely if both disabled
      if (!layer2Enabled && !layer3Enabled) {
        console.log(
          `%c[LayeredStops] L2+L3 disabled — skipping`,
          "color:#94a3b8",
        );
        return;
      }

      let beReached = false;
      let l2Errors = 0;
      let consecutiveNoPos = 0;
      let l2Ticks = 0;

      if (layer2Enabled) {
        machine.startWatching("L2");
        console.log(
          `%c[L2 START] ${upperSymbol} | side=${side} | entry=$${entryFillPrice} | trail=${l2TrailPct}%`,
          "color:#facc15;font-weight:bold",
        );
        while (!beReached) {
          await new Promise((r) => setTimeout(r, 1000));
          l2Ticks++;
          try {
            if (layeredStopsAbortRef.current || machine.isAborted.current) {
              machine.abort("L2");
              console.log(
                `%c[L2 ABORT] ${upperSymbol}`,
                "color:#f87171;font-weight:bold",
              );
              return;
            }
            if (!hasPos()) {
              consecutiveNoPos += 1;
              if (consecutiveNoPos >= 5) {
                machine.abort("L2");
                layeredStopsAbortRef.current = true;
                console.log(
                  `%c[L2 EXIT] ${upperSymbol} — position gone`,
                  "color:#f87171;font-weight:bold",
                );
                return;
              }
              l2Errors = 0;
              continue;
            }
            consecutiveNoPos = 0;
            machine.startWatching("L2");
            const currentPrice = await getLivePrice();
            const rawNewSl =
              side === "buy"
                ? currentPrice * (1 - l2TrailPct / 100)
                : currentPrice * (1 + l2TrailPct / 100);
            const beTargetPrice = entryFillPrice;
            const newSlPrice =
              side === "buy"
                ? Math.max(rawNewSl, currentSlPrice)
                : Math.min(rawNewSl, currentSlPrice);
            const moved =
              side === "buy"
                ? newSlPrice > currentSlPrice + priceEpsilon
                : newSlPrice < currentSlPrice - priceEpsilon;
            const cappedAtBE =
              side === "buy"
                ? rawNewSl >= beTargetPrice &&
                  newSlPrice === beTargetPrice &&
                  currentSlPrice < beTargetPrice - 0.001
                : rawNewSl <= beTargetPrice &&
                  newSlPrice === beTargetPrice &&
                  currentSlPrice > beTargetPrice + 0.001;
            if (moved || cappedAtBE) {
              console.log(
                `%c[L2 MOVE] ${upperSymbol} | SL $${currentSlPrice} → $${newSlPrice} | price=$${currentPrice} | entry=$${entryFillPrice}${cappedAtBE ? " [BE-FORCE]" : ""}`,
                "color:#34d399;font-weight:bold",
              );
              await replaceStop(newSlPrice, "L2");
              if (machine.isAborted.current || layeredStopsAbortRef.current) {
                return;
              }
              beReached =
                side === "buy"
                  ? currentSlPrice >= beTargetPrice - 0.001
                  : currentSlPrice <= beTargetPrice + 0.001;
              if (beReached) {
                console.log(
                  `%c[L2 BE ✅] ${upperSymbol} — risk eliminated @ $${formatLocalPrice(beTargetPrice)}`,
                  "color:#4ade80;font-weight:bold;font-size:13px",
                );
                toast.success(
                  `SL at BE — risk eliminated ($${formatLocalPrice(beTargetPrice)})`,
                );
              }
            } else if (l2Ticks % 10 === 0) {
              const gap = Math.abs(newSlPrice - currentSlPrice).toFixed(3);
              console.log(
                `%c[L2 WATCH] ${upperSymbol} | price=$${currentPrice} | SL=$${currentSlPrice} | target=$${newSlPrice} | gap=$${gap}`,
                "color:#94a3b8",
              );
            }
            l2Errors = 0;
          } catch (err) {
            l2Errors += 1;
            console.error(
              `%c[L2 ERROR #${l2Errors}] ${upperSymbol}`,
              "color:#f87171;font-weight:bold",
              err,
            );
            if (l2Errors >= 5) {
              machine.abort("L2");
              console.error(
                `%c[L2 FATAL] ${upperSymbol} — stopped after 5 errors`,
                "color:#f87171;font-weight:bold",
              );
              toast.error(
                `Stop loss chasing stopped after 5 errors. Check console for details.`,
              );
              return;
            }
            await new Promise((r) => setTimeout(r, 1500));
          }
        }
        console.log(
          `%c[L2 DONE] ${upperSymbol} — handing off to L3`,
          "color:#facc15;font-weight:bold",
        );
      } else {
        console.log(
          `%c[L2 SKIP] ${upperSymbol} — L2 disabled, jumping to L3`,
          "color:#94a3b8;font-weight:bold",
        );
        beReached = true;
      }

      if (layer3Enabled) {
        let highWaterMark = entryFillPrice;
        let l3Errors = 0;
        let consecutiveNoPosL3 = 0;
        let l3Ticks = 0;
        machine.startWatching("L3");
        console.log(
          `%c[L3 START] ${upperSymbol} | side=${side} | entry=$${entryFillPrice} | trail=${l3TrailPct}% from HWM`,
          "color:#818cf8;font-weight:bold",
        );
        while (true) {
          await new Promise((r) => setTimeout(r, 1000));
          l3Ticks++;
          try {
            if (layeredStopsAbortRef.current || machine.isAborted.current) {
              machine.abort("L3");
              console.log(
                `%c[L3 ABORT] ${upperSymbol}`,
                "color:#f87171;font-weight:bold",
              );
              break;
            }
            if (!hasPos()) {
              consecutiveNoPosL3 += 1;
              if (consecutiveNoPosL3 >= 5) {
                machine.abort("L3");
                layeredStopsAbortRef.current = true;
                console.log(
                  `%c[L3 EXIT] ${upperSymbol} — position gone`,
                  "color:#f87171;font-weight:bold",
                );
                break;
              }
              l3Errors = 0;
              continue;
            }
            consecutiveNoPosL3 = 0;
            machine.startWatching("L3");
            const currentPrice = await getLivePrice();
            highWaterMark =
              side === "buy"
                ? Math.max(highWaterMark, currentPrice)
                : Math.min(highWaterMark, currentPrice);
            const newSlPrice =
              side === "buy"
                ? highWaterMark * (1 - l3TrailPct / 100)
                : highWaterMark * (1 + l3TrailPct / 100);
            const moved =
              side === "buy"
                ? newSlPrice > currentSlPrice + priceEpsilon
                : newSlPrice < currentSlPrice - priceEpsilon;
            if (moved) {
              console.log(
                `%c[L3 MOVE] ${upperSymbol} | SL $${currentSlPrice} → $${newSlPrice} | HWM=$${highWaterMark} | price=$${currentPrice}`,
                "color:#a78bfa;font-weight:bold",
              );
              await replaceStop(newSlPrice, "L3");
              if (machine.isAborted.current) {
                break;
              }
            } else if (l3Ticks % 10 === 0) {
              console.log(
                `%c[L3 WATCH] ${upperSymbol} | price=$${currentPrice} | HWM=$${highWaterMark} | SL=$${currentSlPrice} | next=$${newSlPrice.toFixed(2)}`,
                "color:#94a3b8",
              );
            }
            l3Errors = 0;
          } catch (err) {
            l3Errors += 1;
            console.error(
              `%c[L3 ERROR #${l3Errors}] ${upperSymbol}`,
              "color:#f87171;font-weight:bold",
              err,
            );
            if (l3Errors >= 5) {
              machine.abort("L3");
              console.log(
                `%c[L3 FATAL] ${upperSymbol} — stopped after 5 errors`,
                "color:#f87171;font-weight:bold",
              );
              break;
            }
            await new Promise((r) => setTimeout(r, 1500));
          }
        }
      } else {
        console.log(
          `%c[L3 SKIP] ${upperSymbol} — L3 disabled`,
          "color:#94a3b8;font-weight:bold",
        );
      }
    },
    [isPositionOpen, machine, normSym, service],
  );

  return {
    startLayeredStops,
    layeredStopsAbortRef,
    layeredSymbolsRef,
    layeredStopsState: machine.state,
    layeredStopsLayer: machine.layer,
  };
}
