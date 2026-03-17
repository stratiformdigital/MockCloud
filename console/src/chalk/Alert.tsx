import type { ReactNode } from 'react';

export function ChalkAlert({ type = 'info', header, dismissible, onDismiss, children }: {
  type?: 'info' | 'error' | 'warning' | 'success';
  header?: ReactNode;
  dismissible?: boolean;
  onDismiss?: () => void;
  children: ReactNode;
}) {
  return (
    <div className={`chalk-alert chalk-alert-${type}`}>
      <div className="chalk-alert-inner">
        <div>
          {header && (
            <div className="chalk-alert-header">{header}</div>
          )}
          <div className="chalk-alert-body">{children}</div>
        </div>
        {dismissible && (
          <button onClick={onDismiss} className="chalk-alert-dismiss">
            {'\u2715'}
          </button>
        )}
      </div>
    </div>
  );
}
