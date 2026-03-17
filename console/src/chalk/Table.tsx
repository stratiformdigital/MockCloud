import { useState, useMemo, type ReactNode } from 'react';
import { ChalkSpinner } from './Spinner';

export function ChalkTable<T>({ items, columnDefinitions, header, filter, empty, loading, loadingText, sortingDisabled, variant, stickyHeader }: {
  items: T[];
  columnDefinitions: { id?: string; header: ReactNode; cell: (item: T) => ReactNode; sortingField?: string; width?: number }[];
  header?: ReactNode;
  filter?: ReactNode;
  empty?: ReactNode;
  loading?: boolean;
  loadingText?: string;
  sortingDisabled?: boolean;
  variant?: string;
  stickyHeader?: boolean;
}) {
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);

  const sorted = useMemo(() => {
    if (!sortField || sortingDisabled) return items;
    return [...items].sort((a, b) => {
      const av = (a as Record<string, unknown>)[sortField];
      const bv = (b as Record<string, unknown>)[sortField];
      if (av == null && bv == null) return 0;
      if (av == null) return sortAsc ? -1 : 1;
      if (bv == null) return sortAsc ? 1 : -1;
      const cmp = String(av).localeCompare(String(bv));
      return sortAsc ? cmp : -cmp;
    });
  }, [items, sortField, sortAsc, sortingDisabled]);

  const handleSort = (field?: string) => {
    if (!field || sortingDisabled) return;
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(true); }
  };

  return (
    <div>
      {header}
      {filter && <div className="chalk-table-filter">{filter}</div>}
      {loading ? (
        <div className="chalk-table-loading">
          <ChalkSpinner /> {loadingText || 'Loading...'}
        </div>
      ) : items.length === 0 && empty ? (
        <div className="chalk-table-empty">{empty}</div>
      ) : (
        <table className="chalk-table">
          <thead>
            <tr>
              {columnDefinitions.map((col, i) => (
                <th
                  key={col.id || i}
                  onClick={() => handleSort(col.sortingField)}
                  className={col.sortingField && !sortingDisabled ? 'sortable' : undefined}
                  style={col.width ? { width: col.width } : undefined}
                >
                  {col.header}
                  {col.sortingField && sortField === col.sortingField && (
                    <span className="chalk-table-sort-indicator">{sortAsc ? '\u25B2' : '\u25BC'}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((item, ri) => (
              <tr key={ri}>
                {columnDefinitions.map((col, ci) => (
                  <td key={col.id || ci}>
                    {col.cell(item)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
