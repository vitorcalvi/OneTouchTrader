import type { Account } from '@/types';

interface StatusBarProps {
  isPaper: boolean;
  onPaperLiveToggle: (isPaper: boolean) => void;
  account: Account | null;
  paperAvailable?: boolean;
  liveAvailable?: boolean;
  onOpenSettings?: () => void;
}

export function StatusBar({ isPaper, onPaperLiveToggle, account, paperAvailable = true, liveAvailable = true, onOpenSettings }: StatusBarProps) {
  return (
    <header className="flex justify-between items-center mb-1">
      <div className="flex items-center gap-2 text-sm font-semibold text-[#8B99AE]">
        <span>Until Close:</span>
        <span className="text-white text-lg">—</span>
      </div>

      <div className="flex bg-[#1A2234] rounded-full p-1 border border-gray-700/50">
        <button
          onClick={() => !(!paperAvailable) && onPaperLiveToggle(true)}
          disabled={!paperAvailable}
          className={`px-4 py-1.5 rounded-full text-xs font-bold tracking-wide ${
            isPaper ? 'bg-[#FF4B4B] text-white' : 'text-[#8B99AE]'
          }`}
        >
          PAPER
        </button>
        <button
          onClick={() => !(!liveAvailable) && onPaperLiveToggle(false)}
          disabled={!liveAvailable}
          className={`px-4 py-1.5 rounded-full text-xs font-bold tracking-wide ${
            !isPaper ? 'bg-[#FF4B4B] text-white' : 'text-[#8B99AE]'
          }`}
        >
          LIVE
        </button>
      </div>

      <div className="flex items-center gap-2">
        <div className="text-right">
          <div className="text-[#4A90E2] text-[10px] font-bold tracking-wider mb-0.5">POWER</div>
          <div className="text-[#25D366] text-lg font-bold [text-shadow:0_0_10px_rgba(37,211,102,0.3)]">
            ${account ? Math.round(parseFloat(account.equity)).toLocaleString() : '—'}
          </div>
        </div>
        {onOpenSettings && (
          <button
            aria-label="Settings"
            onClick={onOpenSettings}
            className="p-2 text-[#8B99AE] hover:text-white transition-colors"
          >
            <span className="material-symbols-outlined text-xl">settings</span>
          </button>
        )}
      </div>
    </header>
  );
}