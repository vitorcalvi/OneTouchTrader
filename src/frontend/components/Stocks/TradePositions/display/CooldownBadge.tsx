import React, { useEffect, useState, useRef } from 'react';

interface Props {
  duration: number; // milliseconds
  onComplete?: () => void;
}

/**
 * Cooldown badge with countdown ring animation
 * Displays an orange dot with circular progress indicator
 */
export const CooldownBadge: React.FC<Props> = ({ duration, onComplete }) => {
  const [remaining, setRemaining] = useState(duration);
  // FIX #26: Use ref to store onComplete to avoid recreating effect on every callback change
  const onCompleteRef = useRef(onComplete);
  
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    setRemaining(duration);

    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const left = Math.max(0, duration - elapsed);
      
      setRemaining(left);

      if (left === 0) {
        clearInterval(interval);
        // Call via ref to avoid dependency on onComplete
        onCompleteRef.current?.();
      }
    }, 100);

    return () => clearInterval(interval);
  }, [duration]); // Only depend on duration, not onComplete

  const progress = (remaining / duration) * 100;
  const seconds = Math.ceil(remaining / 1000);

  return (
    <div className="relative inline-flex items-center justify-center w-5 h-5">
      {/* Background circle */}
      <svg className="absolute inset-0 w-full h-full -rotate-90" role="img" aria-label={`Cooldown: ${seconds}s remaining`}>
        <title>Cooldown timer</title>
        <circle
          cx="10"
          cy="10"
          r="8"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
          className="text-[var(--color-warning)] opacity-30"
        />
        {/* Progress ring */}
        <circle
          cx="10"
          cy="10"
          r="8"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
          strokeDasharray={`${2 * Math.PI * 8}`}
          strokeDashoffset={`${2 * Math.PI * 8 * (1 - progress / 100)}`}
          className="text-[var(--color-warning)] transition-all duration-100"
          style={{ strokeLinecap: 'round' }}
        />
      </svg>
      {/* Center dot */}
      <div className="absolute w-2 h-2 bg-[var(--color-warning)] rounded-full animate-pulse" />
      {/* Countdown text */}
      <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[9px] font-bold text-[var(--color-warning-light)] whitespace-nowrap">
        {seconds}s
      </div>
    </div>
  );
};
