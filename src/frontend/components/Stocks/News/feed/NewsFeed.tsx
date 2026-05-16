import React from 'react';
import { useNews } from '../hooks/useNews';
import { NewsFeedItem } from './NewsFeedItem';
import type { NewsItem } from '../types';

const groupNewsByTime = (items: NewsItem[]): { label: string; items: NewsItem[] }[] => {
  const now = Date.now();
  const groups: Map<string, NewsItem[]> = new Map();
  
  const sortedItems = [...items].sort((a, b) => 
    new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );

  sortedItems.forEach(item => {
    const itemTime = new Date(item.publishedAt).getTime();
    const diffMs = now - itemTime;
    const diffHours = diffMs / 3600000;
    
    let label: string;
    if (diffHours < 1) {
      label = 'Last Hour';
    } else if (diffHours < 24) {
      label = 'Today';
    } else if (diffHours < 48) {
      label = 'Yesterday';
    } else {
      label = 'Earlier';
    }
    
    if (!groups.has(label)) {
      groups.set(label, []);
    }
    groups.get(label)!.push(item);
  });

  return Array.from(groups.entries()).map(([label, items]) => ({ label, items }));
};

const BreakingBanner: React.FC<{ item: NewsItem; onClick: () => void }> = ({ item, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="w-full p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-3 hover:bg-red-500/20 transition-colors"
  >
    <span className="flex items-center gap-2">
      <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
      <span className="text-[10px] font-black text-red-400 uppercase tracking-wider">Breaking</span>
    </span>
    <span className="text-xs font-bold text-white truncate flex-1">{item.headline}</span>
    <span className="text-[10px] text-slate-400 shrink-0">{item.source}</span>
  </button>
);

export const NewsFeed: React.FC = () => {
  const { items, selectedId, selectItem, filter, isLoading, error } = useNews();

  const filteredItems = items.filter(item => {
    if (!filter.urgency.includes(item.urgency)) return false;
    if (filter.symbols.length > 0) {
      const hasMatchingSymbol = item.symbols.some(s => filter.symbols.includes(s));
      if (!hasMatchingSymbol) return false;
    }
    return true;
  });

  const breakingNews = filteredItems.filter(item => item.urgency === 'breaking');
  const latestBreaking = breakingNews[0];
  const nonBreakingItems = filteredItems.filter(item => item.urgency !== 'breaking');
  const groupedNews = groupNewsByTime(nonBreakingItems);

  if (isLoading && items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500">
        <div className="w-8 h-8 border-2 border-slate-600 border-t-accent rounded-full animate-spin mb-3" />
        <span className="text-sm font-medium">Loading news...</span>
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
        <span className="text-sm font-medium text-red-400">Failed to load news</span>
        <span className="text-xs mt-1">{error}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {latestBreaking && (
        <div className="mb-3 shrink-0">
          <BreakingBanner 
            item={latestBreaking} 
            onClick={() => selectItem(latestBreaking.id)} 
          />
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-4 pr-2">
        {groupedNews.map(({ label, items: groupItems }) => (
          <div key={label}>
            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 px-1">
              {label}
            </h4>
            <div className="space-y-2">
              {groupItems.map(item => (
                <NewsFeedItem
                  key={item.id}
                  item={item}
                  isSelected={selectedId === item.id}
                  onClick={() => selectItem(item.id)}
                />
              ))}
            </div>
          </div>
        ))}

        {filteredItems.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-slate-500">
            <svg className="w-12 h-12 mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <title>No news icon</title>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
            </svg>
            <span className="text-sm font-medium">No news found</span>
            <span className="text-xs mt-1">Try adjusting your filters</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default NewsFeed;
