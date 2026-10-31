import { create, type StoreApi } from 'zustand';
import type { SceneTab } from '../types/sceneTabTypes';

export interface TabMetaState {
  tabs: SceneTab[];
  activeTabId: string | null;
}

export interface TabMetaActions {
  addTab: (filePath: string, displayName: string) => string;
  removeTab: (tabId: string) => void;
  /** Inserts an existing tab before another, or at the end for null. */
  moveTab: (tabId: string, beforeTabId: string | null) => boolean;
  setActiveTab: (tabId: string) => void;
  getTabByFilePath: (filePath: string) => SceneTab | undefined;
  markTabLoaded: (tabId: string) => void;
  markTabDirty: (tabId: string, isDirty: boolean) => void;
  setTabs: (tabs: SceneTab[], activeTabId: string | null) => void;
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

    moveTab: (tabId: string, beforeTabId: string | null): boolean => {
      const { tabs } = get();
      const source = tabs.find((tab) => tab.id === tabId);
      if (!source || tabId === beforeTabId || (beforeTabId !== null && !tabs.some((tab) => tab.id === beforeTabId))) return false;
      const next = tabs.filter((tab) => tab !== source);
      const index = beforeTabId === null ? next.length : next.findIndex((tab) => tab.id === beforeTabId);
      next.splice(index, 0, source);
      if (next.every((tab, position) => tab === tabs[position])) return false;
      set({ tabs: next });
      return true;
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

    updateTabFilePath: (oldPath: string, newPath: string, newDisplayName: string): void => {
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.filePath === oldPath ? { ...t, filePath: newPath, displayName: newDisplayName } : t,
        ),
      }));
    },
  }));
}
