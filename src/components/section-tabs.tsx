"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export function SectionTabs({ label, tabs }: {
  label: string;
  tabs: { id: string; label: string; content: ReactNode }[];
}) {
  const [active, setActive] = useState(tabs[0]?.id ?? "");
  const baseId = useId();
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const offset = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    const target = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : offset ? (index + offset + tabs.length) % tabs.length : -1;
    if (target < 0) return;
    event.preventDefault();
    const next = tabs[target];
    setActive(next.id);
    refs.current[next.id]?.focus();
  }
  return (
    <div className="travel-tabs">
      <div aria-label={label} className="travel-tablist" role="tablist">
        {tabs.map((tab, index) => (
          <button
            aria-controls={`${baseId}-${tab.id}-panel`}
            aria-selected={active === tab.id}
            className="travel-tab"
            id={`${baseId}-${tab.id}-tab`}
            key={tab.id}
            onClick={() => setActive(tab.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
            ref={(node) => { refs.current[tab.id] = node; }}
            role="tab"
            tabIndex={active === tab.id ? 0 : -1}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab) => (
        <div
          aria-labelledby={`${baseId}-${tab.id}-tab`}
          className="travel-tabpanel"
          hidden={active !== tab.id}
          id={`${baseId}-${tab.id}-panel`}
          key={tab.id}
          role="tabpanel"
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}
