// @vitest-environment jsdom
import { act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatEntry } from '../../../../src/app/online/protocol/index.ts';
import { LogState, mountLogSurface, type LogSurfaceMount, type LogSurfaceProps } from '../../../../src/app/online/tableLog/index.ts';

const GM = 'gm';
const KARA = 'kkkkkkkkkkkkkkkkkkkk';
const chat = (n: number): ChatEntry => ({ id: n.toString(16).padStart(24, '0'), at: n * 1000, who: KARA, name: 'Kara', kind: 'chat', text: `message ${n}` });

interface Surface {
  readonly state: LogState;
  readonly tabHost: HTMLElement;
  readonly onOpen: ReturnType<typeof vi.fn>;
  show(open: boolean): void;
}

let mounted: { surface: LogSurfaceMount; hosts: HTMLElement[] } | null = null;

/** The GM's log surface as `TableLogMount` mounts it: the panel in one element, the tab in another. */
function surface(): Surface {
  const state = new LogState(() => GM);
  state.replace([]);
  const host = document.body.createDiv();
  const tabHost = document.body.createDiv();
  const mount = mountLogSurface(host, tabHost);
  mounted = { surface: mount, hosts: [host, tabHost] };
  const onOpen = vi.fn();
  const props = (open: boolean): LogSurfaceProps => ({
    state, self: GM, moderator: true, canSend: true, speakers: [], open, onOpen, onClose: vi.fn(),
    actions: { say: vi.fn(), roll: vi.fn(), edit: vi.fn(), remove: vi.fn(), react: vi.fn() },
  });
  const show = (open: boolean): void => act(() => mount.show(props(open)));
  show(false);
  return { state, tabHost, onOpen, show };
}

afterEach(() => {
  act(() => mounted?.surface.unmount());
  for (const host of mounted?.hosts ?? []) host.remove();
  mounted = null;
});

const tab = ({ tabHost }: Surface): HTMLButtonElement | null => tabHost.querySelector('button');
const count = ({ tabHost }: Surface): string | null => tabHost.querySelector('.atlas-online-log-tab__count')?.textContent ?? null;

describe('the tab that opens the table log on the GM\'s map', () => {
  it('stands there while the log is closed with nothing unread, without a count, and opens the log', () => {
    const log = surface();
    const button = tab(log);
    expect(button).not.toBeNull();
    expect(count(log)).toBeNull();
    expect(button?.textContent).toBe('Table log');
    expect(button?.hasAttribute('title')).toBe(false);
    act(() => button?.click());
    expect(log.onOpen).toHaveBeenCalledTimes(1);
  });

  it('counts what came in while the log was closed, and no longer once it was read', () => {
    const log = surface();
    act(() => log.state.receive({ t: 'log-entry', entry: chat(1) }));
    act(() => log.state.receive({ t: 'log-entry', entry: chat(2) }));
    expect(count(log)).toBe('2');
    expect(tab(log)?.querySelector('.atlas-online-log__sr')?.textContent).toBe('Table log, 2 new');
    act(() => log.state.setOpen(true));
    act(() => log.state.setOpen(false));
    expect(tab(log)).not.toBeNull();
    expect(count(log)).toBeNull();
  });

  it('makes way for the open log', () => {
    const log = surface();
    log.show(true);
    expect(tab(log)).toBeNull();
    log.show(false);
    expect(tab(log)).not.toBeNull();
  });
});
