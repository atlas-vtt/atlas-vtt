import { vi } from 'vitest';
import type { PluginDataStore } from '../../src/app/services/SettingsService';

/** A plugin's `data.json` in memory: `loadData` hands out a copy, as Obsidian reads the file anew. */
export function memoryPluginData(initial: unknown = null): PluginDataStore & { stored: () => unknown; set: (data: unknown) => void } {
  let stored: unknown = initial;
  const copy = (value: unknown): unknown => (value === null || value === undefined ? null : structuredClone(value));
  return {
    stored: () => stored,
    set: (data) => { stored = data; },
    loadData: vi.fn(async (): Promise<unknown> => copy(stored)),
    saveData: vi.fn(async (data: unknown): Promise<void> => { stored = copy(data); }),
  };
}
