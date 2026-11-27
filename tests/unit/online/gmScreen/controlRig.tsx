import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { ARM_MS } from '../../../../src/app/online/gm/armedCards.ts';
import type { GmScreenSession } from '../../../../src/app/online/gmScreen/index.ts';
import { setGmScreenHost } from '../../../../src/app/online/gmScreen/gmScreenSlot.ts';
import { GmScreenControl } from '../../../../src/app/online/gmScreen/ui/GmScreenControl';
import { accountRig } from '../gm/accountRig.ts';
import { sessionRig, type Rig } from './sessionRig.ts';

/** Names the session for the control, with an account that may host. */
export async function hosted(session: GmScreenSession): Promise<void> {
  const account = accountRig('bearer-token');
  await account.control.refresh();
  setGmScreenHost({ session, account: account.control });
}

/** The control over a session the rig runs, rendered into `container` (the body of the test's document unless told). */
export async function shown(container?: HTMLElement): Promise<Rig> {
  const rig = sessionRig();
  await hosted(rig.session);
  render(<GmScreenControl />, container === undefined ? undefined : { container });
  return rig;
}

export const panel = (): HTMLElement => screen.getByRole('dialog', { name: 'Sidekick' });

/** Opens the panel and starts Sidekick from it, the relay welcoming Atlas. */
export async function startedFromPanel(rig: Rig): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: 'Start Sidekick' }));
  fireEvent.click(within(panel()).getByRole('button', { name: 'Start Sidekick' }));
  await act(async () => {
    await Promise.resolve();
    await rig.settle();
  });
  act(() => rig.socket().welcome());
}

/** A device asks to join, and the prompt stands long enough to take an answer. */
export async function knocks(rig: Rig, id: string, name: string): Promise<void> {
  await rig.device(id);
  await act(async () => {
    rig.socket().receive({ t: 'knock', id, name });
    await rig.settle();
    rig.timers.advance(ARM_MS);
  });
}

/** A device asks, is allowed and connects. */
export async function connects(rig: Rig, id: string, name: string): Promise<void> {
  await knocks(rig, id, name);
  fireEvent.click(screen.getByRole('button', { name: 'Allow' }));
  await act(async () => {
    rig.socket().receive({ t: 'player-joined', id, name });
    await rig.settle();
  });
}

/** Waits, in real time, until the panel's buttons that appeared or moved take a press (`useArmed`). */
export async function armed(): Promise<void> {
  await act(() => new Promise<void>((resolve) => setTimeout(resolve, ARM_MS + 50)));
}
