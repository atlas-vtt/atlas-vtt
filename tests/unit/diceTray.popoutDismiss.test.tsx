// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { DiceDropdownMenu } from '../../src/app/react/components/dice/DiceDropdownMenu';
import type { DiceTool } from '../../src/app/tools/DiceTool';

vi.mock('../../src/app/react/root/AtlasUIContext', () => ({
  useAtlasUI: () => ({ app: {}, view: { getViewType: () => 'atlas-vtt' } }),
}));
vi.mock('../../src/app/react/ViewStoreContext', () => ({
  useAtlasStore: (selector: (state: { isPlayerView: boolean }) => unknown) => selector({ isPlayerView: false }),
}));
vi.mock('../../src/app/react/hooks/useDicePreviews', () => ({ useDicePreviews: () => ({}) }));
vi.mock('../../src/app/packages/components/primitives/tooltip', () => ({
  LabelTooltip: ({ children }: { children: React.ReactNode }): React.ReactNode => children,
}));

const diceTool = { rollDice: vi.fn(() => true), rollingDice: () => ({ dice: [{ count: 1, sides: 20 }], crit: 'natural' }) } as unknown as DiceTool;

afterEach(cleanup);

/** The tray of a map in a popout, which renders into the popout's document: the main document hears none of its presses. */
async function openInPopout(onToggle: () => void): Promise<Document> {
  // jsdom gives an iframe a window and document of its own, as a popout has.
  const frame = document.body.appendChild(document.createElement('iframe'));
  const popout = frame.contentDocument as Document;
  const container = popout.body.appendChild(popout.createElement('div'));
  render(<DiceDropdownMenu diceTool={diceTool} isOpen onToggle={onToggle} />, { container, baseElement: popout.body });
  // The tray starts listening a task after it opens, so the press that opened it does not close it.
  await act(() => new Promise<void>(resolve => frame.contentWindow?.setTimeout(resolve, 0)));
  return popout;
}

it('closes on a press outside it in its own window', async () => {
  const onToggle = vi.fn();
  const popout = await openInPopout(onToggle);
  fireEvent.mouseDown(popout.body);
  expect(onToggle).toHaveBeenCalledTimes(1);
});

it('stays open for a press inside it or in another window', async () => {
  const onToggle = vi.fn();
  const popout = await openInPopout(onToggle);
  fireEvent.mouseDown(popout.querySelector('.atlas-dice-tray') as HTMLElement);
  fireEvent.mouseDown(document.body);
  expect(onToggle).not.toHaveBeenCalled();
});
