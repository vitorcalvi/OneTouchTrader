import { toast } from "sonner";
import {
  AlpacaConfig,
  Account,
  Position,
  Order,
  Bar,
  PortfolioHistory,
} from "../../types";
import { isCryptoSymbol } from "../shared/utils/assetClassDetector";
import { formatCryptoPrice } from "../shared/utils/priceFormatters";
import {
  normalizeCryptoSymbol,
  toApiSymbol,
} from "../shared/utils/symbolNormalizers";

// Backend proxy URLs - Alpaca credentials are server-side only
// All Alpaca API calls route through backend at /api/alpaca/*
// Backend adds credentials before forwarding to Alpaca API
const PROXY_BASE = "/api/alpaca";

export interface OrderUpdate {
  T: "trade_update";
  event: string;
  execution_id: string;
  order: Order;
}
const PROXY_DATA = "/api/alpaca";

export class AlpacaService {
  private config: AlpacaConfig;
  private baseUrl: string;
  private dataUrl: string;
  private ws: WebSocket | null = null;
  private wsReconnectTimer: NodeJS.Timeout | null = null;
  private wsRetryCount: number = 0;
  private wsMaxRetries: number = 3;
  private wsLatestSymbols: string[] = [];
  private wsOnQuote: ((symbol: string, price: number) => void) | null = null;
  private wsOnOrderUpdate: ((update: any) => void) | null = null;
  private orderUpdateListeners: Map<string, (update: any) => void> = new Map();
  private wsOnError: ((error: any) => void) | null = null;
  private wsFirstConnectTime: number | null = null;
  private readonly WS_RECONNECT_TIMEOUT_MS = 5 * 60 * 1000;
  private rateLimitBackoff: number = 0;
  private lastRateLimitTime: number = 0;
  private wsConnecting: boolean = false;
  private useDirectUrls: boolean = false; // Fallback flag
  private debugEnabled: boolean = false;

  constructor(config: AlpacaConfig) {
    this.config = config;
    this.debugEnabled = (import.meta as any)?.env?.VITE_DEBUG_ALPACA === "true";

    // Always use backend proxy - credentials are server-side only
    this.baseUrl = PROXY_BASE;
    this.dataUrl = PROXY_DATA;
    this.useDirectUrls = false;
  }

  private log(
    level: "debug" | "warn" | "error",
    message: string,
    details?: Record<string, unknown>,
  ) {
    if (level === "debug" && !this.debugEnabled) return;
    const consoleMethod =
      level === "debug"
        ? console.debug
        : level === "warn"
          ? console.warn
          : console.error;
    if (details) {
      consoleMethod(`[AlpacaService] ${message}`, details);
    } else {
      consoleMethod(`[AlpacaService] ${message}`);
    }
  }

  private withLiveParam(url: string): string {
    if (this.config.isPaper) return url;
    if (/[?&]live=/.test(url)) return url;
    return url.includes("?") ? `${url}&live=true` : `${url}?live=true`;
  }

