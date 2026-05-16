import React from 'react';
import { Eye, Filter, TrendingUp } from 'lucide-react';
import { useNews } from '../hooks/useNews';
import type { NewsUrgency } from '../types';

const UrgencyChip: React.FC<{
  urgency: NewsUrgency;
  isActive: boolean;
  onClick: () => void;
  label: string;
}> = ({ urgency, isActive, onClick, label }) => {
  const colorMap = {
    breaking: isActive ? 'bg-red-500/30 text-red-300 border-red-500/50' : 'bg-transparent text-slate-400 border-slate-700 hover:border-red-500/30',
    high: isActive ? 'bg-yellow-500/30 text-yellow-300 border-yellow-500/50' : 'bg-transparent text-slate-400 border-slate-700 hover:border-yellow-500/30',
    normal: isActive ? 'bg-slate-500/30 text-slate-300 border-slate-500/50' : 'bg-transparent text-slate-400 border-slate-700 hover:border-slate-500/30',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2 py-1 text-[10px] font-bold rounded border transition-all ${colorMap[urgency]}`}
    >
      {label}
    </button>
  );
};

export const NewsFilterBar: React.FC = () => {
  const { filter, setFilter, items } = useNews();

  const urgencyCounts = items.reduce((acc, item) => {
    acc[item.urgency] = (acc[item.urgency] || 0) + 1;
    return acc;
  }, {} as Record<NewsUrgency, number>);

  const toggleUrgency = (urgency: NewsUrgency) => {
    const current = filter.urgency;
    if (current.includes(urgency)) {
      if (current.length > 1) {
        setFilter({ urgency: current.filter(u => u !== urgency) });
      }
    } else {
      setFilter({ urgency: [...current, urgency] });
    }
  };

  return (
    <div className="flex items-center gap-3 p-2 bg-surface rounded-lg border border-slate-800">
      <div className="flex items-center gap-1.5 text-slate-400">
        <Filter size={14} />
        <span className="text-[10px] font-bold uppercase tracking-wider">Filter</span>
      </div>

      <div className="h-4 w-px bg-slate-700" />

      <div className="flex items-center gap-1.5">
        <UrgencyChip
          urgency="breaking"
          isActive={filter.urgency.includes('breaking')}
          onClick={() => toggleUrgency('breaking')}
          label={`Breaking (${urgencyCounts.breaking || 0})`}
        />
        <UrgencyChip
          urgency="high"
          isActive={filter.urgency.includes('high')}
          onClick={() => toggleUrgency('high')}
          label={`High (${urgencyCounts.high || 0})`}
        />
        <UrgencyChip
          urgency="normal"
          isActive={filter.urgency.includes('normal')}
          onClick={() => toggleUrgency('normal')}
          label={`Normal (${urgencyCounts.normal || 0})`}
        />
      </div>

      <div className="h-4 w-px bg-slate-700" />

      <button
        type="button"
        onClick={() => setFilter({ watchlistOnly: !filter.watchlistOnly })}
        className={`flex items-center gap-1.5 px-2 py-1 text-[10px] font-bold rounded border transition-all ${
          filter.watchlistOnly
            ? 'bg-indigo-500/30 text-indigo-300 border-indigo-500/50'
            : 'bg-transparent text-slate-400 border-slate-700 hover:border-indigo-500/30'
        }`}
      >
        {filter.watchlistOnly ? <Eye size={12} /> : <TrendingUp size={12} />}
        Watchlist Only
      </button>
    </div>
  );
};

export default NewsFilterBar;
