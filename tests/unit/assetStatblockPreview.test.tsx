// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Platform, type App } from 'obsidian';
import type { AnyAsset } from '../../src/app/packages/components/asset-manager/types';

vi.mock('../../src/app/statblocks/render/LinkedStatblock', () => ({
  LinkedStatblock: ({ path, noteText, tokens }: { path: string; noteText?: string; tokens: unknown[] }) => (
    <div data-testid="statblock" data-tokens={JSON.stringify(tokens)} data-note={noteText}>{path}</div>
  ),
}));

import { useAssetStatblockPreview } from '../../src/app/packages/components/asset-manager/hooks/useAssetStatblockPreview';
import { useModHoverStatblockPreview } from '../../src/app/packages/components/asset-manager/hooks/useModHoverStatblockPreview';

const app = {} as App;
const WINDOW = '.atlas-statblock-preview-window';

const assets = [
  { id: 'goblin', type: 'tokens', name: 'Goblin', statblockPath: 'bestiary/Goblin.md', imagePath: 'art/goblin.webp', showRing: false },
  { id: 'ogre', type: 'tokens', name: 'Ogre', statblockPath: 'bestiary/Ogre.md' },
  { id: 'crate', type: 'tokens', name: 'Crate' },
] as unknown as AnyAsset[];

function Pane({ container, suspended }: { container: HTMLElement; suspended: boolean }): null {
  useAssetStatblockPreview({ app, container, assets, suspended });
  return null;
}

function setup(suspended = false): { card: (id: string) => HTMLElement; setSuspended: (value: boolean) => void } {
  const pane = document.body.createDiv();
  for (const asset of assets) pane.createDiv({ cls: 'atlas-asset-card', attr: { 'data-asset-id': asset.id } });
  const { rerender } = render(<Pane container={pane} suspended={suspended} />);
  return {
    card: (id) => pane.querySelector<HTMLElement>(`[data-asset-id="${id}"]`)!,
    setSuspended: (value) => rerender(<Pane container={pane} suspended={value} />),
  };
}

const openWindow = (): HTMLElement | null =>
  document.body.querySelector<HTMLElement>(`${WINDOW}:not(${WINDOW}--closing)`);

const statblockElement = (): Element | null =>
  openWindow()?.querySelector('[data-testid="statblock"]') ?? null;

const shownStatblock = (): string | null => statblockElement()?.textContent ?? null;

/** Lets the window render its statblock, place itself and finish closing. */
const settle = (): void => { act(() => { vi.advanceTimersByTime(200); }); };

