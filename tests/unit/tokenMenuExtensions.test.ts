import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InteractionController } from '../../src/app/pixi/token-renderer/InteractionController';
import { openContextMenuGlobal, type ContextMenuEntry } from '../../src/app/react/root/ContextMenuContext';
import { tokenMenuSlot } from '../../src/app/extensions/slots';
import type { MenuItem, TokenMenuContext } from '../../src/api/types/ui';

vi.mock('../../src/app/react/root/ContextMenuContext', () => ({
  openContextMenuGlobal: vi.fn(),
  closeContextMenuGlobal: vi.fn(),
}));

/** Right-clicks `tokenId` and returns the entries the menu opened with. */
function rightClick(tokenId: string, isPlayerView = false): ContextMenuEntry[] {
  const store = {
    getState: () => ({
      activeTool: 'select',
      selectedIds: [],
      initiative: { entries: [] },
      objects: {
        tokens: {
          hero: { id: 'hero', kind: 'character', x: 0, y: 0, imagePath: 'art/hero.png', name: 'Hero' },
          crate: { id: 'crate', kind: 'token', x: 0, y: 0, imagePath: 'art/crate.png' },
        },
      },
    }),
  } as never;
  const controller = new InteractionController({} as never, store, {} as never, new EventEmitter(), {} as never, isPlayerView);
  controller.viewId = 'view-1';
  controller.handleViewportTokenPointerDown(tokenId, { button: 2, stopPropagation: vi.fn(), clientX: 0, clientY: 0 } as never);
  return vi.mocked(openContextMenuGlobal).mock.calls.at(-1)?.[0] ?? [];
}

const labels = (entries: ContextMenuEntry[]): string[] => entries.flatMap((entry) => ('label' in entry ? [entry.label] : []));

function provide(provider: (ctx: TokenMenuContext) => MenuItem[]): () => void {
  return tokenMenuSlot.add('ext', provider);
}

describe('Extension entries in the token context menu', () => {
  beforeEach(() => {
    vi.mocked(openContextMenuGlobal).mockClear();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    expect(tokenMenuSlot.list()).toHaveLength(0);
  });

  it('adds nothing while no provider is registered', () => {
    expect(labels(rightClick('hero'))).not.toContain('Controlled by');
    expect(vi.mocked(openContextMenuGlobal)).toHaveBeenCalledTimes(1);
  });

  it('gives a character token\'s menu the provider\'s items, told the token id and kind', () => {
    const provider = vi.fn((ctx: TokenMenuContext): MenuItem[] => (ctx.tokenKind === 'character' ? [{ label: 'Controlled by', icon: 'users', onClick: vi.fn() }] : []));
    const remove = provide(provider);
    expect(labels(rightClick('hero'))).toContain('Controlled by');
    expect(provider).toHaveBeenCalledWith({ viewId: 'view-1', kind: 'map', isPlayerView: false, tokenId: 'hero', tokenKind: 'character' });
    remove();
  });

  it('lets a provider act on characters only, by tokenKind', () => {
    const remove = provide((ctx) => (ctx.tokenKind === 'character' ? [{ label: 'Controlled by' }] : []));
    expect(labels(rightClick('crate'))).not.toContain('Controlled by');
    remove();
  });

  it('runs an item\'s click and builds submenus', () => {
    const onClick = vi.fn();
    const remove = provide(() => [{ label: 'Control', submenu: [{ label: 'Anna', checked: true, onClick }, { label: 'Bob', disabled: true }] }]);
    const entry = rightClick('hero').find((candidate) => 'label' in candidate && candidate.label === 'Control');
    expect(entry).toMatchObject({ type: 'submenu' });
    const live = (entry as Extract<ContextMenuEntry, { type: 'submenu' }>).children;
    const children = typeof live === 'function' ? live() : live;
    expect(children).toMatchObject([{ type: 'item', label: 'Anna', checked: true }, { type: 'item', label: 'Bob', disabled: true }]);
    (children[0] as Extract<ContextMenuEntry, { type: 'item' }>).onClick();
    expect(onClick).toHaveBeenCalledOnce();
    remove();
  });

  it('keeps the menu when a provider throws', () => {
    const remove = provide(() => { throw new Error('boom'); });
    const names = labels(rightClick('hero'));
    expect(names).toContain('Edit Token');
    remove();
  });

  it('never asks a provider in a player view, which opens no menu', () => {
    const provider = vi.fn(() => [{ label: 'Controlled by' }]);
    const remove = provide(provider);
    rightClick('hero', true);
    expect(provider).not.toHaveBeenCalled();
    expect(vi.mocked(openContextMenuGlobal)).not.toHaveBeenCalled();
    remove();
  });
});
