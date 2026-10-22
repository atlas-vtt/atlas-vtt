// @vitest-environment jsdom
import { EventEmitter } from 'events';
import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Platform } from 'obsidian';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { NotePreviewUIManager } from '../../src/app/services/NotePreviewUIManager';
import { StatblockPreviewWindow } from '../../src/app/services/StatblockPreviewWindow';

vi.mock('../../src/app/services/FantasyStatblocksService', () => ({
  hasCreatureForNotePath: (): boolean => true,
  getFantasyStatblocksApi: (): object => ({}),
}));
const statblockProps = vi.hoisted(() => [] as Array<Record<string, unknown>>);
vi.mock('../../src/app/statblocks/render/LinkedStatblock', async () => {
  const { createElement } = await vi.importActual<typeof import('react')>('react');
  return {
    // The card's top: the name, with a roll in it.
    LinkedStatblock: (props: Record<string, unknown>): React.JSX.Element => {
      statblockProps.push(props);
      return createElement('div', { className: 'atlas-sb-header' }, createElement('a', { className: 'atlas-dice-link' }, '1d6'));
    },
  };
});

const VIEW_ID = 'statblock-pin-test';
const NOTE_PATH = 'Bestiary/Goblin.md';
const FADE_MS = 150;

function hoverToken(eventBus: EventEmitter, id = 'token-1'): void {
  act(() => {
    eventBus.emit('pin-hover-preview', {
      pin: { id, notePath: NOTE_PATH, x: 0, y: 0, type: 'token', name: 'Goblin' },
      screenX: 100,
      screenY: 100,
      pixiEvent: { metaKey: true, ctrlKey: false },
    });
  });
}

function releaseMod(): void {
  document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Meta' }));
  vi.advanceTimersByTime(FADE_MS);
}

const windows = (): HTMLElement[] => Array.from(document.querySelectorAll<HTMLElement>('.atlas-statblock-preview-window'));
const buttonsOf = (preview: HTMLElement): HTMLButtonElement[] =>
  Array.from(preview.querySelectorAll<HTMLButtonElement>('.atlas-statblock-preview-window__button'));

