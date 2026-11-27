// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { setGmScreenHost } from '../../../../src/app/online/gmScreen/gmScreenSlot.ts';
import { GmScreenControl } from '../../../../src/app/online/gmScreen/ui/GmScreenControl';
import { accountRig, APPROVED, MAY_HOST, NO_ACCESS, type AccountRig } from '../gm/accountRig.ts';
import { sessionRig, type Rig } from './sessionRig.ts';

afterEach(() => {
  cleanup();
  setGmScreenHost(null);
});

const panel = (): HTMLElement => screen.getByRole('dialog', { name: 'Sidekick' });

/** The panel's buttons by their words, the Close button left out, disabled ones marked. */
const buttons = (): string[] => within(panel()).getAllByRole('button').filter((button) => !button.classList.contains('atlas-close-btn')).map((button) => `${button.textContent ?? ''}${(button as HTMLButtonElement).disabled ? ' (disabled)' : ''}`);

/** The DM screen's control with its panel open, over a session the rig runs and the account `account` scripts. */
async function opened(account: AccountRig): Promise<Rig> {
  const rig = sessionRig();
  setGmScreenHost({ session: rig.session, account: account.control });
  render(<GmScreenControl />);
  fireEvent.click(screen.getByRole('button', { name: 'Start Sidekick' }));
  await act(() => account.settle());
  return rig;
}

describe('Sidekick\'s panel and the Atlas account', () => {
  it('signed out, offers the sign-in as its one button under what Sidekick is, and no Start', async () => {
    await opened(accountRig());
    expect(within(panel()).getByText(/Your phone or tablet as a second screen/)).toBeTruthy();
    expect(buttons()).toEqual(['Sign in to host']);
    expect(within(panel()).queryByRole('status')).toBeNull();
  });

  it('shows the code while the browser approval waits, and goes on to Start once it is approved', async () => {
    const account = accountRig();
    const rig = await opened(account);
    fireEvent.click(within(panel()).getByRole('button', { name: 'Sign in to host' }));
    await act(() => account.settle());
    expect(account.opened).toEqual(['http://site.test/device?user_code=ABCDEFGH']);
    expect(within(panel()).getByLabelText('Code A B C D E F G H').textContent).toBe('ABCD-EFGH');
    expect(buttons()).toEqual(['Open again', 'Cancel']);

    account.poll = APPROVED;
    await act(async () => {
      account.timers.advance(5000);
      await account.settle();
    });
    expect(buttons()).toEqual(['Start Sidekick']);
    fireEvent.click(within(panel()).getByRole('button', { name: 'Start Sidekick' }));
    await act(() => rig.settle());
    expect(rig.created).toHaveLength(1);
  });

  it('cancels a sign-in back to the sign-in button', async () => {
    const account = accountRig();
    await opened(account);
    fireEvent.click(within(panel()).getByRole('button', { name: 'Sign in to host' }));
    await act(() => account.settle());
    fireEvent.click(within(panel()).getByRole('button', { name: 'Cancel' }));
    await act(() => account.settle());
    expect(buttons()).toEqual(['Sign in to host']);
    expect(account.tokens.value).toBeNull();
  });

  it('signed in without the right to host, says why and offers the account page, never Start', async () => {
    const account = accountRig('bearer-token');
    account.me = NO_ACCESS;
    const rig = await opened(account);
    expect(within(panel()).getByText('Online play is in early access. Redeem an invite key on your account page.')).toBeTruthy();
    expect(buttons()).toEqual(['Sign out', 'Open account page']);
    fireEvent.click(within(panel()).getByRole('button', { name: 'Open account page' }));
    expect(account.opened).toHaveLength(1);
    expect(rig.created).toEqual([]);
  });

  it('keeps Start waiting while the account is checked, and offers a retry while the server cannot be reached', async () => {
    const checking = accountRig('bearer-token');
    checking.holdMe = true;
    await opened(checking);
    expect(within(panel()).getByRole('status').textContent).toBe('Checking your account…');
    expect(buttons()).toEqual(['Start Sidekick (disabled)']);
    cleanup();

    const offline = accountRig('bearer-token');
    offline.reachable = false;
    await opened(offline);
    expect(within(panel()).getByRole('status').textContent).toBe('Can’t reach Atlas sign-in right now.');
    expect(buttons()).toEqual(['Try again']);
    offline.reachable = true;
    offline.me = MAY_HOST;
    fireEvent.click(within(panel()).getByRole('button', { name: 'Try again' }));
    await act(() => offline.settle());
    expect(buttons()).toEqual(['Start Sidekick']);
  });
});
