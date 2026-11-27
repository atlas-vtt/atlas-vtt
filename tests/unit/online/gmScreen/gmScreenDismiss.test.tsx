// @vitest-environment jsdom
import { MotionGlobalConfig } from 'framer-motion';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { handledByAnotherControl } from '../../../../src/app/keyboard/tooltipEscape.ts';
import { setGmScreenHost } from '../../../../src/app/online/gmScreen/gmScreenSlot.ts';
import { armed, connects, knocks, panel, shown, startedFromPanel } from './controlRig.tsx';
import { deviceId, RelaySocket } from './sessionRig.ts';

const PHONE = deviceId('p');

/** What the DM screen under the panel heard: presses on its dice link and its button, its Escape. */
interface Screen {
  readonly heard: string[];
  readonly dice: HTMLElement;
  readonly button: HTMLButtonElement;
  readonly field: HTMLInputElement;
}

let page: Screen;
let stopEscape = (): void => undefined;

/** A DM screen's statblock with a dice link, a button and a field, and the screen's own Escape (as DMScreen listens: on the window, after the tooltips). */
function dmScreen(doc: Document = document): Screen {
  const heard: string[] = [];
  const root = doc.body.appendChild(doc.createElement('div'));
  root.innerHTML = '<span class="atlas-dice-link" role="button" tabindex="0">2d6+3</span><button type="button">Roll initiative</button><input aria-label="Notes">';
  const dice = root.querySelector<HTMLElement>('.atlas-dice-link')!;
  const button = root.querySelector('button')!;
  const field = root.querySelector('input')!;
  for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click', 'contextmenu', 'touchstart', 'touchend', 'auxclick'] as const) {
    dice.addEventListener(type, () => heard.push(`dice ${type}`));
    button.addEventListener(type, () => heard.push(`button ${type}`));
  }
  const view = doc.defaultView!;
  const onEscape = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && !handledByAnotherControl(event)) heard.push('screen escape');
  };
  view.addEventListener('keydown', onEscape);
  stopEscape = () => view.removeEventListener('keydown', onEscape);
  return { heard, dice, button, field };
}

type Pointer = 'mouse' | 'touch' | 'pen';

/**
 * A whole press as a browser sends it: pointerdown, the touch events for a finger, the compatibility mouse
 * events unless the pointerdown's default was prevented, pointerup, and the click (or, for the right button,
 * the context menu) on the element the press ended on.
 */
function press(down: Element, { up = down, button = 0, pointer = 'mouse' as Pointer } = {}): void {
  const init = { bubbles: true, cancelable: true, button, detail: 1, pointerId: pointer === 'mouse' ? 1 : 7, pointerType: pointer, isPrimary: true };
  const compat = fireEvent.pointerDown(down, init);
  if (pointer === 'touch') fireEvent.touchStart(down);
  if (compat) fireEvent.mouseDown(down, init);
  if (button === 2) fireEvent.contextMenu(down, init);
  fireEvent.pointerUp(up, init);
  if (pointer === 'touch') fireEvent.touchEnd(up);
  if (compat) fireEvent.mouseUp(up, init);
  if (button === 0) fireEvent.click(up === down ? down : (down.ownerDocument.body), init);
  if (button === 1) fireEvent(up, new MouseEvent('auxclick', init));
}

const closed = (): Promise<void> => waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
const sidekick = (): HTMLElement => screen.getByRole('button', { name: /Sidekick/, expanded: true });

// The panel leaves through framer-motion's exit, which jsdom never plays to its end.
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
  stopEscape();
  cleanup();
  document.body.innerHTML = '';
  setGmScreenHost(null);
});

