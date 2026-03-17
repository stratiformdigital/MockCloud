export function ChalkBreadcrumbs({ items, onNavigate, onFollow }: {
  items: { text: string; href: string }[];
  onNavigate?: (href: string) => void;
  onFollow?: (e: { preventDefault: () => void; detail: { href: string; text: string } }) => void;
}) {
  return (
    <nav className="chalk-breadcrumbs">
      {items.map((item, i) => (
        <span key={i}>
          {i > 0 && <span className="chalk-breadcrumbs-separator">&gt;</span>}
          {i < items.length - 1 ? (
            <a
              href={item.href}
              onClick={(e) => { e.preventDefault(); if (onFollow) onFollow({ preventDefault: () => e.preventDefault(), detail: { href: item.href, text: item.text } }); else if (onNavigate) onNavigate(item.href); }}
            >
              {item.text}
            </a>
          ) : (
            <span className="chalk-breadcrumbs-current">{item.text}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
