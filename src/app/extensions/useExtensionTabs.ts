import { useEffect, useState } from 'react';
import type { SlotRegistry } from './SlotRegistry';
import { useSlot } from './useSlot';

/** A tab an extension added to an Atlas dialog (`ui.addAssetTab`, `ui.addCollectionSettingsTab`), keyed by owner and id. */
export interface ExtensionTab<T> {
  key: string;
  owner: string;
  tab: T;
}

export interface ExtensionTabs<T> {
  tabs: readonly ExtensionTab<T>[];
  /** The extension tab shown in place of Atlas's own; null while one of Atlas's is. */
  active: ExtensionTab<T> | null;
  /** Shows an extension tab, or (null) goes back to Atlas's own. */
  show: (key: string | null) => void;
}

/**
 * The tabs extensions added to one place, and which is shown. Kept apart from Atlas's own tabs:
 * one whose extension removes it falls back to Atlas's tab, and none is remembered once the
 * dialog closes (`isOpen` false).
 */
export function useExtensionTabs<T extends { id: string }>(slot: SlotRegistry<T>, isOpen: boolean): ExtensionTabs<T> {
  const entries = useSlot(slot);
  const [shown, setShown] = useState<string | null>(null);
  useEffect(() => {
    if (!isOpen) setShown(null);
  }, [isOpen]);
  const tabs = entries.map(({ owner, item }) => ({ key: `${owner}:${item.id}`, owner, tab: item }));
  return { tabs, active: tabs.find((entry) => entry.key === shown) ?? null, show: setShown };
}
