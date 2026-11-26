import '../setup/obsidianDom';
import { createElement } from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import { ARM_MS } from '../../src/app/online/gm/armedCards.ts';
import type { Timers } from '../../src/app/online/gm/companionTimers.ts';
import type { GateEvents, TableEvents } from '../../src/app/online/gm/TableConnection.ts';
import type { TableOutbox } from '../../src/app/online/gm/tableOutbox.ts';
import { channelCryptoOf } from '../../src/app/online/gmScreen/channel/index.ts';
import { GmScreenSession } from '../../src/app/online/gmScreen/index.ts';
import { setGmScreenSession } from '../../src/app/online/gmScreen/gmScreenSlot.ts';
import { GmScreenControl } from '../../src/app/online/gmScreen/ui/GmScreenControl';

/** Obsidian's theme as far as the panel reads it. */
const THEME = `
  body { margin: 0; font: 13px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; --background-primary: #1e1e1e; --background-secondary: #262626; --background-modifier-border: #363636;
    --background-modifier-success: #2f6b3a; --text-normal: #dadada; --text-muted: #b3b3b3; --text-faint: #666; --text-error: #fb464c; --interactive-accent: #7f6df2; --interactive-normal: #2a2a2a;
    --color-green: #44cf6e; --text-on-accent: #fff; --radius-s: 4px; --radius-m: 8px; --radius-l: 12px; --radius-xl: 16px; --font-ui-smaller: 12px; --font-ui-small: 13px; --font-ui-medium: 15px;
    --font-semibold: 600; --input-height: 30px; --line-height-normal: 1.5; background: #111; }
  button, input { font: inherit; }
  button { height: 30px; }
`;

const DM_SCREEN = `
  <div class="atlas-vtt-plugin atlas-react-ui-container" style="position: absolute; inset: 0">
    <div class="atlas-ui" style="position: relative; width: 100%; height: 100%">
      <div class="atlas-dm-screen-wrapper">
        <div class="atlas-dm-screen-backdrop"></div>
        <div class="atlas-dm-screen atlas-dm-screen--pages is-visible" style="animation: none">
          <div class="atlas-dm-screen-header"><div class="atlas-segmented" style="height: 38px; width: 200px"></div></div>
        </div>
      </div>
    </div>
  </div>
`;

const SHOTS = '__screenshots__/gm-screen';
const PHONE = 'p'.repeat(20);

/** A screenshot once every entrance has run. */
async function shot(name: string, element: HTMLElement): Promise<void> {
  await Promise.all(document.getAnimations().map((animation) => animation.finished));
  await page.screenshot({ path: `${SHOTS}/${name}.png`, element });
}

/** Timers the test runs by hand. */
function handTimers(): Timers & { advance(ms: number): void } {
  let now = 0;
  let timers: { at: number; run: () => void; id: number }[] = [];
  let ids = 0;
  return {
    now: () => now,
    setTimer: (run, ms) => (timers.push({ at: now + ms, run, id: (ids += 1) }), ids),
    clearTimer: (id) => void (timers = timers.filter((timer) => timer.id !== id)),
    advance: (ms) => {
      now += ms;
      const due = timers.filter((timer) => timer.at <= now);
      timers = timers.filter((timer) => timer.at > now);
      for (const timer of due) timer.run();
    },
  };
}

