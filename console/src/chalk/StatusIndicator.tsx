import type { ReactNode } from 'react';
import { ChalkSpinner } from './Spinner';

export function ChalkStatusIndicator({ type, children }: {
  type: 'success' | 'error' | 'warning' | 'info' | 'loading' | 'stopped' | 'pending' | 'in-progress';
  children: ReactNode;
}) {
  const symbols: Record<string, string> = {
    success: '\u25CF',
    error: '\u25CF',
    warning: '\u25CF',
    info: '\u25CF',
    loading: '\u25CB',
    stopped: '\u25CF',
    pending: '\u25CB',
    'in-progress': '\u25CB',
  };
  return (
    <span className={`chalk-status chalk-status-${type}`}>
      <span className="chalk-status-dot">
        {type === 'loading' ? <ChalkSpinner /> : symbols[type] || '\u25CF'}
      </span>
      {children}
    </span>
  );
}
