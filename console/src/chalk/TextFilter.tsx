export function ChalkTextFilter({ filteringText, filteringPlaceholder, onChange, countText }: {
  filteringText: string;
  filteringPlaceholder?: string;
  onChange: (detail: { detail: { filteringText: string } }) => void;
  countText?: string;
}) {
  return (
    <div className="chalk-filter">
      <span className="chalk-filter-icon">
        {'\uD83D\uDD0D'}
      </span>
      <input
        value={filteringText}
        onChange={(e) => onChange({ detail: { filteringText: e.target.value } })}
        placeholder={filteringPlaceholder || 'Filter...'}
        className="chalk-filter-input"
      />
      {countText && (
        <span className="chalk-filter-count">
          {countText}
        </span>
      )}
    </div>
  );
}
