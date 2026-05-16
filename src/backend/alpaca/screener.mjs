/**
 * Alpaca Stock Screener Module
 *
 * Provides stock screening functionality using the Alpaca Data API.
 * Exports functions for fetching quotes, bars, snapshots, and scanning stocks
 * based on various preset filters (gappers, momentum, volume leaders, etc.).
 *
 * Environment Variables:
 *   VITE_ALPACA_PAPER_KEY - Alpaca paper trading API key
 *   VITE_ALPACA_PAPER_SECRET - Alpaca paper trading API secret
 *
 * @module screener
 */

import { loadEnv, getAlpacaCredentials } from '../shared/env-loader.mjs';
import { REQUEST_TIMEOUT_MS } from '../../shared/constants.mjs';

// Load environment variables
loadEnv();

// Alpaca Data API configuration
const ALPACA_DATA_URL = 'https://data.alpaca.markets';

// Default liquid stock symbols for screening (US equities)
const DEFAULT_SYMBOLS = [
  'AAPL', 'MSFT', 'NVDA', 'TSLA', 'META', 'AMZN', 'GOOGL', 'GOOG',
  'AMD', 'INTC', 'BAC', 'JPM', 'WFC', 'GS', 'MS', 'C',
  'SPY', 'QQQ', 'IWM', 'DIA', 'VTI', 'VOO',
  'NFLX', 'DIS', 'CRM', 'UBER', 'LYFT', 'ABNB', 'SNOW', 'PLTR',
  'COIN', 'HOOD', 'SQ', 'PYPL', 'SHOP', 'SE', 'ROKU', 'ZM',
  'JNJ', 'PFE', 'MRK', 'LLY', 'UNH', 'ABBV', 'TMO', 'DHR',
  'XOM', 'CVX', 'COP', 'OXY', 'SLB', 'EOG',
  'CAT', 'DE', 'GE', 'BA', 'LMT', 'RTX', 'UPS', 'FDX'
];

/**
 * Get Alpaca API headers from environment variables
 * @returns {Object} Headers object with APCA-API-KEY-ID and APCA-API-SECRET-KEY
 */
function getAlpacaHeaders() {
  const credentials = getAlpacaCredentials(true); // Paper trading
  return {
    'APCA-API-KEY-ID': credentials.key,
    'APCA-API-SECRET-KEY': credentials.secret,
    'Content-Type': 'application/json'
  };
}

/**
 * Get available stock screening presets
 * @returns {Array<Object>} Array of preset objects with id, name, and description
 */
export function getPresets() {
  return [
    {
      id: 'gappers',
      name: 'Gappers',
      description: 'Stocks with largest price gaps (up or down) from previous close'
    },
    {
      id: 'momentum',
      name: 'Momentum Leaders',
      description: 'Stocks showing strongest upward price momentum'
    },
    {
      id: 'volume_leaders',
      name: 'Volume Leaders',
      description: 'Stocks with highest trading volume'
    },
    {
      id: 'high_volatility',
      name: 'High Volatility',
      description: 'Stocks with largest intraday price range (high - low)'
    },
    {
      id: 'top_gainers',
      name: 'Top Gainers',
      description: 'Stocks with highest percentage gains'
    },
    {
      id: 'top_losers',
      name: 'Top Losers',
      description: 'Stocks with highest percentage losses'
    }
  ];
}

/**
 * Fetch the latest trade and quote for a single stock symbol
 * @param {string} symbol - Stock symbol (e.g., 'AAPL')
 * @returns {Promise<Object>} Quote data with symbol, price, volume, timestamp
 */
