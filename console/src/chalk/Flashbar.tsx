import type { ReactNode } from 'react';

export function ChalkFlashbar({ items }: {
  items: { type?: string; content: ReactNode; dismissible?: boolean; onDismiss?: () => void; id?: string }[];
}) {
  if (items.length === 0) return null;
  return (
    <div className="chalk-flashbar">
      {items.map((item, i) => {
        const t = item.type || 'info';
        return (
          <div key={item.id || i} className={`chalk-flash chalk-flash-${t}`}>
            <span>{item.content}</span>
            {item.dismissible && (
              <button onClick={item.onDismiss} className="chalk-flash-dismiss">
                {'\u2715'}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