  private addEquityFeedParam(url: string): string {
    if (/[?&]feed=/.test(url)) return url;
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}feed=iex`;
  }

  // Fetch with automatic retry on proxy failure and network timeout
  private async fetchWithRetry(
    url: string,
    options: RequestInit,
    context: string,
    retries = 1,
    timeoutMs = 10000,
  ): Promise<Response> {
    const existingSignal = options.signal;
    const hasTimeoutSignal =
      typeof AbortSignal !== "undefined" &&
      typeof (AbortSignal as any).timeout === "function";
    const timeoutSignal: AbortSignal | null = hasTimeoutSignal
      ? (AbortSignal as any).timeout(timeoutMs)
      : null;
    const controller = timeoutSignal ? null : new AbortController();

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    if (controller) {
      timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    }

    let signal: AbortSignal | undefined;
    if (
      existingSignal &&
      timeoutSignal &&
      typeof (AbortSignal as any).any === "function"
    ) {
      signal = (AbortSignal as any).any([existingSignal, timeoutSignal]);
    } else if (
      existingSignal &&
      controller &&
      typeof (AbortSignal as any).any === "function"
    ) {
      signal = (AbortSignal as any).any([existingSignal, controller.signal]);
    } else if (timeoutSignal) {
      signal = timeoutSignal;
    } else if (controller) {
      signal = controller.signal;
      if (existingSignal) {
        if (existingSignal.aborted) {
          controller.abort();
        } else {
          const onAbort = () => controller.abort();
          existingSignal.addEventListener("abort", onAbort, { once: true });
        }
      }
    }

    try {
      const method = (options.method || "GET").toUpperCase();
      this.log("debug", `Request ${context}`, { method, url });

      let response;
      try {
        response = await fetch(url, {
          ...options,
          signal,
        });
      } catch (fetchErr) {
        throw fetchErr;
      }

      if (timeoutId) clearTimeout(timeoutId);

      const status = response.status;
      const retryableStatuses = new Set([408, 425, 429, 500, 502, 503, 504]);
      if (retryableStatuses.has(status) && retries > 0) {
        if (status === 429) {
          await this.handleRateLimit();
        } else {
          const attempt = Math.max(0, retries - 1);
          const backoffMs = Math.min(250 * Math.pow(2, attempt), 4000);
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
        }

        this.log("warn", `Retrying ${context}`, {
          url,
          status,
          remainingRetries: retries,
        });
        return this.fetchWithRetry(
          url,
          options,
          context,
          retries - 1,
          timeoutMs,
        );
      }

      this.log("debug", `Response ${context}`, { url, status });
      return response;
    } catch (error: any) {
      if (timeoutId) clearTimeout(timeoutId);

      this.log("warn", `Network error ${context}`, {
        url,
        name: error?.name,
        message: error?.message,
      });

      if (error?.name === "TimeoutError") {
        throw new Error(
          `Request timed out after ${timeoutMs / 1000}s (${context})`,
        );
      }

      if (error?.name === "AbortError") {
        if (existingSignal?.aborted) throw error;
        throw new Error(`Request aborted (${context})`);
      }

      if (retries > 0) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        return this.fetchWithRetry(
          url,
          options,
          context,
          retries - 1,
          timeoutMs,
        );
      }

      throw error;
    }
  }

  private async handleRateLimit() {
    const now = Date.now();
    if (now - this.lastRateLimitTime < 60000) {
      this.rateLimitBackoff = Math.min(
        this.rateLimitBackoff * 2 || 1000,
        30000,
      );
    } else {
      this.rateLimitBackoff = 1000;
    }
    this.lastRateLimitTime = now;
    await new Promise((resolve) => setTimeout(resolve, this.rateLimitBackoff));
  }

  private getHeaders(
    includeContentType: boolean = false,
  ): Record<string, string> {
    const headers: Record<string, string> = {};

    // Backend proxy handles authentication - credentials are server-side only
    // Do NOT send Alpaca credentials from frontend

    // Only include Content-Type for POST/PUT requests with JSON body
    if (includeContentType) {
      headers["Content-Type"] = "application/json";
    }

    return headers;
  }

  hasCredentials(): boolean {
    // Check if API keys are available (for WebSocket compatibility and tests with direct URLs)
    // When useDirectUrls is true, it means we're in a test scenario or have direct API access
    if (this.useDirectUrls) {
      return (
        !!(this.config.paperApiKey && this.config.paperApiSecret) ||
        !!(this.config.liveApiKey && this.config.liveApiSecret)
      );
    }
    // Backend proxy handles authentication - frontend never has credentials
    return false;
  }

  private async handleResponse(
    response: Response,
    context: string,
    unwrapData: boolean = false,
  ) {
    if (response.status === 204) return null;

    const rawText = await response.text().catch(() => "");
    const looksLikeHtml =
      rawText.includes("<!DOCTYPE") || rawText.includes("<html");

    if (response.status === 429) {
      this.log("warn", `${context} rate limited`, { status: response.status });
      let retryAfterSeconds: number | null = null;
      try {
        const parsed = rawText ? JSON.parse(rawText) : null;
        if (parsed && typeof parsed === "object") {
          const ra = (parsed as any)?.retryAfter;
          if (typeof ra === "number" && Number.isFinite(ra) && ra > 0)
            retryAfterSeconds = ra;
        }
      } catch {}

      const wait = retryAfterSeconds ?? 30;
      console.warn(
        `[AlpacaService] Rate limited. Retry after ${wait}s. ` +
          `Endpoint: ${context}`,
      );
      toast.warning(`Alpaca API rate limit hit. Retrying in ${wait}s...`);
      throw new Error(
        `⚠️ Rate limit exceeded. Please wait ${wait}s and try again.`,
      );
    }

    if (!response.ok) {
      if (looksLikeHtml) {
        this.log("error", `${context} failed (HTML response)`, {
          status: response.status,
        });
        throw new Error(
          "❌ Network error. Check your connection, backend, and API keys.",
        );
      }

      let errorMessage = rawText;
      try {
        const json = rawText ? JSON.parse(rawText) : null;
        if (json && typeof json === "object") {
          errorMessage =
            (json as any).message || (json as any).error || rawText;
        }
      } catch {}

      this.log("error", `${context} failed`, {
        status: response.status,
        errorMessage,
      });

      if (response.status === 403) {
        throw new Error(
          `🚫 Permission denied: ${errorMessage || "Forbidden"}.`,
        );
      }
      if (response.status === 401) {
        throw new Error(
          `🔑 Authentication failed: ${errorMessage || "Unauthorized"}.`,
        );
      }
      if (response.status === 404) {
        throw new Error(
          `❓ Not found: ${context}. Symbol may not exist or be tradable.`,
        );
      }
      if (response.status === 422) {
        throw new Error(
          `⚠️ Invalid request: ${errorMessage || "Check request parameters"}`,
        );
      }
      if (response.status >= 500) {
        throw new Error(
          `🔧 ${errorMessage || "Server error"}. Please try again in a moment.`,
        );
      }

      throw new Error(
        `❌ ${context} failed: ${errorMessage || response.statusText}`,
      );
    }

    if (!rawText.trim()) return null;

    if (looksLikeHtml) {
      this.log("error", `${context} failed (unexpected HTML)`, {
        status: response.status,
      });
      throw new Error(`${context} failed: received HTML instead of JSON.`);
    }

    let jsonData: any;
    try {
      jsonData = JSON.parse(rawText);
    } catch (error: any) {
      this.log("error", `${context} failed (invalid JSON)`, {
        status: response.status,
        parseError: error?.message,
      });
      throw new Error(
        `${context} failed: invalid JSON response (${error?.message || "parse error"})`,
      );
    }

    // Handle both wrapped responses { data: [...]} and direct array responses
    if (unwrapData) {
      // Check if it's a wrapped response with data field
      if (jsonData && typeof jsonData === "object" && "data" in jsonData) {
        return (jsonData as any).data;
      }
      // If it's already an array (direct API response), return it as-is
      if (Array.isArray(jsonData)) {
        return jsonData;
      }
      // Handle proxy errors/graceful degradation responses - return empty array
      if (jsonData?.error || jsonData?.status === "service_unavailable") {
        this.log(
          "warn",
          `Received error response for ${context}, returning empty array`,
          jsonData,
        );
        return [];
      }
    }

    return jsonData;
  }

  async getAccount(): Promise<Account> {
    // Backend service handles /v2 internally, so don't include it in the path
    const url = this.withLiveParam(`${this.baseUrl}/account`);
    const response = await this.fetchWithRetry(
      url,
      {
        headers: this.getHeaders(),
      },
      "Fetch account",
    );
    return this.handleResponse(response, "Fetch account", true);
  }

  async getPositions(): Promise<Position[]> {
    // Backend service handles /v2 internally, so don't include it in the path
    const url = this.withLiveParam(`${this.baseUrl}/positions`);
    const response = await this.fetchWithRetry(
      url,
      {
        headers: this.getHeaders(),
      },
      "Fetch positions",
    );
    return this.handleResponse(response, "Fetch positions", true);
  }

  async getOrders(
    status: "open" | "closed" | "all" = "open",
    limit = 200,
  ): Promise<Order[]> {
    // Backend service handles /v2 internally, so don't include it in the path
    const url = this.withLiveParam(
      `${this.baseUrl}/orders?status=${status}&limit=${limit}`,
    );
    const response = await this.fetchWithRetry(
      url,
      {
        headers: this.getHeaders(),
      },
      "Fetch orders",
    );
    return this.handleResponse(response, "Fetch orders", true);
  }

  async getOrderById(orderId: string): Promise<Order> {
    const url = this.withLiveParam(`${this.baseUrl}/orders/${orderId}`);
    const response = await this.fetchWithRetry(
      url,
      {
        headers: this.getHeaders(),
      },
      "Fetch order",
    );
    return this.handleResponse(response, "Fetch order", true);
  }

  async getPortfolioHistory(
    period = "1M",
    timeframe = "1D",
  ): Promise<PortfolioHistory> {
    // Backend service handles /v2 internally, so don't include it in the path
    const url = this.withLiveParam(
      `${this.baseUrl}/account/portfolio/history?period=${period}&timeframe=${timeframe}`,
    );
    const response = await this.fetchWithRetry(
      url,
      {
        headers: this.getHeaders(),
      },
      "Fetch history",
    );
    return this.handleResponse(response, "Fetch history", true);
  }

  async getLatestTrade(symbol: string): Promise<number> {
    if (this.useDirectUrls) {
      if (isCryptoSymbol(symbol)) {
        const normalized = normalizeCryptoSymbol(symbol);
        const response = await fetch(
          `${this.dataUrl}/v1beta3/crypto/us/latest/trades?symbols=${encodeURIComponent(normalized)}`,
          {
            headers: this.getHeaders(),
          },
        );
        const data = await this.handleResponse(
          response,
          `Fetch trade ${symbol}`,
        );
        const trade = data?.trades?.[normalized] ?? data?.trades?.[symbol];
        const price = trade?.p;
        if (typeof price !== "number") {
          throw new Error(`Fetch trade ${symbol} failed - missing trade price`);
        }
        return price;
      }

      const url = this.addEquityFeedParam(
        `${this.dataUrl}/v2/stocks/${encodeURIComponent(symbol)}/trades/latest`,
      );
      const response = await fetch(url, {
        headers: this.getHeaders(),
      });
      const data = await this.handleResponse(response, `Fetch trade ${symbol}`);
      const price = data?.trade?.p;
      if (typeof price !== "number") {
        throw new Error(`Fetch trade ${symbol} failed - missing trade price`);
      }
      return price;
    }

    const normalized = isCryptoSymbol(symbol)
      ? normalizeCryptoSymbol(symbol)
      : symbol;
    const url = this.withLiveParam(
      `${this.dataUrl}/trades?symbols=${encodeURIComponent(symbol)}`,
    );
    const response = await this.fetchWithRetry(
      url,
      { headers: this.getHeaders() },
      `Fetch trade ${symbol}`,
      1,
    );
    const data = await this.handleResponse(
      response,
      `Fetch trade ${symbol}`,
      true,
    );
    const trade = data?.trades?.[symbol]?.p ?? data?.trades?.[normalized]?.p;
    if (typeof trade !== "number") {
      throw new Error(`Fetch trade ${symbol} failed - missing trade price`);
    }
    return trade;
  }

  // Batch fetch trades for polling
  async getLatestTrades(symbols: string[]): Promise<{ [key: string]: number }> {
    if (symbols.length === 0) return {};
    try {
      const result: { [key: string]: number } = {};

      if (this.useDirectUrls) {
        const stockSymbols: string[] = [];
        const cryptoSymbols: string[] = [];
        const cryptoNormalizedByOriginal = new Map<string, string>();

        for (const sym of symbols) {
          if (isCryptoSymbol(sym)) {
            const normalized = normalizeCryptoSymbol(sym);
            cryptoSymbols.push(normalized);
            cryptoNormalizedByOriginal.set(sym, normalized);
          } else {
            stockSymbols.push(sym);
          }
        }

        if (stockSymbols.length > 0) {
          const symbolString = stockSymbols.join(",");
          const url = this.addEquityFeedParam(
            `${this.dataUrl}/v2/stocks/trades/latest?symbols=${encodeURIComponent(symbolString)}`,
          );
          const response = await fetch(url, {
            headers: this.getHeaders(),
          });

          if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
              throw new Error(`Auth failed (${response.status})`);
            }
          } else {
            const data = await response.json();
            if (data?.trades) {
              Object.keys(data.trades).forEach((sym) => {
                const price = data.trades[sym]?.p;
                if (typeof price === "number") result[sym] = price;
              });
            }
          }
        }

        if (cryptoSymbols.length > 0) {
          const symbolString = cryptoSymbols.join(",");
          const response = await fetch(
            `${this.dataUrl}/v1beta3/crypto/us/latest/trades?symbols=${encodeURIComponent(symbolString)}`,
            {
              headers: this.getHeaders(),
            },
          );

          if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
              throw new Error(`Auth failed (${response.status})`);
            }
          } else {
            const data = await response.json();
            const trades = data?.trades ?? data?.data?.trades ?? {};
            for (const [orig, norm] of cryptoNormalizedByOriginal.entries()) {
              const price = trades?.[norm]?.p;
              if (typeof price === "number") result[orig] = price;
            }
          }
        }

        return result;
      }

      const symbolString = symbols.join(",");
      const url = this.withLiveParam(
        `${this.dataUrl}/trades?symbols=${encodeURIComponent(symbolString)}`,
      );
      const response = await this.fetchWithRetry(
        url,
        { headers: this.getHeaders() },
        "Fetch trades",
        1,
      );
      const unwrapped = await this.handleResponse(
        response,
        "Fetch trades",
        true,
      );
      if (unwrapped?.trades && typeof unwrapped.trades === "object") {
        Object.keys(unwrapped.trades).forEach((sym) => {
          const price = (unwrapped.trades as any)[sym]?.p;
          if (typeof price === "number") result[sym] = price;
        });
      }
      for (const sym of symbols) {
        if (result[sym] !== undefined) continue;
        const normalized = isCryptoSymbol(sym)
          ? normalizeCryptoSymbol(sym)
          : sym;
        const price = (unwrapped as any)?.trades?.[normalized]?.p;
        if (typeof price === "number") result[sym] = price;
      }
      return result;
    } catch (error) {
      // Re-throw auth errors so UI can handle them
      if ((error as Error).message.includes("Auth failed")) throw error;
      return {};
    }
  }

  async submitOrder(
    order: Omit<Partial<Order>, "qty"> & {
      type: string;
      side: string;
      symbol: string;
      qty: string | number;
      time_in_force: string;
      extended_hours?: boolean;
      limit_price?: string;
      stop_price?: string;
      take_profit?: { limit_price: string };
      stop_loss?: { stop_price: string };
      order_class?: "simple" | "bracket" | "oco" | "oto";
      trail_price?: string;
      trail_percent?: string;
    },
  ): Promise<Order> {
    console.log(
      "[AlpacaService] submitOrder called with:",
      JSON.stringify(order),
    );
    const isCrypto = isCryptoSymbol(order.symbol);
    const payload = isCrypto
      ? this.buildCryptoOrderPayload(order)
      : this.buildStockOrderPayload(order);

    console.log("[AlpacaService] Payload to send:", JSON.stringify(payload));

    const url = this.withLiveParam(`${this.baseUrl}/orders`);
    const response = await this.fetchWithRetry(
      url,
      {
        method: "POST",
        headers: this.getHeaders(true),
        body: JSON.stringify(payload),
      },
      "Submit order",
      0,
    );
    return this.handleResponse(response, "Submit order", true);
  }

  private buildStockOrderPayload(
    order: Parameters<typeof this.submitOrder>[0],
  ): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      symbol: order.symbol.toUpperCase(),
      qty: String(order.qty),
      side: order.side,
      time_in_force: order.time_in_force || "day",
      type: order.type,
    };

    if (order.limit_price !== undefined)
      payload.limit_price = order.limit_price;
    if (order.stop_price !== undefined) payload.stop_price = order.stop_price;
    if (order.order_class !== undefined)
      payload.order_class = order.order_class;
    if (order.extended_hours !== undefined)
      payload.extended_hours = order.extended_hours;
    if (order.stop_loss !== undefined) payload.stop_loss = order.stop_loss;
    if (order.take_profit !== undefined)
      payload.take_profit = order.take_profit;
    if (order.trail_price !== undefined)
      payload.trail_price = order.trail_price;
    if (order.trail_percent !== undefined)
      payload.trail_percent = order.trail_percent;

    return payload;
  }

  private buildCryptoOrderPayload(
    order: Parameters<typeof this.submitOrder>[0],
  ): Record<string, unknown> {
    const symbol = order.symbol.replace("/", "").toUpperCase();

    const payload: Record<string, unknown> = {
      symbol,
      qty: String(order.qty),
      side: order.side,
      time_in_force: order.time_in_force === "ioc" ? "ioc" : "gtc",
    };

    const type = order.type.toLowerCase();
    payload.type = type === "stop" ? "stop_limit" : type;

    if (order.limit_price) payload.limit_price = order.limit_price;
    if (order.stop_price) payload.stop_price = order.stop_price;

    if (type === "stop_limit" && !payload.limit_price && payload.stop_price) {
      const stopPrice = Number(payload.stop_price);
      const slip = 0.002;
      const limitPrice =
        order.side === "buy" ? stopPrice * (1 + slip) : stopPrice * (1 - slip);
      payload.limit_price = formatCryptoPrice(limitPrice);
    }

    return payload;
  }

  async replaceOrder(
    orderId: string,
    payload: Partial<Order> & {
      stop_price?: string | number;
      limit_price?: string | number;
      qty?: string | number;
    },
  ): Promise<Order> {
    const url = this.withLiveParam(`${this.baseUrl}/orders/${orderId}`);
    const response = await this.fetchWithRetry(
      url,
      {
        method: "PATCH",
        headers: this.getHeaders(true),
        body: JSON.stringify(payload),
      },
      "Replace order",
      1,
    );
    return this.handleResponse(response, "Replace order", true);
  }

  async cancelOrder(orderId: string): Promise<void> {
    // Backend service handles /v2 internally, so don't include it in the path
    const url = this.withLiveParam(`${this.baseUrl}/orders/${orderId}`);
    const response = await this.fetchWithRetry(
      url,
      {
        method: "DELETE",
        headers: this.getHeaders(),
      },
      "Cancel order",
      0,
    );
    await this.handleResponse(response, "Cancel order");
  }

  async closePosition(symbol: string): Promise<void> {
    const positionSymbol = toApiSymbol(symbol);
    const url = this.withLiveParam(
      `${this.baseUrl}/positions/${encodeURIComponent(positionSymbol)}`,
    );
    const response = await this.fetchWithRetry(
      url,
      {
        method: "DELETE",
        headers: this.getHeaders(),
      },
      "Close position",
      0,
    );
    await this.handleResponse(response, "Close position");
  }

  async getAssets(): Promise<
    Array<{ symbol: string; name: string; tradable: boolean; status: string }>
  > {
    if (!this.hasCredentials()) {
      const fallback = [
        "AAPL",
        "PLTR",
        "NVDA",
        "AMZN",
        "GOOGL",
        "META",
        "TSLA",
        "SPY",
        "QQQ",
      ];
      return fallback.map((symbol) => ({
        symbol,
        name: symbol,
        tradable: true,
        status: "active",
      }));
    }

    // Backend service handles /v2 internally, so don't include it in the path
    const url = this.withLiveParam(
      `${this.baseUrl}/assets?status=active&asset_class=us_equity`,
    );
    const response = await this.fetchWithRetry(
      url,
      {
        headers: this.getHeaders(),
      },
      "getAssets",
    );
    return await this.handleResponse(response, "getAssets", true);
  }

  async getAsset(symbol: string): Promise<{
    symbol: string;
    class: string;
    tradable: boolean;
    status: string;
    exchange: string;
  } | null> {
    if (!this.hasCredentials()) return null;

    try {
      const url = this.withLiveParam(
        `${this.baseUrl}/assets/${encodeURIComponent(symbol)}`,
      );
      const response = await this.fetchWithRetry(
        url,
        {
          headers: this.getHeaders(),
        },
        "getAsset",
      );
      return await this.handleResponse(response, "getAsset", true);
    } catch (error) {
      console.warn(`Failed to fetch asset details for ${symbol}:`, error);
      return null;
    }
  }

  async getLatestQuote(
    symbol: string,
  ): Promise<{ ap: number; bp: number; t: string } | null> {
    if (this.useDirectUrls) {
      if (isCryptoSymbol(symbol)) {
        const normalized = normalizeCryptoSymbol(symbol);
        const response = await fetch(
          `${this.dataUrl}/v1beta3/crypto/us/latest/quotes?symbols=${encodeURIComponent(normalized)}`,
          {
            headers: this.getHeaders(),
          },
        );
        const data = await this.handleResponse(response, "getLatestQuote");
        return data?.quotes?.[normalized] || data?.quotes?.[symbol] || null;
      }

      const url = this.addEquityFeedParam(
        `${this.dataUrl}/v2/stocks/${encodeURIComponent(symbol)}/quotes/latest`,
      );
      const response = await fetch(url, {
        headers: this.getHeaders(),
      });
      const data = await this.handleResponse(response, "getLatestQuote");
      return data.quote || null;
    }

    const normalized = isCryptoSymbol(symbol)
      ? normalizeCryptoSymbol(symbol)
      : symbol;
    const url = this.withLiveParam(
      `${this.dataUrl}/quotes?symbols=${encodeURIComponent(symbol)}`,
    );
    const response = await this.fetchWithRetry(
      url,
      { headers: this.getHeaders() },
      "getLatestQuote",
      1,
    );
    const data = await this.handleResponse(response, "getLatestQuote", true);
    const quote = data?.quotes?.[symbol] ?? data?.quotes?.[normalized];
    return quote || null;
  }

  async getBars(
    symbol: string,
    timeframe: string = "1D",
    limit: number = 20,
  ): Promise<Bar[]> {
    const isCrypto = isCryptoSymbol(symbol);
    const normalized = isCrypto ? normalizeCryptoSymbol(symbol) : symbol;

    if (this.useDirectUrls) {
      if (isCrypto) {
        const url = `${this.dataUrl}/v1beta3/crypto/us/bars?symbols=${encodeURIComponent(normalized)}&timeframe=${encodeURIComponent(timeframe)}&limit=${encodeURIComponent(String(limit))}`;
        const response = await fetch(url, {
          headers: this.getHeaders(),
        });
        const data = await this.handleResponse(response, "getBars");
        this.log("debug", `getBars[${symbol}] crypto response`);
        return data?.bars?.[normalized] || data?.bars?.[symbol] || [];
      }
      const url = this.addEquityFeedParam(
        `${this.dataUrl}/v2/stocks/${encodeURIComponent(symbol)}/bars?timeframe=${encodeURIComponent(timeframe)}&limit=${encodeURIComponent(String(limit))}`,
      );
      const response = await fetch(url, {
        headers: this.getHeaders(),
      });
      const data = await this.handleResponse(response, "getBars");
      this.log(
        "debug",
        `getBars[${symbol}] stock response: ${data?.bars?.length} bars`,
      );
      return data.bars || [];
    }

    const url = this.withLiveParam(
      `/api/alpaca/bars?symbols=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}&limit=${encodeURIComponent(String(limit))}`,
    );
    try {
      const response = await this.fetchWithRetry(
        url,
        {
          headers: this.getHeaders(),
        },
        "getBars",
      );

      const json = await this.handleResponse(response, "getBars", true);
      this.log("debug", `getBars[${symbol}] proxy response`);
      return json?.bars?.[symbol] || json?.bars?.[normalized] || [];
    } catch (error) {
      this.log("error", "getBars error", { error: String(error) });
      return [];
    }
  }

  // WebSocket for real-time data - use backend proxy (credentials are server-side)
  connectWebSocket(
    symbols: string[],
    onQuote: (symbol: string, price: number) => void,
    onOrderUpdate?: (update: any) => void,
    onError?: (error: any) => void,
    customWsUrl?: string,
  ) {
    // Deduplication guard: prevent concurrent connection attempts
    if (this.wsConnecting) {
      return;
    }
    this.wsConnecting = true;

    // Tear down previous connection cleanly
    if (this.ws) {
      this.ws.onmessage = null;
      this.ws.onopen = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      if (
        this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING
      ) {
        this.ws.close(1000, "Reconnecting");
      }
      this.ws = null;
    }

    this.disconnectWebSocket();
    this.wsLatestSymbols = symbols;
    this.wsOnQuote = onQuote;
    this.wsOnError = onError || null;
    this.wsOnOrderUpdate = onOrderUpdate || null;

    // Always connect to backend proxy - credentials are server-side
    const wsUrl = customWsUrl || `ws://localhost:5171/ws/alpaca`;
    const ws = new WebSocket(wsUrl);
    this.ws = ws;

    // Initialize first connect timestamp
    if (!this.wsFirstConnectTime) {
      this.wsFirstConnectTime = Date.now();
    }

    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.wsConnecting = false;
      this.wsRetryCount = 0;
      this.wsFirstConnectTime = null;
    };

    ws.onmessage = (event) => {
      if (this.ws !== ws) return;
      try {
        const data = JSON.parse(event.data);

        // Handle messages from backend proxy/Alpaca
        data.forEach((msg: any) => {
          if (msg.T === "success" && msg.msg === "authenticated") {
            // Send subscription AFTER authentication
            const currentSymbols = this.wsLatestSymbols;
            if (currentSymbols.length > 0) {
              const subscribeMsg = {
                action: "subscribe",
                trades: currentSymbols,
                quotes: currentSymbols,
              };
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(subscribeMsg));
              }
            }
          }
          if (msg.T === "t" || msg.T === "q") {
            const price = msg.p || msg.ap || msg.bp; // Trade price (p) or ask/bid price (ap/bp)
            if (price) {
              onQuote(msg.S, price);
            }
          }
          if (msg.T === "trade_update") {
            const orderId = msg.order?.id;
            const update = msg as OrderUpdate;

            if (orderId && this.orderUpdateListeners.has(orderId)) {
              this.orderUpdateListeners.get(orderId)!(update);
            }

            // Prune listener if order is in a terminal state
            if (orderId && ['filled', 'canceled', 'expired'].includes(msg.order.status)) {
              this.orderUpdateListeners.delete(orderId);
            }

            if (this.wsOnOrderUpdate) {
              this.wsOnOrderUpdate(update);
            }
          }
        });
      } catch {}
    };

    ws.onerror = (error) => {
      if (this.ws !== ws) return;
      this.wsConnecting = false;
      if (onError) onError(error);
    };

    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.wsConnecting = false;

      // Check global reconnect timeout
      const elapsed = Date.now() - (this.wsFirstConnectTime || 0);
      if (elapsed > this.WS_RECONNECT_TIMEOUT_MS) {
        console.error("[AlpacaWS] Reconnect timeout exceeded — giving up");
        toast.error("Live price feed disconnected. Refresh to reconnect.");
        this.wsFirstConnectTime = null;
        return;
      }

      if (
        this.wsRetryCount < this.wsMaxRetries &&
        this.wsLatestSymbols.length > 0
      ) {
        const backoffMs = Math.min(
          3000 * Math.pow(2, this.wsRetryCount),
          30000,
        );
        this.wsReconnectTimer = setTimeout(() => {
          this.connectWebSocket(
            this.wsLatestSymbols,
            this.wsOnQuote!,
            this.wsOnOrderUpdate!,
            this.wsOnError!,
          );
        }, backoffMs);
      }
    };
  }

  disconnectWebSocket() {
    this.wsConnecting = false;
    if (this.wsReconnectTimer) {
      clearTimeout(this.wsReconnectTimer);
      this.wsReconnectTimer = null;
    }
    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.close(1000);
      }
      this.ws = null;
    }
    this.wsRetryCount = 0;
    this.wsLatestSymbols = [];
    this.wsOnOrderUpdate = null;
  }

  updateWebSocketSymbols(symbols: string[]) {
    this.wsLatestSymbols = symbols;
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    
    // Unsubscribe from all
    ws.send(
      JSON.stringify({
        action: "unsubscribe",
        trades: ["*"],
        quotes: ["*"],
      }),
    );

    if (symbols.length > 0) {
      ws.send(
        JSON.stringify({
          action: "subscribe",
          trades: symbols,
          quotes: symbols,
        }),
      );
    }
  }

  async getNews(symbols: string[], limit = 5) {
    const url = this.useDirectUrls
      ? `${this.dataUrl}/v1beta1/news?symbols=${symbols.join(",")}&limit=${limit}&sort=desc`
      : `${this.dataUrl}/news?symbols=${symbols.join(",")}&limit=${limit}&sort=desc`;

    const response = await this.fetchWithRetry(
      url,
      {
        headers: this.getHeaders(),
      },
      "Get news",
      1,
    );

    const data = await this.handleResponse(
      response,
      "Get news",
      !this.useDirectUrls,
    );

    // Handle different response structures
    if (Array.isArray(data)) {
      return data;
    } else if (data.news && Array.isArray(data.news)) {
      return data.news;
    } else {
      return [];
    }
  }

  subscribeToOrder(orderId: string, callback: (update: any) => void) {
    this.orderUpdateListeners.set(orderId, callback);
  }

  unsubscribeFromOrder(orderId: string) {
    this.orderUpdateListeners.delete(orderId);
  }
}
