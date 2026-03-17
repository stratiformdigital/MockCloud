import type { CSSProperties, ReactNode } from 'react';
import { ChalkSpinner } from './Spinner';

export function ChalkCards<T>({ items, cardDefinition, header, loading, loadingText, empty, cardsPerRow }: {
  items: T[];
  cardDefinition: {
    header?: (item: T) => ReactNode;
    sections?: { id?: string; header?: ReactNode; content?: (item: T) => ReactNode }[];
  };
  header?: ReactNode;
  loading?: boolean;
  loadingText?: string;
  empty?: ReactNode;
  cardsPerRow?: number[];
}) {
  const cols = cardsPerRow?.[0] || 3;
  return (
    <div>
      {header}
      {loading ? (
        <div className="chalk-table-loading">
          <ChalkSpinner /> {loadingText || 'Loading...'}
        </div>
      ) : items.length === 0 && empty ? (
        <div className="chalk-table-empty">{empty}</div>
      ) : (
        <div
          className={`chalk-cards-grid${header ? ' chalk-cards-grid-with-header' : ''}`}
          style={{ '--cols': cols } as CSSProperties}
        >
          {items.map((item, i) => (
            <div key={i} className="chalk-card">
              {cardDefinition.header && (
                <div className="chalk-card-header">
                  {cardDefinition.header(item)}
                </div>
              )}
              {cardDefinition.sections?.map((section, si) => (
                <div key={section.id || si} className="chalk-card-section">
                  {section.header && (
                    <div className="chalk-card-section-header">
                      {section.header}
                    </div>
                  )}
                  {section.content && <div className="chalk-card-section-content">{section.content(item)}</div>}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
