// @vitest-environment jsdom
import { MotionGlobalConfig } from 'framer-motion';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setGmScreenHost } from '../../../../src/app/online/gmScreen/gmScreenSlot.ts';
import { armed, connects, knocks, panel, shown, startedFromPanel } from './controlRig.tsx';
import { deviceId, RelaySocket } from './sessionRig.ts';

const PHONE = deviceId('p');

const stop = (): HTMLElement => within(panel()).getByRole('button', { name: 'Stop Sidekick' });
const newLink = (): HTMLElement => within(panel()).getByRole('button', { name: 'New link' });
const locks = (): (string | null)[] => [stop(), newLink()].map((button) => button.getAttribute('aria-disabled'));

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

describe('the panel\'s Stop and New link after the New link question or a Stop', () => {
  it('take a press at once after Cancel of a question that stood its moment', async () => {
    const rig = await shown();
    await startedFromPanel(rig);
    await connects(rig, PHONE, 'Phone');
    await armed();
    fireEvent.click(newLink());
    await armed();
    fireEvent.click(within(panel()).getByRole('button', { name: 'Cancel' }));
    expect(locks()).toEqual([null, null]);
    fireEvent.click(stop());
    expect(rig.session.view().status).toBe('stopped');
  });

  it('take a press at once after Escape of a question that stood its moment', async () => {
    const rig = await shown();
    await startedFromPanel(rig);
    await connects(rig, PHONE, 'Phone');
    await armed();
    fireEvent.click(newLink());
    await armed();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    expect(within(panel()).queryByRole('group')).toBeNull();
    expect(locks()).toEqual([null, null]);
  });

  it('wait again in the question asked anew right after Cancel', async () => {
    const rig = await shown();
    await startedFromPanel(rig);
    await connects(rig, PHONE, 'Phone');
    await armed();
    fireEvent.click(newLink());
    await armed();
    fireEvent.click(within(panel()).getByRole('button', { name: 'Cancel' }));
    fireEvent.click(newLink());
    const confirm = within(within(panel()).getByRole('group')).getByRole('button', { name: 'New link' });
    expect(confirm.getAttribute('aria-disabled')).toBe('true');
  });

  it('take a press at once after Stop and Start in a panel that opened itself for a device that asks, once its moment ran out', async () => {
    const rig = await shown();
    await startedFromPanel(rig);
    fireEvent.click(within(panel()).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await knocks(rig, PHONE, 'Phone');
    await armed();
    fireEvent.click(stop());
    const start = within(panel()).getByRole('button', { name: 'Start Sidekick' });
    await act(async () => {
      fireEvent.click(start);
      await rig.settle();
    });
    expect(locks()).toEqual([null, null]);
  });
});
