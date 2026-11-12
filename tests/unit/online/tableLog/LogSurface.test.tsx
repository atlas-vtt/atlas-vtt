// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatEntry } from '../../../../src/app/online/protocol/index.ts';
import { LogState, mountLogSurface, type LogSurfaceMount, type LogSurfaceProps } from '../../../../src/app/online/tableLog/index.ts';

const GM = 'gggggggggggggggggggg';
const KARA = 'kkkkkkkkkkkkkkkkkkkk';
const id = (n: number): string => n.toString(16).padStart(24, '0');

let mounted: LogSurfaceMount | null = null;
afterEach(() => {
  act(() => mounted?.unmount());
  mounted = null;
  document.body.replaceChildren();
  cleanup();
});

function show(state: LogState, onOpen: () => void): HTMLElement {
  const host = document.body.appendChild(document.createElement('div'));
  const tabHost = document.body.appendChild(document.createElement('div'));
  const surface = mountLogSurface(host, tabHost);
  mounted = surface;
  const actions = { say: vi.fn(), roll: vi.fn(), edit: vi.fn(), remove: vi.fn(), react: vi.fn(), clear: vi.fn() };
  const props: LogSurfaceProps = { state, actions, self: GM, moderator: true, canSend: true, open: false, onOpen, onClose: vi.fn() };
  act(() => surface.show(props));
  return tabHost;
}

describe('the log surface while the log is closed', () => {
  it('keeps a tab that opens the log when nothing is unread, without a count', () => {
    const state = new LogState(() => GM);
    const onOpen = vi.fn();
    const tabHost = show(state, onOpen);
    const button = screen.getByRole('button', { name: 'Table log' });
    expect(tabHost.contains(button)).toBe(true);
    expect(tabHost.querySelector('.atlas-online-log-tab__count')).toBeNull();
    fireEvent.click(button);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('counts what came in meanwhile', () => {
    const state = new LogState(() => GM);
    const tabHost = show(state, vi.fn());
    const message: ChatEntry = { id: id(1), at: 1, who: KARA, name: 'Kara', kind: 'chat', text: 'Hello' };
    act(() => state.receive({ t: 'log-entry', entry: message }));
    expect(tabHost.querySelector('.atlas-online-log-tab__count')?.textContent).toBe('1');
    expect(screen.getByRole('button', { name: 'Table log, 1 new' })).toBeTruthy();
  });
});
