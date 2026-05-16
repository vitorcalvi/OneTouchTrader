/**
 * News Tab Types
 * Based on NEWS_TAB_SPECIFICATION.md
 */

export type NewsUrgency = 'breaking' | 'high' | 'normal';

export interface PriceImpact {
  symbol: string;
  changePercent: number;
}

export interface NewsItem {
  id: string;
  headline: string;
  summary: string;
  source: string;
  url: string;
  publishedAt: string;
  symbols: string[];
  urgency: NewsUrgency;
  priceImpact?: PriceImpact;
  isRead: boolean;
}

export interface NewsFilter {
  watchlistOnly: boolean;
  urgency: NewsUrgency[];
  symbols: string[];
}

export interface NewsState {
  items: NewsItem[];
  unreadCount: number;
  selectedId: string | null;
  filter: NewsFilter;
  lastFetchedAt: number;
  isLoading: boolean;
  error: string | null;
}

export interface NewsActions {
  markAllRead: () => void;
  markRead: (id: string) => void;
  selectItem: (id: string | null) => void;
  setFilter: (filter: Partial<NewsFilter>) => void;
  fetchNews: () => Promise<void>;
  addNewItem: (item: NewsItem) => void;
}

export type NewsContextType = NewsState & NewsActions;

// Helper to format relative time
export function formatRelativeTime(dateString: string): string {
  const now = new Date();
  const date = new Date(dateString);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

// Urgency classification keywords
export const BREAKING_KEYWORDS = [
  'breaking', 'alert', 'halted', 'circuit breaker', 'FDA approval',
  'merger', 'acquisition', 'takeover', 'buyout', 'beats estimates',
  'misses estimates', 'guidance cut', 'guidance raised', 'bankruptcy',
  'SEC investigation', 'CEO resign', 'CEO fired'
];

export const HIGH_KEYWORDS = [
  'earnings', 'revenue', 'quarterly', 'upgrade', 'downgrade',
  'target price', 'gap up', 'gap down', 'short squeeze', 'analyst',
  'dividend', 'stock split', 'buyback'
];

// Classify urgency based on headline and summary
export function classifyUrgency(headline: string, summary: string): NewsUrgency {
  const text = (headline + ' ' + summary).toLowerCase();
  
  if (BREAKING_KEYWORDS.some(k => text.includes(k))) return 'breaking';
  if (HIGH_KEYWORDS.some(k => text.includes(k))) return 'high';
  return 'normal';
}
