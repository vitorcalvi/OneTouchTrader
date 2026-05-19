import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  fetchTradeCards,
  fireTradeCard,
  cancelTradeCard,
} from "../../services/tradeCards";
import type { TradeCard } from "../../../shared/tradeCard";

export function TradeCardInbox() {
  const qc = useQueryClient();
  const { data: cards } = useQuery({
    queryKey: ["tradeCards", "PENDING"],
    queryFn: () => fetchTradeCards("PENDING"),
    refetchInterval: 2000,
  });

  const fireMut = useMutation({
    mutationFn: (id: string) => fireTradeCard(id),
    onSuccess: (card) => {
      toast.success(`Order fired: ${card.alpacaOrderId ?? "submitted"}`);
      qc.invalidateQueries({ queryKey: ["tradeCards"] });
    },
    onError: (err: Error) => toast.error(`Fire failed: ${err.message}`),
  });

  const cancelMut = useMutation({
    mutationFn: (id: string) => cancelTradeCard(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tradeCards"] }),
  });

  const pending = cards ?? [];
  if (pending.length === 0) return null;

  return (
    <div className="fixed top-2 left-2 right-2 z-50 flex flex-col gap-2">
      {pending.map((card) => (
        <TradeCardItem
          key={card.id}
          card={card}
          onFire={() => fireMut.mutate(card.id)}
          onCancel={() => cancelMut.mutate(card.id)}
          firing={fireMut.isPending}
        />
      ))}
    </div>
  );
}

function TradeCardItem({
  card,
  onFire,
  onCancel,
  firing,
}: {
  card: TradeCard;
  onFire: () => void;
  onCancel: () => void;
  firing: boolean;
}) {
  const [armed, setArmed] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    const tick = () => {
      const ms = new Date(card.expiresAt).getTime() - Date.now();
      setSecondsLeft(Math.max(0, Math.ceil(ms / 1000)));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [card.expiresAt]);

  useEffect(() => {
    if (!armed) return;
    const id = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(id);
  }, [armed]);

  const risk = Math.abs(card.entryPrice - card.stopLoss) * card.shares;
  const reward1 = Math.abs(card.takeProfit1 - card.entryPrice) * card.shares;
  const rr1 = (reward1 / risk).toFixed(1);

  const dirColor =
    card.direction === "LONG"
      ? "bg-green-600 text-black"
      : "bg-red-600 text-white";

  return (
    <div className="glass-card p-3 border border-yellow-500/50 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded text-xs font-bold ${dirColor}`}>
            {card.direction}
          </span>
          <span className="text-sm font-bold">{card.symbol}</span>
          <span className="text-xs text-app-textMuted">
            {card.entryType} @ {card.entryPrice.toFixed(2)}
          </span>
        </div>
        <span className="text-xs text-app-textMuted">{secondsLeft}s</span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <div className="text-app-textMuted">SL</div>
          <div className="font-mono">{card.stopLoss.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-app-textMuted">T1</div>
          <div className="font-mono">{card.takeProfit1.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-app-textMuted">Size</div>
          <div className="font-mono">{card.shares}sh / ${card.notional}</div>
        </div>
      </div>

      <div className="text-xs text-app-textMuted">
        Risk ${risk.toFixed(0)} → Reward ${reward1.toFixed(0)} ({rr1}:1) · {card.regime}
      </div>

      <div className="text-xs">{card.rationale}</div>

      <div className="flex gap-2 mt-1">
        <button
          onClick={onCancel}
          className="flex-1 py-2 rounded bg-app-button text-xs"
          disabled={firing}
        >
          Cancel
        </button>
        {!armed ? (
          <button
            onClick={() => setArmed(true)}
            className="flex-1 py-2 rounded bg-yellow-500 text-black text-xs font-bold"
            disabled={firing || secondsLeft === 0}
          >
            ARM
          </button>
        ) : (
          <button
            onClick={onFire}
            className="flex-1 py-2 rounded bg-red-600 text-white text-xs font-bold animate-pulse"
            disabled={firing}
          >
            {firing ? "FIRING..." : "FIRE 🔥"}
          </button>
        )}
      </div>
    </div>
  );
}