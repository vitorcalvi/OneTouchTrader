import { useCallback } from "react";
import { toast } from "sonner";
import { AlpacaService } from "@/services/stocks";
import { Order, Position } from "@/types";
import { safeParseFloat } from "@/shared/utils/numbers";
import { getTradingConfig } from "@/config/envConfig";
import { calculateATR } from "@/utils/stocks/indicators";
import {
  findStaleOrphanOrders,
  normalizeSymbol,
} from "@/utils/stocks/position-utils";
import { cancelOrderWithRetry } from "@/utils/stocks/tradeExecutionUtils";
import { vibrate } from "..";
import { cancelExistingExitOrders as cancelExitOrdersUtil } from "@/utils/stocks/cancelExistingExitOrders";

interface UsePositionActionsParams {
  service: AlpacaService;
  positions: Position[];
  setIsSubmitting: (value: boolean) => void;
  loadData: () => void;
  getAssetClass: (symbol: string) => Promise<"crypto" | "us_equity">;
  executeSmartEntry: (
    side: "buy" | "sell",
    symbol: string,
    qty: number,
    extendedHours: boolean,
    orderType?: "market" | "limit" | "stop",
    riskSettings?: {
      stopLoss?: number;
      takeProfit?: number;
      entryOffsetPips?: number;
      entryPrice?: number;
      trailingStop?: number;
    },
  ) => Promise<{ filledPrice: number }>;
  waitForOrderFill: (
    orderId: string,
    maxAttempts?: number,
    pollDelay?: number,
  ) => Promise<unknown>;
  setSymbol: (symbol: string) => void;
  setQty: (qty: number) => void;
  extendedHours: boolean;
  cancelSidewaysLimit: (symbol: string) => Promise<void>;
  executeSidewaysLimit: (
    pos: Position,
    payload?: { qty?: number },
  ) => Promise<void>;
}

