import type { CSSProperties, ReactNode } from 'react';

export function ChalkColumnLayout({ columns, children, borders, variant }: {
  columns: number;
  children: ReactNode;
  borders?: string;
  variant?: string;
}) {
  return (
    <div className="chalk-column-layout" style={{ '--cols': columns } as CSSProperties}>
      {children}
    </div>
  );
}
