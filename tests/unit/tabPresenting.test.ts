import { beforeEach, describe, expect, it, vi } from 'vitest';

const { presentTabInPlayerWindow, presentTabToPlayers, openContextMenuGlobal } = vi.hoisted(() => ({
  presentTabInPlayerWindow: vi.fn(() => Promise.resolve()),
  presentTabToPlayers: vi.fn(() => Promise.resolve()),
  openContextMenuGlobal: vi.fn(),
}));

vi.mock('../../src/app/services/PlayerWindowPresenter', () => ({ presentTabInPlayerWindow }));
vi.mock('../../src/app/services/presentToPlayers', () => ({ presentTabToPlayers }));
vi.mock('../../src/app/react/root/ContextMenuContext', () => ({ openContextMenuGlobal }));

import { activePresentationTarget, addPresentationTarget } from '../../src/app/services/presentationTargets';
import { openSceneTabMenu, presentTab } from '../../src/app/react/tabPresenting';
import { sceneTabMenuSlot } from '../../src/app/extensions/slots';
import { createTabMetaStore } from '../../src/app/stores/tabMetaStore';
import type { ContextMenuEntry } from '../../src/app/react/root/ContextMenuContext';

const app = {} as never;
const tabMetaStore = createTabMetaStore();
tabMetaStore.getState().addTab('maps/t1.atlasmap', 'T1');
tabMetaStore.getState().setTabs(tabMetaStore.getState().tabs.map((tab) => ({ ...tab, id: 't1' })), 't1');
const view = { viewId: 'view-1', tabMetaStore } as never;

/** The rows of the menu opened last: Atlas opens it with a function it reads again while the menu is open. */
function openedEntries(): ContextMenuEntry[] {
  const given = openContextMenuGlobal.mock.calls.at(-1)![0] as ContextMenuEntry[] | (() => ContextMenuEntry[]);
  return typeof given === 'function' ? given() : given;
}

describe('the eye button', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('presents in the player window and offers no menu without a target', () => {
    presentTab(app, view, 't1');
    expect(presentTabInPlayerWindow).toHaveBeenCalledWith(app, view, 't1');
    expect(presentTabToPlayers).not.toHaveBeenCalled();
    expect(openSceneTabMenu(app, view, 't1', { x: 1, y: 2 })).toBe(false);
    expect(openContextMenuGlobal).not.toHaveBeenCalled();
  });

  it('presents to the second screen only while a target is active, with the player window in its menu', () => {
    const stop = addPresentationTarget({ id: 't', label: 'the second screen', isActive: () => true });
    presentTab(app, view, 't1');
    expect(presentTabToPlayers).toHaveBeenCalledWith(view, 't1');
    expect(presentTabInPlayerWindow).not.toHaveBeenCalled();

    expect(openSceneTabMenu(app, view, 't1', { x: 1, y: 2 })).toBe(true);
    const [, position] = openContextMenuGlobal.mock.calls[0] as [unknown, { x: number; y: number }];
    expect(position).toEqual({ x: 1, y: 2 });
    const entries = openedEntries();
    expect(entries).toHaveLength(1);
    const entry = entries[0] as Extract<ContextMenuEntry, { type: 'item' }>;
    expect(entry.label).toBe('Open player window');
    entry.onClick();
    expect(presentTabInPlayerWindow).toHaveBeenCalledWith(app, view, 't1');
    stop();
  });

  it('the eye opens the player window again once the last target is removed', () => {
    const stop = addPresentationTarget({ id: 't', label: 'the second screen', isActive: () => true });
    stop();
    expect(activePresentationTarget()).toBeNull();
    presentTab(app, view, 't1');
    expect(presentTabInPlayerWindow).toHaveBeenCalledWith(app, view, 't1');
  });

  it('opens without a target when an extension section has items, with the section after its label row', () => {
    const remove = sceneTabMenuSlot.add('ext', { heading: 'Present to', items: (ctx) => [{ label: `Anna on ${ctx.name}` }] });
    expect(openSceneTabMenu(app, view, 't1', { x: 1, y: 2 })).toBe(true);
    expect(openedEntries().map((entry) => entry.type === 'label' ? `label:${entry.text}` : entry.type === 'item' ? entry.label : entry.type))
      .toEqual(['label:Present to', 'Anna on T1']);
    remove();
  });

  it("puts a separator between Atlas's entry and a section, and tells the menu when to read its rows again", () => {
    const stop = addPresentationTarget({ id: 't', label: 'the second screen', isActive: () => true });
    const remove = sceneTabMenuSlot.add('ext', { heading: 'Present to', items: () => [{ label: 'Anna' }] });
    openSceneTabMenu(app, view, 't1', { x: 1, y: 2 }, null);
    expect(openedEntries().map((entry) => entry.type)).toEqual(['item', 'separator', 'label', 'item']);
    const options = openContextMenuGlobal.mock.calls.at(-1)![2] as { subscribe(onChange: () => void): () => void };
    const onChange = vi.fn();
    const unsubscribe = options.subscribe(onChange);
    sceneTabMenuSlot.invalidate();
    tabMetaStore.getState().markTabDirty('t1', true);
    expect(onChange).toHaveBeenCalledTimes(2);
    unsubscribe();
    sceneTabMenuSlot.invalidate();
    expect(onChange).toHaveBeenCalledTimes(2);
    remove();
    stop();
  });
});
