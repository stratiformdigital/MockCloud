import { useState, type ReactNode } from 'react';

export function ChalkExpandableSection({ headerText, defaultExpanded, expanded: controlledExpanded, onChange, variant, children }: {
  headerText: ReactNode;
  defaultExpanded?: boolean;
  expanded?: boolean;
  onChange?: (detail: { detail: { expanded: boolean } }) => void;
  variant?: string;
  children: ReactNode;
}) {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded || false);
  const expanded = controlledExpanded ?? internalExpanded;
  return (
    <div className="chalk-expandable">
      <button
        onClick={() => {
          const next = !expanded;
          setInternalExpanded(next);
          onChange?.({ detail: { expanded: next } });
        }}
        className="chalk-expandable-trigger"
      >
        <span className={`chalk-expandable-arrow${expanded ? ' expanded' : ''}`}>
          {'\u25B6'}
        </span>
        {headerText}
      </button>
      {expanded && <div className="chalk-expandable-content">{children}</div>}
    </div>
  );
}
