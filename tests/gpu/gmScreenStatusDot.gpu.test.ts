import '../setup/obsidianDom';
import { act, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ARM_MS } from '../../src/app/online/gm/armedCards.ts';
import { accountRig } from '../unit/online/gm/accountRig.ts';
import { control, dmScreen, handTimers, scriptedSession, shot } from './gmScreenRig.ts';

const PHONE = 'p'.repeat(20);

let teardown = (): void => undefined;
afterEach(() => teardown());

const button = (): HTMLElement => document.querySelector<HTMLElement>('.atlas-gm-screen-control__button')!;
const dot = (): HTMLElement => button().querySelector<HTMLElement>('.atlas-online-status__dot')!;

/** A theme colour as the browser draws it, read off a probe so `var()` and mixes come out as one colour. */
function drawn(variable: string): string {
  const probe = document.body.appendChild(document.createElement('i'));
  probe.style.backgroundColor = `var(${variable})`;
  const colour = getComputedStyle(probe).backgroundColor;
  probe.remove();
  return colour;
}

describe('Sidekick\'s control in the DM screen, laid out by the real stylesheet', () => {
  it('shows its name and the online control\'s dot, grey while off and green while it runs with a device, and never a number', async () => {
    const view = await dmScreen('dark');
    teardown = view.remove;
    const timers = handTimers();
    const { session, relay } = scriptedSession(timers);
    const account = accountRig('bearer-token');
    await account.control.refresh();
    control(view.leaf, session, account);

    expect(getComputedStyle(dot()).backgroundColor).toBe(drawn('--text-faint'));
    expect(dot().getBoundingClientRect().width).toBe(8);
    expect(button().textContent).toBe('Sidekick');
    await shot('t1-dm-screen-status-off', button());

    act(() => screen.getByRole('button', { name: 'Start Sidekick' }).click());
    const panel = document.querySelector<HTMLElement>('.atlas-gm-screen-panel')!;
    await act(async () => within(panel).getByRole('button', { name: 'Start Sidekick' }).click());
    await expect.poll(() => document.querySelector('.atlas-gm-screen-code[data-status="online"]')).not.toBeNull();
    await act(async () => {
      relay.gate?.knocked({ id: PHONE, name: 'iPhone' });
      await expect.poll(() => session.view().knock?.check).not.toBeNull();
      timers.advance(ARM_MS);
    });
    await act(async () => {
      session.allow(PHONE);
      relay.events?.joined({ id: PHONE, name: 'iPhone' });
    });
    act(() => within(document.querySelector<HTMLElement>('.atlas-gm-screen-panel')!).getByRole('button', { name: 'Close' }).click());
    await expect.poll(() => document.querySelector('.atlas-gm-screen-panel')).toBeNull();

    expect(getComputedStyle(dot()).backgroundColor).toBe(drawn('--color-green'));
    expect(button().textContent).toBe('Sidekick');
    expect(screen.getByRole('button', { name: 'Sidekick runs' })).toBe(button());
    await shot('t1-dm-screen-status-on', button());
  });
});
