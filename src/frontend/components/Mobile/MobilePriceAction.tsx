import React from 'react';
import type { AlpacaService } from '@/services/stocks';

interface MobilePriceActionProps {
  service?: AlpacaService | null;
  activeSymbol?: string;
  price: number | null;
  limitPrice: number | null;
  activeTier: 'M' | 'L' | 'S';
  positionSide: 'long' | 'short';
  onSideToggle?: () => void;
  onPriceStep?: (increment: number) => void;
  onBuy: () => void;
  onSell: () => void;
  canTrade?: boolean;
  isSubmitting?: boolean;
  tickDirection?: 'up' | 'down' | null;
  priceSteps?: { large: number; mid: number; small: number };
  onPriceRefresh?: (activeTier: 'M' | 'L' | 'S') => void;
  slActive: boolean;
  tpActive: boolean;
  onToggleSl: () => void;
  onToggleTp: () => void;
}

export const MobilePriceAction: React.FC<MobilePriceActionProps> = ({
  service: _service,
  activeSymbol: _activeSymbol,

  price,
  limitPrice,
  activeTier,
  positionSide,
  onSideToggle,
  onPriceStep,
  onBuy,
  onSell,
  canTrade = true,
  isSubmitting = false,
  tickDirection: _tickDirection,
  priceSteps = { large: 1, mid: 0.1, small: 0.01 },
  onPriceRefresh,
  slActive,
  tpActive,
  onToggleSl,
  onToggleTp,
}) => {
  const displayPrice = activeTier === 'M' ? price : (limitPrice ?? price);
  const formattedPrice = displayPrice !== null ? displayPrice.toFixed(2) : '--';

  return (
    <section className="flex gap-3 mt-1 h-[240px]">
      {/* Left: Price Control Panel */}
      <div className="flex-1 bg-[#171E2D] rounded-2xl flex flex-col justify-between p-3">
        {/* Up Adjustments */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: '1.', value: priceSteps.large },
            { label: '0.1', value: priceSteps.mid },
            { label: '.01', value: priceSteps.small }
          ].map((item, idx) => (
            <button
              key={idx}
              onClick={() => onPriceStep?.(item.value)}
              disabled={activeTier === 'M'}
              className="bg-[#242E42] border border-white/5 rounded-lg py-2 flex flex-col items-center justify-center text-white"
            >
              <span className="text-[10px] leading-none mb-1">+</span>
              <span className="text-sm font-bold leading-none">{item.label}</span>
            </button>
          ))}
        </div>

        {/* Price Display */}
        <div className="flex flex-col items-center justify-center py-2">
          <div
            className={`text-white text-4xl font-bold tracking-tight ${activeTier === 'L' ? 'cursor-pointer select-none' : ''}`}
            onClick={activeTier === 'L' ? () => onPriceRefresh?.(activeTier) : undefined}
          >
            {formattedPrice}
          </div>
          <div className="text-white text-[10px] font-bold tracking-widest mt-1">STOP</div>
        </div>

        {/* Down Adjustments */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: '1.', value: priceSteps.large },
            { label: '0.1', value: priceSteps.mid },
            { label: '.01', value: priceSteps.small }
          ].map((item, idx) => (
            <button
              key={idx}
              onClick={() => onPriceStep?.(-item.value)}
              disabled={activeTier === 'M'}
              className="bg-[#242E42] border border-white/5 rounded-lg py-2 flex flex-col items-center justify-center text-white"
            >
              <span className="text-[10px] leading-none mb-1">-</span>
              <span className="text-sm font-bold leading-none">{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Right: Action Panel */}
      <div className="w-[140px] flex flex-col gap-2">
        {/* Long/Short Toggle */}
        <div className="flex bg-[#1A2234] rounded-full border border-gray-700/50 p-1 w-full">
          <button
            type="button"
            onClick={onSideToggle}
            disabled={positionSide === 'long'}
            className={`flex-1 text-[10px] font-bold tracking-wider py-2 rounded-full ${
              positionSide === 'long'
                ? 'bg-[#25D366] text-[#0A101C] shadow-[0_0_10px_rgba(37,211,102,0.3)]'
                : 'text-white'
            }`}
          >
            LONG
          </button>
          <button
            type="button"
            onClick={onSideToggle}
            disabled={positionSide === 'short'}
            className={`flex-1 text-[10px] font-bold tracking-wider py-2 rounded-full ${
              positionSide === 'short'
                ? 'bg-[#FF4B4B] text-white'
                : 'text-white'
            }`}
          >
            SHORT
          </button>
        </div>

        {/* GO Button with inline SL/TP buttons */}
        <div className="flex gap-2 flex-1">
          {/* Secondary Actions Column */}
          <div className="flex flex-col space-y-2 w-12">
            {/* Top button: TP for LONG, SL for SHORT */}
            <button
              type="button"
              onClick={positionSide === 'long' ? onToggleTp : onToggleSl}
              className={`flex-1 rounded-xl border font-bold text-sm transition-colors ${
                positionSide === 'long'
                  ? tpActive
                    ? 'bg-[#25D366]/20 border-[#25D366] text-white'
                    : 'bg-[#1A2234] text-white border-gray-700/50 hover:bg-[#25D366]/20'
                  : slActive
                    ? 'bg-[#FF4B4B]/20 border-[#FF4B4B] text-white'
                    : 'bg-[#1A2234] text-white border-gray-700/50 hover:bg-[#FF4B4B]/20'
              }`}
            >
              {positionSide === 'long' ? 'TP' : 'SL'}
            </button>
            {/* Bottom button: SL for LONG, TP for SHORT */}
            <button
              type="button"
              onClick={positionSide === 'long' ? onToggleSl : onToggleTp}
              className={`flex-1 rounded-xl border font-bold text-sm transition-colors ${
                positionSide === 'long'
                  ? slActive
                    ? 'bg-[#FF4B4B]/20 border-[#FF4B4B] text-white'
                    : 'bg-[#1A2234] text-white border-gray-700/50 hover:bg-[#FF4B4B]/20'
                  : tpActive
                    ? 'bg-[#25D366]/20 border-[#25D366] text-white'
                    : 'bg-[#1A2234] text-white border-gray-700/50 hover:bg-[#25D366]/20'
              }`}
            >
              {positionSide === 'long' ? 'SL' : 'TP'}
            </button>
          </div>

          {/* GO Button */}
          <button
            type="button"
            onClick={() => (positionSide === 'long' ? onBuy() : onSell())}
            disabled={!canTrade || isSubmitting}
            className={`flex-1 rounded-2xl flex flex-col items-center justify-center shadow-[0_0_30px_rgba(37,211,102,0.3)] border border-[#25D366]/50 relative overflow-hidden disabled:opacity-40 disabled:cursor-not-allowed ${
              positionSide === 'long'
                ? 'bg-[#25D366] hover:bg-[#20b858]'
                : 'bg-[#FF4B4B]'
            }`}
          >
            <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent pointer-events-none"></div>
            <span className="text-white text-xl font-bold leading-tight drop-shadow-md">GO</span>
            <span className="text-white text-xl font-bold leading-tight drop-shadow-md">
              {positionSide === 'long' ? 'LONG' : 'SHORT'}
            </span>
          </button>
        </div>
      </div>
    </section>
  );
};