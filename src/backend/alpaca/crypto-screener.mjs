/**
 * Crypto Screener Module
 *
 * Provides cryptocurrency market data using the CoinGecko public API.
 * No API key required - uses the free tier of CoinGecko.
 *
 * Endpoints used:
 *   - /coins/markets - Market data for top cryptocurrencies
 *   - /search/trending - Trending cryptocurrencies
 *   - /search - Search for coins by symbol
 *   - /coins/{id} - Detailed coin information
 *
 * @module crypto-screener
 */

// CoinGecko API configuration
const COINGECKO_BASE_URL = 'https://api.coingecko.com/api/v3';

/**
 * Scan cryptocurrency markets based on preset filters
 * @param {string} preset - Preset ID (cryptoGainers, cryptoLosers, cryptoVolume, cryptoTrending)
 * @returns {Promise<Object>} Scan results with stocks array, preset, count, and timestamp
 */
export async function scanCrypto(preset = 'cryptoGainers') {
  try {
    const timestamp = new Date().toISOString();

    // Handle trending preset separately
    if (preset === 'cryptoTrending') {
      const url = `${COINGECKO_BASE_URL}/search/trending`;

      const response = await fetch(url, {
        signal: AbortSignal.timeout(8000)
      });

      if (!response.ok) {
        throw new Error(`CoinGecko API error: ${response.status}`);
      }

      const data = await response.json();
      const coins = data?.coins || [];

// Transform trending coins to standard format
       const stocks = coins.map((item, index) => {
         const coin = item?.item || item;
         return {
           symbol: coin.symbol?.toUpperCase() || 'UNKNOWN',
           name: coin.name || 'Unknown',
           price: coin.price_btc || 0, // Note: trending only gives BTC ratio
           change: 0, // Not available in trending endpoint
           volume: coin.market_cap || 0,
           marketCap: coin.market_cap || 0,
           image: coin.thumb || coin.large || '',
           rank: index + 1
         };
       });

      return {
        success: true,
        stocks: stocks.slice(0, 10),
        preset,
        count: Math.min(stocks.length, 10),
        timestamp
      };
    }

    // For other presets, fetch from markets endpoint
    const url = `${COINGECKO_BASE_URL}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=false&price_change_percentage=24h`;

    const response = await fetch(url, {
      signal: AbortSignal.timeout(8000)
    });

    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status}`);
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
      throw new Error('Invalid response format from CoinGecko API');
    }

// Transform to standard format
     let stocks = data.map(coin => ({
       symbol: coin.symbol?.toUpperCase() || '',
       name: coin.name || '',
       price: coin.current_price || 0,
       change: coin.price_change_percentage_24h || 0,
       volume: coin.total_volume || 0,
       marketCap: coin.market_cap || 0,
       image: coin.image || '',
       rank: coin.market_cap_rank || 999
     }));

// Apply preset sorting and filtering
     switch (preset) {
       case 'cryptoGainers':
         // Sort by 24h price change descending
         stocks.sort((a, b) => b.change - a.change);
         break;

       case 'cryptoLosers':
         // Sort by 24h price change ascending
         stocks.sort((a, b) => a.change - b.change);
         break;

       case 'cryptoVolume':
         // Sort by volume descending
         stocks.sort((a, b) => b.volume - a.volume);
         break;

       default:
         // Default: sort by market cap
         stocks.sort((a, b) => (a.rank || 999) - (b.rank || 999));
     }

    // Take top 10
    const topStocks = stocks.slice(0, 10);

    return {
      success: true,
      stocks: topStocks,
      preset,
      count: topStocks.length,
      timestamp
    };
  } catch (error) {
    console.error(`[CryptoScreener] Error scanning crypto with preset '${preset}':`, error.message);

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

/**
 * Get detailed information for a specific cryptocurrency
 * @param {string} symbol - Cryptocurrency symbol (e.g., 'BTC', 'ETH')
 * @returns {Promise<Object>} Detailed crypto information
 */
export async function getCryptoDetails(symbol) {
  try {
    const upperSymbol = symbol.toUpperCase();
    const timestamp = new Date().toISOString();

    // Step 1: Search for the coin by symbol
    const searchUrl = `${COINGECKO_BASE_URL}/search?query=${encodeURIComponent(symbol.toLowerCase())}`;

    const searchResponse = await fetch(searchUrl, {
      signal: AbortSignal.timeout(8000)
    });

    if (!searchResponse.ok) {
      throw new Error(`CoinGecko search failed: ${searchResponse.status}`);
    }

    const searchData = await searchResponse.json();
    const coins = searchData?.coins || [];

    // Find the best match by symbol (exact match preferred)
    const coin = coins.find(c => c.symbol?.toUpperCase() === upperSymbol) ||
                 coins[0];

    if (!coin) {
      console.warn(`[CryptoScreener] No matching coin found for symbol: ${symbol}`);
      return {
        symbol: upperSymbol,
        name: upperSymbol,
        description: 'Not found',
        homepage: '',
        price: 0,
        marketCap: 0,
        volume24h: 0,
        changePercent24h: 0,
        image: '',
        timestamp
      };
    }

    // Step 2: Fetch detailed coin information
    const detailUrl = `${COINGECKO_BASE_URL}/coins/${coin.id}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false`;

    const detailResponse = await fetch(detailUrl, {
      signal: AbortSignal.timeout(8000)
    });

    if (!detailResponse.ok) {
      throw new Error(`CoinGecko detail fetch failed: ${detailResponse.status}`);
    }

    const detailData = await detailResponse.json();

    // Extract and clean description (first 300 chars, strip HTML)
    let description = '';
    if (detailData.description?.en) {
      description = detailData.description.en
        .replace(/<[^>]*>/g, '') // Remove HTML tags
        .substring(0, 300)
        .trim();
      if (detailData.description.en.length > 300) {
        description += '...';
      }
    }

    // Get homepage URL
    const homepage = detailData.links?.homepage?.[0] || '';

    // Get market data
    const marketData = detailData.market_data || {};

    return {
      symbol: upperSymbol,
      name: detailData.name || upperSymbol,
      description: description || 'No description available',
      homepage: homepage,
      price: marketData.current_price?.usd || 0,
      marketCap: marketData.market_cap?.usd || 0,
      volume24h: marketData.total_volume?.usd || 0,
      changePercent24h: marketData.price_change_percentage_24h || 0,
      image: detailData.image?.small || detailData.image?.thumb || '',
      timestamp
    };
  } catch (error) {
    console.error(`[CryptoScreener] Error getting crypto details for ${symbol}:`, error.message);

    // Return graceful fallback on error
    return {
      symbol: symbol.toUpperCase(),
      name: symbol.toUpperCase(),
      description: 'Not found',
      homepage: '',
      price: 0,
      marketCap: 0,
      volume24h: 0,
      changePercent24h: 0,
      image: '',
      timestamp: new Date().toISOString()
    };
  }
}

export default {
  scanCrypto,
  getCryptoDetails
};
