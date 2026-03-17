export function ChalkNav({ items, activeHref, header, onNavigate }: {
  items: { text: string; href: string }[];
  activeHref: string;
  header: string;
  onNavigate: (href: string) => void;
}) {
  return (
    <nav>
      <a
        href="/"
        onClick={(e) => { e.preventDefault(); onNavigate('/'); }}
        className="chalk-nav-header"
      >
        {header}
      </a>
      {items.map((item) => {
        const active = item.href === activeHref;
        return (
          <a
            key={item.href}
            href={item.href}
            onClick={(e) => { e.preventDefault(); onNavigate(item.href); }}
            className={`chalk-nav-item${active ? ' active' : ''}`}
          >
            {item.text}
          </a>
        );
      })}
    </nav>
  );
}
