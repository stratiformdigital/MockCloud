export function ChalkInput({ value, onChange, placeholder, type, disabled, readOnly }: {
  value: string;
  onChange: (detail: { detail: { value: string } }) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
  readOnly?: boolean;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange({ detail: { value: e.target.value } })}
      placeholder={placeholder}
      type={type}
      disabled={disabled}
      readOnly={readOnly}
      className="chalk-input"
    />
  );
}
