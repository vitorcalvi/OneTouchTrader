import React, { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (quantity: number) => void;
  symbol: string;
  defaultQuantity?: number;
}

/**
 * Modal dialog for entering custom quantity override
 */
export const QuantityDialog: React.FC<Props> = ({
  isOpen,
  onClose,
  onConfirm,
  symbol,
  defaultQuantity = 1
}) => {
  const [quantity, setQuantity] = useState(defaultQuantity);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuantity(defaultQuantity);
      // Focus input after a brief delay to ensure modal is rendered
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, defaultQuantity]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (quantity > 0) {
      onConfirm(quantity);
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="quantity-dialog-title"
    >
      <div 
        className="bg-[var(--color-bg-secondary)] border border-[var(--color-info-border)] rounded-3xl shadow-2xl p-6 max-w-sm w-full mx-4 animate-[slideUp_0.3s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h3 id="quantity-dialog-title" className="text-lg font-black text-[var(--color-text-primary)] uppercase tracking-tight">Override Quantity</h3>
          <button
            onClick={onClose}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors p-2 hover:bg-[var(--color-bg-hover)] rounded-lg"
            aria-label="Close dialog"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-6">
            <label htmlFor="quantity-input" className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">
              Shares of {symbol}
            </label>
            <input
              id="quantity-input"
              ref={inputRef}
              type="number"
              min="1"
              step="1"
              value={quantity}
              onChange={(e) => {
                const next = Number(e.target.value);
                setQuantity(Number.isFinite(next) ? next : 0);
              }}
              onKeyDown={handleKeyDown}
              className="w-full bg-[var(--color-bg-primary)] border-2 border-[var(--color-border-default)] rounded-2xl px-4 py-4 text-[var(--color-text-primary)] text-center text-3xl font-mono font-black focus:outline-none focus:border-[var(--color-info-light)] transition-colors"
              aria-label="Quantity"
            />
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 bg-[var(--color-bg-secondary)] hover:bg-[var(--color-bg-hover)] border border-[var(--color-border-default)] hover:border-[var(--color-border-muted)] text-[var(--color-text-secondary)] font-black text-sm uppercase tracking-wide rounded-2xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-3 bg-[var(--color-info)] hover:bg-[var(--color-info-light)] text-[var(--color-text-primary)] font-black text-sm uppercase tracking-wide rounded-2xl transition-colors shadow-lg shadow-[var(--color-info-border)]"
            >
              Confirm
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
