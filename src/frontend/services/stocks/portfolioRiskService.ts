import { Position, Order } from '../../types';
import {
  calculatePortfolioRisk,
  calculatePositionRisk,
  calculateTotalPortfolioRisk,
  runScenarioAnalysis,
  getDefaultScenarios,
  generateRiskReport,
  buildCorrelationMatrix,
  PortfolioRiskMetrics,
  PositionRisk,
  ScenarioResult,
  CorrelationMatrix,
  RiskConfig,
  DEFAULT_RISK_CONFIG,
} from '../../utils/stocks/portfolioRisk';

export interface PortfolioRiskState {
  metrics: PortfolioRiskMetrics | null;
  positionRisks: PositionRisk[];
  scenarios: ScenarioResult[];
  correlationMatrix: CorrelationMatrix | null;
  lastUpdated: Date | null;
  isLoading: boolean;
  error: string | null;
}

export interface RiskAlert {
  id: string;
  type: 'warning' | 'critical' | 'info';
  message: string;
  metric: string;
  value: number;
  threshold: number;
  timestamp: Date;
}

export interface RiskThresholds {
  maxVaRPercent: number;
  maxPositionConcentration: number;
  maxSectorConcentration: number;
  maxCorrelation: number;
  minSharpeRatio: number;
  maxDrawdownPercent: number;
}

const DEFAULT_THRESHOLDS: RiskThresholds = {
  maxVaRPercent: 2,
  maxPositionConcentration: 25,
  maxSectorConcentration: 40,
  maxCorrelation: 0.7,
  minSharpeRatio: 0.5,
  maxDrawdownPercent: 10,
};

class PortfolioRiskService {
  private state: PortfolioRiskState = {
    metrics: null,
    positionRisks: [],
    scenarios: [],
    correlationMatrix: null,
    lastUpdated: null,
    isLoading: false,
    error: null,
  };

  private subscribers: Set<(state: PortfolioRiskState) => void> = new Set();
  private dailyLoss: number = 0;
  private dailyLossLimit: number = 0;

  setDailyLossLimit(limit: number): void {
    this.dailyLossLimit = limit;
  }

  updateDailyLoss(pnl: number): void {
    this.dailyLoss = pnl;
  }

  checkDailyLossCap(): boolean {
    if (this.dailyLossLimit === 0) return true;
    return this.dailyLoss >= -this.dailyLossLimit;
  }

  subscribe(callback: (state: PortfolioRiskState) => void): () => void {
    this.subscribers.add(callback);
    callback(this.state);
    return () => this.subscribers.delete(callback);
  }

  private notify(): void {
    this.subscribers.forEach(callback => callback(this.state));
  }

  setThresholds(thresholds: Partial<RiskThresholds>): void {
    this.thresholds = { ...this.thresholds, ...thresholds };
  }

  setConfig(config: Partial<RiskConfig>): void {
    this.config = { ...this.config, ...config };
  }

  calculateRisk(
    positions: Position[],
    orders: Order[],
    equity: number
  ): PortfolioRiskState {
    try {
      this.state = { ...this.state, isLoading: true, error: null };
      this.notify();

      const stopLossPrices = this.extractStopLossPrices(orders);
      
      const positionRisks = positions.map(p => 
        calculatePositionRisk(p, equity, stopLossPrices[p.symbol], this.config)
      );

      const metrics = calculatePortfolioRisk(positions, stopLossPrices, equity, this.config);

      const symbols = positions.map(p => p.symbol);
      const correlationMatrix = symbols.length > 1 
        ? buildCorrelationMatrix(symbols) 
        : null;

      const scenarios = runScenarioAnalysis(positions, getDefaultScenarios());

      this.state = {
        metrics,
        positionRisks,
        scenarios,
        correlationMatrix,
        lastUpdated: new Date(),
        isLoading: false,
        error: null,
      };

      this.notify();
      return this.state;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error calculating risk';
      this.state = {
        ...this.state,
        isLoading: false,
        error: errorMessage,
      };
      this.notify();
      return this.state;
    }
  }

  private extractStopLossPrices(orders: Order[]): Record<string, number | null> {
    const stopLossPrices: Record<string, number | null> = {};
    
    orders.forEach(order => {
      if (order.type === 'stop' || order.type === 'stop_limit' || order.type === 'trailing_stop') {
        const symbol = order.symbol;
        if (!stopLossPrices[symbol] || order.stop_price) {
          stopLossPrices[symbol] = order.stop_price ? parseFloat(order.stop_price) : null;
        }
      }
    });

    return stopLossPrices;
  }

  getPositionWeight(symbol: string): number {
    const pos = this.state.positionRisks.find(p => p.symbol === symbol);
    return pos ? pos.weight : 0;
  }

