/**
 * Ticker logo proxy route handler
 */
const LOGO_BASE_URL =
  "https://raw.githubusercontent.com/nvstly/icons/main/ticker_icons";
const LOGO_PROXY_TIMEOUT_MS = 5000;

export async function handleTickerLogo(symbol) {
  const cleanSymbol = (symbol || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

  if (!cleanSymbol) {
    throw new Error("Symbol required");
  }

  const logoUrl = `${LOGO_BASE_URL}/${cleanSymbol}.png`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LOGO_PROXY_TIMEOUT_MS);

  const response = await fetch(logoUrl, { signal: controller.signal });
  clearTimeout(timeout);

  if (!response.ok) {
    const error = new Error("Logo not found");
    error.status = 404;
    throw error;
  }

  return await response.arrayBuffer();
}
