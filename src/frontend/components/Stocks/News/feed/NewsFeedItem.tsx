import React from 'react';
import type { NewsItem } from '../types';
import { formatRelativeTime } from '../types';

interface Props {
  item: NewsItem;
  isSelected: boolean;
  onClick: () => void;
}

const UrgencyDot: React.FC<{ urgency: NewsItem['urgency'] }> = ({ urgency }) => {
  const colorClass = {
    breaking: 'bg-red-500',
    high: 'bg-yellow-500',
    normal: 'bg-slate-400',
  }[urgency];

  return (
    <span 
      className={`w-2.5 h-2.5 rounded-full ${colorClass} shrink-0 ${urgency === 'breaking' ? 'animate-pulse' : ''}`}
      title={urgency.charAt(0).toUpperCase() + urgency.slice(1)}
    />
  );
};

const TickerBadge: React.FC<{ symbol: string; changePercent?: number }> = ({ symbol, changePercent }) => {
  const isPositive = changePercent !== undefined && changePercent >= 0;
  const colorClass = changePercent === undefined 
    ? 'bg-slate-700 text-slate-300' 
    : isPositive 
      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
      : 'bg-red-500/20 text-red-400 border-red-500/30';

  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${colorClass}`}>
      {symbol}
      {changePercent !== undefined && (
        <span className="ml-0.5">
          {isPositive ? '+' : ''}{changePercent.toFixed(1)}%
        </span>
      )}
    </span>
  );
};

export const NewsFeedItem: React.FC<Props> = ({ item, isSelected, onClick }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        w-full text-left p-3 rounded-lg transition-all duration-200 border
        ${isSelected 
          ? 'bg-indigo-600/20 border-indigo-500/30 shadow-lg shadow-indigo-500/10' 
          : 'bg-surface border-transparent hover:bg-white/5 hover:border-slate-700'
        }
        ${!item.isRead ? 'border-l-2 border-l-indigo-500' : ''}
      `}
    >
      <div className="flex items-start gap-2.5">
        <UrgencyDot urgency={item.urgency} />
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            {item.symbols.slice(0, 2).map(symbol => (
              <TickerBadge 
                key={symbol} 
                symbol={symbol} 
                changePercent={item.priceImpact?.symbol === symbol ? item.priceImpact.changePercent : undefined}
              />
            ))}
            {item.symbols.length > 2 && (
              <span className="text-[9px] text-slate-500">+{item.symbols.length - 2}</span>
            )}
          </div>
          
          <h3 className={`text-sm leading-snug mb-1.5 line-clamp-2 ${isSelected ? 'text-white' : 'text-slate-200'}`}>
            {item.headline}
          </h3>
          
          <div className="flex items-center justify-between text-[10px] text-slate-500">
            <span className="font-medium">{item.source}</span>
            <span>{formatRelativeTime(item.publishedAt)}</span>
          </div>
        </div>
      </div>
    </button>
  );
};

export default NewsFeedItem;
