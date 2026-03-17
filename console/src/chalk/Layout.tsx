import type { ReactNode } from 'react';

export function ChalkLayout({ navigation, nav, content, children }: { navigation?: ReactNode; nav?: ReactNode; content?: ReactNode; children?: ReactNode }) {
  const sideNav = nav ?? navigation;
  const main = children ?? content;
  return (
    <div className="chalk-layout">
      <aside className="chalk-sidebar">
        {sideNav}
      </aside>
      <main className="chalk-main">
        {main}
      </main>
    </div>
  );
}
