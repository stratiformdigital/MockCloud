import React, { type ReactNode } from 'react';

export function ChalkBox({ variant, color, fontSize, fontWeight, textAlign, padding, margin, children, float, display }: {
  variant?: string;
  color?: string;
  fontSize?: string | number;
  fontWeight?: string | number;
  textAlign?: 'left' | 'center' | 'right';
  padding?: string | number | Record<string, string | number>;
  margin?: string | number | Record<string, string | number>;
  float?: string;
  display?: string;
  children?: ReactNode;
}) {
  const variantColors: Record<string, string> = {
    'awsui-key-label': 'var(--chalk-yellow)',
    'awsui-value-large': 'var(--chalk-white)',
    p: 'var(--chalk-white)',
    span: 'var(--chalk-white)',
    small: 'var(--chalk-white)',
  };
  const boxStyle: React.CSSProperties = {
    color: color || (variant ? variantColors[variant] : undefined),
    fontSize: fontSize,
    fontWeight: fontWeight as React.CSSProperties['fontWeight'],
    textAlign,
    float: float as React.CSSProperties['float'],
    display,
  };
  if (padding != null && typeof padding === 'object') {
    Object.entries(padding).forEach(([k, v]) => { (boxStyle as Record<string, unknown>)[`padding${k.charAt(0).toUpperCase()}${k.slice(1)}`] = v; });
  } else {
    boxStyle.padding = padding as string | number | undefined;
  }
  if (margin != null && typeof margin === 'object') {
    Object.entries(margin).forEach(([k, v]) => { (boxStyle as Record<string, unknown>)[`margin${k.charAt(0).toUpperCase()}${k.slice(1)}`] = v; });
  } else {
    boxStyle.margin = margin as string | number | undefined;
  }
  return (
    <div style={boxStyle}>
      {children}
    </div>
  );
}
