import React from 'react';

type BadgeVariant = 'long' | 'short' | 'info' | 'warning' | 'success' | 'error' | 'neutral';
type BadgeSize = 'xs' | 'sm' | 'md';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: BadgeSize;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  long: 'bg-bull-bg text-bull-light border-bull-border',
  short: 'bg-bear-bg text-bear-light border-bear-border',
  info: 'bg-info-bg text-info-light border-info-border',
  warning: 'bg-warning-bg text-warning-light border-border',
  success: 'bg-success-bg text-success-light border-success-border',
  error: 'bg-danger-bg text-danger-light border-danger-border',
  neutral: 'bg-surface text-muted border-border',
};

const sizeStyles: Record<BadgeSize, string> = {
  xs: 'text-[9px] px-1.5 py-0.5',
  sm: 'text-[10px] px-2 py-0.5',
  md: 'text-xs px-2 py-1',
};

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'neutral',
  size = 'xs',
  className = '',
}) => {
  return (
    <span
      className={`
        inline-flex
        items-center
        justify-center
        font-black
        uppercase
        rounded-md
        border
        tracking-wide
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${className}
      `}
    >
      {children}
    </span>
  );
};

export default Badge;
