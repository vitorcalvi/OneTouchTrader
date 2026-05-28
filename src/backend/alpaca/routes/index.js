/**
 * Route registry - combines all route handlers
 */
import {
  handleLiveHealth,
  handleReadyHealth,
  handleHealth,
  isHealthRoute,
} from "./health.js";

import {
  handleAccount,
  handleGetPositions,
  handleGetPosition,
  handleClosePosition,
} from "./account.js";

import {
  handleGetOrders,
  handleGetOrder,
  handlePatchOrder,
  handleDeleteOrder,
  handleCancelAllOrders,
  handleCreateOrder,
} from "./orders.js";

import {
  handleScanPresets,
  handleScanStocks,
  handleScanCrypto,
  handleGetQuote,
  handleGetBars,
} from "./screener.js";

import {
  handleQuotes,
  handleTrades,
  handleNews,
  handleEarnings,
  handleAssets,
  handleGetAsset,
} from "./market.js";

import { handleBars } from "./bars.js";
import { handleDocumentation } from "./documentation.js";
import { handleTickerLogo } from "./ticker-logo.js";
import { handleLevels, handleSnapshot } from "./levels.mjs";
import { handleTickLevels } from "./tick-levels.mjs";

export {
  handleLiveHealth,
  handleReadyHealth,
  handleHealth,
  isHealthRoute,
  handleAccount,
  handleGetPositions,
  handleGetPosition,
  handleClosePosition,
  handleGetOrders,
  handleGetOrder,
  handlePatchOrder,
  handleDeleteOrder,
  handleCancelAllOrders,
  handleCreateOrder,
  handleScanPresets,
  handleScanStocks,
  handleScanCrypto,
  handleGetQuote,
  handleGetBars,
  handleQuotes,
  handleTrades,
  handleNews,
  handleEarnings,
  handleAssets,
  handleGetAsset,
  handleBars,
  handleDocumentation,
  handleTickerLogo,
  handleLevels,
  handleSnapshot,
  handleTickLevels,
};
