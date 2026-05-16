import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Position, Order } from '../../../../types';
import {
  portfolioRiskService,
  PortfolioRiskState,
  RiskAlert,
  RiskThresholds,
} from '../../../../services/stocks/portfolioRiskService';
import {
  ScenarioResult,
  CorrelationMatrix,
  PortfolioRiskMetrics,
  PositionRisk,
  calculatePositionRisk,
} from '../../../../utils/stocks/portfolioRisk';

export interface UsePortfolioRiskOptions {
  positions: Position[];
  orders: Order[];
  equity: number;
  autoRefresh?: boolean;
  refreshIntervalMs?: number;
  thresholds?: Partial<RiskThresholds>;
  onAlert?: (alert: RiskAlert) => void;
}

export interface UsePortfolioRiskReturn {
  metrics: PortfolioRiskMetrics | null;
  positionRisks: PositionRisk[];
  scenarios: ScenarioResult[];
  correlationMatrix: CorrelationMatrix | null;
  alerts: RiskAlert[];
  isLoading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refresh: () => void;
  runCustomScenario: (priceShock: number, volatilityMultiplier: number) => ScenarioResult | null;
  getPositionRisk: (symbol: string) => PositionRisk | null;
  getTotalRisk: () => number;
  getRiskContribution: (symbol: string) => number;
  generateReport: () => string;
}

export function usePortfolioRisk(options: UsePortfolioRiskOptions): UsePortfolioRiskReturn {
  const {
    positions,
    orders,
    equity,
    autoRefresh = true,
    refreshIntervalMs = 3000,
    thresholds,
    onAlert,
  } = options;

  const [state, setState] = useState<PortfolioRiskState>(portfolioRiskService.getState());
  const [alerts, setAlerts] = useState<RiskAlert[]>([]);
  const prevAlertCountRef = useRef(0);

  useEffect(() => {
    if (thresholds) {
      portfolioRiskService.setThresholds(thresholds);
    }
  }, [thresholds]);

  const refresh = useCallback(() => {
    if (positions.length === 0 || equity <= 0) return;
    portfolioRiskService.calculateRisk(positions, orders, equity);
  }, [positions, orders, equity]);

  useEffect(() => {
    const unsubscribe = portfolioRiskService.subscribe((newState) => {
      setState(newState);
      
      const newAlerts = portfolioRiskService.checkAlerts();
      setAlerts(newAlerts);
      
      if (onAlert && newAlerts.length > prevAlertCountRef.current) {
        const freshAlerts = newAlerts.slice(prevAlertCountRef.current);
        freshAlerts.forEach(alert => onAlert(alert));
      }
      prevAlertCountRef.current = newAlerts.length;
    });

    return unsubscribe;
  }, [onAlert]);

  useEffect(() => {
    if (!autoRefresh || positions.length === 0) return;

    const intervalId = setInterval(refresh, refreshIntervalMs);
    return () => clearInterval(intervalId);
  }, [autoRefresh, refresh, refreshIntervalMs, positions.length]);

  const runCustomScenario = useCallback(
    (priceShock: number, volatilityMultiplier: number): ScenarioResult | null => {
      if (positions.length === 0) return null;
      return portfolioRiskService.runCustomScenario(positions, priceShock, volatilityMultiplier);
    },
    [positions]
  );

  const getPositionRisk = useCallback((symbol: string): PositionRisk | null => {
    return portfolioRiskService.getPositionRisk(symbol);
  }, []);

  const getTotalRisk = useCallback((): number => {
    return portfolioRiskService.getTotalRisk(equity);
  }, [equity]);

  const getRiskContribution = useCallback((symbol: string): number => {
    return portfolioRiskService.getRiskContribution(symbol);
  }, []);

  const generateReport = useCallback((): string => {
    return portfolioRiskService.generateReport();
  }, []);

  return {
    metrics: state.metrics,
    positionRisks: state.positionRisks,
    scenarios: state.scenarios,
    correlationMatrix: state.correlationMatrix,
    alerts,
    isLoading: state.isLoading,
    error: state.error,
    lastUpdated: state.lastUpdated,
    refresh,
    runCustomScenario,
    getPositionRisk,
    getTotalRisk,
    getRiskContribution,
    generateReport,
  };
}

