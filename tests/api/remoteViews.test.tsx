import React from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/app/atlas-view', async () => import('./fakeAtlasView'));

import { tokensApi } from '../../src/api/tokens';
import { useExtensionToolbarItems } from '../../src/app/extensions/extensionToolbarItems';
import type { ViewAtlasStore } from '../../src/app/storeFactory';
import { REMOTE_DRAG_CANCEL, REMOTE_TOKEN_DROPPED } from '../../src/app/remote-view/remoteDrag';
import { fitRemoteMap, remoteTrayRoll } from '../../src/app/remote-view/remoteControls';
import { REMOTE_MAX_DICE } from '../../src/app/remote-view/RemoteViewDice';
import { DiceRollLog } from '../../src/app/react/components/dice-log/DiceRollLog';
import { DiceDropdownMenu } from '../../src/app/react/components/dice/DiceDropdownMenu';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import type { DiceTool } from '../../src/app/tools/DiceTool';
import type { DiceRollResult } from '../../src/app/tools/diceRolling';
import type { AtlasView as FakeAtlasView } from './fakeAtlasView';
import { resolveMeasurementSettings } from '../../src/app/grid/measurementFormat';
import { mapMeasurementSettings } from '../../src/app/services/mapMeasurementSettings';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { getHistoryStore } from '../../src/app/stores/history';
import { remoteScene, remoteToken } from '../unit/remoteSceneFixtures';
import { fakePlugin } from './apiFakes';
import { remoteHarness, remoteHostHarness, type RemoteHarness } from './remoteViewHarness';

/** The store of the remote view `viewId`, as the tracker sees it. */
function storeOf(harness: RemoteHarness, viewId: string): NonNullable<ReturnType<RemoteHarness['tracker']['view']>>['atlasStore'] {
  const view = harness.tracker.view(viewId);
  if (!view) throw new Error(`no view ${viewId}`);
  return view.atlasStore;
}

afterEach(() => { cleanup(); vi.useRealTimers(); });
Element.prototype.scrollTo = vi.fn();

