import { EventEmitter } from 'events';
import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Platform } from 'obsidian';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { NotePreviewUIManager } from '../../src/app/services/NotePreviewUIManager';
import { StatblockPreviewWindow } from '../../src/app/services/StatblockPreviewWindow';
import type { ViewAtlasStore } from '../../src/app/storeFactory';

vi.mock('../../src/app/services/FantasyStatblocksService', () => ({
  hasCreatureForNotePath: (): boolean => true,
}));
const statblockProps = vi.hoisted(() => [] as Array<Record<string, unknown>>);
vi.mock('../../src/app/react/components/FantasyStatblock', () => ({
  default: (props: Record<string, unknown>): null => {
    statblockProps.push(props);
    return null;
  },
}));

const VIEW_ID = 'statblock-preview-test';
const NOTE_PATH = 'Bestiary/Goblin.md';
const FADE_MS = 150;

function hoverToken(eventBus: EventEmitter, modifier = true): void {
  eventBus.emit('pin-hover-preview', {
    pin: { id: 'token-1', notePath: NOTE_PATH, x: 0, y: 0, type: 'token', name: 'Goblin' },
    screenX: 100,
    screenY: 100,
    pixiEvent: { metaKey: modifier, ctrlKey: false },
  });
}

/** The view's store holding `mapPath` loaded, with a token-1 on it. */
function holdScene(store: ViewAtlasStore, mapPath: string, changes: object = {}): void {
  const state = store.getState();
  store.setState({
    mapPath, mapLoaded: true, isMapLoading: false,
    objects: { ...state.objects, tokens: { 'token-1': { id: 'token-1', kind: 'character', name: mapPath, x: 0, y: 0, imagePath: '' } } },
    ...changes,
  });
}

/** The roll context the last statblock preview was opened with. */
const lastContext = (): unknown => statblockProps[statblockProps.length - 1]?.originContext;

function openWindows(): number {
  return document.querySelectorAll('.atlas-statblock-preview-window').length;
}

describe('NotePreviewUIManager statblock previews', () => {
  let manager: NotePreviewUIManager;
  let eventBus: EventEmitter;
  let store: ViewAtlasStore;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('ResizeObserver', class { observe(): void {} disconnect(): void {} });
    Platform.isMacOS = true;
    const { app } = createInMemoryApp({ files: { [NOTE_PATH]: '# Goblin' } });
    Object.assign(app.workspace, { getLeavesOfType: () => [], on: () => ({}) });
    eventBus = new EventEmitter();
    store = createViewAtlasStore(app, VIEW_ID);
    manager = new NotePreviewUIManager(app, eventBus, store, VIEW_ID);
    statblockProps.length = 0;
  });

  afterEach(() => {
    manager.destroy();
    vi.runOnlyPendingTimers();
    document.body.empty();
    Platform.isMacOS = false;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('still closes a preview reopened while the previous one for the token fades out', () => {
    hoverToken(eventBus);
    eventBus.emit('map-loaded');
    hoverToken(eventBus);

    vi.advanceTimersByTime(FADE_MS);
    expect(openWindows()).toBe(1);

    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Meta' }));
    vi.advanceTimersByTime(FADE_MS);
    expect(openWindows()).toBe(0);
  });

  it('closes on Cmd release after being hidden twice while fading', () => {
    hoverToken(eventBus);
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Meta' }));
    vi.advanceTimersByTime(FADE_MS / 2);
    window.dispatchEvent(new Event('blur'));
    vi.advanceTimersByTime(FADE_MS / 2);

    hoverToken(eventBus);
    vi.advanceTimersByTime(FADE_MS);
    expect(openWindows()).toBe(1);

    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Meta' }));
    vi.advanceTimersByTime(FADE_MS);
    expect(openWindows()).toBe(0);
  });

  it('opens the statblock with the scene the token was hovered in, also when replayed after another loads', () => {
    holdScene(store, 'maps/a.atlasmap');
    hoverToken(eventBus, false);
    holdScene(store, 'maps/b.atlasmap');
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Meta', metaKey: true })); });
    act(() => { vi.runOnlyPendingTimers(); });
    expect(lastContext()).toEqual({ viewId: VIEW_ID, mapPath: 'maps/a.atlasmap', tokenIds: ['token-1'] });
  });

  it.each([
    ['while its scene loads', { isMapLoading: true }],
    ['for a token not on the loaded scene', { objects: { tokens: {} } }],
  ])('opens the statblock without a scene %s', (_, changes) => {
    holdScene(store, 'maps/a.atlasmap', changes);
    act(() => { hoverToken(eventBus); });
    act(() => { vi.runOnlyPendingTimers(); });
    expect(statblockProps).not.toHaveLength(0);
    expect(lastContext()).toBeUndefined();
  });

  it('opens a statblock from a list without a scene', () => {
    act(() => { new StatblockPreviewWindow({} as never, NOTE_PATH, { id: 'token-1', name: 'Goblin' }, null, { x: 0, y: 0 }); });
    act(() => { vi.runOnlyPendingTimers(); });
    expect(statblockProps).not.toHaveLength(0);
    expect(lastContext()).toBeUndefined();
  });
});
