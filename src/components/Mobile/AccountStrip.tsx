import type { Account } from '@/types';

interface AccountStripProps {
  account?: Account | null;
}

export function AccountStrip({ account }: AccountStripProps) {
  const equity = account?.equity ? parseFloat(account.equity) : 0;
  const buyingPower = account?.buying_power ? parseFloat(account.buying_power) : 0;
  const lastEquity = account?.last_equity ? parseFloat(account.last_equity) : equity;
  const dayPl = equity - lastEquity;

  return (
    <div className="h-[28px] px-4 bg-gray-900 border-b border-gray-800 flex items-center justify-between text-[10px] font-mono">
      <span className="text-gray-400">
        EQ <span className="text-white">${equity.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
      </span>
      <span className="text-gray-400">
        BP <span className="text-white">${buyingPower.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
      </span>
      <span className="text-gray-400">
        Day P&L <span className={dayPl >= 0 ? 'text-green-500' : 'text-red-500'}>
          ${dayPl >= 0 ? '+' : ''}{dayPl.toFixed(2)}
        </span>
      </span>
    </div>
  );
}