export function usePositionActions({
  service,
  setIsSubmitting,
  loadData,
  getAssetClass,
  executeSmartEntry,
  waitForOrderFill,
  setSymbol,
  setQty,
  extendedHours,
  cancelSidewaysLimit,
  executeSidewaysLimit,
}: UsePositionActionsParams) {
  const clearOrphanOrders = useCallback(
    async (excludeOrderIds: string[] = []) => {
      try {
        const [openOrders, openPositions] = await Promise.all([
          service.getOrders("open"),
          service.getPositions(),
        ]);
        const staleOrphans = findStaleOrphanOrders(
          openOrders,
          openPositions,
          excludeOrderIds,
          5_000,
        );
        if (staleOrphans.length === 0) return;
        await Promise.all(staleOrphans.map((o) => service.cancelOrder(o.id)));
      } catch (err) {
        console.debug(
          "Failed to clear orphan orders:",
          err instanceof Error ? err.message : String(err),
        );
      }
    },
    [service],
  );

  const executeClosePosition = useCallback(
    async (
      position: Position,
      {
        manageSubmitting = true,
        closeQty,
      }: { manageSubmitting?: boolean; closeQty?: number } = {},
    ) => {
      if (manageSubmitting) setIsSubmitting(true);
      try {
        const assetClass = await getAssetClass(position.symbol);
        const positionQty = Math.abs(safeParseFloat(position.qty, 0));

        if (positionQty <= 0) {
          toast.error(`No position to close for ${position.symbol}`);
          return null;
        }

        const qtyToClose =
          closeQty !== undefined
            ? Math.min(closeQty, positionQty)
            : positionQty;

        if (qtyToClose <= 0) {
          toast.error(`Invalid close quantity for ${position.symbol}`);
          return null;
        }

        if (closeQty !== undefined && closeQty > positionQty) {
          toast.info(
            `Requested ${closeQty} shares exceeds position of ${positionQty}. Closing ${positionQty} instead.`,
          );
        }

        const isPartialClose = qtyToClose < positionQty;
        const percentageLabel = isPartialClose
          ? ` (${Math.round((qtyToClose / positionQty) * 100)}%)`
          : "";

        const posSymbolNorm = normalizeSymbol(position.symbol);
        try {
          const openOrders = await service.getOrders("open");
          const relevantOrders = openOrders.filter(
            (o) => normalizeSymbol(o.symbol) === posSymbolNorm,
          );
          console.log(
            `[Trade] Found ${relevantOrders.length} open orders for ${position.symbol}:`,
            relevantOrders.map(
              (o) => `${o.id} ${o.symbol} ${o.type} ${o.side} ${o.status}`,
            ),
          );

          if (relevantOrders.length > 0) {
            await Promise.all(
              relevantOrders.map((o) => service.cancelOrder(o.id)),
            );
            console.log(
              `[Trade] Cancel requests sent for ${relevantOrders.length} orders`,
            );

            for (let i = 0; i < 20; i++) {
              await new Promise((r) => setTimeout(r, 500));
              try {
                const remaining = await service.getOrders("open");
                const stillActive = remaining.filter(
                  (o) => normalizeSymbol(o.symbol) === posSymbolNorm,
                );
                if (stillActive.length === 0) {
                  console.log(
                    `[Trade] Orders for ${position.symbol} confirmed canceled (attempt ${i + 1})`,
                  );
                  break;
                }
                console.log(
                  `[Trade] Still ${stillActive.length} active orders (attempt ${i + 1})`,
                );
              } catch {}
            }
            await new Promise((r) => setTimeout(r, 500));
          }
        } catch (err) {
          console.debug(
            "Failed to cancel open orders:",
            err instanceof Error ? err.message : String(err),
          );
        }

        const isLong = position.side === "long";
        if (assetClass === "crypto") {
          if (isPartialClose) {
            const closeOrder = await service.submitOrder({
              symbol: position.symbol,
              qty: qtyToClose.toString(),
              side: isLong ? "sell" : "buy",
              type: "market",
              time_in_force: "gtc",
            });
            vibrate([50, 50, 50]);
            toast.success(
              `Partial Close ${position.symbol}${percentageLabel}: ${qtyToClose} shares`,
            );
            loadData();
            return closeOrder;
          }
          await service.closePosition(position.symbol);
          vibrate([50, 50, 50]);
          toast.success(`Closed ${position.symbol}`);
          loadData();
          return null;
        }

        const closeOrder = await service.submitOrder({
          symbol: position.symbol,
          qty: qtyToClose.toString(),
          side: isLong ? "sell" : "buy",
          type: "market",
          time_in_force: "day",
        });
        vibrate([50, 50, 50]);
        const toastMessage = isPartialClose
          ? `Partial Close ${position.symbol}${percentageLabel}: ${qtyToClose} shares`
          : `Flash Closed ${position.symbol}`;
        toast.success(toastMessage);
        loadData();
        return closeOrder;
      } catch (e: unknown) {
        const error = e as Error;
        toast.error(error.message);
        throw e;
      } finally {
        if (manageSubmitting) setIsSubmitting(false);
      }
    },
    [service, loadData, getAssetClass, setIsSubmitting],
  );

  const executeReversal = useCallback(
    async (position: Position) => {
      const reversalSymbol = position.symbol;
      const reversalQty = Math.abs(safeParseFloat(position.qty, 0));
      const oppositeSide: "buy" | "sell" =
        position.side === "long" ? "sell" : "buy";

      try {
        setIsSubmitting(true);
        const closeOrder = await executeClosePosition(position, {
          manageSubmitting: false,
        });

        if (closeOrder && "id" in closeOrder) {
          toast.info(`Waiting for ${reversalSymbol} close fill...`);
          await waitForOrderFill(closeOrder.id as string, 20, 500);
        }

        toast.info(`Settling ${reversalSymbol}...`);
        let settled = false;
        const maxSettleAttempts = 15;

        for (let i = 0; i < maxSettleAttempts; i++) {
          await new Promise((r) => setTimeout(r, 800));

          const currentPositions = await service.getPositions();
          const stillHasPosition = currentPositions.some(
            (p) => p.symbol === reversalSymbol,
          );

          console.log(
            `[Reversal] Settle check ${i + 1}: position=${stillHasPosition}`,
          );

          if (!stillHasPosition) {
            settled = true;
            break;
          }
        }

        if (!settled) {
          throw new Error(
            `Position for ${reversalSymbol} did not settle in time. Aborting reversal for safety.`,
          );
        }

        toast.success(`Closed ${reversalSymbol}`);

        await new Promise((r) => setTimeout(r, 500));

        setSymbol(reversalSymbol);
        setQty(reversalQty);
        await executeSmartEntry(
          oppositeSide,
          reversalSymbol,
          reversalQty,
          extendedHours,
        );

        vibrate([50, 50, 50]);
        toast.success(
          `Reversed ${reversalSymbol} to ${oppositeSide === "buy" ? "LONG" : "SHORT"}`,
        );
        loadData();
      } catch (e: unknown) {
        const error = e as Error;
        console.error("[Reversal] Error:", error.message);
        toast.error(error.message || "Reversal failed");
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      service,
      executeClosePosition,
      waitForOrderFill,
      setSymbol,
      setQty,
      executeSmartEntry,
      extendedHours,
      loadData,
      setIsSubmitting,
    ],
  );

  const cancelExistingExitOrders = useCallback(
    async (
      symbol: string,
      side?: "buy" | "sell",
      preFetchedOrders?: Order[],
    ) => {
      return cancelExitOrdersUtil(service, { symbol, side, preFetchedOrders });
    },
    [service],
  );

  const executeTrailingStop = useCallback(
    async (pos: Position, payload?: { percent?: number }) => {
      setIsSubmitting(true);
      try {
        const trailingConfig = getTradingConfig();
        const minTrailPct = Math.min(
          trailingConfig.trailingStopMinPct ?? 0.1,
          0.1,
        );
        const defaultTrailPct = trailingConfig.trailingStopDefaultPct ?? 0.5;
        const appliedTrail = payload?.percent ?? defaultTrailPct;
        const exitSide = pos.side === "long" ? "sell" : "buy";
        const assetClass = await getAssetClass(pos.symbol);

        const openOrders = await service.getOrders("open");
        const existingTsl = openOrders.find(
          (o) =>
            o.symbol === pos.symbol &&
            o.side === exitSide &&
            o.type === "trailing_stop",
        );

        if (existingTsl) {
          const existingPercent = safeParseFloat(existingTsl.trail_percent, 0);
          if (existingPercent === appliedTrail) {
            await service.cancelOrder(existingTsl.id);
            toast.info(`Trailing Stop deactivated for ${pos.symbol}`);
            loadData();
            return;
          }
          await service.cancelOrder(existingTsl.id);
          await new Promise((resolve) => setTimeout(resolve, 500));
        }

        const canceled = await cancelExistingExitOrders(pos.symbol, exitSide);
        if (canceled) {
          toast.info(`Existing exit orders canceled for ${pos.symbol}`);
          await new Promise((resolve) => setTimeout(resolve, 800));

          const verifyOrders = await service.getOrders("open");
          const remaining = verifyOrders.filter(
            (o) =>
              o.symbol === pos.symbol &&
              o.side === exitSide &&
              o.type !== "trailing_stop",
          );
          if (remaining.length > 0) {
            throw new Error(
              `Wait: ${remaining.length} orders still being cancelled for ${pos.symbol}`,
            );
          }
        }

        const positionQty = Math.abs(safeParseFloat(pos.qty, 0));
        if (positionQty <= 0) {
          throw new Error(
            "No position quantity available to set trailing stop",
          );
        }

        await service.submitOrder({
          symbol: pos.symbol,
          qty: positionQty.toString(),
          side: exitSide,
          type: "trailing_stop",
          trail_percent: Math.max(appliedTrail, minTrailPct).toString(),
          time_in_force: assetClass === "crypto" ? "gtc" : "day",
        });

        toast.success(
          `Trailing Stop activated (${appliedTrail}%) for ${pos.symbol}`,
        );
        loadData();
      } catch (e: unknown) {
        const error = e as Error;
        const msg = error.message || "";
        if (msg.includes("insufficient qty")) {
          toast.error(
            `Quantity mismatch for ${pos.symbol}. Try again in a second.`,
          );
        } else if (msg.includes("invalid order type for crypto")) {
          toast.error(`Trailing Stop not supported for Crypto on Alpaca`);
        } else {
          toast.error(msg || "Failed to update Trailing Stop");
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      service,
      getAssetClass,
      cancelExistingExitOrders,
      loadData,
      setIsSubmitting,
    ],
  );

  const executeCancelAllAndSetTp = useCallback(
    async (pos: Position, payload: { price: number; label: string }) => {
      const { price, label } = payload;
      const symbol = pos.symbol;
      const logPrefix = `[CancelAllSetTP][${symbol}]`;

      console.log(
        `${logPrefix} Starting operation. Target TP: ${price} (${label})`,
      );

      setIsSubmitting(true);
      toast.info(`Processing: Cancelling orders for ${symbol}...`);

      try {
        const startTime = Date.now();

        const allOrders = await service.getOrders("open");
        const symbolOrders = allOrders.filter((o) => o.symbol === symbol);

        console.log(`${logPrefix} Found ${symbolOrders.length} open orders.`);

        let existingStopPrice: string | null = null;

        const stopOrder = symbolOrders.find(
          (o) =>
            (o.type === "stop" || o.type === "stop_limit") &&
            o.side === (pos.side === "long" ? "sell" : "buy"),
        );

        if (stopOrder) {
          existingStopPrice = stopOrder.stop_price || null;
          console.log(`${logPrefix} Found existing SL at ${existingStopPrice}`);
        }

        if (symbolOrders.length > 0) {
          const results = await Promise.all(
            symbolOrders.map((o) =>
              cancelOrderWithRetry(
                (id) => service.cancelOrder(id),
                o.id,
                logPrefix,
              ),
            ),
          );
          const allCancelled = results.every((r) => r);

          if (!allCancelled) {
            throw new Error(
              "Failed to cancel some orders after retries. Aborting TP set for safety.",
            );
          }

          console.log(
            `${logPrefix} All ${symbolOrders.length} orders cancelled successfully.`,
          );
        }

        await new Promise((resolve) => setTimeout(resolve, 500));
        const verifyOrders = await service.getOrders("open");
        const remainingOrders = verifyOrders.filter((o) => o.symbol === symbol);

        if (remainingOrders.length > 0) {
          throw new Error(
            `${remainingOrders.length} orders still remain active. Aborting TP set.`,
          );
        }

        const oppositeSide = pos.side === "long" ? "sell" : "buy";
        const qty = Math.abs(safeParseFloat(pos.qty, 0)).toString();

        const assetClassForTp = await getAssetClass(symbol);
        const tpTif = assetClassForTp === "crypto" ? "gtc" : "day";

        const entryPrice = safeParseFloat(pos.avg_entry_price, 0);
        if (!existingStopPrice && entryPrice > 0) {
          const riskPerShare = Math.abs(price - entryPrice);
          const slDistance = riskPerShare;
          const autoSlPrice =
            pos.side === "long"
              ? (entryPrice - slDistance).toFixed(2)
              : (entryPrice + slDistance).toFixed(2);
          existingStopPrice = autoSlPrice;
          console.log(
            `${logPrefix} No existing SL found, auto-calculated SL at ${autoSlPrice} (1R from entry ${entryPrice})`,
          );
        }

        // Submit separate SL and TP orders instead of OCO
        // OCO mutual cancellation is not reliably implemented on Alpaca's side
        // This approach gives more control and is more predictable

        if (existingStopPrice) {
          await service.submitOrder({
            symbol,
            qty,
            side: oppositeSide,
            type: "stop",
            stop_price: existingStopPrice,
            time_in_force: tpTif,
          });
          console.log(`${logPrefix} Submitted SL at ${existingStopPrice}`);
        }

        await service.submitOrder({
          symbol,
          qty,
          side: oppositeSide,
          type: "limit",
          limit_price: price.toFixed(2),
          time_in_force: tpTif,
        });
        console.log(`${logPrefix} Submitted TP at ${price.toFixed(2)}`);

        toast.success(
          existingStopPrice
            ? `TP $${price.toFixed(2)} | SL $${existingStopPrice}`
            : `TP $${price.toFixed(2)} (no SL)`,
        );

        const duration = (Date.now() - startTime) / 1000;
        console.log(
          `${logPrefix} Operation completed successfully in ${duration.toFixed(2)}s`,
        );

        loadData();
      } catch (e: unknown) {
        const error = e as Error;
        console.error(`${logPrefix} Critical failure:`, error.message);
        toast.error(`Operation failed: ${error.message}`);
      } finally {
        setIsSubmitting(false);
      }
    },
    [service, getAssetClass, loadData, setIsSubmitting],
  );

  const executeSetSl = useCallback(
    async (pos: Position, payload: { price: number; label: string }) => {
      const { price, label } = payload;
      const symbol = pos.symbol;
      const side = pos.side === "long" ? "sell" : "buy";
      const logPrefix = `[SetSL][${symbol}]`;

      console.log(`${logPrefix} Setting SL at ${price} (${label})`);
      setIsSubmitting(true);
      toast.info(`Setting Stop Loss for ${symbol}...`);

      try {
        await cancelExistingExitOrders(symbol, side);

        await service.submitOrder({
          symbol,
          qty: Math.abs(safeParseFloat(pos.qty, 0)).toString(),
          side,
          type: "stop",
          stop_price: price.toFixed(2),
          time_in_force: "gtc",
        });

        toast.success(
          `Success: Stop Loss set at $${price.toFixed(2)} for ${symbol}`,
        );
        loadData();
      } catch (e: unknown) {
        const error = e as Error;
        console.error(`${logPrefix} Failure:`, error.message);
        toast.error(`Failed to set SL: ${error.message}`);
      } finally {
        setIsSubmitting(false);
      }
    },
    [service, cancelExistingExitOrders, loadData, setIsSubmitting],
  );

  const executeSetSlAtr = useCallback(
    async (pos: Position, payload: { multiplier: number; label: string }) => {
      const { multiplier, label } = payload;
      const symbol = pos.symbol;
      const side = pos.side === "long" ? "sell" : "buy";
      const isLong = pos.side === "long";
      const logPrefix = `[SetSL-ATR][${symbol}]`;

      console.log(`${logPrefix} Calculating ATR SL (${multiplier}x)`);
      setIsSubmitting(true);
      toast.info(`Calculating ATR for ${symbol}...`);

      try {
        const bars = await service.getBars(symbol, "1D", 50);
        console.log(
          `${logPrefix} Got ${bars?.length || 0} bars:`,
          bars?.slice(0, 3),
        );
        const atr = calculateATR(bars);
        console.log(`${logPrefix} ATR result:`, atr);

        if (!atr) {
          toast.error(
            `Not enough data for ATR calculation (${bars?.length || 0} bars, need at least 1)`,
          );
          setIsSubmitting(false);
          return;
        }

        const currentPrice = safeParseFloat(pos.current_price, 0);
        const slPrice = isLong
          ? currentPrice - atr * multiplier
          : currentPrice + atr * multiplier;

        console.log(
          `${logPrefix} ATR=${atr.toFixed(2)}, SL=$${slPrice.toFixed(2)} (${label})`,
        );
        toast.info(
          `Setting Stop Loss for ${symbol} at $${slPrice.toFixed(2)} (ATR: ${atr.toFixed(2)})...`,
        );

        await cancelExistingExitOrders(symbol, side);

        await service.submitOrder({
          symbol,
          qty: Math.abs(safeParseFloat(pos.qty, 0)).toString(),
          side,
          type: "stop",
          stop_price: slPrice.toFixed(2),
          time_in_force: "gtc",
        });

        toast.success(
          `Success: ATR SL set at $${slPrice.toFixed(2)} (${multiplier}x ATR) for ${symbol}`,
        );
        loadData();
      } catch (e: unknown) {
        const error = e as Error;
        console.error(`${logPrefix} Failure:`, error.message);
        toast.error(`Failed to set ATR SL: ${error.message}`);
      } finally {
        setIsSubmitting(false);
      }
    },
    [service, cancelExistingExitOrders, loadData, setIsSubmitting],
  );

  const executeQuickOrder = useCallback(
    async (position: Position, side: "buy" | "sell") => {
      setIsSubmitting(true);
      try {
        const qty = "1";
        const assetClass = await getAssetClass(position.symbol);
        const quickOrder = await service.submitOrder({
          symbol: position.symbol,
          qty,
          side,
          type: "market",
          time_in_force: assetClass === "crypto" ? "gtc" : "day",
        });
        await clearOrphanOrders([quickOrder.id]);
        vibrate([40, 40]);
        toast.success(
          `${side === "buy" ? "Bought" : "Sold"} ${qty} ${position.symbol}`,
        );
        loadData();
      } catch (e: unknown) {
        const error = e as Error;
        if (error.message?.includes("wash trade")) {
          toast.error("Wash trade detected - wait before rebuying");
        } else if (error.message?.includes("insufficient")) {
          toast.error("Insufficient shares or buying power");
        } else {
          toast.error(error.message || "Quick order failed");
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [service, getAssetClass, clearOrphanOrders, loadData, setIsSubmitting],
  );

  const handleCancelOrder = useCallback(
    async (orderId: string, symbol: string) => {
      vibrate(10);
      try {
        await service.cancelOrder(orderId);
        toast.success(`Canceled order for ${symbol}`);
        loadData();
      } catch (e: unknown) {
        const error = e as Error;
        const msg = (error.message || "").toLowerCase();
        if (
          msg.includes("cancel") ||
          msg.includes("404") ||
          msg.includes("filled")
        ) {
          toast.info(`Order for ${symbol} already completed or cancelled`);
          loadData();
        } else {
          toast.error(error.message || "Failed to cancel order");
        }
      }
    },
    [service, loadData],
  );

  const executeCancelAll = useCallback(
    async (pos: Position) => {
      const symbol = pos.symbol;
      toast.info(`Cancelling all orders for ${symbol}...`);
      try {
        const openOrders = await service.getOrders("open");
        const symbolOrders = openOrders.filter((o) => o.symbol === symbol);

        if (symbolOrders.length > 0) {
          await Promise.all(symbolOrders.map((o) => service.cancelOrder(o.id)));
          toast.success(
            `Cancelled ${symbolOrders.length} orders for ${symbol}`,
          );
        } else {
          toast.info(`No open orders found for ${symbol}`);
        }
        loadData();
      } catch (e: unknown) {
        const error = e as Error;
        toast.error(`Failed to cancel orders: ${error.message}`);
      }
    },
    [service, loadData],
  );

  const executeCancelAllAndSetStopLoss = useCallback(
    async (pos: Position, stopPrice: number, label: string, logTag: string) => {
      const symbol = pos.symbol;
      const side = pos.side === "long" ? "sell" : "buy";
      const logPrefix = `[${logTag}][${symbol}]`;

      setIsSubmitting(true);
      toast.info(`Cancelling orders & setting ${label} SL for ${symbol}...`);

      try {
        const openOrders = await service.getOrders("open");
        const symbolOrders = openOrders.filter((o) => o.symbol === symbol);

        if (symbolOrders.length > 0) {
          await Promise.all(symbolOrders.map((o) => service.cancelOrder(o.id)));
          console.log(
            `${logPrefix} Cancelled ${symbolOrders.length} open orders`,
          );
          await new Promise((resolve) => setTimeout(resolve, 400));
        }

        const qty = Math.abs(safeParseFloat(pos.qty, 0)).toString();
        await service.submitOrder({
          symbol,
          qty,
          side,
          type: "stop",
          stop_price: stopPrice.toFixed(2),
          time_in_force: "gtc",
        });

        toast.success(
          `${label} SL set at $${stopPrice.toFixed(2)} for ${symbol}`,
        );
        loadData();
      } catch (e: unknown) {
        const error = e as Error;
        console.error(`${logPrefix} Failure:`, error.message);
        toast.error(`Failed to set ${label} SL: ${error.message}`);
      } finally {
        setIsSubmitting(false);
      }
    },
    [service, loadData, setIsSubmitting],
  );

  

  const confirmTradeAction = useCallback(
    async (
      pos: Position,
      action: string,
      payload?: Record<string, unknown>,
    ) => {
      vibrate(10);
      if (action === "market" || action === "flash-close") {
        const closeQty = payload?.qty as number | undefined;
        await executeClosePosition(pos, { closeQty });
      } else if (action === "reversal") await executeReversal(pos);
      else if (action === "quick-buy") await executeQuickOrder(pos, "buy");
      else if (action === "quick-sell") await executeQuickOrder(pos, "sell");
      else if (action === "sideways-limit")
        await executeSidewaysLimit(
          pos,
          payload as { qty?: number } | undefined,
        );
      else if (action === "cancel-sideways")
        await cancelSidewaysLimit(pos.symbol);
      else if (action === "trailing-stop")
        await executeTrailingStop(
          pos,
          payload as { percent?: number } | undefined,
        );
      else if (action === "cancel-all-set-tp")
        await executeCancelAllAndSetTp(
          pos,
          payload as { price: number; label: string },
        );
      else if (action === "set-sl")
        await executeSetSl(pos, payload as { price: number; label: string });
      else if (action === "set-sl-atr")
        await executeSetSlAtr(
          pos,
          payload as { multiplier: number; label: string },
        );
      else if (action === "cancel-all") await executeCancelAll(pos);
    },
    [
      executeClosePosition,
      executeReversal,
      executeQuickOrder,
      executeSidewaysLimit,
      cancelSidewaysLimit,
      executeTrailingStop,
      executeCancelAllAndSetTp,
      executeSetSl,
      executeSetSlAtr,
      executeCancelAll,
    ],
  );

  return {
    clearOrphanOrders,
    executeClosePosition,
    executeReversal,
    cancelExistingExitOrders,
    executeTrailingStop,
    executeCancelAllAndSetTp,
    executeSetSl,
    executeSetSlAtr,
    executeQuickOrder,
    handleCancelOrder,
    executeCancelAll,
    executeCancelAllAndSetStopLoss,
    confirmTradeAction,
  };
}
