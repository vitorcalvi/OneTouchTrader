import React, { useState } from 'react';
import { History } from 'lucide-react';
import type { ClosedPosition } from '..';
import { Card } from '../../../ui/Card';
import { Badge } from '../../../ui/Badge';

interface Props {
  recentPositions: ClosedPosition[];
  onSelectSymbol: (symbol: string, qty: number) => void;
}

export const RecentClosed: React.FC<Props> = ({ recentPositions, onSelectSymbol }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (recentPositions.length === 0) return null;

  return (
    <Card>
      <Card.Header
        icon={<History size={18} />}
        title={
          <>
            (L) RECENT CLOSED{' '}
            <span className="text-[var(--color-text-muted)] ml-1">
              [ Last {recentPositions.length} ]
            </span>
          </>
        }
        onToggle={() => setIsExpanded(!isExpanded)}
        isExpanded={isExpanded}
      />

      {isExpanded && (
        <div className="animate-[slideDown_0.2s_ease-out] max-h-[400px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800">
          {recentPositions.map((pos, idx) => {
            const isLong = pos.side === 'long';
            const rawPl = parseFloat(pos.unrealized_pl || '0');
            const isProfit = rawPl >= 0;
            const timeStr = pos.closedAt
              ? new Date(pos.closedAt).toLocaleTimeString([], { hour12: false })
              : '--:--:--';
            const entryPrice = parseFloat(pos.entry_price || '0');
            const exitPrice = parseFloat(pos.exit_price || pos.current_price || '0');

            return (
              <div
                key={pos.asset_id ? `${pos.asset_id}-${pos.closedAt}` : `recent-${pos.symbol}-${idx}`}
                className="
                  px-4 
                  py-3 
                  border-b 
                  border-[var(--color-border-default)]/60 
                  border-dashed 
                  last:border-0 
                  hover:bg-[var(--color-bg-hover)] 
                  transition-colors 
                  cursor-pointer
                "
                onClick={() => onSelectSymbol(pos.symbol, Math.abs(parseFloat(pos.qty)))}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectSymbol(pos.symbol, Math.abs(parseFloat(pos.qty)));
                  }
                }}
              >
                <div className="flex justify-between items-center">
                  <div className="flex items-center space-x-2">
                    <span className="text-[var(--color-text-primary)] font-black text-sm">
                      {pos.symbol}
                    </span>
                    <span className="text-[10px] text-[var(--color-text-muted)] font-bold uppercase bg-[var(--color-bg-secondary)] border border-[var(--color-border-default)] px-1.5 py-0.5 rounded-lg">
                      (~) {pos.tradingMode || 'SCALPER'}
                    </span>
                  </div>
                  <span className="text-[10px] text-[var(--color-text-muted)] font-bold uppercase tracking-wider">
                    EST. P/L
                  </span>
                </div>

                <div className="flex justify-between items-center mt-1">
                  <div className="flex items-center space-x-2 text-xs font-mono text-[var(--color-text-secondary)]">
                    <Badge variant={isLong ? 'long' : 'short'} size="xs">
                      {isLong ? 'LONG' : 'SHORT'}
                    </Badge>
                    <span className="text-[var(--color-text-muted)]">•</span>
                    <span>{pos.qty} QTY</span>
                    <span className="text-[var(--color-text-muted)]">•</span>
                    <span>{timeStr}</span>
                  </div>
                  <span
                    className={`
                      text-sm 
                      font-mono 
                      font-black
                      ${isProfit ? 'text-[var(--color-bullish-light)]' : 'text-[var(--color-bearish-light)]'}
                    `}
                  >
                    {rawPl > 0 ? '+' : ''}${rawPl.toFixed(2)}
                  </span>
                </div>

                <div className="mt-1 flex items-center space-x-2 text-[10px] font-mono text-[var(--color-text-muted)]">
                  <span>
                    IN:{' '}
                    <span className="text-[var(--color-text-secondary)]">
                      ${entryPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </span>
                  <span className="text-[var(--color-border-default)]">|</span>
                  <span>
                    OUT:{' '}
                    <span className="text-[var(--color-text-secondary)]">
                      ${exitPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
};
