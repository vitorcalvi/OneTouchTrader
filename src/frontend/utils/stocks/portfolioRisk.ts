import { Position } from '../../types';

export interface PositionRisk {
  symbol: string;
  side: 'long' | 'short';
  qty: number;
  marketValue: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPL: number;
  unrealizedPLPercent: number;
  weight: number;
  dailyVolatility: number;
  annualizedVolatility: number;
  beta: number;
  var95: number;
  var99: number;
  expectedShortfall95: number;
  contributionToRisk: number;
  stopLossPrice: number | null;
  riskPerShare: number;
  totalPositionRisk: number;
  sector: string;
  industry: string;
}

export interface PortfolioRiskMetrics {
  totalValue: number;
  totalEquity: number;
  grossExposure: number;
  netExposure: number;
  longExposure: number;
  shortExposure: number;
  concentrationRisk: number;
  herfindahlIndex: number;
  effectivePositions: number;
  portfolioBeta: number;
  portfolioVolatility: number;
  annualizedVolatility: number;
  var95: number;
  var99: number;
  expectedShortfall95: number;
  expectedShortfall99: number;
  maxDrawdown: number;
  sharpeRatio: number;
  sortinoRatio: number;
  correlationRisk: number;
  sectorExposure: SectorExposure[];
  topRiskContributors: RiskContributor[];
  riskBudget: RiskBudget;
}

export interface SectorExposure {
  sector: string;
  value: number;
  weight: number;
  var95: number;
  positions: string[];
}

export interface RiskContributor {
  symbol: string;
  contribution: number;
  contributionPercent: number;
  var95: number;
}

export interface RiskBudget {
  maxPositionRisk: number;
  maxSectorRisk: number;
  maxPortfolioVaR: number;
  currentUtilization: number;
  remainingCapacity: number;
}

export interface ScenarioResult {
  name: string;
  description: string;
  portfolioImpact: number;
  positionImpacts: { symbol: string; impact: number }[];
}

export interface CorrelationMatrix {
  symbols: string[];
  matrix: number[][];
}

export interface RiskConfig {
  confidenceLevel: number;
  timeHorizonDays: number;
  riskFreeRate: number;
  maxPositionWeight: number;
  maxSectorWeight: number;
  varLimitPercent: number;
}

const DEFAULT_RISK_CONFIG: RiskConfig = {
  confidenceLevel: 0.95,
  timeHorizonDays: 1,
  riskFreeRate: 0.05,
  maxPositionWeight: 0.25,
  maxSectorWeight: 0.40,
  varLimitPercent: 0.02,
};

const SECTOR_MAP: Record<string, string> = {
  AAPL: 'Technology', MSFT: 'Technology', GOOGL: 'Technology', GOOG: 'Technology',
  AMZN: 'Consumer Cyclical', META: 'Technology', NVDA: 'Technology', TSLA: 'Consumer Cyclical',
  JPM: 'Financial Services', V: 'Financial Services', MA: 'Financial Services',
  JNJ: 'Healthcare', UNH: 'Healthcare', PFE: 'Healthcare',
  HD: 'Consumer Cyclical', WMT: 'Consumer Defensive', PG: 'Consumer Defensive',
  XOM: 'Energy', CVX: 'Energy', COP: 'Energy',
  BAC: 'Financial Services', WFC: 'Financial Services', GS: 'Financial Services',
  DIS: 'Communication Services', NFLX: 'Communication Services',
  AMD: 'Technology', INTC: 'Technology', QCOM: 'Technology',
  BA: 'Industrials', CAT: 'Industrials', HON: 'Industrials',
  SPY: 'ETF', QQQ: 'ETF', IWM: 'ETF', DIA: 'ETF',
};

const INDUSTRY_MAP: Record<string, string> = {
  AAPL: 'Consumer Electronics', MSFT: 'Software', GOOGL: 'Internet Services',
  AMZN: 'E-Commerce', META: 'Social Media', NVDA: 'Semiconductors', TSLA: 'Auto Manufacturers',
  JPM: 'Banks', V: 'Payment Processing', MA: 'Payment Processing',
  JNJ: 'Drug Manufacturers', UNH: 'Healthcare Plans', PFE: 'Drug Manufacturers',
  HD: 'Home Improvement', WMT: 'Discount Stores', PG: 'Household Products',
  XOM: 'Oil & Gas', CVX: 'Oil & Gas',
};

