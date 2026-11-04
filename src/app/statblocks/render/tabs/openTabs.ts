/**
 * Which tab each tab strip of a card shows: view state of one mounted sheet,
 * keyed by the strip (a Tabs block's id, a Spells group's key), never saved.
 * A strip shows its first tab until another is chosen, and the template
 * editor asks the sheet to open the tabs that hold the selected block.
 */

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { tabsHolding } from '../../model/treeTabs';
import type { TemplateLayout } from '../../model/templateTypes';

export interface OpenTabs {
  /** The tab chosen on a strip, if any. */
  chosen: ReadonlyMap<string, string>;
  choose: (strip: string, tab: string) => void;
}

export const OpenTabsContext = createContext<OpenTabs | null>(null);

/** The Section a Tabs block shows as a panel: its heading is the tab, so the panel does not draw it again. */
export const TabPanelContext = createContext<string | null>(null);

const NONE: ReadonlyMap<string, string> = new Map();

function withChoice(chosen: ReadonlyMap<string, string>, strip: string, tab: string): ReadonlyMap<string, string> {
  if (chosen.get(strip) === tab) return chosen;
  const next = new Map(chosen);
  next.set(strip, tab);
  return next;
}

/**
 * The open tabs of one sheet. Whenever `reveal` or the layout changes, the
 * tabs that hold the block `reveal` names open, so a block selected in a
 * closed tab (from the outline, the keys, an undo) comes into view.
 */
export function useOpenTabsState(layout: TemplateLayout, reveal: string | null): OpenTabs {
  const [chosen, setChosen] = useState(NONE);
  const [revealed, setRevealed] = useState<{ id: string | null; layout: TemplateLayout } | null>(null);
  if (revealed === null || revealed.id !== reveal || revealed.layout !== layout) {
    setRevealed({ id: reveal, layout });
    const places = reveal === null ? [] : tabsHolding(layout.blocks, reveal);
    const opened = places.reduce((map, place) => withChoice(map, place.tabsId, place.sectionId), chosen);
    if (opened !== chosen) setChosen(opened);
  }
  const choose = useCallback((strip: string, tab: string): void => setChosen((was) => withChoice(was, strip, tab)), []);
  return useMemo(() => ({ chosen, choose }), [chosen, choose]);
}

/** The tab a strip shows among `tabs` (the chosen one while it is there, else the first) and how to choose another. */
export function useOpenTab(strip: string, tabs: readonly string[]): [string | undefined, (tab: string) => void] {
  const open = useContext(OpenTabsContext);
  const chosen = open?.chosen.get(strip);
  const shown = chosen !== undefined && tabs.includes(chosen) ? chosen : tabs[0];
  const choose = useCallback((tab: string): void => open?.choose(strip, tab), [open, strip]);
  return [shown, choose];
}