describe('Sidekick\'s panel as a light popover over the DM screen', () => {
  it.each([
    ['a left press on a dice link', (): void => press(page.dice)],
    ['a left press on a button', (): void => press(page.button)],
    ['a right press', (): void => press(page.dice, { button: 2 })],
    ['a middle press', (): void => press(page.button, { button: 1 })],
    ['a finger', (): void => press(page.dice, { pointer: 'touch' })],
    ['a pen', (): void => press(page.button, { pointer: 'pen' })],
  ])('closes on %s outside it, which reaches nothing under it; the next press does', async (_, outside) => {
    const rig = await shown();
    page = dmScreen();
    await startedFromPanel(rig);
    act(outside);
    await closed();
    expect(page.heard).toEqual([]);
    act(outside);
    expect(page.heard.length).toBeGreaterThan(0);
  });

  it('keeps the context menu of a swallowed right press from opening', async () => {
    await shown();
    page = dmScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Start Sidekick' }));
    let shownMenu = true;
    act(() => {
      fireEvent.pointerDown(page.dice, { button: 2, pointerId: 1 });
      shownMenu = fireEvent.contextMenu(page.dice, { button: 2 });
      fireEvent.pointerUp(page.dice, { button: 2, pointerId: 1 });
    });
    expect(shownMenu).toBe(false);
    await closed();
  });

  it('closes on a press on its own control and does not open again from it', async () => {
    const rig = await shown();
    page = dmScreen();
    await startedFromPanel(rig);
    act(() => press(sidekick()));
    await closed();
    expect(screen.getByRole('button', { name: /Sidekick/ }).getAttribute('aria-expanded')).toBe('false');
  });

  it('stays open for a press that starts inside it and ends outside', async () => {
    const rig = await shown();
    page = dmScreen();
    await startedFromPanel(rig);
    act(() => press(within(panel()).getByRole('button', { name: 'Copy link' }), { up: page.button }));
    expect(panel()).toBeTruthy();
  });

  it('leaves a press in a layer over the DM screen (an Obsidian modal or menu) to that layer, and stays open', async () => {
    await shown();
    page = dmScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Start Sidekick' }));
    const modal = document.body.appendChild(document.createElement('div'));
    modal.className = 'modal-container';
    const choice = modal.appendChild(document.createElement('button'));
    let chosen = 0;
    choice.addEventListener('click', () => (chosen += 1));
    act(() => press(choice));
    expect(chosen).toBe(1);
    expect(panel()).toBeTruthy();
  });

  it('closes on Escape, which the DM screen does not hear, and gives the focus back to its control; the next Escape is the screen\'s', async () => {
    await shown();
    page = dmScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Start Sidekick' }));
    act(() => void fireEvent.keyDown(page.field, { key: 'Escape' }));
    await closed();
    expect(page.heard).toEqual([]);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /Sidekick/ }));
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(page.heard).toEqual(['screen escape']);
  });

  it('leaves the focus where the press landed when an outside press closes it', async () => {
    await shown();
    page = dmScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Start Sidekick' }));
    page.field.focus();
    act(() => press(page.button));
    await closed();
    expect(document.activeElement).toBe(page.field);
  });

  it('lets Escape undo an inner state first: a new link\'s confirm, a remove\'s, the copy\'s "Copied"', async () => {
    const rig = await shown();
    page = dmScreen();
    await startedFromPanel(rig);
    await connects(rig, PHONE, 'Phone');
    await armed();
    fireEvent.click(within(panel()).getByRole('button', { name: 'New link' }));
    expect(within(panel()).getByText('Every device disconnects and has to scan the new code.')).toBeTruthy();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(within(panel()).queryByText('Every device disconnects and has to scan the new code.')).toBeNull();
    fireEvent.click(within(panel()).getByRole('button', { name: 'Remove Phone' }));
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(within(panel()).getByRole('button', { name: 'Remove Phone' })).toBeTruthy();
    Object.defineProperty(window.navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.resolve() } });
    await act(async () => {
      fireEvent.click(within(panel()).getByRole('button', { name: 'Copy link' }));
      await Promise.resolve();
    });
    expect(within(panel()).getByRole('button', { name: 'Copy link' }).dataset.state).toBe('copied');
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(within(panel()).getByRole('button', { name: 'Copy link' }).dataset.state).toBe('idle');
    expect(page.heard).toEqual([]);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    await closed();
  });

  it('closed by a press while a device asks, answers nothing, and asks again when opened; the knock opened it, and keeps its dot', async () => {
    const rig = await shown();
    page = dmScreen();
    await startedFromPanel(rig);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    await closed();
    await knocks(rig, PHONE, 'Phone');
    expect(screen.getByRole('alertdialog', { name: 'Allow this device?' })).toBeTruthy();
    act(() => press(page.dice));
    await closed();
    expect(rig.socket().framesOf('admit')).toEqual([]);
    expect(rig.socket().framesOf('refuse')).toEqual([]);
    expect(rig.session.view().knock?.id).toBe(PHONE);
    expect(document.querySelector('.atlas-gm-screen-control__waiting')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Sidekick/ }));
    expect(screen.getByRole('alertdialog', { name: 'Allow this device?' })).toBeTruthy();
  });

  it('in a popout window, listens to that window\'s presses and not the main one\'s', async () => {
    const frame = document.body.appendChild(document.createElement('iframe'));
    const doc = frame.contentDocument!;
    const host = doc.body.appendChild(doc.createElement('div'));
    await shown(host);
    page = dmScreen(doc);
    fireEvent.click(within(doc.body).getByRole('button', { name: 'Start Sidekick' }));
    const elsewhere = document.body.appendChild(document.createElement('button'));
    act(() => press(elsewhere));
    expect(within(doc.body).getByRole('dialog', { name: 'Sidekick' })).toBeTruthy();
    act(() => press(page.button));
    await waitFor(() => expect(within(doc.body).queryByRole('dialog')).toBeNull());
    expect(page.heard).toEqual([]);
  });
});
