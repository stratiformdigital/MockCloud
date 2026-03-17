import type { ReactNode } from 'react';

export function ChalkCheckbox({ checked, onChange, disabled, children }: {
  checked: boolean;
  onChange: (detail: { detail: { checked: boolean } }) => void;
  disabled?: boolean;
  children?: ReactNode;
}) {
  return (
    <label className={`chalk-checkbox${disabled ? ' disabled' : ''}`}>
      <span
        onClick={() => { if (!disabled) onChange({ detail: { checked: !checked } }); }}
        className={`chalk-checkbox-box${checked ? ' checked' : ''}`}
      >
        {checked && '\u2713'}
      </span>
      {children && <span className="chalk-checkbox-label">{children}</span>}
    </label>
  );
}
