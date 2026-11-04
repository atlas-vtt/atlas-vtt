import React from 'react';

export interface StripTab {
  /** Unique on the strip; also names the tab's panel. */
  id: string;
  label: React.ReactNode;
}

interface TabStripProps {
  /** A `useId()` of the owner; tab and panel ids are made from it. */
  idBase: string;
  tabs: readonly StripTab[];
  /** The open tab. */
  selected: string | undefined;
  onSelect: (id: string) => void;
  /** The strip's accessible name, where nothing labels it. */
  label?: string | undefined;
}

/** The id of a tab's button; its panel names it in `aria-labelledby`. */
export function tabElementId(idBase: string, tab: string): string {
  return `${idBase}-tab-${tab}`;
}

/** The id of a tab's panel; its button names it in `aria-controls`. */
export function tabPanelId(idBase: string, tab: string): string {
  return `${idBase}-panel-${tab}`;
}

/** Marks a tab button with its tab's id, which the template editor finds tabs by. */
export const TAB_FOR_ATTRIBUTE = 'data-sb-tab-for';

const STEPS: Readonly<Record<string, (index: number, count: number) => number>> = {
  ArrowRight: (index, count) => (index + 1) % count,
  ArrowLeft: (index, count) => (index - 1 + count) % count,
  Home: () => 0,
  End: (_index, count) => count - 1,
};

/**
 * A row of tabs as WAI-ARIA describes them: one tab stop (the open tab), the
 * arrow keys move between tabs and open them, Home and End go to the ends.
 * The panels are the owner's, each with `tabPanelId` and `role="tabpanel"`.
 */
export function TabStrip({ idBase, tabs, selected, onSelect, label }: TabStripProps): React.JSX.Element {
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    // Enter and Space press the tab itself (its click), never a key of what holds the strip.
    if (event.key === 'Enter' || event.key === ' ') {
      event.stopPropagation();
      return;
    }
    const step = STEPS[event.key];
    const index = tabs.findIndex((tab) => tab.id === selected);
    if (!step || index < 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    event.preventDefault();
    event.stopPropagation();
    const next = step(index, tabs.length);
    const tab = tabs[next];
    if (!tab) return;
    onSelect(tab.id);
    event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus();
  };

  return (
    <div className="atlas-sb-tabstrip" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
      {tabs.map((tab) => {
        const open = tab.id === selected;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            className="atlas-sb-tab"
            id={tabElementId(idBase, tab.id)}
            aria-selected={open}
            aria-controls={tabPanelId(idBase, tab.id)}
            tabIndex={open ? 0 : -1}
            {...{ [TAB_FOR_ATTRIBUTE]: tab.id }}
            onClick={() => onSelect(tab.id)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

interface TabPanelProps {
  idBase: string;
  tab: string;
  open: boolean;
  children: React.ReactNode;
}

/** One tab's panel; closed panels stay mounted and hidden, so what they hold keeps its state. */
export function TabPanel({ idBase, tab, open, children }: TabPanelProps): React.JSX.Element {
  return (
    <div className="atlas-sb-tabpanel" role="tabpanel" id={tabPanelId(idBase, tab)} aria-labelledby={tabElementId(idBase, tab)} hidden={!open}>
      {children}
    </div>
  );
}
