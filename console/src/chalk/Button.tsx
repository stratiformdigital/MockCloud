import React, { type ReactNode } from 'react';

export function ChalkButton({ variant = 'normal', onClick, disabled, loading, iconName, children, href }: {
  variant?: 'primary' | 'link' | 'inline-link' | 'icon' | 'normal';
  onClick?: (e: React.MouseEvent) => void;
  disabled?: boolean;
  loading?: boolean;
  iconName?: string;
  children?: ReactNode;
  href?: string;
}) {
  const isDisabled = disabled || loading;
  const icons: Record<string, string> = {
    refresh: '\u21BB',
    add: '+',
    remove: '\u2212',
    close: '\u2715',
    copy: '\u2398',
    download: '\u2913',
    upload: '\u2912',
    edit: '\u270E',
    delete: '\u2716',
    search: '\uD83D\uDD0D',
    settings: '\u2699',
    external: '\u2197',
  };
  const icon = iconName ? icons[iconName] || iconName : null;

  if (variant === 'link' || variant === 'inline-link') {
    return (
      <button
        onClick={onClick}
        disabled={isDisabled}
        className={`chalk-btn chalk-btn-${variant}`}
      >
        {icon && <span className="chalk-btn-icon-text-link">{icon}</span>}
        {children}
      </button>
    );
  }

  if (variant === 'icon') {
    return (
      <button
        onClick={onClick}
        disabled={isDisabled}
        className="chalk-btn chalk-btn-icon"
      >
        {icon || children}
      </button>
    );
  }

  const className = `chalk-btn${variant === 'primary' ? ' chalk-btn-primary' : ''}`;
  return (
    <button
      onClick={onClick}
      disabled={isDisabled}
      className={className}
    >
      {icon && <span className="chalk-btn-icon-text">{icon}</span>}
      {children}
    </button>
  );
}
