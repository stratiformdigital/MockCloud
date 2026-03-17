import type { ReactNode } from 'react';

export function ChalkModal({ visible, onDismiss, header, footer, size, children }: {
  visible: boolean;
  onDismiss: () => void;
  header?: ReactNode;
  footer?: ReactNode;
  size?: 'small' | 'medium' | 'large' | 'max';
  children: ReactNode;
}) {
  if (!visible) return null;
  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onDismiss(); }}
      className="chalk-modal-overlay"
    >
      <div className={`chalk-modal-box chalk-modal-${size || 'medium'}`}>
        {header && (
          <div className="chalk-modal-header">
            <div className="chalk-modal-title">
              {header}
            </div>
            <button onClick={onDismiss} className="chalk-modal-close">
              {'\u2715'}
            </button>
          </div>
        )}
        <div className="chalk-modal-body">{children}</div>
        {footer && (
          <div className="chalk-modal-footer">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