describe('asset manager statblock preview', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('ResizeObserver', class { observe(): void {} disconnect(): void {} });
    Platform.isMacOS = true;
  });

  afterEach(() => {
    cleanup();
    vi.runOnlyPendingTimers();
    document.body.empty();
    Platform.isMacOS = false;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('shows the statblock of a token hovered with Cmd held', () => {
    const { card } = setup();
    fireEvent.mouseMove(card('goblin'), { metaKey: true });
    settle();
    expect(shownStatblock()).toBe('bestiary/Goblin.md');
  });

  it('shows the statblock with the token\'s art, as the preview on the map does', () => {
    const { card } = setup();
    fireEvent.mouseMove(card('goblin'), { metaKey: true });
    settle();
    const tokens = statblockElement()?.getAttribute('data-tokens');
    expect(JSON.parse(tokens ?? '[]')).toEqual([{ name: 'Goblin', imagePath: 'art/goblin.webp', showRing: false }]);
  });

  it('opens above the asset manager, at the pointer, and keeps inside the window like the preview on the map', () => {
    const { card } = setup();
    fireEvent.mouseMove(card('goblin'), { metaKey: true, clientX: window.innerWidth - 10, clientY: window.innerHeight - 10 });
    settle();
    const preview = openWindow()!;
    expect(preview.classList.contains('atlas-statblock-preview-window--over-modal')).toBe(true);
    // jsdom measures nothing, so the window takes its fallback size of 400 × 600.
    expect(parseFloat(preview.style.left) + 400).toBeLessThanOrEqual(window.innerWidth - 20);
    expect(parseFloat(preview.style.top) + 600).toBeLessThanOrEqual(window.innerHeight - 20);
    expect(preview.style.maxHeight).toBe(`${window.innerHeight - 40}px`);
  });

  it('shows nothing without Cmd, and nothing for Ctrl on macOS', () => {
    const { card } = setup();
    fireEvent.mouseMove(card('goblin'));
    fireEvent.mouseMove(card('ogre'), { ctrlKey: true });
    settle();
    expect(shownStatblock()).toBeNull();
  });

  it('shows the statblock when Cmd is pressed while the pointer rests on a token', () => {
    const { card } = setup();
    fireEvent.mouseMove(card('goblin'));
    fireEvent.keyDown(window, { key: 'Meta', metaKey: true });
    settle();
    expect(shownStatblock()).toBe('bestiary/Goblin.md');
  });

  it('keeps the statblock while the pointer is on a token without one or off the tokens', () => {
    const { card } = setup();
    fireEvent.mouseMove(card('goblin'), { metaKey: true });
    fireEvent.mouseMove(card('crate'), { metaKey: true });
    fireEvent(card('crate').parentElement!, new MouseEvent('mouseleave'));
    settle();
    expect(shownStatblock()).toBe('bestiary/Goblin.md');
  });

  it('shows the next token\'s statblock in place of the first', () => {
    const { card } = setup();
    fireEvent.mouseMove(card('goblin'), { metaKey: true });
    fireEvent.mouseMove(card('ogre'), { metaKey: true });
    settle();
    expect(shownStatblock()).toBe('bestiary/Ogre.md');
    expect(document.body.querySelectorAll(WINDOW)).toHaveLength(1);
  });

  it('closes when Cmd is released', () => {
    const { card } = setup();
    fireEvent.mouseMove(card('goblin'), { metaKey: true });
    settle();
    fireEvent.keyUp(window, { key: 'Meta' });
    settle();
    expect(document.body.querySelector(WINDOW)).toBeNull();
  });

  it('closes once a token is selected and stays closed while the selection lasts', () => {
    const { card, setSuspended } = setup();
    fireEvent.mouseMove(card('goblin'), { metaKey: true });
    settle();
    setSuspended(true);
    expect(shownStatblock()).toBeNull();

    fireEvent.mouseMove(card('ogre'), { metaKey: true });
    fireEvent.keyDown(window, { key: 'Meta', metaKey: true });
    settle();
    expect(shownStatblock()).toBeNull();
  });

  it('closes with the pane', () => {
    const { card } = setup();
    fireEvent.mouseMove(card('goblin'), { metaKey: true });
    settle();
    cleanup();
    settle();
    expect(document.body.querySelector(WINDOW)).toBeNull();
  });

  describe('of a note outside the vault', () => {
    function BundlePane({ container, noteText }: { container: HTMLElement; noteText: (path: string) => Promise<string | undefined> }): null {
      useModHoverStatblockPreview({
        app, container, noteText, cardSelector: '.card',
        targetOf: () => ({ key: 'goblin', notePath: 'bundle/Goblin.md', token: { name: 'Goblin' } }),
      });
      return null;
    }

    function setupBundle(): { card: HTMLElement; deliver: () => Promise<void> } {
      const pane = document.body.createDiv();
      const card = pane.createDiv({ cls: 'card' });
      let resolve: (text: string) => void = () => undefined;
      const noteText = (): Promise<string> => new Promise((done) => { resolve = done; });
      render(<BundlePane container={pane} noteText={noteText} />);
      return { card, deliver: async () => { await act(async () => { resolve('goblin note'); await vi.advanceTimersByTimeAsync(200); }); } };
    }

    it('shows the statblock from the note\'s own text once it is read', async () => {
      const { card, deliver } = setupBundle();
      fireEvent.mouseMove(card, { metaKey: true });
      await deliver();
      expect(statblockElement()?.getAttribute('data-note')).toBe('goblin note');
    });

    it('opens nothing when Cmd is released before the note is read', async () => {
      const { card, deliver } = setupBundle();
      fireEvent.mouseMove(card, { metaKey: true });
      fireEvent.keyUp(window, { key: 'Meta' });
      await deliver();
      expect(document.body.querySelector(WINDOW)).toBeNull();
    });
  });
});
