import React from 'react';

interface SectionHeaderProps {
  icon?: React.ReactNode;
  title: string;
  badge?: string | number;
  actions?: React.ReactNode;
  className?: string;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  icon,
  title,
  badge,
  actions,
  className = '',
}) => {
  return (
    <div className={`px-4 py-2 border-b border-border flex items-center justify-between ${className}`}>
      <div className="flex items-center gap-2">
        {icon && <span className="text-accent">{icon}</span>}
        <h2 className="text-[10px] font-black uppercase tracking-widest text-muted">
          {title}
        </h2>
        {badge !== undefined && (
          <span className="text-[10px] text-muted font-bold">({badge})</span>
        )}
      </div>
      {actions && <div className="flex items-center gap-1">{actions}</div>}
    </div>
  );
};
