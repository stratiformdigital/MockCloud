import { useState, useMemo } from 'react';

export function useChalkCollection<T>(
  items: T[],
  opts: {
    filtering?: {
      filteringFunction?: (item: T, filteringText: string) => boolean;
    };
    sorting?: {
      defaultState?: { sortingColumn: { sortingField: string }; isDescending?: boolean };
    };
    pagination?: { pageSize?: number };
  } = {},
) {
  const [filteringText, setFilteringText] = useState('');
  const [sortField, setSortField] = useState(opts.sorting?.defaultState?.sortingColumn?.sortingField || '');
  const [sortDesc, setSortDesc] = useState(opts.sorting?.defaultState?.isDescending || false);
  const [currentPage, setCurrentPage] = useState(1);

  const filtered = useMemo(() => {
    if (!filteringText || !opts.filtering?.filteringFunction) return items;
    return items.filter((item) => opts.filtering!.filteringFunction!(item, filteringText));
  }, [items, filteringText, opts.filtering]);

  const sorted = useMemo(() => {
    if (!sortField) return filtered;
    return [...filtered].sort((a, b) => {
      const av = (a as Record<string, unknown>)[sortField];
      const bv = (b as Record<string, unknown>)[sortField];
      if (av == null && bv == null) return 0;
      if (av == null) return sortDesc ? 1 : -1;
      if (bv == null) return sortDesc ? -1 : 1;
      const cmp = String(av).localeCompare(String(bv));
      return sortDesc ? -cmp : cmp;
    });
  }, [filtered, sortField, sortDesc]);

  const pageSize = opts.pagination?.pageSize || sorted.length;
  const pagesCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const paged = pageSize < sorted.length
    ? sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize)
    : sorted;

  return {
    items: paged,
    filteredItemsCount: filtered.length,
    filterProps: {
      filteringText,
      onChange: ({ detail }: { detail: { filteringText: string } }) => {
        setFilteringText(detail.filteringText);
        setCurrentPage(1);
      },
    },
    sortingProps: {
      sortField,
      sortDesc,
      onSort: (field: string) => {
        if (sortField === field) setSortDesc(!sortDesc);
        else { setSortField(field); setSortDesc(false); }
      },
    },
    paginationProps: {
      currentPageIndex: currentPage,
      pagesCount,
      onChange: ({ detail }: { detail: { currentPageIndex: number } }) => setCurrentPage(detail.currentPageIndex),
    },
    collectionProps: {},
  };
}