const BETA_MAP: Record<string, number> = {
  SPY: 1.0, QQQ: 1.1, IWM: 1.15, DIA: 0.95,
  AAPL: 1.2, MSFT: 1.1, GOOGL: 1.15, AMZN: 1.25, META: 1.3, NVDA: 1.8, TSLA: 2.0,
  JPM: 1.1, V: 1.0, MA: 1.05, BAC: 1.3, WFC: 1.25, GS: 1.35,
  JNJ: 0.7, UNH: 0.9, PFE: 0.75,
  HD: 1.05, WMT: 0.5, PG: 0.6,
  XOM: 1.2, CVX: 1.15, COP: 1.3,
  DIS: 1.1, NFLX: 1.4,
  AMD: 1.9, INTC: 1.3, QCOM: 1.25,
  BA: 1.4, CAT: 1.35, HON: 1.1,
};

const ANNUALIZED_VOLATILITY_MAP: Record<string, number> = {
  SPY: 0.15, QQQ: 0.18, IWM: 0.20, DIA: 0.14,
  AAPL: 0.28, MSFT: 0.25, GOOGL: 0.26, AMZN: 0.30, META: 0.35, NVDA: 0.50, TSLA: 0.60,
  JPM: 0.22, V: 0.20, MA: 0.21, BAC: 0.28, WFC: 0.27, GS: 0.26,
  JNJ: 0.16, UNH: 0.22, PFE: 0.25,
  HD: 0.24, WMT: 0.18, PG: 0.17,
  XOM: 0.28, CVX: 0.26, COP: 0.32,
  DIS: 0.28, NFLX: 0.45,
  AMD: 0.55, INTC: 0.32, QCOM: 0.30,
  BA: 0.35, CAT: 0.32, HON: 0.22,
};

const CORRELATION_DEFAULTS: Record<string, Record<string, number>> = {
  SPY: { QQQ: 0.95, IWM: 0.92, DIA: 0.97 },
  QQQ: { SPY: 0.95, IWM: 0.88, DIA: 0.90 },
  AAPL: { MSFT: 0.75, GOOGL: 0.65, NVDA: 0.70 },
  MSFT: { AAPL: 0.75, GOOGL: 0.72, NVDA: 0.65 },
  JPM: { BAC: 0.85, WFC: 0.82, GS: 0.78 },
  XOM: { CVX: 0.88, COP: 0.82 },
};

export function calculatePositionRisk(
  position: Position,
  totalPortfolioValue: number,
  stopLossPrice: number | null = null,
  config: RiskConfig = DEFAULT_RISK_CONFIG
): PositionRisk {
  const qty = Math.abs(parseFloat(position.qty));
  const entryPrice = parseFloat(position.avg_entry_price);
  const currentPrice = parseFloat(position.current_price);
  const marketValue = parseFloat(position.market_value);
  const side = position.side;
  
  const unrealizedPL = side === 'long' 
    ? (currentPrice - entryPrice) * qty 
    : (entryPrice - currentPrice) * qty;
  const unrealizedPLPercent = side === 'long'
    ? ((currentPrice - entryPrice) / entryPrice) * 100
    : ((entryPrice - currentPrice) / entryPrice) * 100;
  
  const weight = totalPortfolioValue > 0 ? marketValue / totalPortfolioValue : 0;
  
  const symbol = position.symbol;
  const annualizedVolatility = ANNUALIZED_VOLATILITY_MAP[symbol] ?? 0.25;
  const dailyVolatility = annualizedVolatility / Math.sqrt(252);
  const beta = BETA_MAP[symbol] ?? 1.0;
  
  const zScore95 = 1.645;
  const zScore99 = 2.326;
  const timeScaling = Math.sqrt(config.timeHorizonDays);
  
  const var95 = marketValue * dailyVolatility * zScore95 * timeScaling;
  const var99 = marketValue * dailyVolatility * zScore99 * timeScaling;
  
  const es95Multiplier = Math.exp(-0.5 * zScore95 * zScore95) / (Math.sqrt(2 * Math.PI) * (1 - 0.95));
  const expectedShortfall95 = marketValue * dailyVolatility * es95Multiplier * timeScaling;
  
  const riskPerShare = stopLossPrice !== null
    ? (side === 'long' ? entryPrice - stopLossPrice : stopLossPrice - entryPrice)
    : currentPrice * dailyVolatility * zScore95;
  const totalPositionRisk = Math.abs(riskPerShare * qty);
  
  const contributionToRisk = totalPortfolioValue > 0 
    ? (totalPositionRisk / totalPortfolioValue) * 100 
    : 0;
  
  const sector = SECTOR_MAP[symbol] ?? 'Unknown';
  const industry = INDUSTRY_MAP[symbol] ?? 'Unknown';
  
  return {
    symbol,
    side,
    qty,
    marketValue,
    entryPrice,
    currentPrice,
    unrealizedPL,
    unrealizedPLPercent,
    weight,
    dailyVolatility,
    annualizedVolatility,
    beta,
    var95,
    var99,
    expectedShortfall95,
    contributionToRisk,
    stopLossPrice,
    riskPerShare,
    totalPositionRisk,
    sector,
    industry,
  };
}

