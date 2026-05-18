# Lean-FireupTrader - Deep Project Analysis

## Overview

Lean-FireupTrader is a **mobile-first trading application** built with React, TypeScript, and Vite for trading stocks and cryptocurrencies through the Alpaca API. The project features a dark-themed mobile interface (390x844px iPhone-style viewport) with rapid trading capabilities, position management, and real-time price feeds.

---

## Architecture

### Project Structure

```
Lean-FireupTrader/
├── src/
│   ├── frontend/           # React + TypeScript frontend
│   │   ├── components/
│   │   │   ├── Mobile/     # Mobile-specific UI components
│   │   │   ├── Stocks/     # Stock trading components
│   │   │   └── ui/         # Reusable UI primitives
│   │   ├── hooks/          # Custom React hooks
│   │   ├── pages/          # Page components
│   │   ├── services/       # API service layer
│   │   ├── shared/         # Shared utilities
│   │   └── utils/          # Helper functions
│   ├── backend/            # Node.js backend (ES modules)
│   │   └── alpaca/         # Alpaca API integration
│   │       ├── routes/     # API route handlers
│   │       └── screener.mjs  # Stock screening logic
│   ├── lib/                # Library utilities
│   └── shared/             # Shared constants
├── package.json
├── vite.config.ts
└── tailwind.config.js
```

### Dual-Server Architecture

1. **Frontend Server** (Vite dev server on port 5173)
   - Serves React application
   - Provides hot module replacement
   - Proxies API requests to backend

2. **Backend Server** (Node.js on port 5171)
   - Alpaca API proxy server (`server-refactored.mjs`)
   - Handles authentication (server-side API keys)
   - Provides RESTful endpoints and WebSocket proxy
   - Implements rate limiting and graceful shutdown

---

## Technology Stack

| Category | Technology |
|----------|------------|
| Frontend | React 19, TypeScript 5.8, Vite 6 |
| Styling | Tailwind CSS, Radix UI, tailwindcss-animate |
| State/Data | TanStack Query (React Query) v5 |
| Charts | lightweight-charts, Recharts, D3, @xyflow/react |
| Backend | Node.js (ES Modules), Express-style raw HTTP |
| API | @alpacahq/alpaca-trade-api v3 |
| Real-time | WebSocket (ws library) |
| Notifications | sonner (toast notifications) |

---

## Core Components

### Frontend

#### App.tsx
Minimal root component that renders `MobileTradingPage` with Sonner toast notifications.

#### MobileTradingPage.tsx (Main Interface)
A 1153-line comprehensive trading interface with:

**State Management:**
- `activeSymbol` - Currently selected ticker
- `activePreset` - Dollar value preset (10K, 100K, etc.)
- `activeTier` - Order type: M (Market), L (Limit), S (Stop-Limit)
- `positionSide` - LONG or SHORT mode
- `watchlist` - Array of tracked symbols
- `positions`, `orders`, `account` - Trading data
- `slActive`, `tpActive` - Stop-loss/take-profit toggle states

**Trading Presets:**
- **O-SL** - One-cancels-stop-loss bracket order
- **LADDER** - Multiple staggered limit orders
- **L&F** - Live and Forget with layered trailing stops

**Price Actions:**
- Buy/Sell with preset quantity calculation
- Price stepping (+/- buttons for limit price adjustment)
- Long/Short toggle mode

**Position Management:**
- All Exit, All Break-even, All SL, All Trail batch operations
- Individual position SL/BE/Trail toggling
- Exit all positions

### Mobile Components

| Component | Purpose |
|-----------|---------|
| `StatusBar` | Top bar with PAPER/LIVE toggle and account equity |
| `MobileQuickAmount` | Preset amount selector buttons |
| `MobileTickerSelect` | Symbol selector with add/remove |
| `MobileSizeToggle` | M/L/S tier selector |
| `MobilePriceAction` | Price display with +/- controls and GO button |
| `MobileControlsPanel` | BE/SL/EXIT/TRAIL individual buttons |
| `GlobalPositionManager` | Batch position actions with PNL display |

### Backend Services

#### AlpacaService.ts
Frontend service layer that:
- Routes all requests through backend proxy (`/api/alpaca/*`)
- Never exposes API keys to frontend
- Implements fetch with retry logic and timeout handling
- Handles rate limit backoff
- Provides WebSocket connection for real-time quotes

#### Routes (server-refactored.mjs)

| Endpoint | Methods | Description |
|----------|---------|-------------|
| `/api/alpaca/account` | GET | Account details |
| `/api/alpaca/positions` | GET | All positions |
| `/api/alpaca/positions/:symbol` | GET, DELETE | Single position/close |
| `/api/alpaca/orders` | GET, POST | Orders list/create |
| `/api/alpaca/orders/:id` | GET, PATCH, DELETE | Order operations |
| `/api/alpaca/orders/cancel-all` | DELETE | Cancel all orders |
| `/api/alpaca/quotes` | GET | Real-time quotes |
| `/api/alpaca/trades` | GET | Trade data |
| `/api/alpaca/news` | GET | Market news |
| `/api/alpaca/bars` | GET | Candlestick data |
| `/api/alpaca/assets` | GET | Tradable assets |
| `/api/alpaca/clock` | GET | Market clock |
| `/api/alpaca/calendar` | GET | Trading calendar |
| `/api/screener/*` | GET | Stock screening |
| `/ws/alpaca` | WebSocket | Real-time data feed |