export async function getQuote(symbol) {
  try {
    const headers = getAlpacaHeaders();
    const encodedSymbol = encodeURIComponent(symbol.toUpperCase());

    // Fetch latest trade
    const tradeUrl = `${ALPACA_DATA_URL}/v2/stocks/trades/latest?symbols=${encodedSymbol}&feed=iex`;
    const tradeResponse = await fetch(tradeUrl, {
      headers,
      signal: AbortSignal.timeout(8000)
    });

    if (!tradeResponse.ok) {
      throw new Error(`Alpaca API error: ${tradeResponse.status}`);
    }

    const tradeData = await tradeResponse.json();

    // Fetch latest quote
    const quoteUrl = `${ALPACA_DATA_URL}/v2/stocks/quotes/latest?symbols=${encodedSymbol}&feed=iex`;
    const quoteResponse = await fetch(quoteUrl, {
      headers,
      signal: AbortSignal.timeout(8000)
    });

    let quoteData = {};
    if (quoteResponse.ok) {
      quoteData = await quoteResponse.json();
    }

    const trade = tradeData.trades?.[symbol.toUpperCase()];
    const quote = quoteData.quotes?.[symbol.toUpperCase()];

    return {
      symbol: symbol.toUpperCase(),
      price: trade?.p || quote?.ap || null,
      size: trade?.s || null,
      volume: null, // Individual quote doesn't include volume
      timestamp: trade?.t || quote?.t || new Date().toISOString(),
      bid: quote?.b || null,
      ask: quote?.a || null,
      bidSize: quote?.bs || null,
      askSize: quote?.as || null,
      raw: { trade, quote }
    };
  } catch (error) {
    console.error(`[Screener] Error fetching quote for ${symbol}:`, error.message);
    throw new Error(`Failed to fetch quote for ${symbol}: ${error.message}`);
  }
}

/**
 * Fetch historical price bars (candles) for one or more symbols
 * @param {string} symbols - Comma-separated stock symbols (e.g., 'AAPL,MSFT')
 * @param {string} timeframe - Timeframe for bars (e.g., '1Day', '1Hour', '15Min')
 * @param {number} limit - Maximum number of bars to return (1-10000)
 * @returns {Promise<Object>} Object keyed by symbol with array of bars
 */
export async function getBars(symbols, timeframe = '1Day', limit = 100) {
  try {
    const headers = getAlpacaHeaders();
    const encodedSymbols = encodeURIComponent(symbols);
    const validLimit = Math.max(1, Math.min(10000, limit));

    const url = `${ALPACA_DATA_URL}/v2/stocks/bars?symbols=${encodedSymbols}&timeframe=${timeframe}&limit=${validLimit}&feed=iex`;

    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(8000)
    });

    if (!response.ok) {
      throw new Error(`Alpaca API error: ${response.status}`);
    }

    const data = await response.json();

    // Return bars keyed by symbol
    return data.bars || {};
  } catch (error) {
    console.error(`[Screener] Error fetching bars:`, error.message);
    throw new Error(`Failed to fetch bars: ${error.message}`);
  }
}

/**
 * Fetch bulk metrics (snapshots) for multiple symbols
 * @param {string} symbols - Comma-separated stock symbols (e.g., 'AAPL,MSFT,NVDA')
 * @returns {Promise<Object>} Object with success flag, stocks array, and timestamp
 */
export async function getBulkMetrics(symbols) {
  try {
    const headers = getAlpacaHeaders();
    const symbolList = symbols.split(',').map(s => s.trim()).filter(Boolean);

    if (symbolList.length === 0) {
      return { success: true, stocks: [], timestamp: new Date().toISOString() };
    }

    // Alpaca limits symbols per request, so batch if necessary
    const BATCH_SIZE = 50;
    const batches = [];
    for (let i = 0; i < symbolList.length; i += BATCH_SIZE) {
      batches.push(symbolList.slice(i, i + BATCH_SIZE));
    }

    const allResults = [];

    for (const batch of batches) {
      const encodedSymbols = encodeURIComponent(batch.join(','));
      const url = `${ALPACA_DATA_URL}/v2/stocks/snapshots?symbols=${encodedSymbols}&feed=iex`;

      const response = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(8000)
      });

      if (!response.ok) {
        console.error(`[Screener] Snapshot API error for batch: ${response.status}`);
        continue;
      }

      const data = await response.json();

      // Process snapshots
      for (const [symbol, snapshot] of Object.entries(data)) {
        const dailyBar = snapshot?.dailyBar || {};
        const minuteBar = snapshot?.minuteBar || {};
        const latestQuote = snapshot?.latestQuote || {};
        const latestTrade = snapshot?.latestTrade || {};

        // Calculate change metrics from dailyBar
        const currentPrice = latestTrade?.p || dailyBar?.c || latestQuote?.ap || 0;
        const prevClose = dailyBar?.c || currentPrice;
        const openPrice = dailyBar?.o || currentPrice;
        const highPrice = dailyBar?.h || currentPrice;
        const lowPrice = dailyBar?.l || currentPrice;
        const volume = dailyBar?.v || 0;

        const change = currentPrice - prevClose;
        const changePercent = prevClose !== 0 ? (change / prevClose) * 100 : 0;

        allResults.push({
          symbol: symbol.toUpperCase(),
          price: currentPrice,
          change: change,
          changePercent: changePercent,
          volume: volume,
          high: highPrice,
          low: lowPrice,
          open: openPrice,
          prevClose: prevClose,
          vwap: dailyBar?.vw || currentPrice,
          tradeCount: dailyBar?.n || 0,
          timestamp: new Date().toISOString()
        });
      }
    }

    return {
      success: true,
      stocks: allResults,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error(`[Screener] Error fetching bulk metrics:`, error.message);
    throw new Error(`Failed to fetch bulk metrics: ${error.message}`);
  }
}

