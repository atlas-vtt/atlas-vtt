import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { open } = vi.hoisted(() => ({ open: vi.fn() }));

vi.mock('../../src/app/react/root/ContextMenuContext', () => ({ openContextMenuGlobal: open }));
vi.mock('../../src/app/utils/embeddedLeafFocus', () => ({ getActiveWorkspaceLeaf: () => ({ detach: vi.fn() }) }));
vi.mock('../../src/app/react/root/AtlasUIContext', () => ({ useAtlasUI: () => ({ view: { viewId: 'view-1' } }) }));
vi.mock('../../src/app/react/ViewStoreContext', () => ({ useViewStoreHook: () => ({ getState: () => ({ isPlayerView: false }) }) }));

import { ViewActionsMenu } from '../../src/app/react/components/ViewActionsMenu';
import { TooltipProvider } from '../../src/app/packages/components/primitives/tooltip';
import { viewMenuSlot } from '../../src/app/extensions/slots';
import type { MenuItem, ViewContext } from '../../src/api/types/ui';
import type { ContextMenuEntry } from '../../src/app/react/root/ContextMenuContext';

const app = { workspace: { getLeavesOfType: () => [] } } as never;

/** Opens the menu and returns its entries. */
function openMenu(): ContextMenuEntry[] {
  render(<TooltipProvider><ViewActionsMenu app={app} /></TooltipProvider>);
  fireEvent.click(screen.getByRole('button'));
  return open.mock.calls.at(-1)?.[0] ?? [];
}

const labels = (entries: ContextMenuEntry[]): string[] => entries.flatMap((entry) => ('label' in entry ? [entry.label] : []));

function provide(provider: (ctx: ViewContext) => MenuItem[]): () => void {
  let remove = (): void => undefined;
  act(() => { remove = viewMenuSlot.add('ext', provider); });
  return () => act(() => { remove(); });
}

describe('Extension items in the view\'s More options menu', () => {
  beforeEach(() => {
    open.mockClear();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    expect(viewMenuSlot.list()).toHaveLength(0);
  });

  it('has only Atlas\'s own items while nothing is registered', () => {
    expect(labels(openMenu())).toEqual(['Split right', 'Split down', 'Move to new window', 'Close']);
  });

  it('adds a provider\'s items after Atlas\'s layout items, told the view', () => {
    const provider = vi.fn((): MenuItem[] => [{ label: 'Quick notes', icon: 'radio-tower', onClick: vi.fn() }]);
    const remove = provide(provider);
    expect(labels(openMenu())).toEqual(['Split right', 'Split down', 'Move to new window', 'Quick notes', 'Close']);
    expect(provider).toHaveBeenCalledWith({ viewId: 'view-1', kind: 'map', isPlayerView: false });
    remove();
  });

  it('renders an item with a submenu and runs a click inside it', () => {
    const onClick = vi.fn();
    const remove = provide(() => [{ label: 'Present', submenu: [{ label: 'To players', onClick }] }]);
    const entry = openMenu().find((candidate) => 'label' in candidate && candidate.label === 'Present') as Extract<ContextMenuEntry, { type: 'submenu' }>;
    expect(entry.type).toBe('submenu');
    const children = typeof entry.children === 'function' ? entry.children() : entry.children;
    const child = children[0] as Extract<ContextMenuEntry, { type: 'item' }>;
    child.onClick();
    expect(onClick).toHaveBeenCalledOnce();
    remove();
  });

  it('adds nothing for a provider that throws, and keeps the rest', () => {
    const remove = provide(() => { throw new Error('boom'); });
    expect(labels(openMenu())).toEqual(['Split right', 'Split down', 'Move to new window', 'Close']);
    remove();
  });

  it('drops an item without a label and logs a click that throws', () => {
    const remove = provide(() => [{ label: '' }, { label: 'Bad', onClick: () => { throw new Error('boom'); } }]);
    const entries = openMenu();
    expect(labels(entries)).not.toContain('');
    const bad = entries.find((entry) => 'label' in entry && entry.label === 'Bad') as Extract<ContextMenuEntry, { type: 'item' }>;
    expect(() => bad.onClick()).not.toThrow();
    expect(console.error).toHaveBeenCalled();
    remove();
  });

  it('is read at click time: an item removed before the next click is gone', () => {
    const remove = provide(() => [{ label: 'Quick notes' }]);
    remove();
    expect(labels(openMenu())).not.toContain('Quick notes');
  });
});
