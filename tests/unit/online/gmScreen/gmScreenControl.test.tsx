// @vitest-environment jsdom
import React from 'react';
import { MotionGlobalConfig } from 'framer-motion';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ARM_MS } from '../../../../src/app/online/gm/armedCards.ts';
import { gmScreenControlShown, setGmScreenHost } from '../../../../src/app/online/gmScreen/gmScreenSlot.ts';
import { noticeKnocks } from '../../../../src/app/online/gmScreen/knockNotice.ts';
import { GmScreenControl } from '../../../../src/app/online/gmScreen/ui/GmScreenControl';
import { shownLink } from '../../../../src/app/online/gmScreen/ui/LinkCopy';
import { hosted, panel, shown, startedFromPanel } from './controlRig.tsx';
import { deviceId, RelaySocket, sessionRig } from './sessionRig.ts';

const PHONE = deviceId('p');

// The panel leaves through framer-motion's exit, which jsdom never plays to its end.
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
  vi.unstubAllGlobals();
});

describe('the DM screen\'s control for the GM screen', () => {
  it('is not there while online play is off', () => {
    render(<GmScreenControl />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('starts from its panel and then shows the QR code, the link with its key, and no device yet', async () => {
    const rig = await shown();
    await startedFromPanel(rig);
    const link = rig.session.view().link ?? '';
    expect(link).toContain(`#${rig.saved.at(-1)?.link.code}.${rig.saved.at(-1)?.link.key}`);
    expect(screen.getByRole('img', { name: 'QR code of the Sidekick link' })).toBeTruthy();
    const copy = screen.getByRole('button', { name: 'Copy link' });
    const { host, rest } = shownLink(link);
    expect(copy.textContent).toContain(`${host}${rest}`);
    expect(rest).toMatch(/#…$/);
    expect(copy.textContent).not.toContain(rig.saved.at(-1)?.link.key ?? 'no key');
    expect(screen.getByText('No device allowed yet.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sidekick runs: 0 devices connected' })).toBeTruthy();
  });

  it('asks about a device with its name and number, opening the panel, and takes the answer only once the prompt stood', async () => {
    const rig = await shown();
    await startedFromPanel(rig);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const device = await rig.device(PHONE);
    await act(async () => {
      rig.socket().receive({ t: 'knock', id: PHONE, name: 'Mira\'s phone' });
      await rig.settle();
    });
    const prompt = screen.getByRole('alertdialog', { name: 'Allow this device?' });
    expect(prompt.textContent).toContain('Mira\'s phone');
    expect(prompt.textContent).toContain(await device.check(PHONE));
    const allow = screen.getByRole('button', { name: 'Allow' });
    expect((allow as HTMLButtonElement).disabled).toBe(true);
    act(() => rig.timers.advance(ARM_MS));
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }));
    expect(rig.socket().framesOf('admit')).toEqual([{ v: 1, t: 'admit', id: PHONE }]);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('stands in for the knock notice while it shows, and no longer once it is gone', async () => {
    const rig = await shown();
    const told: string[] = [];
    const stop = noticeKnocks(rig.session, gmScreenControlShown, (text) => void told.push(text));
    await startedFromPanel(rig);
    await act(async () => {
      rig.socket().receive({ t: 'knock', id: PHONE, name: 'Phone' });
      await rig.settle();
    });
    expect(screen.getByRole('alertdialog', { name: 'Allow this device?' })).toBeTruthy();
    expect(told).toEqual([]);
    cleanup();
    rig.session.refuse(PHONE);
    rig.socket().receive({ t: 'knock', id: deviceId('t'), name: 'Tablet' });
    await rig.settle();
    expect(told).toEqual(['Tablet asks to join Sidekick. Open the DM screen to allow it.']);
    stop();
  });

  it('lists an allowed device as connected, and removes it', async () => {
    const rig = await shown();
    await startedFromPanel(rig);
    await rig.device(PHONE);
    await act(async () => {
      rig.socket().receive({ t: 'knock', id: PHONE, name: 'Phone' });
      await rig.settle();
      rig.timers.advance(ARM_MS);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }));
    await act(async () => {
      rig.socket().receive({ t: 'player-joined', id: PHONE, name: 'Phone' });
      await rig.settle();
    });
    expect(screen.getByText('Connected')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sidekick runs: 1 device connected' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Phone' }));
    expect(rig.socket().framesOf('kick')).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Press again to remove Phone' }));
    expect(rig.socket().framesOf('kick')).toEqual([{ v: 1, t: 'kick', id: PHONE }]);
    expect(screen.getByText('No device allowed yet.')).toBeTruthy();
  });

  it('stops from its panel, and says why a start was refused', async () => {
    const rig = sessionRig(null, () => Promise.resolve({ refused: 'Sign in to your Atlas account to start Sidekick.' }));
    await hosted(rig.session);
    render(<GmScreenControl />);
    fireEvent.click(screen.getByRole('button', { name: 'Start Sidekick' }));
    fireEvent.click(within(panel()).getByRole('button', { name: 'Start Sidekick' }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByRole('status').textContent).toBe('Sign in to your Atlas account to start Sidekick.');
    expect(RelaySocket.all).toEqual([]);
  });

  it('stops: the room ends and the panel offers Start again', async () => {
    const rig = await shown();
    await startedFromPanel(rig);
    const socket = rig.socket();
    fireEvent.click(screen.getByRole('button', { name: 'Stop Sidekick' }));
    expect(socket.framesOf('end')).toHaveLength(1);
    expect(within(panel()).getByRole('button', { name: 'Start Sidekick' })).toBeTruthy();
  });
});
