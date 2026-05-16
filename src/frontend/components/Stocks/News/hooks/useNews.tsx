import { useState, useCallback, useEffect, createContext, useContext } from 'react';
import type { NewsItem, NewsFilter, NewsContextType } from '../types';
import { classifyUrgency } from '../types';

// Alpaca API news item structure
interface AlpacaNewsItem {
  id: string;
  headline: string;
  summary: string;
  author?: string;
  created_at: string;
  updated_at?: string;
  url: string;
  images?: { size: string; url: string }[];
  source: string;
  symbols: string[];
}

// Transform Alpaca news to our NewsItem format
function transformAlpacaNews(item: AlpacaNewsItem): NewsItem {
  return {
    id: item.id,
    headline: item.headline,
    summary: item.summary || '',
    source: item.source || 'Alpaca',
    url: item.url,
    publishedAt: item.created_at,
    symbols: item.symbols || [],
    urgency: classifyUrgency(item.headline, item.summary || ''),
    isRead: false,
  };
}

const DEFAULT_FILTER: NewsFilter = {
  watchlistOnly: false,
  urgency: ['breaking', 'high', 'normal'],
  symbols: [],
};

const NewsContext = createContext<NewsContextType | null>(null);

export function NewsProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilterState] = useState<NewsFilter>(DEFAULT_FILTER);
  const [lastFetchedAt, setLastFetchedAt] = useState(Date.now());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unreadCount = items.filter(item => !item.isRead).length;

  const markRead = useCallback((id: string) => {
    setItems(prev => prev.map(item => 
      item.id === id ? { ...item, isRead: true } : item
    ));
  }, []);

  const markAllRead = useCallback(() => {
    setItems(prev => prev.map(item => ({ ...item, isRead: true })));
  }, []);

  const selectItem = useCallback((id: string | null) => {
    setSelectedId(id);
    if (id) {
      markRead(id);
    }
  }, [markRead]);

  const setFilter = useCallback((partial: Partial<NewsFilter>) => {
    setFilterState(prev => ({ ...prev, ...partial }));
  }, []);

const fetchNews = useCallback(async (signal?: AbortSignal) => {
  setIsLoading(true);
  setError(null);
  try {
    if (typeof window === 'undefined' || !window.fetch) {
      setError('News fetch not available in this environment');
      setItems([]);
      return;
    }

    const symbolsParam = filter.symbols.length > 0 ? `&symbols=${filter.symbols.join(',')}` : '';
    const newsUrl = `/api/alpaca/news?limit=50${symbolsParam}`;

    const response = await fetch(newsUrl, { signal });

    if (!response.ok) {
      throw new Error(`Failed to fetch news: ${response.statusText}`);
    }

    const data = await response.json();

    if (data?.success && Array.isArray(data.data)) {
      setItems(data.data.map(transformAlpacaNews));
    } else if (Array.isArray(data)) {
      setItems(data.map(transformAlpacaNews));
    } else {
      setItems([]);
    }

    setLastFetchedAt(Date.now());
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') return;
    const errorMessage = err instanceof Error ? err.message : 'Failed to fetch news';
    setError(errorMessage);
    console.error('[News] Fetch error:', err);
  } finally {
    setIsLoading(false);
  }
}, [filter.symbols]);

  const addNewItem = useCallback((item: NewsItem) => {
    setItems(prev => [item, ...prev]);
  }, []);

useEffect(() => {
  const controller = new AbortController();
  fetchNews(controller.signal);
  return () => controller.abort();
}, [filter.symbols]);

const value: NewsContextType = {
  items,
  unreadCount,
  selectedId,
  filter,
  lastFetchedAt,
  isLoading,
  error,
  markAllRead,
  markRead,
  selectItem,
  setFilter,
  fetchNews: () => fetchNews(),
  addNewItem,
};

  return (
    <NewsContext.Provider value={value}>
      {children}
    </NewsContext.Provider>
  );
}

export function useNews() {
  const context = useContext(NewsContext);
  if (!context) {
    throw new Error('useNews must be used within NewsProvider');
  }
  return context;
}
