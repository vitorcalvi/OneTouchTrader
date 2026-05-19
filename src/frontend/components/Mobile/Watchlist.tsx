interface WatchlistProps {
  watchlist: string[];
  onWatchlistChange: (watchlist: string[]) => void;
  onSymbolSelect: (symbol: string) => void;
  activeSymbol: string;
}

export function Watchlist({ watchlist, onWatchlistChange, onSymbolSelect, activeSymbol }: WatchlistProps) {
  const toggleWatchlist = (symbol: string) => {
    const newWatchlist = watchlist.includes(symbol)
      ? watchlist.filter(s => s !== symbol)
      : [...watchlist, symbol].slice(0, 6);
    onWatchlistChange(newWatchlist);
  };

  return (
    <div className="mx-4 my-2 bg-gray-800 rounded-xl p-3">
      <div className="flex flex-wrap gap-2">
        {watchlist.map(symbol => {
          const isActive = symbol === activeSymbol;

          return (
            <button
              key={symbol}
              type="button"
              onContextMenu={(e) => {
                e.preventDefault();
                toggleWatchlist(symbol);
              }}
              onClick={() => onSymbolSelect(symbol)}
              className={`px-4 py-2 rounded-full text-sm font-bold transition-colors ${
                isActive
                  ? 'bg-green-600 text-white'
                  : 'border border-gray-700 text-white hover:border-gray-500'
              }`}
              title={`${symbol} - long press to remove`}
            >
              {symbol}
            </button>
          );
        })}
      </div>
    </div>
  );
}