#### Screener Module (screener.mjs)
Stock screening with presets:
- **gappers** - Largest price gaps
- **momentum/top_gainers** - Highest percent gains
- **top_losers** - Highest percent losses
- **volume_leaders** - Highest volume
- **high_volatility** - Largest intraday range

---

## Trading Strategies

### Order Types (Tiers)

| Tier | Type | Description |
|------|------|-------------|
| M | Market | Immediate execution at market price |
| L | Limit | Execution at specified limit price |
| S | Stop-Limit | Triggers and limits in one order |

### Trading Presets

1. **O-SL (One-Cancels Stop-Loss)**
   - Creates OTO (One-Triggers-Other) bracket order
   - Entry order + attached stop-loss
   - No take-profit (single exit strategy)

2. **LADDER**
   - Multiple staggered limit orders
   - Configurable step size and count (default: 0.10, 3 orders)
   - For momentum entries at different price levels

3. **L&F (Live and Forget)**
   - Single entry order followed by layered trailing stops
   - L2 chase (trail percentage)
   - L3 trail (wider trail percentage)
   - Automatic position scaling

### Position Actions

- **SL** - Set stop-loss at configured offset
- **BE** - Move stop-loss to break-even
- **EXIT** - Close entire position
- **TRAIL** - Toggle trailing stop order

---

## Configuration

### Environment Variables (.env)

```bash
# Alpaca API Keys
VITE_ALPACA_PAPER_KEY=
VITE_ALPACA_PAPER_SECRET=
VITE_ALPACA_LIVE_KEY=
VITE_ALPACA_LIVE_SECRET=

# Trading Defaults
VITE_ALPACA_IS_PAPER=true
VITE_DEFAULT_SYMBOL=INTC
VITE_DEFAULT_QTY=100
VITE_EXTENDED_HOURS=false

# Risk Management
VITE_AUTO_STOP_LOSS_PCT=1
VITE_AUTO_TAKE_PROFIT_PCT=2
VITE_TRAILING_STOP_DEFAULT_PCT=0.5
VITE_BE_STOP_OFFSET=0.5
VITE_SL_STOP_OFFSET=0.5

# Layered Stops (L&F)
VITE_LAYER1_ENABLED=true
VITE_LAYER2_ENABLED=true
VITE_LAYER3_ENABLED=true
VITE_LAYER2_TRAIL_PCT=1
VITE_LAYER3_TRAIL_PCT=2

# Ladder Orders
VITE_LADDER_PRICE_STEP=0.10
VITE_LADDER_ORDER_COUNT=3

# Mobile UI
VITE_MOBILE_DEFAULT_TICKERS=INTC,MU,MC
VITE_MOBILE_DEFAULT_PRESETS=10K,100K,30K,50K
VITE_MOBILE_DEFAULT_TIER=L
VITE_MOBILE_DEFAULT_OSL=false
```

---

## Key Features

### Real-time Data
- WebSocket connection to Alpaca data stream
- Live price updates for watchlist symbols
- Automatic reconnection with exponential backoff

### Risk Management
- Automatic SL/TP price calculation based on entry
- Position size limiting based on buying power
- Rate limit handling with backoff

### Mobile-First Design
- Fixed 390x844px viewport (iPhone 12/13 mini size)
- Touch-optimized controls with long-press gestures
- Dark theme optimized for trading

### Security
- API keys stored server-side only
- Frontend communicates only with local proxy
- No CORS issues in development

---

## Development

### Scripts

```bash
npm run dev          # Start both Vite and backend server
npm run build      # TypeScript check and Vite build
npm run preview    # Preview production build
npm run lint       # TypeScript type checking
npm run test       # Run unit tests
```

### Ports
- Frontend: 5173 (Vite)
- Backend: 5171 (Alpaca API proxy)
- WebSocket: ws://localhost:5171/ws/alpaca

---

## Type Definitions

### Core Types (types.ts)

```typescript
interface AlpacaConfig {
  paperApiKey: string;
  paperApiSecret: string;
  liveApiKey: string;
  liveApiSecret: string;
  isPaper: boolean;
  defaults?: {
    extendedHours?: boolean;
    defaultTimeInForce?: 'day' | 'gtc' | 'ioc';
    mobile?: { tickers, presets, defaultPreset, defaultTier };
  };
}

interface Position {
  symbol: string;
  qty: string;
  side: 'long' | 'short';
  avg_entry_price: string;
  current_price: string;
  unrealized_pl: string;
  status?: 'watching' | 'running';
}

interface Order {
  id: string;
  symbol: string;
  qty: string;
  side: 'buy' | 'sell';
  type: string;
  status: string;
  time_in_force: string;
  limit_price?: string;
  stop_price?: string;
  take_profit?: { limit_price: string };
  stop_loss?: { stop_price: string };
}
```

---

## Build Configuration

### Vite (vite.config.ts)
- Port 5173 with host access enabled
- Proxy configuration for all `/api/*` endpoints
- Code splitting for large dependencies (react, d3, charts)
- Graceful degradation for failed service connections

### Tailwind CSS
- Dark mode class-based
- Custom color variables for bull/bear themes
- Responsive utilities for mobile viewport