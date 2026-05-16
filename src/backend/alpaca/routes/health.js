/**
 * Health check routes
 */
import { safeParseInt } from "../../shared/numbers.mjs";

export function handleLiveHealth(res, corsHeaders, packageVersion, getUptime) {
  res.writeHead(200, corsHeaders);
  res.end(
    JSON.stringify({
      status: "alive",
      service: "alpaca",
      version: packageVersion,
      uptime: getUptime(),
      timestamp: new Date().toISOString(),
    }),
  );
}

export function handleReadyHealth(
  res,
  corsHeaders,
  packageVersion,
  getUptime,
  checkAlpacaAPI,
  alpacaMetrics,
) {
  return checkAlpacaAPI().then((alpacaCheck) => {
    const isReady = alpacaCheck.status !== "unhealthy";
    const statusCode = isReady ? 200 : 503;

    res.writeHead(statusCode, corsHeaders);
    res.end(
      JSON.stringify({
        status: isReady ? "ready" : "not_ready",
        service: "alpaca",
        version: packageVersion,
        uptime: getUptime(),
        checks: {
          alpaca: alpacaCheck,
        },
        metrics: alpacaMetrics,
        timestamp: new Date().toISOString(),
      }),
    );
  });
}

export function handleHealth(
  res,
  corsHeaders,
  packageVersion,
  getUptime,
  checkAlpacaAPI,
  alpacaMetrics,
) {
  return checkAlpacaAPI().then((alpacaCheck) => {
    res.writeHead(200, corsHeaders);
    res.end(
      JSON.stringify({
        status: "ok",
        service: "alpaca",
        version: packageVersion,
        uptime: getUptime(),
        checks: {
          alpaca: alpacaCheck,
        },
        metrics: alpacaMetrics,
        timestamp: new Date().toISOString(),
      }),
    );
  });
}

export function handleTestAlpaca(res, corsHeaders, alpacaRequest, hasLiveKeys) {
  return alpacaRequest("/v2/clock", "GET", null, false)
    .then(() => {
      return { success: true, message: "Alpaca connection successful" };
    })
    .catch((error) => {
      return {
        success: false,
        message: `Alpaca connection failed: ${error.message}`,
      };
    });
}

export function isHealthRoute(pathname) {
  return (
    pathname === "/health/live" ||
    pathname === "/health/ready" ||
    pathname === "/health"
  );
}
