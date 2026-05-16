import { useState, useEffect, useCallback, useRef } from 'react';
import { AlpacaService } from '@/services/stocks';

export const useSymbolAutocomplete = (service: AlpacaService, onSymbolSelected?: (symbol: string) => void) => {
  const [availableSymbols, setAvailableSymbols] = useState<string[]>([]);
  const [filteredSymbols, setFilteredSymbols] = useState<string[]>([]);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [selectedSymbolPrice, setSelectedSymbolPrice] = useState<number | null>(null);
  const [isQuoteLoading, setIsQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  // Load available symbols for autocomplete
  useEffect(() => {
    const loadSymbols = async () => {
      try {
        const assets = await service.getAssets();
        const symbols = assets
          .filter(a => a.tradable && a.status === 'active')
          .map(a => a.symbol)
          .sort();

        setAvailableSymbols(symbols);
      } catch {
        // Failed to load symbols - ignore
      }
    };
    loadSymbols();
  }, [service]);

  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchSymbolPrice = useCallback(async (sym: string) => {
    if (!sym) return;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsQuoteLoading(true);
    setSelectedSymbolPrice(null);
    setQuoteError(null);
    try {
      const tradePrice = await service.getLatestTrade(sym);
      if (controller.signal.aborted) return;
      if (typeof tradePrice === 'number' && Number.isFinite(tradePrice) && tradePrice > 0) {
        setSelectedSymbolPrice(tradePrice);
        return;
      }
      const quote = await service.getLatestQuote(sym);
      if (controller.signal.aborted) return;
      const ap = quote?.ap;
      const bp = quote?.bp;
      const best = (typeof ap === 'number' && Number.isFinite(ap) && ap > 0)
        ? ap
        : (typeof bp === 'number' && Number.isFinite(bp) && bp > 0)
          ? bp
          : null;
      if (best !== null) setSelectedSymbolPrice(best);
      else setQuoteError(`No price data for ${sym.toUpperCase()}.`);
    } catch (error: any) {
      if (controller.signal.aborted) return;
      setQuoteError(error instanceof Error ? error.message : 'Failed to fetch price.');
    } finally {
      if (!controller.signal.aborted) {
        setIsQuoteLoading(false);
      }
    }
  }, [service]);

  // Fetch price for a symbol without autocomplete side effects (used for auto-refresh on mount)
  const fetchPrice = useCallback(async (sym: string) => {
    return fetchSymbolPrice(sym);
  }, [fetchSymbolPrice]);

  // Handle symbol input changes for autocomplete
  const handleSymbolChange = useCallback((value: string) => {
    const upper = value.toUpperCase();

    if (upper.length >= 1 && availableSymbols.length > 0) {
      const filtered = availableSymbols
        .filter(s => s.startsWith(upper))
        .slice(0, 8);
      setFilteredSymbols(filtered);
      setShowAutocomplete(filtered.length > 0 && upper.length > 0);
    } else {
      setShowAutocomplete(false);
      setFilteredSymbols([]);
    }

    // Clear price when typing
    setSelectedSymbolPrice(null);
    setQuoteError(null);
    setIsQuoteLoading(false);

    return upper;
  }, [availableSymbols]);

  // FIX #22: Select symbol from autocomplete and notify parent
  const selectSymbol = useCallback(async (sym: string) => {
    setShowAutocomplete(false);
    setFilteredSymbols([]);

    // Notify parent to update symbol state
    if (onSymbolSelected) {
      onSymbolSelected(sym);
    }

    await fetchSymbolPrice(sym);

    return sym;
  }, [fetchSymbolPrice, onSymbolSelected]);

  const clearAutocomplete = useCallback(() => {
    setShowAutocomplete(false);
    setSelectedSymbolPrice(null);
    setFilteredSymbols([]);
    setIsQuoteLoading(false);
    setQuoteError(null);
  }, []);

  return {
    availableSymbols,
    filteredSymbols,
    showAutocomplete,
    selectedSymbolPrice,
    isQuoteLoading,
    quoteError,
    handleSymbolChange,
    selectSymbol,
    fetchPrice,
    setShowAutocomplete,
    clearAutocomplete
  };
};
