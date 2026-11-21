// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LabelTooltip, TooltipProvider } from '../../src/app/packages/components/primitives/tooltip';
import { watchInput } from '../../src/app/packages/components/primitives/lastInput';

/** A pointer event as a device of `kind` sends it; jsdom's own events carry no pointer type. */
function pointer(type: 'pointerdown' | 'pointermove', kind: 'mouse' | 'pen' | 'touch', target: EventTarget): void {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'pointerType', { value: kind });
  act(() => {
    target.dispatchEvent(event);
  });
}

const key = (): void => {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
  });
};

/**
 * A tooltip is for a pointer that hovers and for the keyboard. A finger gets none, whatever the device: decided by what
 * was last used, so a mouse attached to a tablet still gets its tooltips, and a touch screen on a desktop gets none.
 */
describe('a tooltip and the kind of pointer that asks for it', () => {
  let stopWatching: () => void = () => undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    stopWatching = watchInput(document);
  });

  afterEach(() => {
    cleanup();
    stopWatching();
    // The next file starts as the app does: with a mouse.
    const reset = watchInput(document);
    pointer('pointermove', 'mouse', document.body);
    reset();
    vi.useRealTimers();
  });

  function mount(): HTMLElement {
    render(
      <TooltipProvider delayDuration={300}>
        <LabelTooltip label="Delete Hall"><button type="button">x</button></LabelTooltip>
        <button type="button">other</button>
      </TooltipProvider>,
    );
    return screen.getByRole('button', { name: 'Delete Hall' });
  }

  const hover = async (button: HTMLElement, kind: 'mouse' | 'pen' | 'touch'): Promise<void> => {
    pointer('pointermove', kind, button);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
  };

  it('opens for a mouse that hovers', async () => {
    await hover(mount(), 'mouse');
    expect(screen.getByRole('tooltip').textContent).toBe('Delete Hall');
  });

  it('opens for a pen that hovers', async () => {
    await hover(mount(), 'pen');
    expect(screen.getByRole('tooltip').textContent).toBe('Delete Hall');
  });

  it('stays shut for a finger that moves over the control', async () => {
    await hover(mount(), 'touch');
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('stays shut when focus comes to the control after a tap elsewhere, as when a menu it opened closes', () => {
    const button = mount();
    pointer('pointerdown', 'touch', screen.getByRole('button', { name: 'other' }));
    act(() => button.focus());
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('opens for focus the keyboard brought, also on a device that was touched before', () => {
    const button = mount();
    pointer('pointerdown', 'touch', screen.getByRole('button', { name: 'other' }));
    key();
    act(() => button.focus());
    expect(screen.getByRole('tooltip').textContent).toBe('Delete Hall');
  });

  it('opens for a mouse that hovers after a finger was used', async () => {
    const button = mount();
    pointer('pointerdown', 'touch', screen.getByRole('button', { name: 'other' }));
    await hover(button, 'mouse');
    expect(screen.getByRole('tooltip').textContent).toBe('Delete Hall');
  });
});
