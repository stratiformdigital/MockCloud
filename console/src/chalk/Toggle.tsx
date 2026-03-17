import type { ReactNode } from 'react';

export function ChalkToggle({ checked, onChange, disabled, children }: {
  checked: boolean;
  onChange: (detail: { detail: { checked: boolean } }) => void;
  disabled?: boolean;
  children?: ReactNode;
}) {
  return (
    <label className={`chalk-toggle${disabled ? ' chalk-toggle-disabled' : ''}`}>
      <span
        onClick={() => { if (!disabled) onChange({ detail: { checked: !checked } }); }}
        className={`chalk-toggle-track${checked ? ' checked' : ''}`}
      >
        <span className={`chalk-toggle-knob${checked ? ' checked' : ''}`} />
      </span>
      {children && <span className="chalk-toggle-label">{children}</span>}
    </label>
  );
}
