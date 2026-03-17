import type { ReactNode } from 'react';

export function ChalkSpaceBetween({ size = 'm', direction = 'vertical', children, alignItems }: {
  size?: 'xs' | 's' | 'm' | 'l';
  direction?: 'vertical' | 'horizontal';
  alignItems?: string;
  children: ReactNode;
}) {
  const alignClass = alignItems === 'center' ? ' chalk-space-between-align-center' : '';
  const needsInline = alignItems && alignItems !== 'center';
  return (
    <div
      className={`chalk-space-between chalk-space-between-${direction} chalk-space-${size}${alignClass}`}
      style={needsInline ? { alignItems } : undefined}
    >
      {children}
    </div>
  );
}
