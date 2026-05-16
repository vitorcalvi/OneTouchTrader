import React from 'react';
import { useEarnings } from '../hooks/useEarnings';
import { EarningsItem, formatEarningsDate, getTimeOfDayColors } from '../types';

const groupByDate = (items: EarningsItem[]): Map<string, EarningsItem[]> => {
  const groups = new Map<string, EarningsItem[]>();
  items.forEach(item => {
    const existing = groups.get(item.reportDate) || [];
    existing.push(item);
    groups.set(item.reportDate, existing);
  });
  return groups;
};

export const EarningsCalendarView: React.FC = () => {
  const { items, selectedId, selectItem, isLoading, error } = useEarnings();
  const grouped = groupByDate(items);
  const sortedDates = Array.from(grouped.keys()).sort();

  if (isLoading && items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500">
        <div className="w-8 h-8 border-2 border-slate-600 border-t-accent rounded-full animate-spin mb-3" />
        <span className="text-sm font-medium">Loading earnings...</span>
      </div>
    );
  }

  if (error && items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500">
        <svg className="w-12 h-12 mb-3 opacity-50 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <title>Error icon</title>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <span className="text-sm font-medium text-red-400">Failed to load earnings</span>
        <span className="text-xs mt-1">{error}</span>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500">
        <svg className="w-12 h-12 mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <title>No earnings icon</title>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span className="text-sm font-medium">No earnings found</span>
        <span className="text-xs mt-1">Adjust date range to see results</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto pr-2 space-y-4">
      {sortedDates.map(date => {
        const dateItems = grouped.get(date) || [];
        return (
          <div key={date}>
            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 px-1">
              {formatEarningsDate(date)}
            </h4>
            <div className="space-y-2">
              {dateItems.map(item => (
                <button
                  key={item.id}
                  onClick={() => selectItem(item.id)}
                  className={`w-full text-left p-3 rounded-lg border transition-all ${
                    selectedId === item.id
                      ? 'bg-accent/10 border-accent/50'
                      : 'bg-surface border-slate-800 hover:bg-surface/80'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-primary">{item.symbol}</span>
<span className={`text-[10px] px-1.5 py-0.5 rounded border ${getTimeOfDayColors(item.timeOfDay)}`}>
                         {item.timeOfDay.toUpperCase()}
                       </span>
                    </div>
                    {item.surprisePercent !== null && (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        item.surprisePercent >= 0
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-red-500/20 text-red-400'
                      }`}>
                        {item.surprisePercent >= 0 ? '+' : ''}{item.surprisePercent.toFixed(1)}%
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-slate-500">EPS:</span>{' '}
                      <span className="text-primary">
                        {item.epsActual !== null
                          ? `$${item.epsActual.toFixed(2)}`
                          : item.epsEstimate !== null
                            ? `Est: $${item.epsEstimate.toFixed(2)}`
                            : '—'
                        }
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">Revenue:</span>{' '}
                      <span className="text-primary">
                        {item.revenueActual !== null
                          ? `$${item.revenueActual.toFixed(0)}M`
                          : item.revenueEstimate !== null
                            ? `Est: $${item.revenueEstimate.toFixed(0)}M`
                            : '—'
                        }
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default EarningsCalendarView;
