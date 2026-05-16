/**
 * Alpaca API client wrapper
 */
import { safeParseInt } from "../../shared/numbers.mjs";

const ALPACA_PAPER_URL = "https://paper-api.alpaca.markets";
const ALPACA_LIVE_URL = "https://api.alpaca.markets";
const ALPACA_DATA_URL = "https://data.alpaca.markets";

export class AlpacaClient {
  constructor(config = {}) {
    this.paperKey = config.paperKey || "";
    this.paperSecret = config.paperSecret || "";
    this.liveKey = config.liveKey || "";
    this.liveSecret = config.liveSecret || "";
    this.hasLiveKeys = !!(this.liveKey && this.liveSecret);
    this.timeout = config.timeout || 30000;
    this.metrics = {
      requests: 0,
      errors: 0,
      authErrors: 0,
    };
  }

  getUrl(isLive, isData) {
    if (isData) return ALPACA_DATA_URL;
    if (isLive && this.hasLiveKeys) return ALPACA_LIVE_URL;
    return ALPACA_PAPER_URL;
  }

  getKeySecret(isLive) {
    if (isLive && this.hasLiveKeys) {
      return { key: this.liveKey, secret: this.liveSecret };
    }
    return { key: this.paperKey, secret: this.paperSecret };
  }

  async request(
    endpoint,
    method = "GET",
    body = null,
    isLive = false,
    isData = false,
    customKeys = null,
  ) {
    const { key, secret } = customKeys || this.getKeySecret(isLive);

    if (!key || !secret) {
      this.metrics.errors++;
      this.metrics.authErrors++;
      const error = new Error(
        `Alpaca API keys not configured for ${isLive ? "LIVE" : "PAPER"} mode`,
      );
      error.code = "ALPACA_KEYS_MISSING";
      throw error;
    }

    const baseUrl = this.getUrl(isLive, isData);
    const url = `${baseUrl}${endpoint}`;
    const headers = {
      "APCA-API-KEY-ID": key,
      "APCA-API-SECRET-KEY": secret,
      "Content-Type": "application/json",
      Connection: "keep-alive",
    };

    const options = {
      method,
      headers,
      signal: AbortSignal.timeout(this.timeout),
    };

    if (body && (method === "POST" || method === "PUT" || method === "PATCH")) {
      const {
        __alpacaKeyId: _k,
        __alpacaSecretKey: _s,
        ...sanitizedBody
      } = body;
      options.body = JSON.stringify(sanitizedBody);
    }

    this.metrics.requests++;
    const response = await fetch(url, options);

    if (response.status === 204) {
      return null;
    }

    let data;
    try {
      data = await response.json();
    } catch (error) {
      throw new Error(
        `Invalid JSON response from Alpaca API: ${error.message}`,
      );
    }

    if (!response.ok) {
      this.metrics.errors++;
      if (response.status === 401 || response.status === 403)
        this.metrics.authErrors++;
      const err = new Error(
        data.message || `Alpaca API error: ${response.status}`,
      );
      err.statusCode = response.status;
      throw err;
    }

    return data;
  }

  async getAccount(isLive = false, customKeys = null) {
    return this.request("/v2/account", "GET", null, isLive, false, customKeys);
  }

  async getPositions(isLive = false, customKeys = null) {
    return this.request(
      "/v2/positions",
      "GET",
      null,
      isLive,
      false,
      customKeys,
    ).catch(() => []);
  }

  async getPosition(symbol, isLive = false, customKeys = null) {
    return this.request(
      `/v2/positions/${symbol}`,
      "GET",
      null,
      isLive,
      false,
      customKeys,
    );
  }

  async closePosition(symbol, isLive = false, customKeys = null) {
    return this.request(
      `/v2/positions/${symbol}`,
      "DELETE",
      null,
      isLive,
      false,
      customKeys,
    );
  }

  async getOrders(params = {}, isLive = false, customKeys = null) {
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined) queryParams.set(k, String(v));
    });
    return this.request(
      `/v2/orders?${queryParams.toString()}`,
      "GET",
      null,
      isLive,
      false,
      customKeys,
    );
  }

  async getOrder(orderId, isLive = false, customKeys = null) {
    return this.request(
      `/v2/orders/${orderId}`,
      "GET",
      null,
      isLive,
      false,
      customKeys,
    );
  }

  async createOrder(order, isLive = false, customKeys = null) {
    return this.request("/v2/orders", "POST", order, isLive, false, customKeys);
  }

  async replaceOrder(orderId, updates, isLive = false, customKeys = null) {
    return this.request(
      `/v2/orders/${orderId}`,
      "PATCH",
      updates,
      isLive,
      false,
      customKeys,
    );
  }

  async cancelOrder(orderId, isLive = false, customKeys = null) {
    return this.request(
      `/v2/orders/${orderId}`,
      "DELETE",
      null,
      isLive,
      false,
      customKeys,
    );
  }

  async cancelAllOrders(isLive = false, customKeys = null) {
    return this.request(
      "/v2/orders",
      "DELETE",
      null,
      isLive,
      false,
      customKeys,
    );
  }

  async getClock(isLive = false, customKeys = null) {
    return this.request("/v2/clock", "GET", null, isLive, false, customKeys);
  }

  async getCalendar(isLive = false, customKeys = null) {
    return this.request("/v2/calendar", "GET", null, isLive, false, customKeys);
  }

  async getBars(symbols, timeframe, limit, isLive = false, customKeys = null) {
    return this.request(
      `/v2/stocks/${symbols}/bars?timeframe=${timeframe}&limit=${limit}`,
      "GET",
      null,
      isLive,
      true,
      customKeys,
    );
  }

  async getQuotes(symbols, isLive = false, customKeys = null) {
    return this.request(
      `/v2/stocks/quotes/latest?symbols=${symbols}&feed=iex`,
      "GET",
      null,
      isLive,
      true,
      customKeys,
    );
  }

  async getTrades(symbols, isLive = false, customKeys = null) {
    return this.request(
      `/v2/stocks/trades/latest?symbols=${symbols}&feed=iex`,
      "GET",
      null,
      isLive,
      true,
      customKeys,
    );
  }

  async getNews(params = {}, isLive = false, customKeys = null) {
    const queryParams = new URLSearchParams(params);
    return this.request(
      `/v1beta1/news?${queryParams.toString()}`,
      "GET",
      null,
      isLive,
      true,
      customKeys,
    );
  }

  async getAssets(
    status = "active",
    assetClass = "us_equity",
    isLive = false,
    customKeys = null,
  ) {
    return this.request(
      `/v2/assets?status=${status}&asset_class=${assetClass}`,
      "GET",
      null,
      isLive,
      false,
      customKeys,
    );
  }

  async getAsset(symbol, isLive = false, customKeys = null) {
    return this.request(
      `/v2/assets/${encodeURIComponent(symbol)}`,
      "GET",
      null,
      isLive,
      false,
      customKeys,
    );
  }
}

export default AlpacaClient;
