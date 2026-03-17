import type { ReactNode } from 'react';

export function ChalkContainer({ header, children, footer }: {
  header?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="chalk-container">
      {header && (
        <div className="chalk-container-header">
          {header}
        </div>
      )}
      <div className="chalk-container-body">{children}</div>
      {footer && (
        <div className="chalk-container-footer">
          {footer}
        </div>
      )}
    </div>
  );
}
