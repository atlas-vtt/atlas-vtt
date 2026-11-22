import { vi } from 'vitest';
import type { Mood } from '@/app/sound/soundTypes';
import { startMusic } from '@/app/soundDirector/liveEdits';
import { EMPTY_MIX, type SoundMix } from '@/app/soundDirector/soundMix';
import type { SoundSnapshot } from '@/app/soundDirector/soundSnapshot';
import { EMPTY_TABLE_SOUND } from '@/app/soundDirector/tableSound';
import { RemoteSettingsStore } from '@/app/soundRemote/remoteSettings';
import type { TableSource } from '@/app/soundRemote/remoteTable';
import { DEFAULT_INITIATIVE_RULES } from '@/app/gameSystems/initiativeRules';
import type { ViewAtlasState } from '@/app/storeFactory';
import type { DicePreset } from '@/app/types/dicePresetTypes';
import type { InitiativeRules } from '@/app/types/initiativeRulesTypes';
import type { InitiativeState } from '@/app/types/initiativeTypes';

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

/** A table as the remote sees it: one map whose tracker holds `combatants`, and a player window; the actions are spies. */
export function fakeTable(options: { combatants?: number; rules?: InitiativeRules; map?: boolean } = {}) {
  const state = {
    mapPath: 'Maps/Cave.atlasmap',
    mapLoaded: true,
    isMapLoading: false,
    initiative: {
      isActive: false,
      round: 0,
      entries: Array.from({ length: options.combatants ?? 2 }, (_, index) => ({ id: `e${index}`, name: `Goblin ${index}`, initiative: 0, order: index })),
    } as unknown as InitiativeState,
    objects: { tokens: {} } as ViewAtlasState['objects'],
    startCombat: vi.fn((): void => { state.initiative = { ...state.initiative, isActive: true, round: 1 }; }),
    endCombat: vi.fn((): void => { state.initiative = { ...state.initiative, isActive: false, round: 0 }; }),
  };
  const map = {
    state: () => state,
    rules: (): InitiativeRules => options.rules ?? { ...DEFAULT_INITIATIVE_RULES },
    defeated: vi.fn((): ReadonlySet<string> => new Set(['e1'])),
    roll: vi.fn(),
    presented: vi.fn(() => false),
    present: vi.fn(),
    savedRolls: (): readonly DicePreset[] => [
      { id: 'attack', name: 'Attack', formula: '1d20+5' },
      { id: 'fire', name: 'Fire bolt', formula: '+2', look: { dice: [{ count: 2, sides: 10, colour: '#ff6600' }], crit: 'natural' } },
    ],
    rollSaved: vi.fn(),
  };
  const window = { open: true, frozen: false, trueScale: false, curtained: false, handout: false, hoveringImage: false };
  const player = {
    isOpen: () => window.open,
    isFrozen: () => window.frozen,
    isTrueScale: () => window.trueScale,
    isCurtained: () => window.curtained,
    handoutShown: () => window.handout,
    toggleFreeze: vi.fn(() => { window.frozen = !window.frozen; }),
    setCurtain: vi.fn((down: boolean) => { window.curtained = down; }),
    takeBackHandout: vi.fn(() => { window.handout = false; }),
    showHoveredImage: vi.fn(() => window.hoveringImage),
  };
  const shared = { shown: false };
  const shareRolls = { shown: () => shared.shown, setShown: vi.fn((shown: boolean) => { shared.shown = shown; }) };
  const table: TableSource = { map: () => (options.map === false ? null : map), player, shareRolls };
  return { table, state, map, player, window, shareRolls };
}