export interface UsePositionRiskOptions {
  symbol: string;
  positions: Position[];
  orders: Order[];
  equity: number;
}

export interface UsePositionRiskReturn {
  positionRisk: PositionRisk | null;
  contributionPercent: number;
  isLoading: boolean;
}

export function usePositionRisk(options: UsePositionRiskOptions): UsePositionRiskReturn {
  const { symbol, positions, orders, equity } = options;

  const [positionRisk, setPositionRisk] = useState<PositionRisk | null>(null);
  const [contributionPercent, setContributionPercent] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (positions.length === 0 || equity <= 0) {
      setPositionRisk(null);
      setContributionPercent(0);
      return;
    }

    setIsLoading(true);

    const stopLossPrices: Record<string, number | null> = {};
    orders.forEach(order => {
      if ((order.type === 'stop' || order.type === 'stop_limit' || order.type === 'trailing_stop') && 
          order.symbol === symbol && order.stop_price) {
        stopLossPrices[symbol] = parseFloat(order.stop_price);
      }
    });

    const position = positions.find(p => p.symbol === symbol);
    if (!position) {
      setPositionRisk(null);
      setContributionPercent(0);
      setIsLoading(false);
      return;
    }

    const totalValue = positions.reduce((sum, p) => sum + Math.abs(parseFloat(p.market_value)), 0);
    
    const risk = calculatePositionRisk(position, totalValue, stopLossPrices[symbol] || null);
    
    setPositionRisk(risk);
    setContributionPercent(totalValue > 0 ? (risk.totalPositionRisk / totalValue) * 100 : 0);
    setIsLoading(false);
  }, [symbol, positions, orders, equity]);

  return {
    positionRisk,
    contributionPercent,
    isLoading,
  };
}

export interface RiskMonitorConfig {
  warningThreshold: number;
  criticalThreshold: number;
  checkIntervalMs: number;
}

const DEFAULT_MONITOR_CONFIG: RiskMonitorConfig = {
  warningThreshold: 0.015,
  criticalThreshold: 0.025,
  checkIntervalMs: 3000,
};

export function useRiskMonitor(
  getTotalRisk: () => number,
  equity: number,
  config: Partial<RiskMonitorConfig> = {},
  onWarning?: (risk: number) => void,
  onCritical?: (risk: number) => void
): { status: 'normal' | 'warning' | 'critical'; currentRisk: number } {
  const finalConfig = useMemo(() => ({ 
    ...DEFAULT_MONITOR_CONFIG, 
    ...config 
  }), [config.warningThreshold, config.criticalThreshold, config.checkIntervalMs]);

  const [status, setStatus] = useState<'normal' | 'warning' | 'critical'>('normal');
  const [currentRisk, setCurrentRisk] = useState(0);
  const prevStatusRef = useRef<'normal' | 'warning' | 'critical'>('normal');

  useEffect(() => {
    const checkRisk = () => {
      const risk = getTotalRisk();
      const riskPercent = equity > 0 ? risk / equity : 0;
      setCurrentRisk(risk);

      let newStatus: 'normal' | 'warning' | 'critical' = 'normal';
      
      if (riskPercent >= finalConfig.criticalThreshold) {
        newStatus = 'critical';
      } else if (riskPercent >= finalConfig.warningThreshold) {
        newStatus = 'warning';
      }

      if (newStatus !== prevStatusRef.current) {
        setStatus(newStatus);
        
        if (newStatus === 'warning' && onWarning && prevStatusRef.current === 'normal') {
          onWarning(risk);
        } else if (newStatus === 'critical' && onCritical) {
          onCritical(risk);
        }
        
        prevStatusRef.current = newStatus;
      }
    };

    checkRisk();
    const intervalId = setInterval(checkRisk, finalConfig.checkIntervalMs);
    return () => clearInterval(intervalId);
  }, [getTotalRisk, equity, finalConfig, onWarning, onCritical]);

  return { status, currentRisk };
}
