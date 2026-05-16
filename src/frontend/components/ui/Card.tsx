import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  animate?: boolean;
}

interface CardHeaderProps {
  children?: React.ReactNode;
  className?: string;
  icon?: React.ReactNode;
  title: React.ReactNode;
  titleClassName?: string;
  onToggle?: () => void;
  isExpanded?: boolean;
  rightContent?: React.ReactNode;
}

interface CardBodyProps {
  children: React.ReactNode;
  className?: string;
}

const Card: React.FC<CardProps> & {
  Header: typeof CardHeader;
  Body: typeof CardBody;
} = ({ children, className = '', animate = true }) => {
  return (
    <div
      className={`
        bg-background
        border 
        border-border
        shadow-2xl 
        rounded-xl
        overflow-hidden 
        ${animate ? 'animate-[fadeIn_0.3s_ease-out]' : ''}
        ${className}
      `}
    >
      {children}
    </div>
  );
};

const CardHeader: React.FC<CardHeaderProps> = ({
  children,
  className = '',
  icon,
  title,
  titleClassName = '',
  onToggle,
  isExpanded,
  rightContent,
}) => {
  const headerContent = (
    <div
      className={`
        bg-background
        px-4 
        py-3 
        flex 
        items-center 
        justify-between 
        border-b 
        border-border
        ${className}
      `}
    >
      <button
        type="button"
        className="flex items-center space-x-2 cursor-pointer group"
        onClick={onToggle}
        aria-expanded={isExpanded !== undefined ? isExpanded : undefined}
      >
        {icon && (
          <span className="text-info-light group-hover:scale-110 transition-transform">
            {icon}
          </span>
        )}
        <h3
          className={`
            text-primary
            font-bold 
            uppercase 
            tracking-wider 
            text-xs
            ${titleClassName}
          `}
        >
          {title}
        </h3>
        {isExpanded !== undefined && (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`text-muted transition-transform duration-200 ${
              isExpanded ? 'rotate-180' : ''
            }`}
            aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        )}
      </button>
      {rightContent && <div className="flex items-center space-x-2">{rightContent}</div>}
    </div>
  );

  return children !== undefined ? (
    <>
      {headerContent}
      {children}
    </>
  ) : (
    headerContent
  );
};

const CardBody: React.FC<CardBodyProps> = ({ children, className = '' }) => {
  return (
    <div
      className={`
        p-4
        ${className}
      `}
    >
      {children}
    </div>
  );
};

Card.Header = CardHeader;
Card.Body = CardBody;

export { Card };
export default Card;