describe('pinning a statblock preview of a token on the map', () => {
  let manager: NotePreviewUIManager;
  let eventBus: EventEmitter;
  let store: ViewAtlasStore;
  /** Whether the map's tab is the one shown, and the workspace events the manager listens to. */
  let mapShown: boolean;
  let workspaceEvents: Map<string, (leaf?: unknown) => void>;
  const mapLeaf = { view: { viewId: VIEW_ID, getViewType: (): string => 'atlas-vtt', containerEl: { isShown: (): boolean => mapShown } } };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('ResizeObserver', class { observe(): void {} disconnect(): void {} });
    Platform.isMacOS = true;
    const { app } = createInMemoryApp({ files: { [NOTE_PATH]: '# Goblin' } });
    mapShown = true;
    workspaceEvents = new Map();
    Object.assign(app.workspace, {
      getLeavesOfType: (type: string) => (type === 'atlas-vtt' ? [mapLeaf] : []),
      on: (name: string, callback: (leaf?: unknown) => void) => { workspaceEvents.set(name, callback); return {}; },
    });
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

  it('closes an unpinned preview when Mod is released', () => {
    hoverToken(eventBus);
    releaseMod();
    expect(windows()).toHaveLength(0);
  });

  it('keeps a pinned preview open on Mod release and on hovering another token, until it is closed', () => {
    hoverToken(eventBus);
    const [preview] = windows();
    const [pin, close] = buttonsOf(preview!);
    pin!.click();
    expect(preview!.classList.contains('is-pinned')).toBe(true);

    releaseMod();
    hoverToken(eventBus, 'token-2');
    releaseMod();
    expect(windows()).toEqual([preview]);

    close!.click();
    vi.advanceTimersByTime(FADE_MS);
    expect(windows()).toHaveLength(0);
  });

  it('pins only with its pin button: a press into the window leaves it unpinned', () => {
    hoverToken(eventBus);
    const [preview] = windows();
    preview!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(preview!.classList.contains('is-pinned')).toBe(false);
    releaseMod();
    expect(windows()).toHaveLength(0);
  });

  it('moves the window with its controls and keeps it there', () => {
    hoverToken(eventBus);
    const [preview] = windows();
    const controls = preview!.querySelector<HTMLElement>('.atlas-statblock-preview-window__controls')!;
    controls.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 10, clientY: 10 }));
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 60, clientY: 40 }));
    document.dispatchEvent(new MouseEvent('mouseup'));

    expect(preview!.style.left).toBe('50px');
    expect(preview!.style.top).toBe('30px');
    // Moving it pins nothing
    expect(preview!.classList.contains('is-pinned')).toBe(false);
  });

  describe('staying within reach', () => {
    const rect = (left: number, top: number, width: number, height: number): DOMRect =>
      ({ left, top, right: left + width, bottom: top + height, width, height, x: left, y: top, toJSON: () => ({}) });
    const capsuleOf = (preview: HTMLElement): HTMLElement => preview.querySelector<HTMLElement>('.atlas-statblock-preview-window__controls')!;

    /** A preview whose capsule and card top are laid out at the window's top right, which jsdom does not do. */
    function openLaidOut(): HTMLElement {
      hoverToken(eventBus);
      const [preview] = windows();
      capsuleOf(preview!).getBoundingClientRect = (): DOMRect => rect(900, 100, 80, 36);
      preview!.querySelector<HTMLElement>('.atlas-sb-header')!.getBoundingClientRect = (): DOMRect => rect(620, 140, 360, 60);
      return preview!;
    }

    it('cannot be dragged so far that its capsule leaves the map view', () => {
      const viewEl = document.body.createDiv({ cls: 'workspace-leaf' });
      viewEl.getBoundingClientRect = (): DOMRect => rect(300, 40, 1000, 800);
      manager.followView(viewEl);
      const preview = openLaidOut();

      capsuleOf(preview).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 920, clientY: 110 }));
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 920 + 2000, clientY: 110 - 500 }));
      document.dispatchEvent(new MouseEvent('mouseup'));

      // The capsule's right edge on the view's right edge, its top on the view's top.
      expect([preview.style.left, preview.style.top]).toEqual(['320px', '-60px']);
    });

    it('moves by its card\'s top past a threshold, where a click on a roll still rolls', () => {
      const preview = openLaidOut();
      const roll = preview.querySelector<HTMLElement>('.atlas-dice-link')!;
      const rolled = vi.fn();
      preview.addEventListener('click', rolled);

      roll.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 700, clientY: 160 }));
      document.dispatchEvent(new MouseEvent('mouseup'));
      roll.click();
      expect(rolled).toHaveBeenCalledTimes(1);
      // Rolling a die never pins the window
      expect(preview.classList.contains('is-pinned')).toBe(false);

      const placed = preview.style.left;
      roll.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 700, clientY: 160 }));
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 702, clientY: 161 }));
      expect(preview.style.left).toBe(placed);
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 650, clientY: 200 }));
      document.dispatchEvent(new MouseEvent('mouseup'));
      roll.click();
      expect([preview.style.left, preview.style.top]).toEqual(['-50px', '40px']);
      expect(rolled).toHaveBeenCalledTimes(1);
    });

    it('comes back into view when the window shrinks under a pinned preview', () => {
      const preview = openLaidOut();
      buttonsOf(preview)[0]!.click();
      Object.defineProperty(preview, 'offsetLeft', { configurable: true, value: 900 });
      Object.defineProperty(preview, 'offsetTop', { configurable: true, value: 100 });
      capsuleOf(preview).getBoundingClientRect = (): DOMRect => rect(1200, 100, 80, 36);

      window.dispatchEvent(new Event('resize'));
      expect(preview.style.left).toBe(`${900 - (1280 - window.innerWidth)}px`);
    });
  });

  describe('following its token', () => {
    const unhurt = { hp: { current: 7, max: 7 } };
    const goblin = (changes: object = {}): object => ({
      id: 'token-1', kind: 'character', name: 'Goblin', x: 0, y: 0, imagePath: '', resources: unhurt, ...changes,
    });
    const holdTokens = (tokens: object): void => {
      act(() => { store.setState({ objects: { ...store.getState().objects, tokens } as never }); });
    };

    beforeEach(() => {
      holdTokens({ 'token-1': goblin() });
      hoverToken(eventBus);
      buttonsOf(windows()[0]!)[0]!.click();
    });

    it('shows the token\'s values as they change', () => {
      holdTokens({ 'token-1': goblin({ resources: { hp: { current: 3, max: 7 } } }) });
      const last = statblockProps[statblockProps.length - 1] as { tokens: Array<{ resources: unknown }> };
      expect(last.tokens[0]!.resources).toEqual({ hp: { current: 3, max: 7 } });
    });

    it('draws nothing anew while the token only moves', () => {
      const drawn = statblockProps.length;
      holdTokens({ 'token-1': goblin({ x: 70, y: 140 }) });
      expect(statblockProps).toHaveLength(drawn);
    });

    it('closes once the token is gone', () => {
      holdTokens({});
      vi.advanceTimersByTime(FADE_MS);
      expect(windows()).toHaveLength(0);
    });
  });

  it('hides a pinned preview while another tab covers its map, and shows it with the map', () => {
    hoverToken(eventBus);
    const [preview] = windows();
    buttonsOf(preview!)[0]!.click();

    mapShown = false;
    workspaceEvents.get('active-leaf-change')?.({ view: { getViewType: (): string => 'markdown' } });
    expect(preview!.style.display).toBe('none');

    mapShown = true;
    workspaceEvents.get('active-leaf-change')?.(mapLeaf);
    expect(preview!.style.display).toBe('');
    expect(windows()).toEqual([preview]);
  });

  it('has no controls on a preview from a list, which only lives while Mod is held', () => {
    act(() => { new StatblockPreviewWindow({} as never, NOTE_PATH, { id: 'token-1', name: 'Goblin' }, null, { x: 0, y: 0 }); });
    const [preview] = windows();
    expect(preview!.querySelector('.atlas-statblock-preview-window__controls')).toBeNull();
  });
});
