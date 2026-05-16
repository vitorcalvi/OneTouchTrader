import React from 'react';
import { ExternalLink, Link2, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useNews } from '../hooks/useNews';

const TickerBadge: React.FC<{ symbol: string; changePercent?: number }> = ({ symbol, changePercent }) => {
  const isPositive = changePercent !== undefined && changePercent >= 0;
  const colorClass = changePercent === undefined 
    ? 'bg-slate-700 text-slate-300' 
    : isPositive 
      ? 'bg-emerald-500/20 text-emerald-400'
      : 'bg-red-500/20 text-red-400';

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-bold ${colorClass}`}>
      <span className="w-2 h-2 rounded-full bg-blue-500" />
      {symbol}
      {changePercent !== undefined && (
        <span>{isPositive ? '+' : ''}{changePercent.toFixed(2)}%</span>
      )}
    </span>
  );
};

export const NewsReader: React.FC = () => {
  const { items, selectedId, selectItem } = useNews();

  const selectedItem = items.find(item => item.id === selectedId);
  const selectedIndex = items.findIndex(item => item.id === selectedId);
  
  const handlePrevious = () => {
    if (selectedIndex > 0) {
      selectItem(items[selectedIndex - 1].id);
    }
  };

  const handleNext = () => {
    if (selectedIndex < items.length - 1) {
      selectItem(items[selectedIndex + 1].id);
    }
  };

  const handleOpenExternal = () => {
    if (selectedItem?.url) {
      window.open(selectedItem.url, '_blank', 'noopener,noreferrer');
    }
  };

  const handleCopyLink = async () => {
    if (selectedItem?.url) {
      await navigator.clipboard.writeText(selectedItem.url);
    }
  };

  const handleClose = () => {
    selectItem(null);
  };

  if (!selectedItem) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-500 p-8">
        <svg className="w-16 h-16 mb-4 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <title>Select article</title>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
        </svg>
        <p className="text-sm font-medium text-center">Select an article from the feed</p>
        <p className="text-xs mt-1 text-center">Click on any news item to read the full story</p>
      </div>
    );
  }

  const publishedDate = new Date(selectedItem.publishedAt);
  const formattedDate = publishedDate.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  });
  const formattedTime = publishedDate.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit'
  });

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between p-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleOpenExternal}
            className="p-2 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-colors"
            title="Open in new tab"
          >
            <ExternalLink size={16} />
          </button>
          <button
            type="button"
            onClick={handleCopyLink}
            className="p-2 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-colors"
            title="Copy link"
          >
            <Link2 size={16} />
          </button>
        </div>
        <button
          type="button"
          onClick={handleClose}
          className="p-2 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-colors"
          title="Close"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mb-4">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            {selectedItem.source}
          </span>
        </div>

        <h1 className="text-xl font-black text-white leading-tight mb-4">
          {selectedItem.headline}
        </h1>

        <div className="flex items-center gap-3 text-xs text-slate-500 mb-4">
          <span>{formattedDate}, {formattedTime}</span>
          <span>•</span>
          <span>2 min read</span>
        </div>

        {selectedItem.priceImpact && (
          <div className="mb-6">
            <TickerBadge 
              symbol={selectedItem.priceImpact.symbol} 
              changePercent={selectedItem.priceImpact.changePercent} 
            />
          </div>
        )}

        <div className="prose prose-invert prose-sm max-w-none">
          <p className="text-slate-300 leading-relaxed">
            {selectedItem.summary}
          </p>
          <p className="text-slate-400 text-sm mt-4">
            This is a preview. For the full article, please click "Open in new tab" above.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between p-3 border-t border-slate-800">
        <button
          type="button"
          onClick={handlePrevious}
          disabled={selectedIndex <= 0}
          className={`flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            selectedIndex <= 0 
              ? 'text-slate-600 cursor-not-allowed' 
              : 'text-slate-300 hover:bg-white/5'
          }`}
        >
          <ChevronLeft size={16} />
          Previous
        </button>
        
        <span className="text-xs text-slate-500">
          {selectedIndex + 1} of {items.length}
        </span>

        <button
          type="button"
          onClick={handleNext}
          disabled={selectedIndex >= items.length - 1}
          className={`flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            selectedIndex >= items.length - 1 
              ? 'text-slate-600 cursor-not-allowed' 
              : 'text-slate-300 hover:bg-white/5'
          }`}
        >
          Next
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
};

export default NewsReader;
