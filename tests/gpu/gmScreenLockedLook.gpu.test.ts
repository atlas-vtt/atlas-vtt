import '../setup/obsidianDom';
import { act, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ARM_MS } from '../../src/app/online/gm/armedCards.ts';
import { accountRig } from '../unit/online/gm/accountRig.ts';
import { control, dmScreen, handTimers, scriptedSession } from './gmScreenRig.ts';

const PHONE = 'p'.repeat(20);

let teardown = (): void => undefined;
afterEach(() => teardown());

const panel = (): HTMLElement => document.querySelector<HTMLElement>('.atlas-gm-screen-panel')!;
const opacity = (name: string): string => getComputedStyle(within(panel()).getByRole('button', { name })).opacity;

describe('Sidekick\'s panel while its controls take no press', () => {
  it('shows Stop and New link a step back until they take a press again, as a Remove\'s confirm', async () => {
    const view = await dmScreen('dark');
    teardown = view.remove;
    const timers = handTimers();
    const { session, relay } = scriptedSession(timers);
    const account = accountRig('bearer-token');
    await account.control.refresh();
    control(view.leaf, session, account);
    act(() => screen.getByRole('button', { name: 'Start Sidekick' }).click());
    await act(async () => within(panel()).getByRole('button', { name: 'Start Sidekick' }).click());
    await expect.poll(() => document.querySelector('.atlas-gm-screen-code[data-status="online"]')).not.toBeNull();
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, ARM_MS + 50)));
    expect([opacity('Stop Sidekick'), opacity('New link')]).toEqual(['1', '1']);

    await act(async () => {
      relay.gate?.knocked({ id: PHONE, name: 'iPhone' });
      await expect.poll(() => session.view().knock?.check).not.toBeNull();
    });
    expect([opacity('Stop Sidekick'), opacity('New link')]).toEqual(['0.6', '0.6']);
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, ARM_MS + 50)));
    expect([opacity('Stop Sidekick'), opacity('New link')]).toEqual(['1', '1']);
  });
});
