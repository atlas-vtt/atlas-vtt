import { createElement } from 'react';
import { render } from '@testing-library/react';
import { page } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import type { Timers } from '../../src/app/online/gm/companionTimers.ts';
import type { GateEvents, TableEvents } from '../../src/app/online/gm/TableConnection.ts';
import type { TableOutbox } from '../../src/app/online/gm/tableOutbox.ts';
import { channelCryptoOf } from '../../src/app/online/gmScreen/channel/index.ts';
import { GmScreenSession } from '../../src/app/online/gmScreen/index.ts';
import { setGmScreenHost } from '../../src/app/online/gmScreen/gmScreenSlot.ts';
import { GmScreenControl } from '../../src/app/online/gmScreen/ui/GmScreenControl';
import type { AccountRig } from '../unit/online/gm/accountRig.ts';
import { DASHBOARD_THEME } from './dashboardTheme.ts';

/** Obsidian's default theme in both looks, with what the panel reads beyond the dashboard's share. */
const THEME = `${DASHBOARD_THEME}
  body { font-size: 13px; --interactive-normal: var(--color-base-30); --interactive-hover: var(--color-base-35); --color-green: #44cf6e; --color-orange: #e9973f;
    --background-modifier-success: color-mix(in srgb, var(--color-green) 40%, transparent); background: #111; }
  .theme-light body, body.theme-light { --color-green: #08b94e; background: #ddd; }
  button { height: auto; }
`;

const DM_SCREEN = `
  <div class="atlas-vtt-plugin atlas-react-ui-container" style="position: absolute; inset: 0">
    <div class="atlas-ui" style="position: relative; width: 100%; height: 100%">
      <div class="atlas-dm-screen-wrapper">
        <div class="atlas-dm-screen-backdrop"></div>
        <div class="atlas-dm-screen atlas-dm-screen--pages is-visible" style="animation: none">
          <div class="atlas-dm-screen-header"><div class="atlas-segmented" style="height: 38px; width: 200px"></div></div>
          <div class="atlas-dm-screen-stage"></div>
        </div>
      </div>
    </div>
  </div>
`;

export const SHOTS = '__screenshots__/gm-screen';
export type Theme = 'dark' | 'light';

/** Timers the test runs by hand. */
export function handTimers(): Timers & { advance(ms: number): void } {
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

export interface ScriptedRelay {
  events: TableEvents | null;
  gate: GateEvents | null;
  /** The connection Atlas holds: its close code is what Atlas reads when the relay ends the room. */
  outbox: { closeCode: number | null } | null;
}

/** A session whose relay is scripted: the room is made at once and welcomes Atlas; what Atlas sends is dropped. */
export function scriptedSession(timers: Timers, origin = 'https://play.atlas-vtt.dev'): { session: GmScreenSession; relay: ScriptedRelay } {
  const relay: ScriptedRelay = { events: null, gate: null, outbox: null };
  const ignore = (): void => undefined;
  const session = new GmScreenSession({
    crypto: channelCryptoOf(crypto),
    timers,
    origin,
    create: (code) => Promise.resolve({ room: { code, secret: 'room-secret-0123456789abcdef', maxPlayers: 4, kind: 'gm-screen' } }),
    open: (_room, events, gate) => {
      relay.events = events;
      relay.gate = gate;
      const outbox = { start: () => (events.status('online'), events.welcome([])), stop: ignore, end: ignore, askEnd: ignore, send: ignore, sendLive: ignore, sendTime: () => false, sendGate: ignore, answer: ignore, kick: ignore, setPlayers: ignore, sendCode: ignore, connected: new Set(), batches: true, minLevel: null, closeCode: null, onSent: null, stats: () => ({ status: 'online', reconnects: 0, lastClose: null, latencyMs: null, players: 0 }) };
      relay.outbox = outbox;
      return outbox as unknown as TableOutbox;
    },
    save: ignore,
    notice: ignore,
    now: () => Date.now(),
  }, null);
  return { session, relay };
}

/** The DM screen in a leaf of the given look, with the real stylesheet; returns it and what takes it down. */
export async function dmScreen(theme: Theme): Promise<{ leaf: HTMLElement; remove(): void }> {
  await page.viewport(1280, 800);
  const style = document.head.appendChild(document.createElement('style'));
  style.textContent = `${THEME}\n${css}`;
  document.body.className = `theme-${theme}`;
  const leaf = document.body.appendChild(document.createElement('div'));
  leaf.style.cssText = 'position: absolute; inset: 0; contain: strict';
  leaf.innerHTML = DM_SCREEN;
  return {
    leaf,
    remove: () => {
      setGmScreenHost(null);
      leaf.remove();
      style.remove();
      document.body.className = '';
    },
  };
}

/** The control in the DM screen's header, as DMScreen renders it: the header's own child, out of its flow. */
export function control(leaf: HTMLElement, session: GmScreenSession, account: AccountRig): void {
  setGmScreenHost({ session, account: account.control });
  const header = leaf.querySelector<HTMLElement>('.atlas-dm-screen-header')!;
  const host = header.appendChild(document.createElement('div'));
  host.style.display = 'contents';
  render(createElement(GmScreenControl), { container: host });
}

/** A screenshot once every entrance has run. */
export async function shot(name: string, element: HTMLElement): Promise<void> {
  await Promise.all(document.getAnimations().filter((animation) => animation.effect?.getTiming().iterations !== Infinity).map((animation) => animation.finished));
  await page.screenshot({ path: `${SHOTS}/${name}.png`, element });
}
