/**
 * Environment Variable Validator
 *
 * Comprehensive startup validation for required environment variables.
 * Throws clear, actionable errors if critical variables are missing.
 */

const isProduction = process.env.NODE_ENV === "production";
const isDevelopment =
  process.env.NODE_ENV === "development" || !process.env.NODE_ENV;

const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};

const symbols = {
  success: "✓",
  error: "✗",
  warning: "⚠",
  info: "ℹ",
};

function log(type, message) {
  const colorMap = {
    success: colors.green,
    error: colors.red,
    warning: colors.yellow,
    info: colors.cyan,
  };
  const symbolMap = {
    success: symbols.success,
    error: symbols.error,
    warning: symbols.warning,
    info: symbols.info,
  };

  console.log(
    `${colorMap[type] || ""}${symbolMap[type] || ""} ${message}${colors.reset}`,
  );
}

function header(text) {
  console.log(`\n${colors.cyan}═══ ${text} ═══${colors.reset}\n`);
}

export class EnvValidationError extends Error {
  constructor(missingVars, context = "") {
    const message = `Missing required environment variables:\n${missingVars.map((v) => `  - ${v.name}: ${v.description}`).join("\n")}${context ? `\n\n${context}` : ""}`;
    super(message);
    this.name = "EnvValidationError";
    this.missingVars = missingVars;
  }
}

function checkVar(name, options = {}) {
  const { description = "", optional = false, minLen = 1, validate } = options;
  const value = process.env[name];
  const result = { name, description, value: !!value, optional };

  if (!value || (typeof value === "string" && value.trim().length < minLen)) {
    if (!optional) {
      result.missing = true;
      result.error = `Missing or empty`;
    }
    return result;
  }

  if (validate && !validate(value)) {
    result.missing = true;
    result.error = `Validation failed`;
    return result;
  }

  return result;
}

export function validateEnv(options = {}) {
  const {
    strict = isProduction,
    throwOnError = true,
    silent = false,
    checkAlpaca = true,
  } = options;

  const errors = [];
  const warnings = [];

  if (!silent) {
    header("Environment Validation");
    log("info", `Environment: ${process.env.NODE_ENV || "development"}`);
    log("info", `Strict mode: ${strict}`);
  }

  const coreVars = [];

  const stripeVars = [
    checkVar("STRIPE_SECRET_KEY", {
      description: "Stripe secret API key",
      validate: (v) => v.startsWith("sk_test_") || v.startsWith("sk_live_"),
      optional: true,
    }),
    checkVar("STRIPE_WEBHOOK_SECRET", {
      description: "Stripe webhook signing secret",
      validate: (v) => v.startsWith("whsec_"),
      optional: true,
    }),
  ];

  for (const result of [...coreVars, ...stripeVars]) {
    if (result.missing) {
      if (result.optional) {
        // silent — not configured in CloneTrader
      } else {
        errors.push(result);
        if (!silent)
          log(
            "error",
            `${result.name}: ${result.error} - ${result.description}`,
          );
      }
    } else {
      if (!silent) log("success", `${result.name}: configured`);
    }
  }

  if (checkAlpaca) {
    if (!silent) header("Alpaca Trading Configuration");

    const tradingMode = process.env.TRADING_MODE || "simulated";
    const isLiveTrading = tradingMode === "live" || tradingMode === "paper";
    const isPaperMode = process.env.VITE_ALPACA_IS_PAPER !== "false";

    if (!silent) log("info", `Trading mode: ${tradingMode}`);

    if (isLiveTrading || tradingMode !== "simulated") {
      const paperKey =
        process.env.VITE_ALPACA_PAPER_KEY || process.env.ALPACA_PAPER_KEY;
      const paperSecret =
        process.env.VITE_ALPACA_PAPER_SECRET || process.env.ALPACA_PAPER_SECRET;
      const liveKey =
        process.env.VITE_ALPACA_LIVE_KEY || process.env.ALPACA_LIVE_KEY;
      const liveSecret =
        process.env.VITE_ALPACA_LIVE_SECRET || process.env.ALPACA_LIVE_SECRET;

      if (isPaperMode || tradingMode === "paper") {
        if (!paperKey || !paperSecret) {
          const result = {
            name: "ALPACA_PAPER_KEYS",
            description: "Alpaca paper trading API keys",
          };
          if (strict) {
            errors.push(result);
            if (!silent)
              log("error", "Alpaca paper keys required for paper/live trading");
          } else {
            warnings.push(result);
            if (!silent) log("warning", "Alpaca paper keys not configured");
          }
        } else {
          if (!silent) log("success", "Alpaca paper keys: configured");
        }
      }

      if (!isPaperMode || tradingMode === "live") {
        if (!liveKey || !liveSecret) {
          const result = {
            name: "ALPACA_LIVE_KEYS",
            description: "Alpaca live trading API keys",
          };
          if (strict && tradingMode === "live") {
            errors.push(result);
            if (!silent)
              log("error", "Alpaca live keys required for live trading");
          } else {
            warnings.push(result);
            if (!silent)
              log(
                "warning",
                "Alpaca live keys not configured (required for live trading)",
              );
          }
        } else {
          if (!silent)
            log("warning", "Alpaca live keys: configured (use with caution!)");
        }
      }
    } else {
      if (!silent)
        log("info", "Trading mode is simulated - Alpaca keys optional");
    }
  }

  if (!silent) header("Validation Summary");

  if (errors.length > 0) {
    if (!silent) {
      log("error", `Found ${errors.length} critical error(s)`);
      for (const err of errors) {
        log("error", `  - ${err.name}: ${err.description}`);
      }
    }

    if (throwOnError) {
      throw new EnvValidationError(
        errors,
        `
To fix these errors:
1. Copy .env.example to .env: cp .env.example .env
2. Fill in the missing values in .env
3. Ensure all secrets meet minimum requirements
4. Restart the server
`,
      );
    }

    return { valid: false, errors, warnings };
  }

  if (warnings.length > 0 && !silent) {
    log(
      "warning",
      `Found ${warnings.length} warning(s) - some features may not work`,
    );
  }

  if (!silent) log("success", "Environment validation passed");

  return { valid: true, errors: [], warnings };
}

export function requireEnv(name, description = "") {
  const value = process.env[name];
  if (!value) {
    throw new EnvValidationError(
      [{ name, description: description || `Required environment variable` }],
      `Set ${name} in your .env file or environment`,
    );
  }
  return value;
}

export default {
  validateEnv,
  requireEnv,
  EnvValidationError,
};
