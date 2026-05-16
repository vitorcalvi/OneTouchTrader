import React, { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';

export interface CollapsibleProps {
  title: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
  persistKey?: string;
  className?: string;
  triggerClassName?: string;
  contentClassName?: string;
  icon?: React.ReactNode;
}

const readPersistedOpen = (_persistKey: string): boolean | undefined => {
  // Persistence removed - always use defaultOpen
  return undefined;
};

const writePersistedOpen = (_persistKey: string, _open: boolean) => {
  // Persistence removed
};

export const Collapsible: React.FC<CollapsibleProps> = ({
  title,
  children,
  defaultOpen = false,
  open,
  onOpenChange,
  disabled = false,
  persistKey,
  className = '',
  triggerClassName = '',
  contentClassName = '',
  icon,
}) => {
  const contentId = useId();
  const buttonId = useId();

  const isControlled = typeof open === 'boolean';

  const [uncontrolledOpen, setUncontrolledOpen] = useState<boolean>(() => {
    if (persistKey) {
      const persisted = readPersistedOpen(persistKey);
      if (typeof persisted === 'boolean') return persisted;
    }
    return defaultOpen;
  });

  useEffect(() => {
    if (!persistKey) return;
    const persisted = readPersistedOpen(persistKey);
    if (typeof persisted !== 'boolean') return;
    if (isControlled) return;
    setUncontrolledOpen(persisted);
  }, [persistKey, isControlled]);

  const isOpen = isControlled ? (open as boolean) : uncontrolledOpen;

  const setOpen = useCallback(
    (next: boolean) => {
      onOpenChange?.(next);
      if (!isControlled) setUncontrolledOpen(next);
      if (persistKey) writePersistedOpen(persistKey, next);
    },
    [isControlled, onOpenChange, persistKey]
  );

  const toggle = useCallback(() => {
    if (disabled) return;
    setOpen(!isOpen);
  }, [disabled, isOpen, setOpen]);

  const contentAriaHidden = useMemo(() => (!isOpen ? true : undefined), [isOpen]);

  return (
    <section className={className}>
      <button
        id={buttonId}
        type="button"
        onClick={toggle}
        disabled={disabled}
        aria-expanded={isOpen}
        aria-controls={contentId}
        className={`
          w-full 
          flex 
          items-center 
          justify-between 
          gap-3 
          cursor-pointer
          group
          disabled:opacity-50 
          disabled:cursor-not-allowed
          ${triggerClassName}
        `}
      >
        <span className="flex items-center gap-2 min-w-0">
          {icon && (
            <span className="text-[var(--color-info-light)] group-hover:scale-110 transition-transform shrink-0">
              {icon}
            </span>
          )}
          <span className="truncate">{title}</span>
        </span>
        <ChevronDown
          size={14}
          aria-hidden="true"
          className={`
            text-[var(--color-text-muted)] 
            shrink-0 
            transition-transform 
            duration-200 
            motion-reduce:transition-none 
            ${isOpen ? 'rotate-180' : 'rotate-0'}
          `}
        />
      </button>

      <div
        id={contentId}
        role="region"
        aria-labelledby={buttonId}
        aria-hidden={contentAriaHidden}
        className={`
          grid 
          transition-[grid-template-rows,opacity] 
          duration-300 
          ease-in-out 
          motion-reduce:transition-none 
          ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}
          ${contentClassName}
        `}
      >
        <div className="overflow-hidden min-h-0">{children}</div>
      </div>
    </section>
  );
};