export function calculatePortfolioRisk(
  positions: Position[],
  stopLossPrices: Record<string, number | null>,
  equity: number,
  config: RiskConfig = DEFAULT_RISK_CONFIG
): PortfolioRiskMetrics {
  if (positions.length === 0) {
    return getEmptyPortfolioMetrics();
  }
  
  const totalValue = positions.reduce((sum, p) => sum + Math.abs(parseFloat(p.market_value)), 0);
  const positionRisks = positions.map(p => 
    calculatePositionRisk(p, totalValue, stopLossPrices[p.symbol], config)
  );
  
  const longExposure = positionRisks
    .filter(p => p.side === 'long')
    .reduce((sum, p) => sum + p.marketValue, 0);
  const shortExposure = positionRisks
    .filter(p => p.side === 'short')
    .reduce((sum, p) => sum + p.marketValue, 0);
  const grossExposure = longExposure + shortExposure;
  const netExposure = longExposure - shortExposure;
  
  const weights = positionRisks.map(p => p.weight);
  const herfindahlIndex = weights.reduce((sum, w) => sum + w * w, 0);
  const effectivePositions = herfindahlIndex > 0 ? 1 / herfindahlIndex : positions.length;
  const concentrationRisk = Math.sqrt(herfindahlIndex);
  
  const portfolioBeta = positionRisks.reduce((sum, p) => sum + p.weight * p.beta, 0);
  
  const correlationMatrix = buildCorrelationMatrix(positionRisks.map(p => p.symbol));
  const portfolioVariance = calculatePortfolioVariance(weights, correlationMatrix, positionRisks);
  const portfolioVolatility = Math.sqrt(portfolioVariance);
  const annualizedVolatility = portfolioVolatility * Math.sqrt(252);
  
  const zScore95 = 1.645;
  const zScore99 = 2.326;
  const timeScaling = Math.sqrt(config.timeHorizonDays);
  
  const var95 = totalValue * portfolioVolatility * zScore95 * timeScaling;
  const var99 = totalValue * portfolioVolatility * zScore99 * timeScaling;
  
  const es95Multiplier = Math.exp(-0.5 * zScore95 * zScore95) / (Math.sqrt(2 * Math.PI) * (1 - 0.95));
  const expectedShortfall95 = totalValue * portfolioVolatility * es95Multiplier * timeScaling;
  const es99Multiplier = Math.exp(-0.5 * zScore99 * zScore99) / (Math.sqrt(2 * Math.PI) * (1 - 0.99));
  const expectedShortfall99 = totalValue * portfolioVolatility * es99Multiplier * timeScaling;
  
  const portfolioReturn = positionRisks.reduce((sum, p) => sum + p.weight * (p.unrealizedPLPercent / 100), 0);
  const sharpeRatio = portfolioVolatility > 0 
    ? ((portfolioReturn * 252) - config.riskFreeRate) / annualizedVolatility 
    : 0;
  const downsideVol = calculateDownsideVolatility(positionRisks, portfolioReturn);
  const sortinoRatio = downsideVol > 0 
    ? ((portfolioReturn * 252) - config.riskFreeRate) / (downsideVol * Math.sqrt(252))
    : 0;
  
  const sectorMap = new Map<string, SectorExposure>();
  positionRisks.forEach(p => {
    const existing = sectorMap.get(p.sector);
    if (existing) {
      existing.value += p.marketValue;
      existing.weight += p.weight;
      existing.var95 += p.var95;
      existing.positions.push(p.symbol);
    } else {
      sectorMap.set(p.sector, {
        sector: p.sector,
        value: p.marketValue,
        weight: p.weight,
        var95: p.var95,
        positions: [p.symbol],
      });
    }
  });
  const sectorExposure = Array.from(sectorMap.values());
  
  const riskContributors = positionRisks
    .map(p => ({
      symbol: p.symbol,
      contribution: p.totalPositionRisk,
      contributionPercent: totalValue > 0 ? (p.totalPositionRisk / totalValue) * 100 : 0,
      var95: p.var95,
    }))
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 5);
  
  const correlationRisk = calculateAverageCorrelation(correlationMatrix);
  
  const maxDrawdown = calculateMaxDrawdown(positionRisks);
  
  const riskBudget: RiskBudget = {
    maxPositionRisk: config.maxPositionWeight * equity,
    maxSectorRisk: config.maxSectorWeight * equity,
    maxPortfolioVaR: config.varLimitPercent * equity,
    currentUtilization: var95 / (config.varLimitPercent * equity),
    remainingCapacity: Math.max(0, (config.varLimitPercent * equity) - var95),
  };
  
  return {
    totalValue,
    totalEquity: equity,
    grossExposure,
    netExposure,
    longExposure,
    shortExposure,
    concentrationRisk,
    herfindahlIndex,
    effectivePositions,
    portfolioBeta,
    portfolioVolatility,
    annualizedVolatility,
    var95,
    var99,
    expectedShortfall95,
    expectedShortfall99,
    maxDrawdown,
    sharpeRatio,
    sortinoRatio,
    correlationRisk,
    sectorExposure,
    topRiskContributors: riskContributors,
    riskBudget,
  };
}