/**
 * Scan stocks based on a preset filter
 * @param {string} preset - Preset ID (gappers, momentum, volume_leaders, high_volatility, top_gainers, top_losers)
 * @param {Object} options - Scan options
 * @param {boolean} options.includeMeta - Whether to include metadata in response
 * @returns {Promise<Object>} Scan results with stocks array, preset, count, and timestamp
 */
export async function scanStocks(preset = 'gappers', options = {}) {
  try {
    const { includeMeta = false } = options;

    // Use default liquid tickers
    const symbols = DEFAULT_SYMBOLS;

    // Fetch bulk metrics for all default symbols
    const metrics = await getBulkMetrics(symbols.join(','));

    if (!metrics.success || !Array.isArray(metrics.stocks)) {
      throw new Error('Failed to fetch stock metrics');
    }

    let filteredStocks = [...metrics.stocks];

    // Apply preset filters and sorting
    switch (preset) {
      case 'gappers':
        // Sort by absolute change percent (largest gaps first)
        filteredStocks.sort((a, b) =>
          Math.abs(b.changePercent || 0) - Math.abs(a.changePercent || 0)
        );
        break;

      case 'momentum':
      case 'top_gainers':
        // Sort by change percent descending (highest gains first)
        filteredStocks.sort((a, b) =>
          (b.changePercent || 0) - (a.changePercent || 0)
        );
        break;

      case 'top_losers':
        // Sort by change percent ascending (highest losses first)
        filteredStocks.sort((a, b) =>
          (a.changePercent || 0) - (b.changePercent || 0)
        );
        break;

      case 'volume_leaders':
        // Sort by volume descending
        filteredStocks.sort((a, b) =>
          (b.volume || 0) - (a.volume || 0)
        );
        break;

      case 'high_volatility':
        // Sort by volatility (high - low) / open
        filteredStocks = filteredStocks.map(stock => ({
          ...stock,
          volatility: stock.open !== 0
            ? ((stock.high || stock.price) - (stock.low || stock.price)) / stock.open
            : 0
        })).sort((a, b) => b.volatility - a.volatility);
        break;

      default:
        // Default: sort by volume
        filteredStocks.sort((a, b) =>
          (b.volume || 0) - (a.volume || 0)
        );
    }

    // Take top 10 results
    const topStocks = filteredStocks.slice(0, 10);

    const result = {
      success: true,
      stocks: topStocks,
      preset,
      count: topStocks.length,
      timestamp: new Date().toISOString()
    };

    if (includeMeta) {
      const presets = getPresets();
      const presetConfig = presets.find(p => p.id === preset) || { id: preset, name: preset, description: '' };

      result.meta = {
        preset: presetConfig,
        filters: [
          'Active US equities',
          `Sorted by: ${preset}`,
          `Limit: 10 results`
        ],
        generatedAt: new Date().toISOString(),
        source: 'Alpaca Data API'
      };
    }

    return result;
  } catch (error) {
    console.error(`[Screener] Error scanning stocks with preset '${preset}':`, error.message);

    // Return empty result on error rather than throwing
    return {
      success: false,
      stocks: [],
      preset,
      count: 0,
      timestamp: new Date().toISOString(),
      error: error.message
    };
  }
}

export default {
  getPresets,
  getQuote,
  getBars,
  getBulkMetrics,
  scanStocks
};
