import React, { type ReactNode } from 'react';

export function ChalkLink({ href, onFollow, variant, external, children, fontSize, color }: {
  href?: string;
  onFollow?: (e: React.MouseEvent) => void;
  variant?: string;
  external?: boolean;
  children: ReactNode;
  fontSize?: string | number;
  color?: string;
}) {
  return (
    <a
      href={href || '#'}
      onClick={(e) => {
        if (onFollow) { e.preventDefault(); onFollow(e); }
      }}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      className={`chalk-link${variant === 'info' ? ' chalk-link-info' : ''}`}
      style={color || fontSize ? { color: color || undefined, fontSize: fontSize || undefined } : undefined}
    >
      {children}
      {external && <span className="chalk-link-external-icon">{'\u2197'}</span>}
    </a>
  );
}
