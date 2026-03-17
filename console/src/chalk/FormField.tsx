import type { ReactNode } from 'react';

export function ChalkFormField({ label, description, errorText, secondaryControl, children }: {
  label: ReactNode;
  description?: ReactNode;
  errorText?: ReactNode;
  secondaryControl?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="chalk-form-field">
      <div className="chalk-form-field-header">
        <label className="chalk-form-label">
          {label}
        </label>
        {secondaryControl}
      </div>
      {description && (
        <div className="chalk-form-desc">{description}</div>
      )}
      {children}
      {errorText && (
        <div className="chalk-form-error">{errorText}</div>
      )}
    </div>
  );
}
