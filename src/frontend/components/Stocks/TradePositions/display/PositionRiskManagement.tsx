import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Position, Order } from '../../../../types';
import { AlpacaService } from '../../../../services/stocks';
import type { ClosedPosition } from '..';
import { usePortfolioRisk } from '../hooks/usePortfolioRisk';
import { RunningPositionsSector } from './RunningPositionsSector';
import type { PositionAction, PositionActionPayload } from './PositionCard';

interface Props {
  positions: Position[];
  orders?: Order[];
  recentPositions: ClosedPosition[];
  isLoading: boolean;
  refreshing: boolean;
  realtimePrices: Record<string, number>;
  service: AlpacaService;
  equity?: number;
  onAction: (pos: Position, action: PositionAction, payload?: PositionActionPayload) => Promise<void>;
  onRefresh: () => void;
  onSelectSymbol: (symbol: string, qty: number) => void;
  collapseAllVersion?: number;
  collapseAllCollapsed?: boolean;
  expandedSymbol?: string | null;
}

export const PositionRiskManagement: React.FC<Props> = ({
  positions: allPositions,
  orders = [],
  recentPositions,
  isLoading,
  refreshing,
  realtimePrices,
  onAction,
  onRefresh,
  onSelectSymbol,
  equity = 0,
  collapseAllVersion = 0,
  collapseAllCollapsed = true,
  expandedSymbol = null,
}) => {
  const [selectedPositionIds, setSelectedPositionIds] = useState<string[]>([]);

  const {
    metrics: portfolioMetrics,
    positionRisks,
  } = usePortfolioRisk({
    positions: allPositions,
    orders,
    equity,
    autoRefresh: true,
    refreshIntervalMs: 3000,
  });

  const runningPositions = allPositions;

  const handlePositionAdd = useCallback((positionId: string | null) => {
    if (!positionId) return;
    const position = allPositions.find(pos => pos.asset_id === positionId);
    if (position) {
      setSelectedPositionIds(prev => {
        if (prev.includes(positionId)) {
          return prev; // Already selected
        }
        return [...prev, positionId];
      });
      onSelectSymbol(position.symbol, Math.abs(parseFloat(position.qty || '0')));
    }
  }, [allPositions, onSelectSymbol]);

  const handleSelectSymbol = useCallback((symbol: string, qty: number) => {
    onSelectSymbol(symbol, qty);
    const position = runningPositions.find(pos => pos.symbol === symbol);
    if (position && !selectedPositionIds.includes(position.asset_id)) {
      setSelectedPositionIds(prev => [...prev, position.asset_id]);
    }
  }, [onSelectSymbol, runningPositions, selectedPositionIds]);

  // Effect to handle external expansion request (e.g. after a trade)
  useEffect(() => {
    if (expandedSymbol) {
      // Find the position. It might not be there immediately if it's a very fast trade,
      // but the polling should pick it up.
      const position = allPositions.find(p => p.symbol === expandedSymbol);
      if (position) {
        handleSelectSymbol(position.symbol, Math.abs(parseFloat(position.qty || '0')));
      }
    }
  }, [expandedSymbol, allPositions, handleSelectSymbol]);

  const portfolioMetricsForSector = useMemo(() => {
    if (!portfolioMetrics) return null;
    return {
      positionRisks,
      var95: portfolioMetrics.var95 || 0,
    };
  }, [portfolioMetrics, positionRisks]);

  return (
    <div className="h-screen bg-base flex flex-col font-mono overflow-hidden">
      <div className="flex flex-1 overflow-hidden">
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-muted text-sm font-mono">Loading positions...</div>
          </div>
        ) : (
          <div className="flex-1 min-w-0">
            {allPositions.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center py-12 px-6 text-center bg-surface">
                <div className="mb-4">
                  <svg className="w-12 h-12 mx-auto text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-primary mb-2">No Positions</h3>
                <p className="text-sm text-muted mb-4">
                  Enter a trade using the form to start trading
                </p>
                {recentPositions.length > 0 && (
                  <div className="mt-4 p-4 bg-card rounded-xl border border-border w-full max-w-md">
                    <p className="text-xs text-muted mb-3">Or jump back into a recent position:</p>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {recentPositions.slice(0, 10).map((pos, idx) => (
                        <button
                          key={pos.asset_id || `recent-${idx}`}
                          type="button"
                          onClick={() => onSelectSymbol(pos.symbol, Math.abs(parseFloat(pos.qty || '0')))}
                          className="px-3 py-2 bg-input hover:bg-surface border border-surface hover:border-accent rounded-xl text-sm font-bold text-secondary hover:text-primary transition-all"
                        >
                          {pos.symbol}
                          {pos.unrealized_pl && (
                            <span className={`ml-2 text-xs ${parseFloat(pos.unrealized_pl) >= 0 ? 'text-bull' : 'text-bear'}`}>
                              {parseFloat(pos.unrealized_pl) >= 0 ? '+' : ''}${parseFloat(pos.unrealized_pl).toFixed(2)}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <RunningPositionsSector
                positions={runningPositions}
                orders={orders}
                realtimePrices={realtimePrices}
                equity={equity}
                portfolioMetrics={portfolioMetricsForSector}
                onAction={onAction}
                onRefresh={onRefresh}
                onSelectSymbol={handleSelectSymbol}
                onPositionSelect={handlePositionAdd}
                selectedPositionIds={selectedPositionIds}
                refreshing={refreshing}
                collapseAllVersion={collapseAllVersion}
                collapseAllCollapsed={collapseAllCollapsed}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
};
