import React from 'react';

type ButtonVariant = 'primary' | 'success' | 'danger' | 'warning' | 'outline' | 'ghost' | 'dimmed' | 'bullish' | 'bearish' | 'secondary';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: `
    bg-accent-light
    text-background
    hover:bg-accent
    shadow-brand
  `,
  success: `
    bg-bull
    text-white 
    hover:bg-bull-light
    shadow-bullish
  `,
  bullish: `
    bg-bull
    text-white 
    hover:bg-bull-light
    shadow-bullish
  `,
  danger: `
    bg-bear
    text-white 
    hover:bg-bear-light
    shadow-bearish
  `,
  bearish: `
    bg-bear
    text-white 
    hover:bg-bear-light
    shadow-bearish
  `,
  warning: `
    bg-warn
    text-white 
    hover:bg-warn-light
    shadow-[0_10px_15px_-3px_rgba(245,158,11,0.2)]
  `,
  outline: `
    bg-transparent 
    border 
    border-border 
    text-secondary
    hover:bg-white/5
    hover:border-muted
    hover:text-primary
  `,
  ghost: `
    bg-transparent
    text-muted
    hover:bg-white/5
    hover:text-primary
  `,
  secondary: `
    bg-surface
    text-secondary
    border-border
    hover:bg-card
    hover:text-primary
  `,
  dimmed: `
    bg-surface
    text-muted 
    border-border
    opacity-60 
    grayscale
  `,
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs rounded-lg',
  md: 'px-4 py-2.5 text-sm rounded-xl',
  lg: 'px-6 py-4 text-base rounded-2xl',
};

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  loading = false,
  icon,
  iconPosition = 'left',
  className = '',
  disabled,
  ...props
}) => {
  const isDisabled = disabled || loading;

  return (
    <button
      className={`
        inline-flex
        items-center
        justify-center
        gap-2
        font-bold
        transition-all
        duration-200
        ease-out
        cursor-pointer
        active:scale-[0.98]
        disabled:opacity-50
        disabled:cursor-not-allowed
        focus:outline-none
        focus:ring-2
        focus:ring-accent
        focus:ring-offset-2
        focus:ring-offset-background
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${fullWidth ? 'w-full' : ''}
        ${className}
      `}
      disabled={isDisabled}
      {...props}
    >
      {loading && (
        <svg
          className="animate-spin h-4 w-4"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      )}
      {icon && iconPosition === 'left' && !loading && (
        <span className="shrink-0">{icon}</span>
      )}
      {children}
      {icon && iconPosition === 'right' && (
        <span className="shrink-0">{icon}</span>
      )}
    </button>
  );
};

export default Button;