function getEmptyPortfolioMetrics(): PortfolioRiskMetrics {
  return {
    totalValue: 0,
    totalEquity: 0,
    grossExposure: 0,
    netExposure: 0,
    longExposure: 0,
    shortExposure: 0,
    concentrationRisk: 0,
    herfindahlIndex: 0,
    effectivePositions: 0,
    portfolioBeta: 0,
    portfolioVolatility: 0,
    annualizedVolatility: 0,
    var95: 0,
    var99: 0,
    expectedShortfall95: 0,
    expectedShortfall99: 0,
    maxDrawdown: 0,
    sharpeRatio: 0,
    sortinoRatio: 0,
    correlationRisk: 0,
    sectorExposure: [],
    topRiskContributors: [],
    riskBudget: {
      maxPositionRisk: 0,
      maxSectorRisk: 0,
      maxPortfolioVaR: 0,
      currentUtilization: 0,
      remainingCapacity: 0,
    },
  };
}

export function buildCorrelationMatrix(symbols: string[]): CorrelationMatrix {
  const n = symbols.length;
  const matrix: number[][] = Array(n).fill(null).map(() => Array(n).fill(0));
  
  for (let i = 0; i < n; i++) {
    matrix[i][i] = 1;
    for (let j = i + 1; j < n; j++) {
      const sym1 = symbols[i];
      const sym2 = symbols[j];
      
      let correlation = 0.5;
      
      if (CORRELATION_DEFAULTS[sym1]?.[sym2] !== undefined) {
        correlation = CORRELATION_DEFAULTS[sym1][sym2];
      } else if (CORRELATION_DEFAULTS[sym2]?.[sym1] !== undefined) {
        correlation = CORRELATION_DEFAULTS[sym2][sym1];
      } else {
        const sector1 = SECTOR_MAP[sym1] ?? 'Unknown';
        const sector2 = SECTOR_MAP[sym2] ?? 'Unknown';
        
        if (sector1 === sector2 && sector1 !== 'Unknown') {
          correlation = 0.7;
        } else if (sector1 === 'ETF' || sector2 === 'ETF') {
          correlation = 0.85;
        } else {
          correlation = 0.4;
        }
      }
      
      matrix[i][j] = correlation;
      matrix[j][i] = correlation;
    }
  }
  
  return { symbols, matrix };
}

