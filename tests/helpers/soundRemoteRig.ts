import { vi } from 'vitest';
import type { Mood } from '@/app/sound/soundTypes';
import { startMusic } from '@/app/soundDirector/liveEdits';
import { EMPTY_MIX, type SoundMix } from '@/app/soundDirector/soundMix';
import type { SoundSnapshot } from '@/app/soundDirector/soundSnapshot';
import { EMPTY_TABLE_SOUND } from '@/app/soundDirector/tableSound';
import { RemoteSettingsStore } from '@/app/soundRemote/remoteSettings';

export const remoteMood = (id: string, name = id): Mood => ({ id, name, order: 0, fadeSeconds: 2, music: { tracks: [], shuffle: false, levelDb: 0 }, layers: [], icon: 'inn' });

export const withMusic = (mix: SoundMix = EMPTY_MIX): SoundMix => ({
  ...mix,
  table: startMusic(EMPTY_TABLE_SOUND, [{ key: 'a', frames: 48_000 * 60, gainDb: 0 }], false, -4, 7, 0, 0, 0),
});

/** A director as the remote sees it: its intents are spies, its snapshot what a test sets. */
export function fakeRemoteDirector(mix: SoundMix = EMPTY_MIX) {
  let snapshot = { mix, levels: { masterDb: 0, musicDb: -3, ambienceDb: -6 } } as SoundSnapshot;
  const listeners = new Set<() => void>();
  return {
    isOn: true,
    snapshot: (): SoundSnapshot => snapshot,
    now: (): number => 1000,
    shelf: { recordOfKey: (key: string) => (key === 'a' ? { name: 'Tavern song' } : null) } as never,
    press: vi.fn(),
    pressNext: vi.fn(),
    setChannelLevels: vi.fn((changes: Partial<SoundSnapshot['levels']>) => {
      snapshot = { ...snapshot, levels: { ...snapshot.levels, ...changes } };
    }),
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    publish(next: Partial<SoundSnapshot>): void {
      snapshot = { ...snapshot, ...next };
      for (const listener of listeners) listener();
    },
    desk: {
      toggleSilence: vi.fn(),
      togglePause: vi.fn(),
      skip: vi.fn(),
      back: vi.fn(),
      setShuffle: vi.fn(),
      setRepeat: vi.fn(),
      setMusicMuted: vi.fn(),
      setMusicLevel: vi.fn(),
    },
  };
}

export function memoryRemoteSettings(): RemoteSettingsStore {
  const stored = new Map<string, unknown>();
  return new RemoteSettingsStore({ loadLocalStorage: (key: string) => stored.get(key), saveLocalStorage: (key: string, value: unknown) => { stored.set(key, value); } } as never);
}
