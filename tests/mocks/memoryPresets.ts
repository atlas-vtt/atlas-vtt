import type { PresetStorage } from '../../src/app/services/SystemPresetService';
import type { StoredPreset } from '../../src/app/services/systemPresets/presetFiles';

/** The user's presets kept in memory, as the preset files keep them: a new list after every change. */
export function memoryPresets(initial: readonly StoredPreset[] = []): PresetStorage & { current: () => readonly StoredPreset[] } {
  let entries: readonly StoredPreset[] = [...initial];
  const listeners = new Set<() => void>();
  const set = (next: readonly StoredPreset[]): void => {
    entries = next;
    for (const listener of [...listeners]) listener();
  };
  return {
    current: () => entries,
    entries: () => entries,
    create: (entry) => set([...entries, entry]),
    update: (id, change) => set(entries.map((entry) => (entry.id === id ? change(entry) : entry))),
    remove: (id) => set(entries.filter((entry) => entry.id !== id)),
    onChange: (listener) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
