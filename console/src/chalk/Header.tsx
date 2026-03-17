import type { ReactNode } from 'react';

export function ChalkHeader({ variant = 'h1', counter, actions, children, description }: {
  variant?: 'h1' | 'h2' | 'h3';
  counter?: string;
  actions?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}) {
  const Tag = variant;
  return (
    <div className="chalk-header">
      <div className="chalk-header-row">
        <Tag className={`chalk-header-${variant}`}>
          {children}
          {counter && (
            <span className="chalk-header-counter">
              {counter}
            </span>
          )}
        </Tag>
        {actions && <div className="chalk-header-actions">{actions}</div>}
      </div>
      {description && (
        <div className="chalk-header-description">{description}</div>
      )}
    </div>
  );
}
