import React from 'react';
import { useEarnings } from '../hooks/useEarnings';
import { Calendar, DollarSign, TrendingUp, TrendingDown, BarChart3 } from 'lucide-react';
import { getTimeOfDayLabel, getTimeOfDayColors, calculateSurprisePercent } from '../types';

interface ComparisonRowProps {
  label: string;
  actual: number | null;
  estimate: number | null;
  prefix?: string;
  suffix?: string;
}

const ComparisonRow: React.FC<ComparisonRowProps> = ({ label, actual, estimate, prefix = '', suffix = '' }) => {
  const hasBoth = actual !== null && estimate !== null;
  const surprise = hasBoth ? calculateSurprisePercent(actual, estimate) : null;

  const formatValue = (val: number | null) => {
    if (val === null) return '—';
    return `${prefix}${val.toFixed(2)}${suffix}`;
  };

  return (
    <div className="bg-surface/30 rounded-lg p-3 border border-slate-800">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-slate-500 font-medium">{label}</span>
        {surprise !== null && (
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5 ${
            surprise >= 0 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
          }`}>
            {surprise >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
            {surprise >= 0 ? '+' : ''}{surprise.toFixed(1)}%
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-[10px] text-slate-500 mb-1">Actual</div>
          <div className={`text-lg font-mono font-bold ${
            hasBoth ? (actual! >= estimate! ? 'text-green-400' : 'text-red-400') : 'text-primary'
          }`}>
            {formatValue(actual)}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-slate-500 mb-1">Estimate</div>
          <div className="text-lg font-mono font-bold text-slate-400">
            {formatValue(estimate)}
          </div>
        </div>
      </div>
    </div>
  );
};

export const EarningsDetailView: React.FC = () => {
  const { selectedId, items } = useEarnings();
  const item = items.find(i => i.id === selectedId);

  if (!item) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-500 p-8">
        <BarChart3 size={48} className="mb-4 opacity-30" />
        <span className="text-sm font-medium">Select an earnings report</span>
        <span className="text-xs mt-1 text-slate-600">Click on a card to view details</span>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <h2 className="text-2xl font-black text-primary">{item.symbol}</h2>
<span className={`text-[10px] px-2 py-0.5 rounded border ${getTimeOfDayColors(item.timeOfDay)}`}>
              {getTimeOfDayLabel(item.timeOfDay)}
            </span>
        </div>
        <div className="flex items-center gap-2 text-slate-400 text-sm">
          <Calendar size={14} />
          <span>{item.reportDate}</span>
          {item.fiscalQuarter && (
            <>
              <span className="text-slate-600">•</span>
              <span className="text-slate-500">{item.fiscalQuarter}</span>
            </>
          )}
        </div>
      </div>

      <div className="mb-4">
        <h3 className="text-sm font-bold text-primary mb-3 flex items-center gap-2">
          <DollarSign size={16} className="text-accent" />
          Earnings Per Share
        </h3>
        <ComparisonRow label="EPS" actual={item.epsActual} estimate={item.epsEstimate} prefix="$" />
      </div>

      <div className="mb-4">
        <h3 className="text-sm font-bold text-primary mb-3 flex items-center gap-2">
          <BarChart3 size={16} className="text-accent" />
          Revenue
        </h3>
        <ComparisonRow label="Revenue" actual={item.revenueActual} estimate={item.revenueEstimate} prefix="$" suffix="M" />
      </div>

      {item.epsActual === null && item.revenueActual === null && (
        <div className="mt-6 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
          <div className="text-xs text-amber-400 font-medium">
            Scheduled - Not Yet Reported
          </div>
          <div className="text-xs text-amber-400/70 mt-1">
            This earnings report is scheduled for {item.reportDate}
          </div>
        </div>
      )}
    </div>
  );
};

export default EarningsDetailView;
