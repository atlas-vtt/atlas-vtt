// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FederatedPointerEvent } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { EventEmitter } from 'events';
import type { App } from 'obsidian';
import { InteractionController } from '../../src/app/pixi/token-renderer/InteractionController';
import type { GridSystem } from '../../src/app/grid/GridSystem';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { TokenSoundPlayer } from '../../src/app/audio/TokenSoundPlayer';
import type { ContextMenuEntry } from '../../src/app/react/components/context-menu/AtlasContextMenu';
import type { Token } from '../../src/app/types';
import type { TokenSound } from '../../src/app/types/audioTypes';
import { FakeAudioContext } from '../mocks/fakeAudioContext';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const opened = vi.hoisted(() => ({ entries: [] as ContextMenuEntry[] }));
vi.mock('../../src/app/react/root/ContextMenuContext', () => ({
  openContextMenuGlobal: (entries: ContextMenuEntry[]) => { opened.entries = entries; },
  closeContextMenuGlobal: () => {},
}));
const showNotice = vi.hoisted(() => vi.fn());
vi.mock('../../src/app/ui/notice', () => ({ showNotice }));

const token = (id: string, sounds?: TokenSound[]): Token => ({
  id, kind: 'token', imagePath: `${id}.png`, x: 0, y: 0, ...(sounds && { sounds }),
});

/** The app of the running test, whose sound player is released after it. */
let current: App | null = null;

function setup(tokens: Token[], selectedIds: string[] = []): { app: App; rightClick: (id: string) => void } {
  const { app } = createInMemoryApp({
    files: { 'Sounds/dragon-roar.mp3': 'audio:48000', 'Sounds/wings.ogg': 'audio:24000', 'Sounds/hiss.wav': 'audio:12000' },
  });
  current = app;
  const store = createViewAtlasStore(app, `sounds-${Math.random()}`);
  store.setState({
    persistenceEnabled: false, activeTool: 'select', selectedIds,
    objects: { ...store.getState().objects, tokens: Object.fromEntries(tokens.map((t) => [t.id, t])) },
  });
  const controller = new InteractionController({} as Viewport, store, {} as GridSystem, {} as EventEmitter, app as unknown as App);
  const rightClick = (id: string): void => controller.handleViewportTokenPointerDown(
    id, { button: 2, stopPropagation: () => {}, clientX: 0, clientY: 0, global: { x: 0, y: 0 } } as unknown as FederatedPointerEvent,
  );
  return { app, rightClick };
}

/** The rows of the Play sound submenu of the menu opened last, or null when it has none. */
function soundRows(): Extract<ContextMenuEntry, { type: 'item' }>[] | null {
  const menu = opened.entries.find((entry) => entry.type === 'submenu' && entry.label === 'Play sound');
  if (menu?.type !== 'submenu') return null;
  const children = typeof menu.children === 'function' ? menu.children() : menu.children;
  return children.filter((entry): entry is Extract<ContextMenuEntry, { type: 'item' }> => entry.type === 'item');
}

async function choose(label: string): Promise<void> {
  const row = soundRows()?.find((entry) => entry.label === label);
  if (!row) throw new Error(`no "${label}" row`);
  await row.onClick();
}

const playing = (): (string | undefined)[] =>
  (FakeAudioContext.instances.at(-1)?.playing() ?? []).map((source) => source.buffer?.decodedFrom);

beforeEach(() => {
  FakeAudioContext.reset();
  vi.stubGlobal('AudioContext', FakeAudioContext);
  showNotice.mockClear();
  opened.entries = [];
});

afterEach(() => {
  if (current) TokenSoundPlayer.release(current);
  current = null;
  vi.unstubAllGlobals();
});

describe('token context menu sounds', () => {
  it('lists a token\'s sounds by file name, in its order', () => {
    const { rightClick } = setup([token('dragon', [{ path: 'Sounds/dragon-roar.mp3' }, { path: 'Sounds/wings.ogg', volume: 0.5 }])]);
    rightClick('dragon');
    expect(soundRows()?.map((row) => row.label)).toEqual(['dragon-roar', 'wings']);
  });

  it('has no Play sound submenu for a token without sounds', () => {
    const { rightClick } = setup([token('goblin'), token('orc', [])]);
    rightClick('goblin');
    expect(soundRows()).toBeNull();
    rightClick('orc');
    expect(soundRows()).toBeNull();
  });

  it('plays the chosen sound at its volume', async () => {
    const { rightClick } = setup([token('dragon', [{ path: 'Sounds/dragon-roar.mp3' }, { path: 'Sounds/wings.ogg', volume: 0.5 }])]);
    rightClick('dragon');

    await choose('wings');

    const context = FakeAudioContext.instances.at(-1)!;
    expect(playing()).toEqual(['audio:24000']);
    expect(context.route(context.playing()[0]!).gain).toBe(0.5);
  });

  it('offers only the right-clicked token\'s sounds when it is one of several selected', () => {
    const { rightClick } = setup(
      [token('dragon', [{ path: 'Sounds/dragon-roar.mp3' }]), token('snake', [{ path: 'Sounds/hiss.wav' }])],
      ['dragon', 'snake'],
    );
    rightClick('snake');
    expect(soundRows()?.map((row) => row.label)).toEqual(['hiss']);
  });

  it('offers Stop sounds while a sound plays, and it stops every sound', async () => {
    const { rightClick } = setup([token('dragon', [{ path: 'Sounds/dragon-roar.mp3' }]), token('snake', [{ path: 'Sounds/hiss.wav' }])]);
    rightClick('dragon');
    expect(soundRows()?.map((row) => row.label)).toEqual(['dragon-roar']);
    await choose('dragon-roar');

    rightClick('snake');
    expect(soundRows()?.map((row) => row.label)).toEqual(['hiss', 'Stop sounds']);
    await choose('Stop sounds');

    expect(playing()).toEqual([]);
  });

  it('tells the GM when a sound\'s file is gone, naming it', async () => {
    const { rightClick } = setup([token('dragon', [{ path: 'Sounds/lost-roar.mp3' }])]);
    rightClick('dragon');

    await choose('lost-roar');

    expect(showNotice).toHaveBeenCalledOnce();
    expect(showNotice.mock.calls[0]![0]).toContain('lost-roar');
  });

  it('says nothing when a sound plays', async () => {
    const { rightClick } = setup([token('dragon', [{ path: 'Sounds/dragon-roar.mp3' }])]);
    rightClick('dragon');
    await choose('dragon-roar');
    expect(showNotice).not.toHaveBeenCalled();
  });
});
