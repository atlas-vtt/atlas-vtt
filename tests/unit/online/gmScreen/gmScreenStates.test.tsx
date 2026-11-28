// @vitest-environment jsdom
import React from 'react';
import { MotionGlobalConfig } from 'framer-motion';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setGmScreenHost } from '../../../../src/app/online/gmScreen/gmScreenSlot.ts';
import { GmScreenControl } from '../../../../src/app/online/gmScreen/ui/GmScreenControl';
import { CLOSE } from '../../../../src/app/online/protocol/index.ts';
import { armed, connects, hosted, panel, shown, startedFromPanel } from './controlRig.tsx';
import { deviceId, RelaySocket, sessionRig } from './sessionRig.ts';

const PHONE = deviceId('p');
const CONFIRM = 'Every device disconnects and has to scan the new code.';

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

describe('Sidekick\'s panel in each of its states', () => {
  it('names itself beside its icon in the control, names the panel without a heading or a cross of its own, and draws the icon in the code', async () => {
    const rig = await shown();
    const control = screen.getByRole('button', { name: 'Start Sidekick' });
    expect(control.querySelector('img.atlas-sidekick-icon')?.getAttribute('alt')).toBe('');
    expect(control.querySelector('svg')).toBeNull();
    await startedFromPanel(rig);
    // Its control names it right above it, and a press outside or Escape closes it
    expect(panel().getAttribute('aria-label')).toBe('Sidekick');
    expect(within(panel()).queryByRole('heading', { name: 'Sidekick' })).toBeNull();
    expect(within(panel()).queryByRole('button', { name: 'Close' })).toBeNull();
    const icon = control.querySelector('img')!.getAttribute('src');
    expect(icon).toMatch(/^data:image\/webp;base64,/);
    fireEvent.click(within(panel()).getByRole('button', { name: 'Show QR code' }));
    expect(within(panel()).getByRole('img', { name: 'QR code of the Sidekick link' }).querySelector('image')?.getAttribute('href')).toBe(icon);
  });

  it('while off, says what Sidekick is over Start, and Start says so while it starts', async () => {
    let answer = (): void => undefined;
    const rig = sessionRig(null, (code) => new Promise((resolve) => (answer = () => resolve({ room: { code, secret: 'room-secret-0123456789abcdef', maxPlayers: 4, kind: 'gm-screen' } }))));
    await hosted(rig.session);
    render(<GmScreenControl />);
    fireEvent.click(screen.getByRole('button', { name: 'Start Sidekick' }));
    expect(within(panel()).getByText(/Your phone or tablet as a second screen/)).toBeTruthy();
    fireEvent.click(within(panel()).getByRole('button', { name: 'Start Sidekick' }));
    expect((within(panel()).getByRole('button', { name: 'Starting Sidekick…' }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => {
      answer();
      await rig.settle();
    });
    expect(within(panel()).getByText('Connecting…')).toBeTruthy();
    expect(document.querySelector('.atlas-gm-screen-code')?.getAttribute('data-status')).toBe('connecting');
    act(() => rig.socket().welcome());
    expect(within(panel()).getByText('Scan with your phone or tablet.')).toBeTruthy();
    expect(document.querySelector('.atlas-gm-screen-code')?.getAttribute('data-status')).toBe('online');
  });

  it('started on another computer, says so over Start, and keeps the devices it knows', async () => {
    const rig = await shown();
    await startedFromPanel(rig);
    await connects(rig, PHONE, 'Phone');
    act(() => rig.socket().drop(CLOSE.superseded));
    expect(within(panel()).getByRole('status').textContent).toBe('Sidekick was started in another vault or on another computer, so it stopped here.');
    expect(within(panel()).getByRole('button', { name: 'Start Sidekick' })).toBeTruthy();
    expect(within(panel()).getByRole('button', { name: /Devices/ }).textContent).toBe('Devices1');
  });

  it('makes a new link at once while no device is allowed', async () => {
    const rig = await shown();
    await startedFromPanel(rig);
    await armed();
    const before = rig.session.view().link;
    await act(async () => {
      fireEvent.click(within(panel()).getByRole('button', { name: 'New link' }));
      await rig.settle();
    });
    expect(within(panel()).queryByText(CONFIRM)).toBeNull();
    expect(rig.session.view().link).not.toBe(before);
  });

  it('says first, in place, that a new link ends every device, and makes it only on the second press', async () => {
    const rig = await shown();
    await startedFromPanel(rig);
    await connects(rig, PHONE, 'Phone');
    await armed();
    const before = rig.session.view().link;
    fireEvent.click(within(panel()).getByRole('button', { name: 'New link' }));
    const ask = within(panel()).getByRole('group', { name: CONFIRM });
    expect(document.activeElement).toBe(within(ask).getByRole('button', { name: 'Cancel' }));
    fireEvent.click(within(ask).getByRole('button', { name: 'Cancel' }));
    expect(rig.session.view().link).toBe(before);
    await armed();
    fireEvent.click(within(panel()).getByRole('button', { name: 'New link' }));
    await armed();
    await act(async () => {
      fireEvent.click(within(within(panel()).getByRole('group', { name: CONFIRM })).getByRole('button', { name: 'New link' }));
      await rig.settle();
    });
    expect(rig.session.view().link).not.toBe(before);
    expect(rig.session.view().devices).toEqual([]);
  });

  it('stops on one press, since Start brings back the same link and devices', async () => {
    const rig = await shown();
    await startedFromPanel(rig);
    await connects(rig, PHONE, 'Phone');
    await armed();
    const link = rig.session.view().link;
    fireEvent.click(within(panel()).getByRole('button', { name: 'Stop Sidekick' }));
    expect(rig.session.view().status).toBe('stopped');
    expect(rig.saved.at(-1)?.devices.map((device) => device.id)).toEqual([PHONE]);
    await act(async () => {
      fireEvent.click(within(panel()).getByRole('button', { name: 'Start Sidekick' }));
      await rig.settle();
    });
    expect(rig.session.view().link).toBe(link);
  });

  it('goes from the DM screen the moment online play is switched off, panel and all', async () => {
    const rig = await shown();
    await startedFromPanel(rig);
    act(() => setGmScreenHost(null));
    expect(screen.queryByRole('button', { name: /Sidekick/ })).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
