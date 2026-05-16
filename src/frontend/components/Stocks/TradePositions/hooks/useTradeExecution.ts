import { useCallback, useRef, useEffect } from "react";
import { toast } from "sonner";
import { AlpacaService } from "@/services/stocks";
import { Order } from "@/types";
import { safeParseFloat } from "@/shared/utils/numbers";
import { runWithRetry, formatPrice } from "@/utils/stocks/tradeExecutionUtils";

interface TradeExecutionConfig {
  stopLossOffsetPct: number;
  autoStopLossPct: number;
  layer1Enabled: boolean;
  layer2Enabled: boolean;
  layer3Enabled: boolean;
  layer2TrailPct: number;
  layer3TrailPct: number;
}

interface UseTradeExecutionParams {
  service: AlpacaService;
  realtimePrices: Record<string, number>;
  config: TradeExecutionConfig;
  startLayeredStops: (params: {
    symbol: string;
    side: "buy" | "sell";
    qty: number;
    isCrypto: boolean;
    initialStopId: string | null;
    initialStopPrice: number;
    entryFillPrice: number;
    l2TrailPct: number;
    l3TrailPct: number;
  }) => Promise<void>;
  layeredSymbolsRef: React.MutableRefObject<Set<string>>;
}

export function useTradeExecution({
  service,
  realtimePrices,
  config,
  startLayeredStops,
  layeredSymbolsRef,
}: UseTradeExecutionParams) {
  const realtimePricesRef = useRef(realtimePrices);
  const abortControllerRef = useRef(new AbortController());

  useEffect(() => {
    const controller = new AbortController();
    abortControllerRef.current = controller;
    return () => {
      controller.abort();
    };
  }, []);

  useEffect(() => {
    realtimePricesRef.current = realtimePrices;
  }, [realtimePrices]);

  const waitForOrderFill = useCallback(
    async (orderId: string, maxAttempts = 35, pollDelay = 500) => {
      let attempts = 0;
      while (attempts < maxAttempts) {
        await new Promise((r) => setTimeout(r, pollDelay));
        const allOrders = await service.getOrders("all");
        const checkOrder = allOrders.find((o) => o.id === orderId);

        if (checkOrder?.status === "filled") {
          return checkOrder;
        }

        if (
          ["canceled", "rejected", "expired"].includes(checkOrder?.status || "")
        ) {
          throw new Error(
            `Order ${checkOrder?.status}: ${checkOrder?.status === "canceled" ? "Order was canceled" : "Check order details"}`,
          );
        }
        attempts++;
      }

      try {
        await service.cancelOrder(orderId);
      } catch (err) {
        console.debug(
          "Failed to cancel order after timeout:",
          err instanceof Error ? err.message : String(err),
        );
      }
      throw new Error("Timed out waiting for fill");
    },
    [service],
  );

  const executeSmartEntry = useCallback(
    async (
      side: "buy" | "sell",
      symbol: string,
      qty: number,
      extendedHours: boolean,
      orderTypeOverride?: "market" | "limit" | "stop",
      riskSettings?: {
        stopLoss?: number;
        takeProfit?: number;
        entryOffsetPips?: number;
        entryPrice?: number;
        trailingStop?: number;
      },
    ) => {
      const upperSymbol = symbol.toUpperCase();
      const effectiveOrderType = orderTypeOverride || "limit";
      const effectiveRisk = {
        stopLoss: config.stopLossOffsetPct,
        ...riskSettings,
      };

      let filledPrice = 0;

      try {
        const looksCrypto =
          upperSymbol.includes("/") ||
          /^[A-Z0-9]{2,15}USD(T)?$/.test(upperSymbol);
        let isCrypto = looksCrypto;
        try {
          const asset = await service.getAsset(upperSymbol);
          if (asset?.class) isCrypto = asset.class === "crypto";
        } catch (err) {
          console.warn(
            "Failed to check asset class, defaulting to stock behavior",
            err,
          );
        }

        if (isCrypto) {
          try {
            const openOrders = await service.getOrders("open");
            const normSym = (s: string) =>
              s
                .replace("/", "")
                .replace("-", "")
                .replace("_", "")
                .toUpperCase()
                .trim();
            const staleOrders = openOrders.filter(
              (o) => normSym(o.symbol) === normSym(upperSymbol),
            );
            if (staleOrders.length > 0) {
              console.log(
                `[Trade] Canceling ${staleOrders.length} existing orders for ${upperSymbol} before new entry`,
              );
              await Promise.all(
                staleOrders.map((o) => service.cancelOrder(o.id)),
              );
              await new Promise((r) => setTimeout(r, 300));
            }
          } catch (err) {
            console.debug(
              "[Trade] Failed to clear stale orders before entry:",
              err,
            );
          }
        }

        const latestPrice =
          realtimePricesRef.current[upperSymbol] ||
          (await service.getLatestTrade(upperSymbol));
        const orderPayload: any = {
          symbol: upperSymbol,
          qty: String(qty),
          side: side,
          time_in_force: isCrypto ? "gtc" : "day",
        };

        const pipSize = !isCrypto
          ? 0.01
          : latestPrice >= 1000
            ? 0.1
            : latestPrice >= 100
              ? 0.01
              : latestPrice >= 1
                ? 0.001
                : 0.0001;
        const entryOffsetPips = Number.isFinite(
          effectiveRisk.entryOffsetPips as number,
        )
          ? Number(effectiveRisk.entryOffsetPips)
          : 1;
        const entryOffsetDistance = entryOffsetPips * pipSize;

        if (effectiveOrderType === "stop") {
          const triggerPrice =
            Number.isFinite(effectiveRisk.entryPrice as number) &&
            effectiveRisk.entryPrice! > 0
              ? effectiveRisk.entryPrice!
              : side === "buy"
                ? latestPrice + entryOffsetDistance
                : latestPrice - entryOffsetDistance;

          if (side === "buy" && triggerPrice <= latestPrice) {
            toast.error(
              `Buy Stop price (${formatPrice(triggerPrice, isCrypto)}) must be ABOVE current price (${formatPrice(latestPrice, isCrypto)})`,
            );
            return { filledPrice: 0 };
          }
          if (side === "sell" && triggerPrice >= latestPrice) {
            toast.error(
              `Sell Stop price (${formatPrice(triggerPrice, isCrypto)}) must be BELOW current price (${formatPrice(latestPrice, isCrypto)})`,
            );
            return { filledPrice: 0 };
          }

          orderPayload.type = "stop";
          orderPayload.stop_price = Number(triggerPrice.toFixed(2));
          orderPayload.time_in_force = "gtc";

          console.log(
            `🚀 ${side.toUpperCase()} Stop @ ${orderPayload.stop_price}`,
          );
        } else if (effectiveOrderType === "limit") {
          const limitPrice =
            Number.isFinite(effectiveRisk.entryPrice as number) &&
            effectiveRisk.entryPrice! > 0
              ? effectiveRisk.entryPrice!
              : side === "buy"
                ? latestPrice - entryOffsetDistance
                : latestPrice + entryOffsetDistance;

          const isStopDirection =
            (side === "sell" && limitPrice < latestPrice) ||
            (side === "buy" && limitPrice > latestPrice);

          if (isStopDirection) {
            const limitBuffer = isCrypto
              ? Math.max(limitPrice * 0.001, pipSize)
              : 0.02;
            orderPayload.type = "stop_limit";
            orderPayload.stop_price = formatPrice(limitPrice, isCrypto);
            orderPayload.limit_price = formatPrice(
              side === "sell"
                ? limitPrice - limitBuffer
                : limitPrice + limitBuffer,
              isCrypto,
            );
            orderPayload.time_in_force = isCrypto ? "gtc" : "day";
            console.log(
              `🚀 ${side.toUpperCase()} Stop-Limit @ stop=${orderPayload.stop_price} limit=${orderPayload.limit_price}`,
            );
          } else {
            orderPayload.type = "limit";
            orderPayload.limit_price = formatPrice(limitPrice, isCrypto);
            orderPayload.time_in_force = isCrypto ? "gtc" : "day";
            if (!isCrypto && extendedHours) {
              orderPayload.extended_hours = true;
            }
          }
        } else if (extendedHours) {
          orderPayload.type = "limit";
          if (isCrypto) {
            orderPayload.time_in_force = "gtc";
          } else {
            orderPayload.time_in_force = "day";
            orderPayload.extended_hours = true;
          }
          const buffer = 0.002;
          const lPrice =
            side === "buy"
              ? latestPrice * (1 + buffer)
              : latestPrice * (1 - buffer);
          orderPayload.limit_price = formatPrice(lPrice, isCrypto);
        } else {
          orderPayload.type = "market";
          if (!isCrypto && config.layer1Enabled) {
            if (side === "buy") {
              const rawSl = latestPrice * (1 - config.autoStopLossPct / 100);
              orderPayload.order_class = "oto";
              orderPayload.stop_loss = { stop_price: rawSl.toFixed(2) };
            } else if (side === "sell") {
              const rawSl = latestPrice * (1 + config.autoStopLossPct / 100);
              orderPayload.order_class = "oto";
              orderPayload.stop_loss = { stop_price: rawSl.toFixed(2) };
            }
          }
        }

        const entryOrder = await service.submitOrder(orderPayload);

        if (!entryOrder || !entryOrder.id) {
          throw new Error(
            "Order submitted but response is invalid or missing ID",
          );
        }

        // If already filled (market order instant fill), skip polling
        if (entryOrder.status === "filled") {
          console.log(
            "[TradeExecution] Order already filled on submission, skipping poll",
          );
          filledPrice = safeParseFloat(entryOrder.filled_avg_price, 0);
          // Place stop loss and start layered stops for instant fills
          const stopSide = side === "buy" ? "sell" : "buy";
          const stopPrice = formatPrice(
            side === "buy"
              ? filledPrice * (1 - config.autoStopLossPct / 100)
              : filledPrice * (1 + config.autoStopLossPct / 100),
            isCrypto,
          );
          let placedOrder: Order | null = null;
          let slPlaced = false;
          for (let attempt = 1; attempt <= 3 && !slPlaced; attempt++) {
            if (attempt > 1) await new Promise((r) => setTimeout(r, 800));
            try {
              placedOrder = await service.submitOrder({
                symbol: upperSymbol,
                qty: String(qty),
                side: stopSide,
                type: "stop",
                stop_price: stopPrice,
                time_in_force: isCrypto ? "gtc" : "day",
              });
              slPlaced = true;
            } catch (slErr: any) {
              console.warn(
                `[Trade] SL attempt ${attempt}/3 failed:`,
                slErr.message,
              );
            }
          }
          if (
            slPlaced &&
            !isCrypto &&
            (config.layer2Enabled || config.layer3Enabled)
          ) {
            console.log(
              `%c[Trade] 🚀 STARTING layered stops for ${upperSymbol} | stopId=${placedOrder?.id} | initialStop=$${stopPrice} | fillPrice=$${filledPrice}`,
              "color:#fbbf24;font-weight:bold",
            );
startLayeredStops({
               symbol: upperSymbol,
               side,
               qty,
               isCrypto,
               initialStopId: placedOrder?.id || null,
               initialStopPrice: safeParseFloat(stopPrice, 0),
               entryFillPrice: filledPrice,
               l2TrailPct: config.layer2TrailPct,
               l3TrailPct: config.layer3TrailPct,
             }).catch((err) => {
               console.error("[Trade] startLayeredStops failed:", err?.message);
             });
          } else if (!slPlaced) {
            console.error(
              "[Trade] Could not place SL after instant fill — closing position for safety",
            );
            try {
              await service.closePosition(upperSymbol);
            } catch {}
          }
          return { filledPrice };
        }

        // If rejected immediately
        if (["rejected", "cancelled", "expired"].includes(entryOrder.status)) {
          throw new Error(
            `Order rejected at submission with status: ${entryOrder.status}`,
          );
        }

        if (effectiveOrderType === "limit" || effectiveOrderType === "stop") {
          const isStopLimitOrder = orderPayload.type === "stop_limit";
          const label =
            effectiveOrderType === "stop"
              ? side === "buy"
                ? "Buy Stop"
                : "Sell Stop"
              : isStopLimitOrder
                ? side === "buy"
                  ? "Buy Stop-Limit"
                  : "Sell Stop-Limit"
                : side === "buy"
                  ? "Buy Limit"
                  : "Sell Limit";
          const entryPrice =
            effectiveOrderType === "stop" || isStopLimitOrder
              ? orderPayload.stop_price
              : orderPayload.limit_price;
          toast.success(`${label} placed @ $${entryPrice}`);

          const orderId = entryOrder.id;
          const trailPct = config.autoStopLossPct;
          const stopSide = side === "buy" ? "sell" : "buy";

          await runWithRetry(async () => {
            const POLL_TIMEOUT_MS = 120_000;
            const pollStart = Date.now();

            while (Date.now() - pollStart < POLL_TIMEOUT_MS) {
              if (abortControllerRef.current.signal.aborted) break;
              await new Promise((r) => setTimeout(r, 500));
              if (abortControllerRef.current.signal.aborted) break;

              try {
                const o = await service.getOrderById(orderId);
                if (
                  !o ||
                  ["canceled", "rejected", "expired"].includes(o.status)
                )
                  break;
                if (o.status === "filled" || o.status === "partially_filled") {
                  const orderQty = safeParseFloat(o.qty, qty);
                  const filledQty = safeParseFloat(o.filled_qty, 0);
                  const tolerance = isCrypto ? orderQty * 0.005 : 0.0001;
                  const isFullyFilled =
                    o.status === "filled" || filledQty >= orderQty - tolerance;

                  if (!isFullyFilled) {
                    console.log(
                      `[Trade] Order ${orderId} partially filled (${filledQty}/${orderQty}), waiting for full fill before SL`,
                    );
                    continue;
                  }

                  const fp = safeParseFloat(o.filled_avg_price, 0);
                  const sp =
                    side === "buy"
                      ? formatPrice(fp * (1 - trailPct / 100), isCrypto)
                      : formatPrice(fp * (1 + trailPct / 100), isCrypto);
                  let placedOrder: Order | null = null;
                  let slPlaced = false;
                  for (let attempt = 1; attempt <= 3 && !slPlaced; attempt++) {
                    if (attempt > 1)
                      await new Promise((r) => setTimeout(r, 800));
                    try {
                      placedOrder = await service.submitOrder({
                        symbol: upperSymbol,
                        qty: String(qty),
                        side: stopSide,
                        type: "stop",
                        stop_price: sp,
                        time_in_force: isCrypto ? "gtc" : "day",
                      });
                      slPlaced = true;
                    } catch (slErr: any) {
                      console.warn(
                        `[Trade] BG SL attempt ${attempt}/3 failed:`,
                        slErr.message,
                      );
                    }
                  }
                  if (!slPlaced) {
                    toast.error(
                      `Stop loss failed 3×. Closing position for safety (${upperSymbol}).`,
                    );
                    try {
                      await service.closePosition(upperSymbol);
                      toast.warning(
                        `Emergency: position closed for ${upperSymbol} — SL placement failed.`,
                      );
                    } catch (closeErr: any) {
                      toast.error(
                        `CRITICAL: Emergency close FAILED for ${upperSymbol}. ` +
                          `Manual action required immediately. Error: ${closeErr?.message}`,
                      );
                      console.error(
                        "[Emergency Close Failed]",
                        upperSymbol,
                        closeErr,
                      );
                    }
                  } else {
                    toast.success(`Stop Loss @ $${sp} (${label})`);
                    if (
                      !isCrypto &&
                      (config.layer2Enabled || config.layer3Enabled)
                    ) {
                      await startLayeredStops({
                        symbol: upperSymbol,
                        side,
                        qty: qty,
                        isCrypto,
                        initialStopId: placedOrder?.id || null,
                        initialStopPrice: safeParseFloat(sp, 0),
                        entryFillPrice: fp,
                        l2TrailPct: config.layer2TrailPct,
                        l3TrailPct: config.layer3TrailPct,
                      });
                    }
                  }
                  break;
                }
              } catch (err: any) {
                console.warn(
                  "[OrderPolling] Error fetching order status:",
                  err?.message,
                );
                throw err;
              }
            }

            if (Date.now() - pollStart >= POLL_TIMEOUT_MS) {
              toast.error(
                `Order fill timeout for ${upperSymbol}. Stop loss NOT placed. Check your positions.`,
              );
              throw new Error(`Fill polling timed out for order ${orderId}`);
            }
          }, `SL Placement (${upperSymbol})`);

          return { filledPrice: -1 };
        }

        const filledOrder = await waitForOrderFill(entryOrder.id);
        filledPrice = safeParseFloat(filledOrder.filled_avg_price, 0);
        console.log(`[Trade] Order filled at $${filledPrice}`);

        const stopSide = side === "buy" ? "sell" : "buy";
        const trailPct = config.autoStopLossPct;
        const stopPrice =
          side === "buy"
            ? formatPrice(filledPrice * (1 - trailPct / 100), isCrypto)
            : formatPrice(filledPrice * (1 + trailPct / 100), isCrypto);

        let placedOrder: Order | null = null;
        let slPlaced = false;
        for (let attempt = 1; attempt <= 3 && !slPlaced; attempt++) {
          if (attempt > 1) await new Promise((r) => setTimeout(r, 800));
          try {
            placedOrder = await service.submitOrder({
              symbol: upperSymbol,
              qty: String(qty),
              side: stopSide,
              type: "stop",
              stop_price: stopPrice,
              time_in_force: isCrypto ? "gtc" : "day",
            });
            slPlaced = true;
            console.log(
              `[Trade] Stop loss placed (attempt ${attempt}): $${stopPrice}`,
            );
          } catch (err: any) {
            console.warn(
              `[Trade] SL attempt ${attempt}/3 failed:`,
              err.message,
            );
          }
        }

        if (!slPlaced) {
          console.error(
            "[Trade] Could not place SL after 3 attempts — closing position for safety",
          );
          toast.error("Stop loss failed 3×. Closing position for safety.");
          try {
            await service.closePosition(upperSymbol);
            toast.warning(
              `Emergency: position closed for ${upperSymbol} — SL placement failed.`,
            );
          } catch (closeErr: any) {
            toast.error(
              `CRITICAL: Emergency close FAILED for ${upperSymbol}. ` +
                `Manual action required immediately. Error: ${closeErr?.message}`,
            );
            console.error("[Emergency Close Failed]", upperSymbol, closeErr);
          }
        } else {
          toast.success(`Stop Loss @ $${stopPrice}`);
          if (!isCrypto && (config.layer2Enabled || config.layer3Enabled)) {
            void startLayeredStops({
              symbol: upperSymbol,
              side,
              qty: qty,
              isCrypto,
              initialStopId: placedOrder?.id || null,
              initialStopPrice: safeParseFloat(stopPrice, 0),
              entryFillPrice: filledPrice,
              l2TrailPct: config.layer2TrailPct,
              l3TrailPct: config.layer3TrailPct,
            });
          }
        }
      } catch (err: any) {
        console.error("[Trade] Execution error:", err);
        toast.error(err.message || "Trade execution failed");
        return { filledPrice: 0 };
      }

      return { filledPrice };
    },
    [service, config, waitForOrderFill, startLayeredStops, layeredSymbolsRef],
  );

  return {
    executeSmartEntry,
    waitForOrderFill,
    realtimePricesRef,
  };
}
