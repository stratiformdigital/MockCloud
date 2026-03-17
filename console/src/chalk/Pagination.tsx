export function ChalkPagination({ currentPageIndex, pagesCount, onChange }: {
  currentPageIndex: number;
  pagesCount: number;
  onChange: (detail: { currentPageIndex: number }) => void;
}) {
  if (pagesCount <= 1) return null;
  return (
    <div className="chalk-pagination">
      <button
        disabled={currentPageIndex <= 1}
        onClick={() => onChange({ currentPageIndex: currentPageIndex - 1 })}
        className="chalk-pagination-btn"
      >
        {'<'}
      </button>
      {Array.from({ length: pagesCount }, (_, i) => i + 1).map((page) => (
        <button
          key={page}
          onClick={() => onChange({ currentPageIndex: page })}
          className={`chalk-pagination-page${page === currentPageIndex ? ' active' : ''}`}
        >
          {page}
        </button>
      ))}
      <button
        disabled={currentPageIndex >= pagesCount}
        onClick={() => onChange({ currentPageIndex: currentPageIndex + 1 })}
        className="chalk-pagination-btn"
      >
        {'>'}
      </button>
    </div>
  );
}
