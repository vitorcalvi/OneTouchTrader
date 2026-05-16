import React from "react";
import { Filter, Calendar, List, Grid } from "lucide-react";
import { useEarnings } from "../hooks/useEarnings";

export const EarningsFilterBar: React.FC = () => {
  const { filter, setFilter } = useEarnings();

  return (
    <div className="flex items-center gap-3 p-2 bg-surface rounded-lg border border-slate-800 flex-wrap">
      {/* Filter label */}
      <div className="flex items-center gap-1.5 text-slate-400">
        <Filter size={14} />
        <span className="text-[10px] font-bold uppercase tracking-wider">
          Filter
        </span>
      </div>

      <div className="h-4 w-px bg-slate-700" />

      {/* Date range inputs */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5">
          <Calendar size={12} className="text-slate-400" />
          <input
            type="date"
            value={filter.dateRange.from}
            onChange={(e) =>
              setFilter({
                dateRange: { ...filter.dateRange, from: e.target.value },
              })
            }
            className="bg-base border border-slate-700 rounded px-2 py-1 text-xs text-primary focus:border-accent focus:outline-none"
          />
        </div>
        <span className="text-slate-500 text-xs">to</span>
        <input
          type="date"
          value={filter.dateRange.to}
          onChange={(e) =>
            setFilter({
              dateRange: { ...filter.dateRange, to: e.target.value },
            })
          }
          className="bg-base border border-slate-700 rounded px-2 py-1 text-xs text-primary focus:border-accent focus:outline-none"
        />
      </div>

      <div className="h-4 w-px bg-slate-700" />

      {/* Symbol filter */}
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          placeholder="Symbol..."
          value={filter.symbol || ""}
          onChange={(e) =>
            setFilter({
              symbol: e.target.value.toUpperCase(),
            })
          }
          className="bg-base border border-slate-700 rounded px-2 py-1 text-xs text-primary w-20 focus:border-accent focus:outline-none placeholder:text-slate-600 uppercase"
        />
      </div>

      <div className="h-4 w-px bg-slate-700" />

      {/* View mode toggle */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => setFilter({ viewMode: "calendar" })}
          className={`flex items-center gap-1 px-2 py-1 text-[10px] font-bold rounded border transition-all ${
            filter.viewMode === "calendar"
              ? "bg-accent/20 text-accent border-accent/30"
              : "bg-transparent text-slate-400 border-slate-700 hover:border-accent/30"
          }`}
        >
          <Grid size={12} />
          Calendar
        </button>
        <button
          onClick={() => setFilter({ viewMode: "list" })}
          className={`flex items-center gap-1 px-2 py-1 text-[10px] font-bold rounded border transition-all ${
            filter.viewMode === "list"
              ? "bg-accent/20 text-accent border-accent/30"
              : "bg-transparent text-slate-400 border-slate-700 hover:border-accent/30"
          }`}
        >
          <List size={12} />
          List
        </button>
      </div>
    </div>
  );
};

export default EarningsFilterBar;
