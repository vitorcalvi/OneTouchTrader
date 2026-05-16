import React, { useState, useEffect, useMemo } from 'react';
import { Order } from '@/types';
import { Heart, Activity, X, CheckCircle2, Clock, Ban, Filter, Pencil } from 'lucide-react';
import { vibrate } from '..';
import { Card } from '../../../ui/Card';
import { Badge } from '../../../ui/Badge';

const WORKING_STATUSES = ['new', 'accepted', 'partially_filled', 'held'];

interface Props {
  orders: Order[];
  onCancelOrder: (id: string, symbol: string) => void;
  onEditOrder?: (order: Order) => void;
}

export const StopOrderMonitor: React.FC<Props> = ({ orders, onCancelOrder, onEditOrder }) => {
  const [tab, setTab] = useState<'stops' | 'all'>('all');
  const [isExpanded, setIsExpanded] = useState(false);

  const [showOnlyWorking, setShowOnlyWorking] = useState(true);

  const [likedOrderIds, setLikedOrderIds] = useState<string[]>([]);

  useEffect(() => {
    if (orders.filter(o => WORKING_STATUSES.includes(o.status)).length > 0) {
      setIsExpanded(true);
    }
  }, []);

  const toggleLike = (id: string) => {
    vibrate(5);
    setLikedOrderIds((prev) =>
      prev.includes(id) ? prev.filter((oid) => oid !== id) : [...prev, id]
    );
  };

  const stopOrders = useMemo(() => {
    let filtered = tab === 'stops'
      ? orders.filter(o => o.type === 'stop' || o.type === 'stop_limit' || o.type === 'trailing_stop')
      : orders.filter(o => WORKING_STATUSES.includes(o.status));

    if (showOnlyWorking) {
      filtered = filtered.filter((o) => WORKING_STATUSES.includes(o.status));
    }

    return filtered
      .sort((a, b) => {
        const aLiked = likedOrderIds.includes(a.id);
        const bLiked = likedOrderIds.includes(b.id);
        if (aLiked && !bLiked) return -1;
        if (!aLiked && bLiked) return 1;
        return (
          new Date(b.created_at || b.submitted_at || '').getTime() -
          new Date(a.created_at || a.submitted_at || '').getTime()
        );
      })
      .slice(0, 15);
  }, [orders, likedOrderIds, showOnlyWorking, tab]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'filled':
        return <CheckCircle2 size={14} className="text-[var(--color-bullish-light)]" />;
      case 'canceled':
      case 'rejected':
      case 'expired':
        return <Ban size={14} className="text-[var(--color-bearish-light)]" />;
      case 'new':
      case 'accepted':
        return <Clock size={14} className="text-[var(--color-info-light)]" />;
      default:
        return <Activity size={14} className="text-[var(--color-text-muted)]" />;
    }
  };

  const getStatusVariant = (status: string): 'success' | 'error' | 'info' | 'neutral' => {
    switch (status) {
      case 'filled':
        return 'success';
      case 'canceled':
      case 'rejected':
      case 'expired':
        return 'error';
      case 'new':
      case 'accepted':
        return 'info';
      default:
        return 'neutral';
    }
  };

  if (stopOrders.length === 0 && !showOnlyWorking) return null;

  return (
    <Card>
      {/* Tab toggle */}
      <div className="flex gap-1 mb-2 px-4 pt-2">
        <button
          type="button"
          onClick={() => setTab('all')}
          className={`px-3 py-1 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${
            tab === 'all' ? 'bg-[#1e40af] text-[#93c5fd]' : 'bg-[#1e293b] text-[#94a3b8]'
          }`}
        >
          All Open
        </button>
        <button
          type="button"
          onClick={() => setTab('stops')}
          className={`px-3 py-1 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${
            tab === 'stops' ? 'bg-[#1e40af] text-[#93c5fd]' : 'bg-[#1e293b] text-[#94a3b8]'
          }`}
        >
          Stops
        </button>
      </div>

      <Card.Header
        icon={<Activity size={18} />}
        title="Stop Order Monitor"
        onToggle={() => setIsExpanded(!isExpanded)}
        isExpanded={isExpanded}
        rightContent={
          <button
            type="button"
            onClick={() => setShowOnlyWorking(!showOnlyWorking)}
            className={`
              flex 
              items-center 
              space-x-1.5 
              px-2 
              py-0.5 
              rounded-full 
              border 
              text-[10px] 
              font-bold 
              transition-all
              ${
                showOnlyWorking
                  ? 'bg-[var(--color-info-bg)] text-[var(--color-info-light)] border-[var(--color-info-border)]'
                  : 'bg-[var(--color-bg-secondary)] text-[var(--color-text-muted)] border-[var(--color-border-default)] hover:text-[var(--color-text-secondary)] hover:border-[var(--color-border-muted)]'
              }
            `}
            aria-pressed={showOnlyWorking}
          >
            <Filter size={10} />
            <span>WORKING ONLY ({stopOrders.length})</span>
          </button>
        }
      />

      {isExpanded && (
        <div className="animate-[slideDown_0.2s_ease-out]">
          <div
            className="
              grid 
              grid-cols-12 
              gap-2 
              px-4 
              py-2 
              bg-[var(--color-bg-secondary)] 
              border-b 
              border-[var(--color-border-default)] 
              text-[10px] 
              font-bold 
              text-[var(--color-text-muted)] 
              uppercase 
              tracking-wider
            "
          >
            <div className="col-span-3">Symbol</div>
            <div className="col-span-2 text-center">Pos</div>
            <div className="col-span-2 text-right">Qty</div>
            <div className="col-span-3 text-right">Stop Price</div>
            <div className="col-span-2 text-right">Status</div>
          </div>

          <div className="max-h-[400px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800">
            {stopOrders.length === 0 ? (
              <div className="text-center py-8 text-[var(--color-text-muted)] text-xs italic">
                No active stop orders found
              </div>
            ) : (
               stopOrders.map((order, index) => {
                 const isLiked = likedOrderIds.includes(order.id);
                 const isStop = order.type === 'stop' || order.type === 'stop_limit';
                 const isTrailing = order.type === 'trailing_stop';
                 const isLong = order.side === 'sell';

                return (
                  <div
                    key={order.id}
                    className={`
                      grid 
                      grid-cols-12 
                      gap-2 
                      px-4 
                      py-3 
                      border-b 
                      border-[var(--color-border-default)]/60 
                      items-center 
                      hover:bg-[var(--color-bg-hover)] 
                      transition-colors 
                      group
                      ${index === 0 ? 'bg-[var(--color-info-bg)]' : ''}
                    `}
                  >
                    <div className="col-span-3 flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() => toggleLike(order.id)}
                        className={`
                          transition-all 
                          duration-200 
                          transform 
                          active:scale-125
                          ${
                            isLiked
                              ? 'text-[var(--color-bearish)] scale-110'
                              : 'text-[var(--color-text-disabled)] hover:text-[var(--color-bearish-light)]'
                          }
                        `}
                        title={isLiked ? 'Unlike' : 'Like to pin'}
                        aria-label={isLiked ? 'Unlike order' : 'Like order to pin'}
                        aria-pressed={isLiked}
                      >
                        <Heart
                          size={12}
                          fill={isLiked ? 'currentColor' : 'none'}
                          strokeWidth={isLiked ? 0 : 2}
                        />
                      </button>
                      <span className="text-[var(--color-text-primary)] font-black text-xs tracking-tight">
                        {order.symbol}
                      </span>
                    </div>

                    <div className="col-span-2 flex justify-center">
                      <Badge variant={isLong ? 'long' : 'short'} size="xs">
                        {isLong ? 'LONG' : 'SHORT'}
                      </Badge>
                    </div>

                    <div className="col-span-2 text-right">
                      <span className="text-[var(--color-text-secondary)] font-mono text-xs font-bold">
                        {order.qty}
                      </span>
                    </div>

                    <div className="col-span-3 text-right">
                      <span className="text-[var(--color-info-light)] font-mono text-xs font-bold">
                        $
                        {isStop
                          ? order.stop_price
                          : isTrailing
                            ? `Trail ${order.trail_percent}%`
                            : order.limit_price}
                      </span>
                    </div>

                    <div className="col-span-2 flex justify-end items-center space-x-2">
                      <Badge variant={getStatusVariant(order.status)} size="xs">
                        {getStatusIcon(order.status)}
                        <span className="hidden sm:inline ml-1">
                          {order.status === 'new'
                            ? 'NEW'
                            : order.status === 'canceled'
                              ? 'CANC'
                              : order.status.substring(0, 4).toUpperCase()}
                        </span>
                      </Badge>

                      {WORKING_STATUSES.includes(order.status) && (
                        <>
                          {onEditOrder && (
                            <button
                              type="button"
                              onClick={() => onEditOrder(order)}
                              className="
                                text-[var(--color-text-muted)] 
                                hover:text-[var(--color-info-light)] 
                                hover:bg-[var(--color-info-bg)] 
                                transition-all 
                                p-1 
                                rounded
                              "
                              title="Edit Order"
                              aria-label={`Edit order for ${order.symbol}`}
                            >
                              <Pencil size={12} />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onCancelOrder(order.id, order.symbol)}
                            className="
                              text-[var(--color-text-muted)] 
                              hover:text-[var(--color-bearish-light)] 
                              hover:bg-[var(--color-bearish-bg)] 
                              transition-all 
                              p-1 
                              rounded
                            "
                            title="Cancel Order"
                            aria-label={`Cancel order for ${order.symbol}`}
                          >
                            <X size={12} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </Card>
  );
};
