import type { CSSProperties, ReactNode } from 'react';

export function ChalkKeyValuePairs({ items, columns }: {
  items: { label: ReactNode; value: ReactNode }[];
  columns?: number;
}) {
  return (
    <div className="chalk-kv" style={columns ? { '--cols': columns } as CSSProperties : undefined}>
      {items.map((item, i) => (
        <div key={i}>
          <div className="chalk-kv-label">{item.label}</div>
          <div className="chalk-kv-value">{item.value}</div>
        </div>
      ))}
    </div>
  );
}
