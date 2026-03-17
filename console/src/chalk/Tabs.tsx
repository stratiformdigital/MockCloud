import { useState, type ReactNode } from 'react';

export function ChalkTabs({ tabs, activeTabId: controlledActiveTabId, onChange }: {
  tabs: { id: string; label: string; content: ReactNode }[];
  activeTabId?: string;
  onChange?: (detail: { activeTabId: string }) => void;
}) {
  const [internalActive, setInternalActive] = useState(tabs[0]?.id || '');
  const activeTabId = controlledActiveTabId || internalActive;

  const handleClick = (id: string) => {
    setInternalActive(id);
    onChange?.({ activeTabId: id });
  };

  const activeTab = tabs.find((t) => t.id === activeTabId);
  return (
    <div>
      <div className="chalk-tabs">
        {tabs.map((tab) => {
          const active = tab.id === activeTabId;
          return (
            <button
              key={tab.id}
              onClick={() => handleClick(tab.id)}
              className={`chalk-tab${active ? ' active' : ''}`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div>{activeTab?.content}</div>
    </div>
  );
}