function calculatePortfolioVariance(
  weights: number[],
  correlationMatrix: CorrelationMatrix,
  positionRisks: PositionRisk[]
): number {
  const n = weights.length;
  let variance = 0;
  
  for (let i = 0; i < n; i++) {
    variance += weights[i] * weights[i] * positionRisks[i].dailyVolatility * positionRisks[i].dailyVolatility;
    
    for (let j = i + 1; j < n; j++) {
      const cov = weights[i] * weights[j] * 
        positionRisks[i].dailyVolatility * positionRisks[j].dailyVolatility * 
        correlationMatrix.matrix[i][j];
      variance += 2 * cov;
    }
  }
  
  return variance;
}

function calculateDownsideVolatility(
  positionRisks: PositionRisk[],
  _portfolioReturn: number
): number {
  const targetReturn = 0;
  const returns = positionRisks.map(p => p.unrealizedPLPercent / 100);
  const downsideReturns = returns.filter(r => r < targetReturn);
  
  if (downsideReturns.length === 0) return 0;
  
  const squaredDiff = downsideReturns.reduce((sum, r) => {
    const diff = r - targetReturn;
    return sum + diff * diff;
  }, 0);
  
  return Math.sqrt(squaredDiff / downsideReturns.length);
}

function calculateAverageCorrelation(correlationMatrix: CorrelationMatrix): number {
  const n = correlationMatrix.symbols.length;
  if (n <= 1) return 0;
  
  let sum = 0;
  let count = 0;
  
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      sum += correlationMatrix.matrix[i][j];
      count++;
    }
  }
  
  return count > 0 ? sum / count : 0;
}

function calculateMaxDrawdown(positionRisks: PositionRisk[]): number {
  const negativeReturns = positionRisks
    .filter(p => p.unrealizedPLPercent < 0)
    .map(p => Math.abs(p.unrealizedPLPercent / 100));
  
  if (negativeReturns.length === 0) return 0;
  
  return Math.max(...negativeReturns);
}

export function runScenarioAnalysis(
  positions: Position[],
  scenarios: { name: string; priceShock: number; volatilityMultiplier: number }[]
): ScenarioResult[] {
  return scenarios.map(scenario => {
    const positionImpacts = positions.map(p => {
      const qty = parseFloat(p.qty);
      const currentPrice = parseFloat(p.current_price);
      const side = p.side;
      
      const shockedPrice = currentPrice * (1 + scenario.priceShock);
      const priceImpact = side === 'long'
        ? (shockedPrice - currentPrice) * qty
        : (currentPrice - shockedPrice) * qty;
      
      return {
        symbol: p.symbol,
        impact: priceImpact,
      };
    });
    
    const portfolioImpact = positionImpacts.reduce((sum, p) => sum + p.impact, 0);
    
    return {
      name: scenario.name,
      description: `${(scenario.priceShock * 100).toFixed(1)}% price move, ${scenario.volatilityMultiplier}x volatility`,
      portfolioImpact,
      positionImpacts,
    };
  });
}

export function getDefaultScenarios(): { name: string; priceShock: number; volatilityMultiplier: number }[] {
  return [
    { name: 'Mild Correction', priceShock: -0.05, volatilityMultiplier: 1.5 },
    { name: 'Market Crash', priceShock: -0.20, volatilityMultiplier: 3.0 },
    { name: 'Flash Rally', priceShock: 0.10, volatilityMultiplier: 2.0 },
    { name: 'Sector Rotation', priceShock: -0.03, volatilityMultiplier: 1.2 },
    { name: 'Volatility Spike', priceShock: 0, volatilityMultiplier: 2.5 },
    { name: 'Black Swan', priceShock: -0.30, volatilityMultiplier: 4.0 },
  ];
}