describe('remoteViews', () => {
  it('C-remote-1: open with reuse reveals the same tab; close fires onClose once; the view is never active() and never saved', async () => {
    vi.useFakeTimers();
    const harness = await remoteHarness();
    const { api, views, workspace, files } = harness;
    const before = JSON.stringify([...files].sort());
    const first = await api.open({ title: 'Remote scene', icon: 'network', reuse: true });
    const again = await api.open({ title: 'Remote scene', reuse: true });
    expect(again.viewId).toBe(first.viewId);
    expect(workspace.leavesOf('atlas-vtt-remote')).toHaveLength(1);
    expect(workspace.revealed.length).toBeGreaterThanOrEqual(2);
    const closed = vi.fn();
    first.onClose(closed);
    expect(views.list().find((info) => info.viewId === first.viewId)?.kind).toBe('remote');
    // It is the workspace's active view, and still never active().
    expect(views.active()).toBeNull();
    // Never saved: an inert store with no history, and the vault untouched past every save debounce.
    const store = storeOf(harness, first.viewId);
    expect(store.getState().persistenceEnabled).toBe(false);
    store.getState().setPersistenceEnabled(true);
    store.getState().addToken({ x: 10, y: 10, imagePath: 'blob:app://obsidian.md/a' });
    await store.flushStorage();
    await vi.advanceTimersByTimeAsync(5000);
    expect(JSON.stringify([...files].sort())).toBe(before);
    expect(getHistoryStore(store)?.getState().pastStates).toHaveLength(0);
    first.close();
    first.close();
    expect(closed).toHaveBeenCalledTimes(1);
    expect(workspace.leavesOf('atlas-vtt-remote')).toHaveLength(0);
    expect(views.list()).toEqual([]);
  });

  it("tells a toolbar item's isVisible ownRemote only in the remote view its own extension opened", async () => {
    const { host, plugin, workspace } = await remoteHostHarness();
    const own = host.api.connect(plugin);
    const other = host.api.connect(fakePlugin('ext-other'));
    const asked: Array<[string, boolean]> = [];
    const item = (id: string) => ({ id, icon: 'map', label: id, views: ['remote'] as Array<'remote'>, onClick: () => undefined,
      isVisible: (ctx: { ownRemote: boolean }): boolean => { asked.push([id, ctx.ownRemote]); return ctx.ownRemote; } });
    own.ui.addToolbarItem(item('own'));
    other.ui.addToolbarItem(item('other'));
    const view = await own.remoteViews!.open({ title: 'X' });
    const leaf = workspace.leavesOf('atlas-vtt-remote')[0]!;
    const { result } = renderHook(() => useExtensionToolbarItems(view.viewId, (leaf.view as { atlasStore: ViewAtlasStore }).atlasStore, false));
    expect(result.current.map(({ id }) => id)).toEqual(['ext:ext:own']);
    expect(asked.slice(-2)).toEqual([['own', true], ['other', false]]);
    host.dispose();
  });

  it('C-remote-2: unloading the extension or Atlas closes its remote views', async () => {
    const { host, plugin, workspace } = await remoteHostHarness();
    const view = await host.api.connect(plugin).remoteViews!.open({ title: 'X' });
    const closed = vi.fn();
    view.onClose(closed);
    plugin.unload();
    expect(closed).toHaveBeenCalledTimes(1);
    expect(workspace.leavesOf('atlas-vtt-remote')).toHaveLength(0);

    const again = await host.api.connect(fakePlugin('ext2')).remoteViews!.open({ title: 'Y' });
    const closedAgain = vi.fn();
    again.onClose(closedAgain);
    host.dispose();
    expect(closedAgain).toHaveBeenCalledTimes(1);
    expect(workspace.leavesOf('atlas-vtt-remote')).toHaveLength(0);
  });

  it('closing the tab by hand closes the handle once, lets the extension go and keeps other owners apart', async () => {
    const harness = await remoteHarness();
    const first = await harness.api.open({ title: 'A' });
    const second = await harness.api.open({ title: 'B' });
    expect(second.viewId).not.toBe(first.viewId);
    const closed = vi.fn();
    first.onClose(closed);
    harness.workspace.leavesOf('atlas-vtt-remote')[0]!.detach();
    expect(closed).toHaveBeenCalledTimes(1);
    first.close();
    expect(closed).toHaveBeenCalledTimes(1);
    expect(harness.workspace.leavesOf('atlas-vtt-remote')).toHaveLength(1);
    harness.dispose();
    expect(harness.workspace.leavesOf('atlas-vtt-remote')).toHaveLength(0);
  });

  it('runs a throwing close listener guarded and still tells the others', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { api } = await remoteHarness();
    const view = await api.open({ title: 'A' });
    const after = vi.fn();
    view.onClose(() => { throw new Error('boom'); });
    view.onClose(after);
    view.close();
    expect(after).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('does nothing once closed, whatever is called, and keeps no listener', async () => {
    const { api } = await remoteHarness();
    const view = await api.open({ title: 'A' });
    view.close();
    const listener = vi.fn();
    expect(() => {
      view.setScene(remoteScene());
      view.setPlayer({ movableTokenIds: [], measurement: resolveMeasurementSettings(undefined, null), tokenUi: { conditions: [], resources: {} }, initiative: { rules: null, health: {} } });
      view.setStatus({ title: 'T', connection: 'C', tone: 'ended', message: null });
      view.setDiceLog([]);
      view.throwRoll({ id: 'r', timestamp: 0, formula: '1d6', rolls: [{ die: 'd6', value: 1, max: 6 }], modifiers: 0, total: 1 } as never);
      view.setCamera({ centerX: 0, centerY: 0, width: 10, height: 10 });
      view.cancelDrag();
      view.close();
      for (const add of [view.onTokenDrop, view.onCameraMoved, view.onRoll, view.onClose, view.onStatusAction!]) add(listener)();
    }).not.toThrow();
    expect(listener).not.toHaveBeenCalled();
  });

  it('a view revealed again with reuse keeps the title, icon and dice limit it opened with', async () => {
    const harness = await remoteHarness();
    const first = await harness.api.open({ title: 'First', icon: 'network', reuse: true, maxDice: 20 });
    await harness.api.open({ title: 'Second', icon: 'map', reuse: true, maxDice: 5 });
    const leaf = harness.workspace.leavesOf('atlas-vtt-remote')[0]!;
    const view = leaf.view as { getDisplayText(): string; getIcon(): string };
    expect(view.getDisplayText()).toBe('First');
    expect(view.getIcon()).toBe('network');
    expect(storeOf(harness, first.viewId).getState().remoteView?.maxDice).toBe(20);
  });

  it('hands out a frozen handle and refuses a malformed title', async () => {
    const { api } = await remoteHarness();
    const view = await api.open({ title: 'A' });
    expect(Object.isFrozen(view)).toBe(true);
    await expect(api.open({ title: '' })).rejects.toThrow(/title/);
    await expect(api.open({ title: 'A', icon: 3 as never })).rejects.toThrow(/icon/);
  });

  it('C-remote-3: setScene shows in the snapshot, loaded; null unloads; a GM view keeps its own measurement', async () => {
    vi.useFakeTimers();
    const harness = await remoteHarness();
    const before = JSON.stringify([...harness.files].sort());
    const view = await harness.api.open({ title: 'A' });
    view.setScene(remoteScene({ objects: { tokens: { t1: remoteToken('t1'), t2: remoteToken('t2', { x: 300 }) }, texts: {}, drawings: {}, fog: {} } }));
    const snapshot = harness.views.snapshot(view.viewId);
    expect(snapshot?.loaded).toBe(true);
    expect(snapshot?.mapPath).toBe(`remote:${view.viewId}`);
    expect(Object.keys(snapshot?.objects.tokens ?? {})).toEqual(['t1', 't2']);
    const measurement = { ...resolveMeasurementSettings(undefined, null), unitDistance: 10, coneAngle: 60 };
    view.setPlayer({ movableTokenIds: ['t1'], measurement, tokenUi: { conditions: [], resources: {} }, initiative: { rules: null, health: {} } });
    const store = storeOf(harness, view.viewId);
    const assets = { getCollectionForMap: () => null } as never;
    expect(mapMeasurementSettings(assets, store.getState())).toEqual(measurement);
    const gm = createViewAtlasStore(harness.app, 'gm-view');
    expect(mapMeasurementSettings(assets, gm.getState())).toEqual(resolveMeasurementSettings(undefined, gm.getState().grid));
    // Read-only: tokens.move refuses it; nothing of it reaches the vault or the history.
    expect(tokensApi(harness.tracker).move(view.viewId, [{ tokenId: 't1', x: 500, y: 500 }])).toEqual({ ok: false, reason: 'not-loaded' });
    await vi.advanceTimersByTimeAsync(5000);
    expect(JSON.stringify([...harness.files].sort())).toBe(before);
    expect(getHistoryStore(store)?.getState().pastStates).toHaveLength(0);
    view.setScene(null);
    expect(harness.views.snapshot(view.viewId)?.loaded).toBe(false);
    expect(harness.views.snapshot(view.viewId)?.objects.tokens).toEqual({});
    expect(() => view.setScene({ nonsense: true } as never)).toThrow(/RemoteSceneInput/);
    view.close();
    expect(() => view.setScene(remoteScene())).not.toThrow();
  });

  it('C-remote-4: onTokenDrop fires for movable ids only; lasers work in the remote view; onCameraMoved after a pan and Fit map', async () => {
    const harness = await remoteHarness();
    const view = await harness.api.open({ title: 'A' });
    const fake = harness.tracker.view(view.viewId) as unknown as FakeAtlasView;
    view.setScene(remoteScene({ objects: { tokens: { t1: remoteToken('t1'), t2: remoteToken('t2') }, texts: {}, drawings: {}, fog: {} } }));
    view.setPlayer({ movableTokenIds: ['t1'], measurement: resolveMeasurementSettings(undefined, null), tokenUi: { conditions: [], resources: {} }, initiative: { rules: null, health: {} } });
    const drops = vi.fn();
    view.onTokenDrop(drops);
    fake.eventBus.emit(REMOTE_TOKEN_DROPPED, { tokenId: 't2', x: 1, y: 2 });
    fake.eventBus.emit(REMOTE_TOKEN_DROPPED, { tokenId: 't1', x: 175, y: 105 });
    expect(drops.mock.calls).toEqual([[{ tokenId: 't1', x: 175, y: 105 }]]);
    expect(Object.isFrozen(drops.mock.calls[0]![0])).toBe(true);

    const local = vi.fn();
    harness.lasers.onLocal(view.viewId, local);
    fake.renderer.laserHub.emitLocal({ kind: 'point', x: 5, y: 6 });
    expect(local).toHaveBeenCalledWith({ kind: 'point', x: 5, y: 6 });
    const shown = vi.fn();
    fake.renderer.laserHub.onRemote(shown);
    harness.lasers.show(view.viewId, { from: 'p1', color: '#ff0000', points: [{ x: 1, y: 1 }], lifted: false });
    expect(shown).toHaveBeenCalledOnce();

    const moved = vi.fn();
    view.onCameraMoved(moved);
    view.setCamera({ centerX: 200, centerY: 100, width: 400, height: 300 });
    expect(fake.viewport.center).toEqual({ x: 200, y: 100 });
    expect(moved).not.toHaveBeenCalled();
    fake.viewport.moved('drag');
    expect(moved).toHaveBeenLastCalledWith(true);
    expect(fitRemoteMap(view.viewId)).toBe(true);
    expect(moved).toHaveBeenLastCalledWith(false);
    expect(() => view.setCamera({ centerX: 0, centerY: 0, width: 0, height: 1 })).toThrow(/camera/);
    expect(() => view.setCamera({ centerX: Number.NaN, centerY: 0, width: 10, height: 10 })).toThrow(/camera/);
    let reads = 0;
    const shifty = { centerY: 100, width: 400, height: 300, get centerX(): number { return reads++ === 0 ? 200 : Number.NaN; } };
    view.setCamera(shifty);
    expect(reads).toBe(1);
    expect(fake.viewport.center).toEqual({ x: 200, y: 100 });
    const { screenWidth, screenHeight } = fake.viewport;
    view.setCamera({ centerX: 200, centerY: 100, width: 400, height: 300 }, { padded: true });
    expect(fake.viewport.scale.x).toBeCloseTo(Math.min((screenWidth - 32) / 400, (screenHeight - 32) / 300));
  });

  it('a new scene leaves a dragged token under the pointer, and ends a drag whose token may no longer move', async () => {
    const harness = await remoteHarness();
    const view = await harness.api.open({ title: 'A' });
    const fake = harness.tracker.view(view.viewId) as unknown as FakeAtlasView;
    const store = storeOf(harness, view.viewId);
    const player = { measurement: resolveMeasurementSettings(undefined, null), tokenUi: { conditions: [], resources: {} }, initiative: { rules: null, health: {} } };
    view.setPlayer({ ...player, movableTokenIds: ['t1'] });
    view.setScene(remoteScene());
    store.setState({ isDragging: true, selectedIds: ['t1'] });
    store.getState().setTokenPositions([{ id: 't1', x: 400, y: 400 }]);
    view.setScene(remoteScene({ objects: { tokens: { t1: remoteToken('t1', { x: 120 }) }, texts: {}, drawings: {}, fog: {} } }));
    expect(store.getState().objects.tokens.t1).toMatchObject({ x: 400, y: 400 });
    // What the drag controller does on cancel: the drag ends and the token goes back to where it started.
    const cancelled = vi.fn(() => {
      store.setState({ isDragging: false });
      store.getState().setTokenPositions([{ id: 't1', x: 100, y: 100 }]);
    });
    fake.eventBus.on(REMOTE_DRAG_CANCEL, cancelled);
    view.setPlayer({ ...player, movableTokenIds: [] });
    expect(cancelled).toHaveBeenCalledOnce();
    // The scene then puts it where the latest scene has it.
    expect(store.getState().objects.tokens.t1).toMatchObject({ x: 120, y: 100 });
    store.setState({ isDragging: true, selectedIds: ['t1'] });
    view.cancelDrag();
    expect(cancelled).toHaveBeenCalledTimes(2);
    expect(store.getState().objects.tokens.t1).toMatchObject({ x: 120, y: 100 });
    expect(getHistoryStore(store)?.getState().pastStates).toHaveLength(0);
  });

  it('C-remote-5: the tray shows an onRoll refusal and closes once sent; the shared log renders without Clear; throwRoll once per id', async () => {
    const harness = await remoteHarness();
    const view = await harness.api.open({ title: 'A' });
    const store = storeOf(harness, view.viewId);
    const rollDice = vi.fn();
    const onToggle = vi.fn();
    const ui = { app: harness.app, view: { viewId: view.viewId, serviceManager: {} } as never, pixiApp: null, renderer: null };
    render(
      <AtlasUIContext.Provider value={ui}>
        {/* The tray sits in the remote view's store, as in Atlas: a player view, so it offers no Show my rolls switch. */}
        <ViewStoreProvider store={store as never}>
          <DiceDropdownMenu diceTool={{ rollDice } as unknown as DiceTool} isOpen onToggle={onToggle} onRoll={remoteTrayRoll(view.viewId)} maxDice={REMOTE_MAX_DICE} />
        </ViewStoreProvider>
      </AtlasUIContext.Provider>,
    );
    const stop = view.onRoll(() => 'Not connected');
    fireEvent.click(screen.getByLabelText(/^Add a d20/));
    fireEvent.click(screen.getByText('Roll'));
    expect(await screen.findByText('Not connected')).toBeTruthy();
    expect(onToggle).not.toHaveBeenCalled();
    stop();
    const sent = vi.fn((): string | null => null);
    view.onRoll(sent);
    fireEvent.click(screen.getByText('Roll'));
    expect(sent).toHaveBeenCalledWith({ d20: 1 }, 0);
    expect(onToggle).toHaveBeenCalledOnce();
    expect(rollDice).not.toHaveBeenCalled();
    cleanup();

    const entry: DiceRollResult = { id: 'r1', timestamp: 0, formula: '1d20+2', rolls: [{ die: 'd20', value: 13, max: 20 }], modifiers: 2, total: 15, crit: null, rolledBy: 'Anna' };
    const log = render(
      <AtlasUIContext.Provider value={ui}>
        <ViewStoreProvider store={store as never}><DiceRollLog isOpen onClose={() => undefined} /></ViewStoreProvider>
      </AtlasUIContext.Provider>,
    );
    act(() => view.setDiceLog([entry]));
    expect(log.container.textContent).toContain('1d20+2');
    expect(screen.queryByLabelText('Clear history')).toBeNull();
    expect(store.getState().diceLog).toEqual([]);

    view.throwRoll(entry);
    const thrown = store.getState().remoteView?.ownRoll;
    expect(thrown).toEqual(entry);
    view.throwRoll({ ...entry, total: 99 });
    expect(store.getState().remoteView?.ownRoll).toBe(thrown);
    view.throwRoll({ ...entry, id: 'r2' });
    view.throwRoll(entry);
    expect(store.getState().remoteView?.ownRoll?.id).toBe('r2');
    view.setStatus({ title: 'T', connection: 'Connected', tone: 'connected', message: null });
    expect(store.getState().remoteView?.status.connection).toBe('Connected');
    const statusAction = vi.fn();
    view.onStatusAction!(statusAction);
    view.setStatus({ title: 'T', connection: 'Connected', tone: 'connected', message: null, actions: [{ id: 'shared', label: 'Library' }] });
    store.getState().remoteView?.status.actions?.[0]?.run();
    expect(statusAction).toHaveBeenCalledExactlyOnceWith('shared');
    view.close();
    store.getState().remoteView?.status.actions?.[0]?.run();
    expect(statusAction).toHaveBeenCalledOnce();
    expect(() => view.onStatusAction!(vi.fn())()).not.toThrow();
    expect(() => view.throwRoll({ ...entry, id: 'r2' })).not.toThrow();
  });
});
