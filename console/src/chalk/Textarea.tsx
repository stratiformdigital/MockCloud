export function ChalkTextarea({ value, onChange, rows, placeholder, disabled }: {
  value: string;
  onChange: (detail: { detail: { value: string } }) => void;
  rows?: number;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange({ detail: { value: e.target.value } })}
      rows={rows || 4}
      placeholder={placeholder}
      disabled={disabled}
      className="chalk-textarea"
    />
  );
}
