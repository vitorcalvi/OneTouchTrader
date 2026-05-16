/**
 * Centralized Environment Variable Loader
 *
 * Ensures consistent .env loading across all backend services.
 * Call this at the top of any backend entry point to load environment variables.
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { safeParseInt, safeParseFloat } from './numbers.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Project root is three levels up from src/backend/shared/
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

/**
 * Load environment variables from .env file
 * @param {Object} options - Configuration options
 * @param {boolean} options.validateRequired - Whether to validate required variables
 * @param {string[]} options.required - List of required environment variables
 * @returns {Object} - Loaded configuration object
 */
export function loadEnv(options = {}) {
  const { validateRequired = false, required = [] } = options;

  // Try multiple .env file locations
  const envPaths = [
    path.resolve(PROJECT_ROOT, '.env'),
    path.resolve(process.cwd(), '.env'),
    path.resolve(__dirname, '../../.env')
  ];

  let loaded = false;
  let envPath = null;

  for (const testPath of envPaths) {
    if (fs.existsSync(testPath)) {
      const result = dotenv.config({ path: testPath });

      if (!result.error) {
        envPath = testPath;
        loaded = true;
        console.log(`[EnvLoader] ✓ Loaded environment from: ${testPath}`);
        break;
      }
    }
  }

  if (!loaded) {
    console.warn('[EnvLoader] ⚠ No .env file found. Using system environment variables only.');
    console.warn('[EnvLoader] Searched paths:', envPaths);
  }

  // Validate required variables if requested
  if (validateRequired && required.length > 0) {
    const missing = required.filter(key => !process.env[key]);

    if (missing.length > 0) {
      console.error('[EnvLoader] ✗ Missing required environment variables:', missing);
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
  }

  return {
    loaded,
    path: envPath,
    projectRoot: PROJECT_ROOT
  };
}

/**
 * Get Alpaca API credentials based on mode (paper/live)
 * @param {boolean} isPaper - Whether to use paper trading credentials
 * @returns {Object} - API credentials
 */
export function getAlpacaCredentials(isPaper = true) {
  if (isPaper) {
    return {
      key: process.env.ALPACA_PAPER_KEY || '',
      secret: process.env.ALPACA_PAPER_SECRET || '',
      isPaper: true
    };
  }

  return {
    key: process.env.ALPACA_LIVE_KEY || '',
    secret: process.env.ALPACA_LIVE_SECRET || '',
    isPaper: false
  };
}


/**
 * Get trading configuration
 * @returns {Object} - Trading configuration
 */
export function getTradingConfig() {
  return {
    mode: process.env.TRADING_MODE || 'simulated',
    strategy: process.env.STRATEGY || 'scalper',
    maxDailyLoss: safeParseFloat(process.env.MAX_DAILY_LOSS, 50),
    maxPositionSizePct: safeParseFloat(process.env.MAX_POSITION_SIZE_PERCENT, 2),
    maxConsecutiveLosses: safeParseInt(process.env.MAX_CONSECUTIVE_LOSSES, 4),
    pauseOnLossStreak: process.env.PAUSE_ON_LOSS_STREAK !== 'false',
    contractSize: safeParseInt(process.env.CONTRACT_SIZE, 1),
    leverage: safeParseInt(process.env.LEVERAGE, 10)
  };
}

// Auto-load on import (for convenience)
loadEnv();

export default {
  loadEnv,
  getAlpacaCredentials,
  getTradingConfig,
  PROJECT_ROOT
};