  getTotalRisk(_equity: number): number {
    if (!this.state.metrics) return 0;
    return this.state.metrics.var95;
  }

  getRiskContribution(symbol: string): number {
    const positionRisk = this.getPositionRisk(symbol);
    if (!positionRisk || !this.state.metrics) return 0;
    
    return this.state.metrics.totalValue > 0 
      ? (positionRisk.totalPositionRisk / this.state.metrics.totalValue) * 100 
      : 0;
  }

  checkAlerts(): RiskAlert[] {
    const alerts: RiskAlert[] = [];
    const metrics = this.state.metrics;
    
    if (!metrics) return alerts;

    const varPercent = (metrics.var95 / metrics.totalEquity) * 100;
    if (varPercent > this.thresholds.maxVaRPercent) {
      alerts.push({
        id: `var-${Date.now()}`,
        type: varPercent > this.thresholds.maxVaRPercent * 1.5 ? 'critical' : 'warning',
        message: `Portfolio VaR (${varPercent.toFixed(1)}%) exceeds threshold (${this.thresholds.maxVaRPercent}%)`,
        metric: 'var95',
        value: varPercent,
        threshold: this.thresholds.maxVaRPercent,
        timestamp: new Date(),
      });
    }

    this.state.positionRisks.forEach(pos => {
      const weightPercent = pos.weight * 100;
      if (weightPercent > this.thresholds.maxPositionConcentration) {
        alerts.push({
          id: `conc-${pos.symbol}-${Date.now()}`,
          type: weightPercent > this.thresholds.maxPositionConcentration * 1.2 ? 'critical' : 'warning',
          message: `${pos.symbol} concentration (${weightPercent.toFixed(1)}%) exceeds threshold`,
          metric: 'concentration',
          value: weightPercent,
          threshold: this.thresholds.maxPositionConcentration,
          timestamp: new Date(),
        });
      }
    });

    metrics.sectorExposure.forEach(sector => {
      const sectorPercent = sector.weight * 100;
      if (sectorPercent > this.thresholds.maxSectorConcentration) {
        alerts.push({
          id: `sector-${sector.sector}-${Date.now()}`,
          type: 'warning',
          message: `${sector.sector} sector exposure (${sectorPercent.toFixed(1)}%) exceeds threshold`,
          metric: 'sectorConcentration',
          value: sectorPercent,
          threshold: this.thresholds.maxSectorConcentration,
          timestamp: new Date(),
        });
      }
    });

    if (metrics.correlationRisk > this.thresholds.maxCorrelation) {
      alerts.push({
        id: `corr-${Date.now()}`,
        type: 'warning',
        message: `Portfolio correlation (${(metrics.correlationRisk * 100).toFixed(1)}%) is high`,
        metric: 'correlation',
        value: metrics.correlationRisk,
        threshold: this.thresholds.maxCorrelation,
        timestamp: new Date(),
      });
    }

    if (metrics.sharpeRatio < this.thresholds.minSharpeRatio && metrics.sharpeRatio !== 0) {
      alerts.push({
        id: `sharpe-${Date.now()}`,
        type: 'info',
        message: `Sharpe ratio (${metrics.sharpeRatio.toFixed(2)}) is below target`,
        metric: 'sharpeRatio',
        value: metrics.sharpeRatio,
        threshold: this.thresholds.minSharpeRatio,
        timestamp: new Date(),
      });
    }

    return alerts;
  }

  runCustomScenario(
    positions: Position[],
    priceShock: number,
    volatilityMultiplier: number
  ): ScenarioResult {
    const results = runScenarioAnalysis(positions, [
      { name: 'Custom', priceShock, volatilityMultiplier }
    ]);
    return results[0];
  }

  generateReport(): string {
    if (!this.state.metrics) {
      return 'No portfolio data available. Please calculate risk first.';
    }
    return generateRiskReport(this.state.metrics, this.state.positionRisks);
  }

  getState(): PortfolioRiskState {
    return this.state;
  }

  getMetrics(): PortfolioRiskMetrics | null {
    return this.state.metrics;
  }

  getPositionRisks(): PositionRisk[] {
    return this.state.positionRisks;
  }

  getScenarios(): ScenarioResult[] {
    return this.state.scenarios;
  }

  getCorrelationMatrix(): CorrelationMatrix | null {
    return this.state.correlationMatrix;
  }
}

export const portfolioRiskService = new PortfolioRiskService();

export {
  calculatePortfolioRisk,
  calculatePositionRisk,
  calculateTotalPortfolioRisk,
  runScenarioAnalysis,
  getDefaultScenarios,
  generateRiskReport,
  buildCorrelationMatrix,
  DEFAULT_RISK_CONFIG,
};

export type {
  PortfolioRiskMetrics,
  PositionRisk,
  ScenarioResult,
  CorrelationMatrix,
  RiskConfig,
};
