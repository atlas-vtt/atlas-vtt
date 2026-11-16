import { create, type StoreApi } from 'zustand';
import type { SceneTab } from '../types/sceneTabTypes';

export interface TabMetaState {
  tabs: SceneTab[];
  activeTabId: string | null;
}

export interface TabMetaActions {
  addTab: (filePath: string, displayName: string) => string;
  removeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  getTabByFilePath: (filePath: string) => SceneTab | undefined;
  markTabLoaded: (tabId: string) => void;
  markTabDirty: (tabId: string, isDirty: boolean) => void;
  setTabs: (tabs: SceneTab[], activeTabId: string | null) => void;
  /** Moves a tab to `toIndex` (clamped), keeping every tab's data and the active tab. False when nothing moved. */
  moveTab: (tabId: string, toIndex: number) => boolean;
  updateTabFilePath: (oldPath: string, newPath: string, newDisplayName: string) => void;
}

export type TabMetaStore = StoreApi<TabMetaState & TabMetaActions>;

function generateTabId(): string {
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createTabMetaStore(): TabMetaStore {
  return create<TabMetaState & TabMetaActions>()((set, get) => ({
    tabs: [],
    activeTabId: null,

    addTab: (filePath: string, displayName: string): string => {
      const id = generateTabId();
      set((s) => ({
        tabs: [...s.tabs, { id, filePath, displayName, isLoaded: false, isDirty: false }],
        activeTabId: id,
      }));
      return id;
    },

    removeTab: (tabId: string): void => {
      set((s) => {
        const idx = s.tabs.findIndex((t) => t.id === tabId);
        if (idx === -1) return s;
        const tabs = s.tabs.filter((t) => t.id !== tabId);
        const activeTabId =
          s.activeTabId === tabId
            ? (tabs[Math.min(idx, tabs.length - 1)]?.id ?? null)
            : s.activeTabId;
        return { tabs, activeTabId };
      });
    },

    setActiveTab: (tabId: string): void => {
      set({ activeTabId: tabId });
    },

    getTabByFilePath: (filePath: string): SceneTab | undefined => {
      return get().tabs.find((t) => t.filePath === filePath);
    },

    markTabLoaded: (tabId: string): void => {
      set((s) => ({
        tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, isLoaded: true } : t)),
      }));
    },

    markTabDirty: (tabId: string, isDirty: boolean): void => {
      set((s) => ({
        tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, isDirty } : t)),
      }));
    },

    setTabs: (tabs: SceneTab[], activeTabId: string | null): void => {
      set({ tabs, activeTabId });
    },

    moveTab: (tabId: string, toIndex: number): boolean => {
      const { tabs } = get();
      const from = tabs.findIndex((t) => t.id === tabId);
      const to = Math.max(0, Math.min(tabs.length - 1, toIndex));
      if (from === -1 || from === to) return false;
      const next = tabs.slice();
      next.splice(to, 0, ...next.splice(from, 1));
      set({ tabs: next });
      return true;
    },

    updateTabFilePath: (oldPath: string, newPath: string, newDisplayName: string): void => {
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.filePath === oldPath ? { ...t, filePath: newPath, displayName: newDisplayName } : t,
        ),
      }));
    },
  }));
}