export function generateRiskReport(
  portfolioRisk: PortfolioRiskMetrics,
  _positionRisks: PositionRisk[]
): string {
  const lines: string[] = [
    '═══════════════════════════════════════════════════════════════',
    '                    PORTFOLIO RISK REPORT                      ',
    '═══════════════════════════════════════════════════════════════',
    '',
    'PORTFOLIO OVERVIEW',
    '───────────────────────────────────────────────────────────────',
    `Total Portfolio Value:     $${portfolioRisk.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    `Gross Exposure:            $${portfolioRisk.grossExposure.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    `Net Exposure:              $${portfolioRisk.netExposure.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    `Long Exposure:             $${portfolioRisk.longExposure.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    `Short Exposure:            $${portfolioRisk.shortExposure.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    '',
    'RISK METRICS',
    '───────────────────────────────────────────────────────────────',
    `Portfolio Beta:            ${portfolioRisk.portfolioBeta.toFixed(2)}`,
    `Daily Volatility:          ${(portfolioRisk.portfolioVolatility * 100).toFixed(2)}%`,
    `Annualized Volatility:     ${(portfolioRisk.annualizedVolatility * 100).toFixed(2)}%`,
    `VaR (95%):                 $${portfolioRisk.var95.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    `VaR (99%):                 $${portfolioRisk.var99.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    `Expected Shortfall (95%):  $${portfolioRisk.expectedShortfall95.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    '',
    'CONCENTRATION ANALYSIS',
    '───────────────────────────────────────────────────────────────',
    `Effective Positions:       ${portfolioRisk.effectivePositions.toFixed(1)}`,
    `Herfindahl Index:          ${portfolioRisk.herfindahlIndex.toFixed(3)}`,
    `Concentration Risk:        ${(portfolioRisk.concentrationRisk * 100).toFixed(1)}%`,
    `Average Correlation:       ${(portfolioRisk.correlationRisk * 100).toFixed(1)}%`,
    '',
    'RISK-ADJUSTED RETURNS',
    '───────────────────────────────────────────────────────────────',
    `Sharpe Ratio:              ${portfolioRisk.sharpeRatio.toFixed(2)}`,
    `Sortino Ratio:             ${portfolioRisk.sortinoRatio.toFixed(2)}`,
    '',
    'TOP RISK CONTRIBUTORS',
    '───────────────────────────────────────────────────────────────',
  ];
  
  portfolioRisk.topRiskContributors.forEach((contributor, index) => {
    lines.push(`${index + 1}. ${contributor.symbol.padEnd(8)} ${contributor.contributionPercent.toFixed(2)}%  ($${contributor.var95.toFixed(2)} VaR)`);
  });
  
  if (portfolioRisk.sectorExposure.length > 0) {
    lines.push('', 'SECTOR EXPOSURE', '───────────────────────────────────────────────────────────────');
    portfolioRisk.sectorExposure
      .sort((a, b) => b.weight - a.weight)
      .forEach(sector => {
        lines.push(`${sector.sector.padEnd(20)} ${(sector.weight * 100).toFixed(1)}%  ($${sector.var95.toFixed(2)} VaR)`);
      });
  }
  
  lines.push('', 'RISK BUDGET', '───────────────────────────────────────────────────────────────');
  lines.push(`VaR Utilization:           ${(portfolioRisk.riskBudget.currentUtilization * 100).toFixed(1)}%`);
  lines.push(`Remaining Capacity:        $${portfolioRisk.riskBudget.remainingCapacity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  lines.push('', '═══════════════════════════════════════════════════════════════');
  
  return lines.join('\n');
}

export function calculateTotalPortfolioRisk(
  positions: Position[],
  stopLossPrices: Record<string, number | null>,
  equity: number
): number {
  const portfolioRisk = calculatePortfolioRisk(positions, stopLossPrices, equity);
  return portfolioRisk.var95;
}

export { DEFAULT_RISK_CONFIG };
