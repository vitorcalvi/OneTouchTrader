import React from 'react';
import { EarningsFilterBar } from '../filters/EarningsFilterBar';
import { EarningsCalendarView } from '../views/EarningsCalendarView';
import { EarningsDetailView } from '../views/EarningsDetailView';

export const EarningsPanel: React.FC = () => {
  return (
    <div className="flex flex-col w-full" style={{ height: 'calc(100vh - 200px)', minHeight: '500px' }}>
      <div className="mb-4 shrink-0">
        <EarningsFilterBar />
      </div>

      <div className="flex-1 flex gap-4 min-h-0">
        <div className="w-[60%] min-w-[400px] max-w-[700px] flex flex-col bg-base rounded-xl border border-slate-800 overflow-hidden">
          <div className="flex-1 p-3 overflow-hidden">
            <EarningsCalendarView />
          </div>
        </div>

        <div className="flex-1 bg-surface rounded-xl border border-slate-800 overflow-hidden">
          <EarningsDetailView />
        </div>
      </div>
    </div>
  );
};

export default EarningsPanel;
