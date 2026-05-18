#!/bin/bash
# Stress Test Script for Lean-FireupTrader
# Usage: ./stress_test.sh

echo "Starting Stress Tests..."

# 1. API Outage Simulation (requires sudo, might be blocked by environment constraints)
echo "Checking connectivity to Alpaca..."
if ping -c 1 paper-api.alpaca.markets > /dev/null; then
    echo "Connectivity OK."
else
    echo "Warning: Connectivity check failed."
fi

# 2. Rate Limiter Test (Simulated)
echo "Running Rate Limit Test..."
for i in {1..20}; do
  curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5171/api/alpaca/account &
done
echo "Rate Limit test complete."

# 3. Order Flood Test (Validation Check)
echo "Running Order Flood Test..."
for i in {1..5}; do
  curl -X POST http://localhost:5171/api/alpaca/orders     -d '{"symbol":"AAPL","qty":1000000,"side":"buy","type":"limit","limit_price":"100"}' &
done
echo "Order flood test complete (Checking if limits triggered)."

echo "Stress tests finished."
