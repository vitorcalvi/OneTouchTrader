import React, { useState, useEffect, useMemo } from 'react';
import { Position, Order } from '../../../../types';
import { Activity, RefreshCw, ChevronsUp, ChevronsDown } from 'lucide-react';
import { PositionCard, type PositionAction, type PositionActionPayload } from './PositionCard';
import { ErrorBoundary } from '../../../ErrorBoundary';
import { PositionRisk } from '../../../../utils/stocks/portfolioRisk';

interface RunningPositionsSectorProps {
  positions: Position[];
  orders?: Order[];
  realtimePrices: Record<string, number>;
  equity: number;
  portfolioMetrics: {
    positionRisks: PositionRisk[];
    var95: number;
  } | null;
  onAction: (pos: Position, action: PositionAction, payload?: PositionActionPayload) => Promise<void>;
  onRefresh: () => void;
  onSelectSymbol: (symbol: string, qty: number) => void;
  onPositionSelect?: (positionId: string | null) => void;
  selectedPositionIds?: string[];
  refreshing: boolean;
  className?: string;
  collapseAllVersion?: number;
  collapseAllCollapsed?: boolean;
}

export const RunningPositionsSector: React.FC<RunningPositionsSectorProps> = ({
  positions,
  orders = [],
  realtimePrices,
  equity,
  portfolioMetrics,
  onAction,
  onRefresh,
  onSelectSymbol,
  onPositionSelect,
  selectedPositionIds = [],
  refreshing,
  className = '',
  collapseAllVersion: propsCollapseAllVersion = 0,
  collapseAllCollapsed: propsCollapseAllCollapsed = true,
}) => {
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const [collapseAllVersion, setCollapseAllVersion] = useState(propsCollapseAllVersion);
  const [collapseAllCollapsed, setCollapseAllCollapsed] = useState(propsCollapseAllCollapsed);
  const [draggedPosition, setDraggedPosition] = useState<string | null>(null);

  // Sync props to internal state
  useEffect(() => {
    setCollapseAllVersion(propsCollapseAllVersion);
    setCollapseAllCollapsed(propsCollapseAllCollapsed);
  }, [propsCollapseAllVersion, propsCollapseAllCollapsed]);

  const positionRiskMap = useMemo(() => {
    const map = new Map<string, PositionRisk>();
    portfolioMetrics?.positionRisks.forEach(risk => {
      map.set(risk.symbol, risk);
    });
    return map;
  }, [portfolioMetrics?.positionRisks]);

  const handleDragStart = (e: React.DragEvent, position: Position) => {
    e.dataTransfer.setData('text/plain', position.asset_id);
    e.dataTransfer.setData('application/json', JSON.stringify({
      asset_id: position.asset_id,
      symbol: position.symbol,
      side: position.side,
      qty: position.qty,
    }));
    e.dataTransfer.effectAllowed = 'move';
    setDraggedPosition(position.asset_id);
  };

  const handleDragEnd = () => {
    setDraggedPosition(null);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (positions.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex(prev => {
          const next = prev < positions.length - 1 ? prev + 1 : 0;
          const pos = positions[next];
          onSelectSymbol(pos.symbol, Math.abs(parseFloat(pos.qty || '0')));
          onPositionSelect?.(pos.asset_id);
          return next;
        });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex(prev => {
          const next = prev > 0 ? prev - 1 : positions.length - 1;
          const pos = positions[next];
          onSelectSymbol(pos.symbol, Math.abs(parseFloat(pos.qty || '0')));
          onPositionSelect?.(pos.asset_id);
          return next;
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [positions, onSelectSymbol, onPositionSelect]);

  return (
    <div className={`w-full h-full border-r border-border bg-surface flex flex-col ${className}`}>
      <div className="px-4 py-2 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity size={14} className="text-bull" />
          {/* REFACTORED: Renamed 'RUNNING POSITIONS' to 'OPEN POSITIONS' per user requirement */}
          <h2 className="text-[10px] font-black uppercase tracking-widest text-muted">
            OPEN POSITIONS
          </h2>
          <span className="text-[10px] text-muted">({positions.length})</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setCollapseAllCollapsed(true);
              setCollapseAllVersion(v => v + 1);
            }}
            disabled={positions.length === 0}
            className="w-6 h-6 inline-flex items-center justify-center rounded bg-surface hover:bg-card text-muted hover:text-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Collapse all"
          >
            <ChevronsUp size={12} />
          </button>
          <button
            type="button"
            onClick={() => {
              setCollapseAllCollapsed(false);
              setCollapseAllVersion(v => v + 1);
            }}
            disabled={positions.length === 0}
            className="w-6 h-6 inline-flex items-center justify-center rounded bg-surface hover:bg-card text-muted hover:text-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Expand all"
          >
            <ChevronsDown size={12} />
          </button>
          <button
            type="button"
            onClick={onRefresh}
            className="w-6 h-6 inline-flex items-center justify-center rounded bg-surface hover:bg-card text-muted hover:text-primary transition-colors"
            title="Refresh"
          >
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {positions.length === 0 ? (
          <div className="text-center py-8 text-muted text-xs font-mono">
            No running positions
          </div>
        ) : (
          positions.map((pos, index) => {
            // Include filled/triggered for status display
            const RELEVANT_STATUSES = new Set([
              'new',
              'accepted',
              'partially_filled',
              'held',
              'filled',           // ← SL triggered / TP hit
              'pending_cancel',   // ← in transit
            ]);

            const symbolOrders = orders.filter(
              (o) => o.symbol === pos.symbol && RELEVANT_STATUSES.has(o.status)
            );

            const isDragging = draggedPosition === pos.asset_id;

            return (
              <div
                key={pos.asset_id}
                draggable
                onDragStart={(e) => handleDragStart(e, pos)}
                onDragEnd={handleDragEnd}
                className={`cursor-grab active:cursor-grabbing transition-opacity ${isDragging ? 'opacity-50' : ''}`}
              >
                <ErrorBoundary fallback={<div className="p-2 bg-bear/20 rounded text-xs text-bear">Error loading position</div>}>
                  <PositionCard
                    position={pos}
                    orders={symbolOrders}
                    realtimePrice={realtimePrices[pos.symbol]}
                    onAction={onAction}
                    onSelectSymbol={onSelectSymbol}
                    isSelected={index === activeIndex || selectedPositionIds.includes(pos.asset_id)}
                    collapseAllVersion={collapseAllVersion}
                    collapseAllCollapsed={collapseAllCollapsed}
                    portfolioRisk={positionRiskMap.get(pos.symbol) || null}
                    portfolioVaR={portfolioMetrics?.var95 || 0}
                    totalEquity={equity}
                  />
                </ErrorBoundary>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
