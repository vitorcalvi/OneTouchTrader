import csv
import os

import requests

API_KEY = os.environ.get("ALPACA_PAPER_KEY")
API_SECRET = os.environ.get("ALPACA_PAPER_SECRET")

if not API_KEY or not API_SECRET:
    raise ValueError("ALPACA_PAPER_KEY and ALPACA_PAPER_SECRET environment variables must be set")

try:
    # Get all assets
    resp = requests.get(
        "https://paper-api.alpaca.markets/v2/assets",
        headers={"APCA-API-KEY-ID": API_KEY, "APCA-API-SECRET-KEY": API_SECRET},
        timeout=10,
    )
    assets = resp.json()
    
    # Filter Brazilian assets (tradable ones)
    brazilian_assets = [
        a for a in assets 
        if "brazil" in a.get("name", "").lower() and a.get("tradable") == True
    ]
    
    # Write to CSV
    csv_path = "brazilian_assets.csv"
    with open(csv_path, "w", newline="") as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=["symbol", "name", "exchange", "LONG", "SHORT"])
        writer.writeheader()
        for asset in brazilian_assets:
            writer.writerow({
                "symbol": asset.get("symbol"),
                "name": asset.get("name"),
                "exchange": asset.get("exchange"),
                "LONG": "TRUE",
                "SHORT": "TRUE" if asset.get("marginable") and asset.get("shortable") else "FALSE",
            })
    
    print(f"Brazilian Assets written to {csv_path}")
    print(f"Total tradable assets: {len(brazilian_assets)}")
except Exception as e:
    print("Execution Error:", type(e).__name__, "-", e)
