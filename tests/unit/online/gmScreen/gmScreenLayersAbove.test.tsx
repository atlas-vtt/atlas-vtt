// @vitest-environment jsdom
import { MotionGlobalConfig } from 'framer-motion';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setGmScreenHost } from '../../../../src/app/online/gmScreen/gmScreenSlot.ts';
import { shown } from './controlRig.tsx';
import { RelaySocket } from './sessionRig.ts';

const stops: (() => void)[] = [];

/** Hears Escape on the window, in the phase given, as Obsidian's keymap (bubble) or Atlas's dice log (capture) do; `take` marks it used, as the dice log does. */
function escapeListener(capture: boolean, take = false): string[] {
  const heard: string[] = [];
  const hear = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    heard.push('escape');
    if (!take) return;
    event.preventDefault();
    event.stopPropagation();
  };
  window.addEventListener('keydown', hear, capture);
  stops.push(() => window.removeEventListener('keydown', hear, capture));
  return heard;
}

/** A layer Obsidian draws over the page, with a button in it that hears its presses. */
function layer(className: string): { root: HTMLElement; pressed: string[] } {
  const root = document.body.appendChild(document.createElement('div'));
  root.className = className;
  const button = root.appendChild(document.createElement('button'));
  const pressed: string[] = [];
  button.addEventListener('click', () => pressed.push('click'));
  return { root, pressed };
}

function pressOn(element: Element): void {
  const init = { bubbles: true, cancelable: true, button: 0, detail: 1, pointerId: 1, pointerType: 'mouse', isPrimary: true };
  fireEvent.pointerDown(element, init);
  fireEvent.mouseDown(element, init);
  fireEvent.pointerUp(element, init);
  fireEvent.mouseUp(element, init);
  fireEvent.click(element, init);
}

const openPanel = async (): Promise<void> => {
  await shown();
  fireEvent.click(screen.getByRole('button', { name: 'Start Sidekick' }));
};
/** Whether the panel stands, once a closing panel had the time to leave. */
const isOpen = async (): Promise<boolean> => {
  await act(() => new Promise<void>((resolve) => setTimeout(resolve, 50)));
  return screen.queryByRole('dialog') !== null;
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
  for (const stop of stops.splice(0)) stop();
  cleanup();
  document.body.innerHTML = '';
  setGmScreenHost(null);
});

describe('Sidekick\'s panel under the layers Obsidian draws over it', () => {
  it('leaves Escape to an Obsidian modal over it, which carries no aria-modal, and stays open', async () => {
    await openPanel();
    const modal = layer('modal-container mod-dim');
    const input = modal.root.appendChild(document.createElement('input'));
    const keymap = escapeListener(false);
    act(() => void fireEvent.keyDown(input, { key: 'Escape' }));
    expect(keymap).toEqual(['escape']);
    expect(await isOpen()).toBe(true);
  });

  it('leaves Escape to a suggestion list over it, and a press in that list is the list\'s', async () => {
    await openPanel();
    const suggestions = layer('suggestion-container');
    const keymap = escapeListener(false);
    act(() => void fireEvent.keyDown(document.body, { key: 'Escape' }));
    expect(keymap).toEqual(['escape']);
    pressOn(suggestions.root.querySelector('button')!);
    expect(suggestions.pressed).toEqual(['click']);
    expect(await isOpen()).toBe(true);
  });

  it('leaves a press in a hover preview to the preview, and Escape still closes it', async () => {
    await openPanel();
    const preview = layer('popover hover-popover');
    pressOn(preview.root.querySelector('button')!);
    expect(preview.pressed).toEqual(['click']);
    expect(await isOpen()).toBe(true);
    act(() => void fireEvent.keyDown(document.body, { key: 'Escape' }));
    expect(await isOpen()).toBe(false);
  });
});

describe('one Escape around Sidekick\'s panel', () => {
  it('closes the panel and nothing else: a listener on the window that came later never hears it', async () => {
    await openPanel();
    const diceLog = escapeListener(true);
    act(() => void fireEvent.keyDown(document.body, { key: 'Escape' }));
    expect(await isOpen()).toBe(false);
    expect(diceLog).toEqual([]);
  });

  it('is left to a control that took it first, and the panel stays open', async () => {
    const diceLog = escapeListener(true, true);
    await openPanel();
    act(() => void fireEvent.keyDown(document.body, { key: 'Escape' }));
    expect(diceLog).toEqual(['escape']);
    expect(await isOpen()).toBe(true);
  });
});
