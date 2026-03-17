export function ChalkSelect({ selectedOption, onChange, options, placeholder, disabled }: {
  selectedOption: { value: string; label?: string } | null;
  onChange: (detail: { detail: { selectedOption: { value: string; label: string } } }) => void;
  options: { value: string; label?: string }[];
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <select
      value={selectedOption?.value || ''}
      disabled={disabled}
      onChange={(e) => {
        const opt = options.find((o) => o.value === e.target.value);
        if (opt) onChange({ detail: { selectedOption: { value: opt.value, label: opt.label || opt.value } } });
      }}
      className="chalk-select"
    >
      {placeholder && <option value="" disabled>{placeholder}</option>}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label || opt.value}
        </option>
      ))}
    </select>
  );
}
