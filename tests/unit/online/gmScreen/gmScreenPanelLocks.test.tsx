// @vitest-environment jsdom
import { MotionGlobalConfig } from 'framer-motion';
import { act, cleanup, fireEvent, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setGmScreenHost } from '../../../../src/app/online/gmScreen/gmScreenSlot.ts';
import { armed, connects, panel, shown, startedFromPanel } from './controlRig.tsx';
import { deviceId, RelaySocket } from './sessionRig.ts';

const PHONE = deviceId('p');

const stop = (): HTMLElement => within(panel()).getByRole('button', { name: 'Stop Sidekick' });
const devices = (): HTMLElement => within(panel()).getByRole('button', { name: /Devices/ });
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

describe('the panel\'s controls when something moved them', () => {
  it('Stop and New link take a press at once as the devices fold opens for a known device that connects again', async () => {
    const rig = await shown();
    await startedFromPanel(rig);
    await connects(rig, PHONE, 'Phone');
    act(() => rig.socket().receive({ t: 'player-left', id: PHONE }));
    fireEvent.click(devices());
    await armed();
    await act(async () => {
      rig.socket().receive({ t: 'player-joined', id: PHONE, name: 'Phone' });
      await rig.settle();
    });
    expect(devices().getAttribute('aria-expanded')).toBe('true');
    expect([stop(), newLink()].map((button) => button.getAttribute('aria-disabled'))).toEqual([null, null]);
    fireEvent.click(stop());
    expect(rig.session.view().status).toBe('stopped');
  });

  it('Stop takes a press at once as the line under the code changes, again and again, between scanning and connecting', async () => {
    const rig = await shown();
    await startedFromPanel(rig);
    await armed();
    for (let flap = 0; flap < 3; flap++) {
      act(() => rig.socket().drop());
      await act(async () => {
        await rig.settle();
      });
    }
    act(() => rig.socket().drop());
    expect(within(panel()).getByText(/Connecting/)).toBeTruthy();
    expect(stop().getAttribute('aria-disabled')).toBeNull();
    fireEvent.click(stop());
    expect(rig.session.view().status).toBe('stopped');
  });

  it('a Remove\'s confirm tells a screen reader when it takes the second press', async () => {
    const rig = await shown();
    await startedFromPanel(rig);
    await connects(rig, PHONE, 'Phone');
    await armed();
    fireEvent.click(within(panel()).getByRole('button', { name: 'Remove Phone' }));
    const row = within(panel()).getByRole('listitem');
    expect(within(row).getByRole('status').textContent).toBe('');
    await armed();
    expect(within(row).getByRole('status').textContent).toBe('Press again to remove Phone');
  });
});
