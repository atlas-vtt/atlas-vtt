// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LabelTooltip, TooltipProvider } from '../../src/app/packages/components/primitives/tooltip';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

function labeledButton(suppressed: boolean): React.ReactElement {
  return <TooltipProvider delayDuration={100} skipDelayDuration={0} disableHoverableContent>
    <LabelTooltip label="Move Cave" suppressed={suppressed}><button>Move</button></LabelTooltip>
  </TooltipProvider>;
}

/** jsdom has no PointerEvent, so give its mouse event the pointer kind Radix reads. */
function pointer(target: Element, type: string): void {
  const event = new MouseEvent(type, { bubbles: true, relatedTarget: document.body });
  Object.defineProperty(event, 'pointerType', { value: 'mouse' });
  act(() => { target.dispatchEvent(event); });
}

const advanceHover = async (): Promise<void> => {
  await act(async () => { await vi.advanceTimersByTimeAsync(100); });
};

it('closes an open tooltip, rejects pointer and focus while suppressed, and waits for fresh focus to reopen', async () => {
  const { rerender } = render(labeledButton(false));
  const button = screen.getByRole('button', { name: 'Move Cave' });
  await act(async () => { button.focus(); });
  expect(screen.getByRole('tooltip').textContent).toBe('Move Cave');

  rerender(labeledButton(true));
  expect(screen.queryByRole('tooltip')).toBeNull();
  await act(async () => { button.blur(); button.focus(); });
  pointer(button, 'pointermove');
  await advanceHover();
  expect(screen.queryByRole('tooltip')).toBeNull();

  rerender(labeledButton(false));
  await advanceHover();
  expect(screen.queryByRole('tooltip')).toBeNull();

  await act(async () => { button.blur(); button.focus(); });
  expect(screen.getByRole('tooltip').textContent).toBe('Move Cave');
});

it('allows a fresh hover after a tooltip mounted suppressed becomes available', async () => {
  const { rerender } = render(labeledButton(true));
  const button = screen.getByRole('button', { name: 'Move Cave' });
  pointer(button, 'pointermove');
  await advanceHover();
  expect(screen.queryByRole('tooltip')).toBeNull();

  rerender(labeledButton(false));
  await advanceHover();
  expect(screen.queryByRole('tooltip')).toBeNull();

  pointer(button, 'pointerout');
  pointer(button, 'pointermove');
  await advanceHover();
  expect(screen.getByRole('tooltip').textContent).toBe('Move Cave');
});

it.each([false, true])('keeps Radix controlled for its lifetime when suppression starts as %s', (initiallySuppressed) => {
  const warnings = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const { rerender } = render(labeledButton(initiallySuppressed));

  rerender(labeledButton(!initiallySuppressed));
  rerender(labeledButton(initiallySuppressed));

  const messages = [...warnings.mock.calls, ...errors.mock.calls].flat().map(String);
  expect(messages.filter((message) => /controlled.*uncontrolled|uncontrolled.*controlled/i.test(message))).toEqual([]);
});
