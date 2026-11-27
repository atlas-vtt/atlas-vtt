// @vitest-environment jsdom
import React from 'react';
import { MotionGlobalConfig } from 'framer-motion';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_MAP_HOTKEYS } from '../../../../src/app/keyboard/mapHotkeys';
import { setGmScreenHost } from '../../../../src/app/online/gmScreen/gmScreenSlot.ts';
import { SettingsService } from '../../../../src/app/services/SettingsService';
import { hosted, shown } from './controlRig.tsx';
import { RelaySocket, sessionRig } from './sessionRig.ts';

vi.mock('../../../../src/app/resources/useMapResources', () => ({ useMapResources: () => [] }));
vi.mock('../../../../src/app/react/root/AtlasUIContext', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../../src/app/react/root/AtlasUIContext')>(),
  useAtlasUI: () => ({ app, view: {} }),
}));
vi.mock('../../../../src/app/react/ViewStoreContext', () => ({
  useAtlasStore: (selector: (value: typeof state) => unknown) => selector(state),
}));

const { default: DMScreen } = await import('../../../../src/app/react/components/DMScreen');

const app = {
  workspace: { on: vi.fn(), offref: vi.fn(), getActiveViewOfType: (): null => null },
  vault: { getMarkdownFiles: (): never[] => [], getAbstractFileByPath: (): null => null },
};
const state = {
  objects: { tokens: {} },
  dmScreenPage: 'statblocks',
  setDMScreenPage: vi.fn(),
  initiative: { entries: [], isActive: false, round: 0 },
  dmNotePath: null,
  setDMNotePath: vi.fn(),
  updateToken: vi.fn(),
};

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
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

/** The DM screen with Sidekick's panel open on it; what closes the screen. */
async function openPanel(): Promise<ReturnType<typeof vi.fn>> {
  await hosted(sessionRig().session);
  const onClose = vi.fn();
  render(<DMScreen isOpen onClose={onClose} />);
  fireEvent.click(screen.getByRole('button', { name: 'Start Sidekick' }));
  return onClose;
}

const panelButtons = (root: HTMLElement): HTMLElement[] => within(within(root).getByRole('dialog', { name: 'Sidekick' })).getAllByRole('button');

/** A key as the browser sends it to the focused element; whether its default was left to the browser. */
function key(target: HTMLElement, init: KeyboardEventInit): boolean {
  return fireEvent.keyDown(target, init);
}

const settled = (): Promise<void> => act(() => new Promise<void>((resolve) => setTimeout(resolve, 300)));

describe('keys on Sidekick\'s panel over the DM screen', () => {
  it('Tab moves the focus through the panel\'s controls, round from the last to the first, and leaves the DM screen open', async () => {
    const onClose = await openPanel();
    const [close, start] = [panelButtons(document.body).at(0)!, panelButtons(document.body).at(-1)!];
    start.focus();
    expect(key(start, { key: 'Tab' })).toBe(false);
    expect(document.activeElement).toBe(close);
    expect(key(close, { key: 'Tab', shiftKey: true })).toBe(false);
    expect(document.activeElement).toBe(start);
    await settled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Sidekick' })).toBeTruthy();
  });

  it('Tab from outside the panel goes into it', async () => {
    await openPanel();
    const control = screen.getByRole('button', { name: /Sidekick/, expanded: true });
    control.focus();
    key(control, { key: 'Tab' });
    expect(panelButtons(document.body)).toContain(document.activeElement);
  });

  it('keeps whatever key the GM bound to the DM screen with the panel', async () => {
    vi.spyOn(SettingsService, 'forApp').mockReturnValue({ getHotkeys: () => ({ ...DEFAULT_MAP_HOTKEYS, dashboard: 'q' }) } as unknown as SettingsService);
    const onClose = await openPanel();
    const start = panelButtons(document.body).at(-1)!;
    start.focus();
    key(start, { key: 'q' });
    await settled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('in a popout window, Tab goes round the panel there', async () => {
    const frame = document.body.appendChild(document.createElement('iframe'));
    const doc = frame.contentDocument!;
    const host = doc.body.appendChild(doc.createElement('div'));
    await shown(host);
    fireEvent.click(within(doc.body).getByRole('button', { name: 'Start Sidekick' }));
    const buttons = panelButtons(doc.body);
    const [first, last] = [buttons.at(0)!, buttons.at(-1)!];
    last.focus();
    expect(key(last, { key: 'Tab' })).toBe(false);
    expect(doc.activeElement).toBe(first);
  });
});
