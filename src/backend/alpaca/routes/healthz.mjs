export function handleHealthz(req, res) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({
    status: "ok",
    uptimeSec: Math.floor(process.uptime()),
    ts: new Date().toISOString(),
  }));
}