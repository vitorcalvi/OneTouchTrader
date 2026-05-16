/**
 * Earnings Tab Types
 * Calendar-based earnings reporting interface
 */

/** Time of day when earnings report is released */
export type EarningsTimeOfDay = 'bmo' | 'amc' | 'dmh';

/**
 * Individual earnings report item
 * Represents a company's earnings announcement for a specific quarter
 */
export interface EarningsItem {
  /** Unique identifier for the earnings entry */
  id: string;

  /** Stock ticker symbol */
  symbol: string;

  /** Company name */
  name: string;

  /** Report date in YYYY-MM-DD format */
  reportDate: string;

  /** Time of day when earnings are released */
  timeOfDay: EarningsTimeOfDay;

  /** Estimated earnings per share (null if no estimate available) */
  epsEstimate: number | null;

  /** Actual reported EPS (null if not yet reported) */
  epsActual: number | null;

  /** Estimated revenue in millions (null if no estimate available) */
  revenueEstimate: number | null;

  /** Actual reported revenue in millions (null if not yet reported) */
  revenueActual: number | null;

  /** Percentage surprise calculated from EPS (null if estimate or actual is null) */
  surprisePercent: number | null;

  /** Fiscal quarter string (e.g., "Q1 2024") */
  fiscalQuarter: string | null;
}

/**
 * Filter configuration for earnings calendar
 */
export interface EarningsFilter {
  /** Filter by specific symbol (single symbol - Finnhub API supports one at a time) */
  symbol: string;

  /** Date range for earnings reports */
  dateRange: {
    /** Start date in YYYY-MM-DD format */
    from: string;
    /** End date in YYYY-MM-DD format */
    to: string;
  };

  /** View mode for displaying earnings */
  viewMode: 'calendar' | 'list';
}

/**
 * Earnings state managed by context/store
 */
export interface EarningsState {
  /** List of earnings items */
  items: EarningsItem[];

  /** Currently selected item ID (null if none selected) */
  selectedId: string | null;

  /** Current filter settings */
  filter: EarningsFilter;

  /** Loading state for async operations */
  isLoading: boolean;

  /** Error message (null if no error) */
  error: string | null;

  /** Timestamp of last successful fetch */
  lastFetchedAt: number;
}

/**
 * Actions available for managing earnings state
 */
export interface EarningsActions {
  /** Fetch earnings data from API */
  fetchEarnings: () => Promise<void>;

  /** Select/deselect an earnings item */
  selectItem: (id: string | null) => void;

  /** Update filter settings (partial update supported) */
  setFilter: (filter: Partial<EarningsFilter>) => void;
}

/** Combined context type for earnings state and actions */
export type EarningsContextType = EarningsState & EarningsActions;

/**
 * Format an earnings report date for display
 * Returns relative date like "Today", "Tomorrow", "In 3 days", or formatted date
 *
 * @param dateString - Date in YYYY-MM-DD format
 * @returns Human-readable relative date string
 */
export function formatEarningsDate(dateString: string): string {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const date = new Date(dateString);
  date.setHours(0, 0, 0, 0);

  const diffMs = date.getTime() - now.getTime();
  const diffDays = Math.round(diffMs / 86400000);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  if (diffDays > 1 && diffDays <= 7) return `In ${diffDays} days`;
  if (diffDays < -1 && diffDays >= -7) return `${Math.abs(diffDays)} days ago`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

/**
 * Calculate the earnings surprise percentage
 * Compares actual EPS to estimated EPS
 *
 * @param actual - Actual reported EPS (null if not yet reported)
 * @param estimate - Estimated EPS (null if no estimate available)
 * @returns Surprise percentage or null if calculation not possible
 */
export function calculateSurprisePercent(
  actual: number | null,
  estimate: number | null
): number | null {
  if (actual === null || estimate === null || estimate === 0) {
    return null;
  }

  const surprise = ((actual - estimate) / Math.abs(estimate)) * 100;
  return Math.round(surprise * 100) / 100; // Round to 2 decimal places
}

/** Display labels for time of day values */
export const TIME_OF_DAY_LABELS: Record<EarningsTimeOfDay, string> = {
  bmo: 'Before Market Open',
  amc: 'After Market Close',
  dmh: 'During Market Hours',
};

/** Display colors for time of day badges (for UI consistency) */
export const TIME_OF_DAY_COLORS: Record<EarningsTimeOfDay, string> = {
  bmo: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  amc: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
  dmh: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
};

/** Safe accessor for time of day colors with fallback */
export function getTimeOfDayColors(value: string | undefined): string {
  return TIME_OF_DAY_COLORS[(value as EarningsTimeOfDay) || 'dmh'];
}

/** Safe accessor for time of day labels with fallback */
export function getTimeOfDayLabel(value: string | undefined): string {
  return TIME_OF_DAY_LABELS[(value as EarningsTimeOfDay) || 'dmh'];
}
