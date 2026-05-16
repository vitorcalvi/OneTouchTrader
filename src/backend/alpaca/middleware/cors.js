/**
 * CORS middleware
 */
export function getCorsHeaders(origin = "*") {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-User-ID, APCA-API-KEY-ID, APCA-API-SECRET-KEY",
    "Content-Type": "application/json",
    "Cache-Control": "no-cache, no-store, must-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  };
}

export function corsMiddleware(req, res) {
  if (req.method === "OPTIONS") {
    res.writeHead(200, getCorsHeaders());
    res.end();
    return true;
  }
  return false;
}
