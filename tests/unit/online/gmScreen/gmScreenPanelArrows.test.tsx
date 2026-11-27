// @vitest-environment jsdom
import React from 'react';
import { MotionGlobalConfig } from 'framer-motion';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setGmScreenHost } from '../../../../src/app/online/gmScreen/gmScreenSlot.ts';
import { hosted } from './controlRig.tsx';
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
  state.setDMScreenPage.mockClear();
});

describe('the DM screen\'s pages while Sidekick\'s panel is open', () => {
  it('stay where they are on the left and right arrows, and turn again once the panel closed', async () => {
    await hosted(sessionRig().session);
    render(<DMScreen isOpen onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start Sidekick' }));
    const [inside] = within(screen.getByRole('dialog', { name: 'Sidekick' })).getAllByRole('button');
    // Wherever the focus is: in the panel, or on the screen behind it.
    inside!.focus();
    fireEvent.keyDown(inside!, { key: 'ArrowRight' });
    const wrapper = document.querySelector<HTMLElement>('.atlas-dm-screen-wrapper')!;
    wrapper.focus();
    fireEvent.keyDown(wrapper, { key: 'ArrowLeft' });
    expect(state.setDMScreenPage).not.toHaveBeenCalled();

    fireEvent.keyDown(document.body, { key: 'Escape' });
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 50)));
    expect(screen.queryByRole('dialog', { name: 'Sidekick' })).toBeNull();
    wrapper.focus();
    fireEvent.keyDown(wrapper, { key: 'ArrowRight' });
    expect(state.setDMScreenPage).toHaveBeenCalledWith('sound');
  });
});
