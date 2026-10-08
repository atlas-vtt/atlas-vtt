/**
 * The remote view tab's own rules, as regression cases on Atlas's view:
 * never a navigation target, a tab nothing opened closes itself, a tab closed before it opened
 * makes `open()` reject and tells nobody, and it never loads or saves a file.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/app/atlas-view', async () => import('./fakeAtlasView'));

import { RemoteMapView } from '../../src/app/remote-view/RemoteMapView';
import { presentViewToPlayers } from '../../src/app/services/presentToPlayers';
import { presentedScene } from '../../src/app/services/PresentedScene';
import { remoteHarness } from './remoteViewHarness';

describe('the remote view tab', () => {
  it('is no navigation target, saves nothing of itself, and never loads a file', async () => {
    const harness = await remoteHarness();
    const handle = await harness.api.open({ title: 'Shared scene', icon: 'network' });
    const view = harness.workspace.leavesOf('atlas-vtt-remote')[0]!.view as RemoteMapView;
    expect(view.navigation).toBe(false);
    expect(view.getState()).toEqual({ mapFilePath: null });
    expect(view.getDisplayText()).toBe('Shared scene');
    expect(view.getIcon()).toBe('network');
    await expect(view.onLoadFile()).resolves.toBeUndefined();
    await expect(view.setState()).resolves.toBeUndefined();
    expect(view.atlasStore.getState().mapPath).toBeNull();
    handle.close();
  });

  it('closes a tab nothing opened (restored at startup, split or duplicated), leaving the owned one alone', async () => {
    const harness = await remoteHarness();
    const owned = await harness.api.open({ title: 'A' });
    const closed = vi.fn();
    owned.onClose(closed);
    const copy = await harness.workspace.restore();
    expect(harness.workspace.leaves).not.toContain(copy);
    expect((copy.view as RemoteMapView).isClosed).toBe(true);
    expect(harness.workspace.leavesOf('atlas-vtt-remote')).toHaveLength(1);
    expect(closed).not.toHaveBeenCalled();
    expect(harness.views.list().map((info) => info.viewId)).toEqual([owned.viewId]);
  });

  it('rejects open() for a tab closed before it opened, and leaves nothing behind', async () => {
    const harness = await remoteHarness();
    harness.workspace.next.mode = 'close-before-open';
    await expect(harness.api.open({ title: 'A' })).rejects.toThrow('remoteViews.open: the remote view could not open.');
    expect(harness.workspace.leavesOf('atlas-vtt-remote')).toHaveLength(0);
    expect(harness.views.list()).toEqual([]);
    // Nothing of it is kept: reuse opens a fresh one.
    const fresh = await harness.api.open({ title: 'A', reuse: true });
    expect(harness.workspace.leavesOf('atlas-vtt-remote')).toHaveLength(1);
    fresh.close();
  });

  it('rejects open() when the workspace makes no remote view, or refuses the tab, and keeps nothing listed', async () => {
    const harness = await remoteHarness();
    harness.workspace.next.mode = 'no-view';
    await expect(harness.api.open({ title: 'A' })).rejects.toThrow('could not open');
    harness.workspace.next.mode = 'reject';
    await expect(harness.api.open({ title: 'A', reuse: true })).rejects.toThrow('refused');
    const fresh = await harness.api.open({ title: 'A', reuse: true });
    expect(harness.views.list().map((info) => info.viewId)).toEqual([fresh.viewId]);
  });

  it('checks maxDice: a whole number from 1 to 100, 100 by default, and the tray follows it', async () => {
    const harness = await remoteHarness();
    for (const maxDice of [0, 101, 2.5, Number.NaN, '20']) {
      await expect(harness.api.open({ title: 'A', maxDice: maxDice as never })).rejects.toThrow(/maxDice/);
    }
    const plain = await harness.api.open({ title: 'A' });
    const limited = await harness.api.open({ title: 'B', maxDice: 20 });
    const maxOf = (viewId: string): number | undefined => harness.tracker.view(viewId)?.atlasStore.getState().remoteView?.maxDice;
    expect(maxOf(plain.viewId)).toBe(100);
    expect(maxOf(limited.viewId)).toBe(20);
  });

  it('is never presented to players by the Present commands', async () => {
    const harness = await remoteHarness();
    const handle = await harness.api.open({ title: 'A' });
    const view = harness.workspace.leavesOf('atlas-vtt-remote')[0]!.view as RemoteMapView;
    await presentViewToPlayers(view);
    expect(presentedScene.current()).toBeNull();
    handle.close();
  });
});
