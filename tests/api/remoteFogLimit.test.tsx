import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/app/atlas-view', async () => import('./fakeAtlasView'));

import { REMOTE_FOG_OPS_MAX } from '../../src/app/remote-view/remoteInput';
import { RemoteStatusBar } from '../../src/app/remote-view/RemoteStatusBar';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import type { FogOperation } from '../../src/app/types/fogTypes';
import { remoteScene } from '../unit/remoteSceneFixtures';
import { remoteHarness } from './remoteViewHarness';

afterEach(() => cleanup());

const rect = (i: number): FogOperation => ({ id: `f${i}`, kind: 'fog', type: 'rectangle', timestamp: i, isErasing: false, x: i % 900, y: 0, width: 10, height: 10 });
const fogOf = (count: number): Record<string, FogOperation> => Object.fromEntries(Array.from({ length: count }, (_, i) => [`f${i}`, rect(i)]));

describe('RemoteView.setScene with too much fog', () => {
  it('covers the view and says so in the status bar, without throwing; a smaller fog clears the message', async () => {
    const harness = await remoteHarness();
    const view = await harness.api.open({ title: 'A' });
    const store = harness.tracker.view(view.viewId)!.atlasStore;
    const bar = render(<ViewStoreProvider store={store as never}><RemoteStatusBar /></ViewStoreProvider>);
    act(() => view.setScene(remoteScene({ objects: { tokens: {}, texts: {}, drawings: {}, fog: fogOf(REMOTE_FOG_OPS_MAX + 1) } })));
    expect(store.getState().remoteView?.fogTooLarge).toBe(true);
    expect(Object.keys(harness.views.snapshot(view.viewId)?.objects.fog ?? {})).toEqual(['atlas-remote-fog-limit']);
    // Shown even before the owner set any status of its own, in the bar's polite live region.
    const message = bar.container.querySelector('[role="status"] .atlas-remote-status-bar__message--fog');
    expect(message?.textContent).toBe('This scene has too much fog to show, so the map stays covered.');
    act(() => view.setScene(remoteScene({ objects: { tokens: {}, texts: {}, drawings: {}, fog: fogOf(2) } })));
    expect(store.getState().remoteView?.fogTooLarge).toBe(false);
    expect(bar.container.querySelector('.atlas-remote-status-bar')).toBeNull();
    act(() => view.setScene(remoteScene({ objects: { tokens: {}, texts: {}, drawings: {}, fog: fogOf(REMOTE_FOG_OPS_MAX + 1) } })));
    // Under the operation cap, but one operation with too many points: the same cover and the same line.
    const points = Array.from({ length: 10_001 }, (_, i) => ({ x: i % 900, y: 5 }));
    act(() => view.setScene(remoteScene({ objects: { tokens: {}, texts: {}, drawings: {}, fog: { big: { id: 'big', kind: 'fog', type: 'lasso', timestamp: 1, isErasing: false, points } } } })));
    expect(store.getState().remoteView?.fogTooLarge).toBe(true);
    expect(Object.keys(harness.views.snapshot(view.viewId)?.objects.fog ?? {})).toEqual(['atlas-remote-fog-limit']);
    act(() => view.setScene(null));
    expect(store.getState().remoteView?.fogTooLarge).toBe(false);
    view.close();
  });
});
