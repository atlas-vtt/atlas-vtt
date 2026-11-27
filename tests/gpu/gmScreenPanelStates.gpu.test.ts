import '../setup/obsidianDom';
import { act, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ARM_MS } from '../../src/app/online/gm/armedCards.ts';
import type { GmScreenSession } from '../../src/app/online/gmScreen/index.ts';
import { CLOSE } from '../../src/app/online/protocol/index.ts';
import { accountRig, APPROVED, NO_ACCESS } from '../unit/online/gm/accountRig.ts';
import { control, dmScreen, handTimers, scriptedSession, shot, type ScriptedRelay, type Theme } from './gmScreenRig.ts';

const PHONE = 'p'.repeat(20);
const TABLET = 't'.repeat(20);

let teardown = (): void => undefined;
afterEach(() => teardown());

const panel = (): HTMLElement => document.querySelector<HTMLElement>('.atlas-gm-screen-panel')!;

/** A device asks to join and its prompt stands long enough to take an answer. */
async function knock(session: GmScreenSession, relay: ScriptedRelay, timers: ReturnType<typeof handTimers>, id: string, name: string): Promise<void> {
  await act(async () => {
    relay.gate?.knocked({ id, name });
    await expect.poll(() => session.view().knock?.check).not.toBeNull();
    timers.advance(ARM_MS);
  });
}

describe.each<Theme>(['dark', 'light'])('Sidekick\'s panel in each of its states, %s', (theme) => {
  it('runs: the code, a device asking, one connected, one away, the confirms, and the copy', async () => {
    const view = await dmScreen(theme);
    teardown = view.remove;
    const timers = handTimers();
    const { session, relay } = scriptedSession(timers);
    const account = accountRig('bearer-token');
    await account.control.refresh();
    control(view.leaf, session, account);
    await shot(`${theme}-01-control`, view.leaf.querySelector<HTMLElement>('.atlas-dm-screen-header')!);
    act(() => screen.getByRole('button', { name: 'Start Sidekick' }).click());
    await shot(`${theme}-02-off`, panel());
    await act(async () => within(panel()).getByRole('button', { name: 'Start Sidekick' }).click());
    await expect.poll(() => document.querySelector('.atlas-gm-screen-code[data-status="online"]')).not.toBeNull();
    await shot(`${theme}-03-running`, panel());

    await knock(session, relay, timers, PHONE, 'iPhone Fabian');
    await shot(`${theme}-04-allow`, panel());
    await act(async () => {
      session.allow(PHONE);
      relay.events?.joined({ id: PHONE, name: 'iPhone Fabian' });
    });
    await expect.poll(() => document.querySelector('.atlas-gm-screen-device[data-connected="true"]')).not.toBeNull();
    await shot(`${theme}-05-connected`, panel());

    await knock(session, relay, timers, TABLET, 'iPad');
    await act(async () => {
      session.allow(TABLET);
      relay.events?.joined({ id: TABLET, name: 'iPad' });
      relay.events?.left(TABLET);
    });
    act(() => within(panel()).getByRole('button', { name: 'Remove iPhone Fabian' }).click());
    await shot(`${theme}-06-remove-asks`, panel());
    act(() => within(panel()).getByRole('button', { name: 'New link' }).click());
    await shot(`${theme}-07-new-link-asks`, panel());
    act(() => within(panel()).getByRole('button', { name: 'Cancel' }).click());

    await act(async () => within(panel()).getByRole('button', { name: 'Copy link' }).click());
    await expect.poll(() => within(panel()).getByRole('button', { name: 'Copy link' }).dataset.state).toBe('copied');
    await shot(`${theme}-08-copied`, panel());

    act(() => relay.events?.left(PHONE));
    act(() => within(panel()).getByRole('button', { name: /Devices/ }).click());
    await shot(`${theme}-09-folded`, panel());

    act(() => relay.events?.status('connecting'));
    await shot(`${theme}-10-connecting`, panel());
    act(() => {
      if (relay.outbox) relay.outbox.closeCode = CLOSE.superseded;
      relay.events?.status('refused');
    });
    expect(within(panel()).getByRole('status').textContent).toContain('another computer');
    await shot(`${theme}-11-elsewhere`, panel());
  });

  it('signs in: signed out, the code to approve, and no right to host, each under the same icon and words', async () => {
    const view = await dmScreen(theme);
    teardown = view.remove;
    const { session } = scriptedSession(handTimers());
    const account = accountRig();
    control(view.leaf, session, account);
    act(() => screen.getByRole('button', { name: 'Start Sidekick' }).click());
    await act(() => account.settle());
    expect(panel().querySelector('.atlas-gm-screen-hero__icon')).not.toBeNull();
    expect(panel().querySelector('.atlas-gm-screen-start')).toBeNull();
    await shot(`${theme}-12-signed-out`, panel());
    await act(async () => {
      within(panel()).getByRole('button', { name: 'Sign in to host' }).click();
      await account.settle();
    });
    expect(within(panel()).getByLabelText('Code A B C D E F G H').textContent).toBe('ABCD-EFGH');
    await shot(`${theme}-13-approve`, panel());
    account.me = NO_ACCESS;
    account.poll = APPROVED;
    await act(async () => {
      account.timers.advance(5000);
      await account.settle();
    });
    expect(within(panel()).getByRole('button', { name: 'Open account page' })).toBeTruthy();
    await shot(`${theme}-14-no-access`, panel());
  });
});