/** A session whose relay is scripted: the room is made at once and welcomes Atlas; what Atlas sends is dropped. */
function scriptedSession(timers: Timers): { session: GmScreenSession; relay: { events: TableEvents | null; gate: GateEvents | null } } {
  const relay: { events: TableEvents | null; gate: GateEvents | null } = { events: null, gate: null };
  const ignore = (): void => undefined;
  const session = new GmScreenSession({
    crypto: channelCryptoOf(crypto),
    timers,
    origin: 'https://play.atlas-vtt.dev',
    create: (code) => Promise.resolve({ room: { code, secret: 'room-secret-0123456789abcdef', maxPlayers: 4, kind: 'gm-screen' } }),
    open: (_room, events, gate) => {
      relay.events = events;
      relay.gate = gate;
      return { start: () => (events.status('online'), events.welcome([])), stop: ignore, end: ignore, send: ignore, sendLive: ignore, sendTime: () => false, sendGate: ignore, answer: ignore, kick: ignore, setPlayers: ignore, sendCode: ignore, connected: new Set(), batches: true, minLevel: null, closeCode: null, onSent: null, stats: () => ({ status: 'online', reconnects: 0, lastClose: null, latencyMs: null, players: 0 }) } as unknown as TableOutbox;
    },
    save: ignore,
    notice: ignore,
    now: () => Date.now(),
  }, null);
  return { session, relay };
}

describe('the GM screen\'s control on the DM screen', () => {
  const style = document.createElement('style');
  const leaf = document.createElement('div');

  beforeEach(async () => {
    await page.viewport(1280, 800);
    style.textContent = `${THEME}\n${css}`;
    document.head.append(style);
    leaf.style.cssText = 'position: absolute; inset: 0; contain: strict';
    leaf.innerHTML = DM_SCREEN;
    document.body.append(leaf);
  });

  afterEach(() => {
    setGmScreenSession(null);
    leaf.remove();
    style.remove();
  });

  it('stands at the header\'s start beside the centred page control, and its panel opens below it inside the view', async () => {
    const timers = handTimers();
    const { session, relay } = scriptedSession(timers);
    setGmScreenSession(session);
    const header = leaf.querySelector<HTMLElement>('.atlas-dm-screen-header')!;
    // As DMScreen renders it: the header's own child, out of its flow.
    const host = header.appendChild(document.createElement('div'));
    host.style.display = 'contents';
    render(createElement(GmScreenControl), { container: host });
    const button = screen.getByRole('button', { name: 'Start Sidekick' });
    const pages = leaf.querySelector('.atlas-segmented')!.getBoundingClientRect();
    expect(button.getBoundingClientRect().right).toBeLessThan(pages.left);
    expect(Math.abs((pages.left + pages.right) / 2 - 640)).toBeLessThan(2);
    await shot('1-dm-screen-button', leaf.querySelector<HTMLElement>('.atlas-dm-screen')!);

    act(() => button.click());
    const start = [...document.querySelectorAll<HTMLButtonElement>('.atlas-gm-screen-start')][0]!;
    await act(async () => start.click());
    await expect.poll(() => document.querySelector('.atlas-gm-screen-qr')).not.toBeNull();
    const panel = document.querySelector<HTMLElement>('.atlas-gm-screen-panel')!;
    const box = panel.getBoundingClientRect();
    expect(box.top).toBeGreaterThan(button.getBoundingClientRect().bottom);
    expect(box.bottom).toBeLessThanOrEqual(800);
    expect(panel.scrollWidth).toBeLessThanOrEqual(panel.clientWidth);
    await shot('2-start-panel-qr', panel);

    await act(async () => {
      relay.gate?.knocked({ id: PHONE, name: 'Mira\'s phone' });
      await expect.poll(() => session.view().knock?.check).not.toBeNull();
      timers.advance(ARM_MS);
    });
    const prompt = await screen.findByRole('alertdialog', { name: 'Allow this device?' });
    expect(prompt.textContent).toContain(session.view().knock?.check ?? 'no number');
    await shot('3-allow-prompt', panel);

    await act(async () => {
      session.allow(PHONE);
      relay.events?.joined({ id: PHONE, name: 'Mira\'s phone' });
      await Promise.resolve();
    });
    await expect.poll(() => document.querySelector('.atlas-gm-screen-device[data-connected="true"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Sidekick runs: 1 device connected' })).toBeTruthy();
    await shot('4-device-list', leaf.querySelector<HTMLElement>('.atlas-dm-screen')!);
  });
});
