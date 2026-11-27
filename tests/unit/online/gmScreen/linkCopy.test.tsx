// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COPIED_MS } from '../../../../src/app/online/gm/dock/controls.ts';
import { LinkCopy, shownLink } from '../../../../src/app/online/gmScreen/ui/LinkCopy';

const LINK = 'https://play.atlas-vtt.dev/gm-screen#gggggggggggggggggggggggggg.KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKA';
const KEY = LINK.slice(LINK.indexOf('#') + 1);

let copied: string[] = [];
let refuse = false;

beforeEach(() => {
  copied = [];
  refuse = false;
  vi.useFakeTimers();
  Object.defineProperty(window.navigator, 'clipboard', {
    configurable: true,
    value: { writeText: (text: string) => (refuse ? Promise.reject(new Error('denied')) : (copied.push(text), Promise.resolve())) },
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const control = (): HTMLButtonElement => screen.getByRole('button', { name: 'Copy link' });

/** Presses the control and lets the clipboard answer. */
async function press(how: (button: HTMLButtonElement) => void = (button) => fireEvent.click(button)): Promise<void> {
  await act(async () => {
    how(control());
    await Promise.resolve();
  });
}

describe('the link as one control that copies it', () => {
  it('shows the host and path and none of the key, which goes to the clipboard whole', async () => {
    const { container } = render(<LinkCopy link={LINK} />);
    expect(shownLink(LINK)).toEqual({ host: 'play.atlas-vtt.dev', rest: '/gm-screen#…' });
    expect(container.textContent).toContain('play.atlas-vtt.dev/gm-screen#…');
    expect(container.innerHTML).not.toContain(KEY.slice(0, 6));
    expect(container.querySelector('input')).toBeNull();
    await press();
    expect(copied).toEqual([LINK]);
  });

  it('says "Copied" in place for a moment, tells a screen reader, and is a link again after it', async () => {
    render(<LinkCopy link={LINK} />);
    expect(screen.getByRole('status').textContent).toBe('');
    await press();
    expect(control().dataset.state).toBe('copied');
    expect(control().querySelector('[data-shown="true"]')?.textContent).toBe('Copied');
    expect(screen.getByRole('status').textContent).toBe('Link copied');
    act(() => vi.advanceTimersByTime(COPIED_MS - 1));
    expect(control().dataset.state).toBe('copied');
    act(() => vi.advanceTimersByTime(1));
    expect(control().dataset.state).toBe('idle');
    expect(control().querySelector('[data-shown="true"]')?.textContent).toBe('play.atlas-vtt.dev/gm-screen#…');
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('holds "Copied" for a full moment again on another press', async () => {
    render(<LinkCopy link={LINK} />);
    await press();
    act(() => vi.advanceTimersByTime(COPIED_MS - 100));
    await press();
    act(() => vi.advanceTimersByTime(COPIED_MS - 1));
    expect(control().dataset.state).toBe('copied');
    expect(copied).toEqual([LINK, LINK]);
  });

  it('copies with Enter and Space, as the button it is', async () => {
    render(<LinkCopy link={LINK} />);
    const button = control();
    expect(button.tagName).toBe('BUTTON');
    expect(button.getAttribute('type')).toBe('button');
    // A native button turns Enter and Space into its click; jsdom does not, so the click is what the key makes.
    await press((target) => {
      fireEvent.keyDown(target, { key: 'Enter' });
      fireEvent.click(target);
    });
    expect(copied).toEqual([LINK]);
  });

  it('says it could not copy when the clipboard refuses, and nothing else happens', async () => {
    refuse = true;
    render(<LinkCopy link={LINK} />);
    await press();
    expect(control().dataset.state).toBe('failed');
    expect(screen.getByRole('status').textContent).toBe('Couldn’t copy');
    act(() => vi.advanceTimersByTime(COPIED_MS));
    expect(control().dataset.state).toBe('idle');
  });
});
