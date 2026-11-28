// @vitest-environment jsdom
import { MotionGlobalConfig } from 'framer-motion';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setGmScreenHost } from '../../../../src/app/online/gmScreen/gmScreenSlot.ts';
import { armed, connects, knocks, panel, shown, startedFromPanel } from './controlRig.tsx';
import { deviceId, RelaySocket } from './sessionRig.ts';

const PHONE = deviceId('p');
const TABLET = deviceId('t');

const stop = (): HTMLElement => within(panel()).getByRole('button', { name: 'Stop Sidekick' });
const newLink = (): HTMLElement => within(panel()).getByRole('button', { name: 'New link' });

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});
beforeEach(() => {
  RelaySocket.all = [];
});
afterEach(() => {
  cleanup();
  setGmScreenHost(null);
});

describe('the panel\'s Stop and New link under a resting pointer', () => {
  it('take no press in the moment the panel opened itself for a device that asks, and do once it stood', async () => {
    const rig = await shown();
    await startedFromPanel(rig);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await knocks(rig, PHONE, 'Phone');
    fireEvent.click(stop());
    fireEvent.click(newLink());
    expect(rig.session.view().status).toBe('online');
    expect(within(panel()).queryByRole('group')).toBeNull();
    await armed();
    fireEvent.click(stop());
    expect(rig.session.view().status).toBe('stopped');
  });

  it('take a press at once while the panel stands open, as another device\'s prompt comes and the list of devices grows', async () => {
    const rig = await shown();
    await startedFromPanel(rig);
    await armed();
    await knocks(rig, PHONE, 'Phone');
    expect(stop().getAttribute('aria-disabled')).toBeNull();
    fireEvent.click(within(panel()).getByRole('button', { name: 'Allow' }));
    await act(async () => {
      rig.socket().receive({ t: 'player-joined', id: PHONE, name: 'Phone' });
      await rig.settle();
    });
    expect(stop().getAttribute('aria-disabled')).toBeNull();
    fireEvent.click(stop());
    expect(rig.session.view().status).toBe('stopped');
  });

  it('wait only once in an opening for a device that asks: a connection that comes and goes then locks nothing', async () => {
    const rig = await shown();
    await startedFromPanel(rig);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await knocks(rig, PHONE, 'Phone');
    expect(stop().getAttribute('aria-disabled')).toBe('true');
    await armed();
    act(() => rig.socket().drop());
    expect(within(panel()).getByText(/Connecting/)).toBeTruthy();
    expect([stop(), newLink()].map((button) => button.getAttribute('aria-disabled'))).toEqual([null, null]);
    fireEvent.click(stop());
    expect(rig.session.view().status).toBe('stopped');
  });

  it('make no new link from a double-click: the confirm\'s New link waits before it takes a press', async () => {
    const rig = await shown();
    await startedFromPanel(rig);
    await connects(rig, TABLET, 'Tablet');
    await armed();
    const link = rig.session.view().link;
    fireEvent.click(newLink());
    const confirm = within(within(panel()).getByRole('group')).getByRole('button', { name: 'New link' });
    fireEvent.click(confirm);
    expect(rig.session.view().link).toBe(link);
    expect(confirm.getAttribute('aria-disabled')).toBe('true');
  });
});
