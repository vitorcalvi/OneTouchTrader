import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  resetOnPropsChange?: boolean;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  private resetTimeoutId: NodeJS.Timeout | null = null;

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    this.setState({
      error,
      errorInfo
    });

    // Call optional error handler
    this.props.onError?.(error, errorInfo);

    // Auto-reset after 5 seconds for recoverable errors only
    const RECOVERABLE_ERROR_PATTERNS = [
      /network request failed/i,
      /fetch failed/i,
      /failed to fetch/i,
      /load chunk/i,
    ];
    const isRecoverable = RECOVERABLE_ERROR_PATTERNS.some(p => p.test(error.message));
    if (isRecoverable) {
      this.resetTimeoutId = setTimeout(() => {
        this.handleReset();
      }, 5000);
    }
  }

  componentWillUnmount() {
    if (this.resetTimeoutId) {
      clearTimeout(this.resetTimeoutId);
    }
  }

  componentDidUpdate(prevProps: Props) {
    if (this.props.resetOnPropsChange && prevProps.children !== this.props.children) {
      this.handleReset();
    }
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <div className="min-h-[400px] flex items-center justify-center bg-gray-900 border border-red-500/20 rounded-lg">
          <div className="text-center p-6 max-w-md">
            <AlertTriangle className="mx-auto h-12 w-12 text-red-400 mb-4" />
            <h2 className="text-lg font-bold text-white mb-2">
              Component Error
            </h2>
            <p className="text-gray-400 text-sm mb-4">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            
            <div className="space-y-3">
              <button
                onClick={this.handleReset}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/40 rounded-lg text-blue-300 text-sm font-medium transition-colors"
              >
                <RefreshCw size={14} />
                Try Again
              </button>
              
              <details className="text-left">
                <summary className="cursor-pointer text-gray-500 text-xs hover:text-gray-400">
                  Error Details
                </summary>
                <div className="mt-2 p-3 bg-gray-800 rounded border text-xs font-mono text-gray-300 overflow-auto max-h-32">
                  <div className="text-red-400 mb-2">
                    {this.state.error?.name}: {this.state.error?.message}
                  </div>
                  {this.state.errorInfo?.componentStack && (
                    <div className="text-gray-500">
                      {this.state.errorInfo.componentStack}
                    </div>
                  )}
                </div>
              </details>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Higher-order component for easier usage
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Omit<Props, 'children'>
) {
  return function WithErrorBoundaryComponent(props: P) {
    return (
      <ErrorBoundary {...errorBoundaryProps}>
        <Component {...props} />
      </ErrorBoundary>
    );
  };
}

// Hook for manual error handling
export function useErrorHandler() {
  const reportError = React.useCallback((error: Error, errorInfo?: string) => {
    console.error('Manual error report:', error, errorInfo);
    // You can send errors to a logging service here
  }, []);

  const wrapAsyncFunction = React.useCallback(<T extends any[], R>(
    fn: (...args: T) => Promise<R>
  ) => {
    return async (...args: T): Promise<R | null> => {
      try {
        return await fn(...args);
      } catch (error) {
        reportError(error as Error, 'Async function error');
        return null;
      }
    };
  }, [reportError]);

  return { reportError, wrapAsyncFunction };
}
