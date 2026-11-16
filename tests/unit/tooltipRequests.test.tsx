// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LabelTooltip, TooltipProvider } from '../../src/app/packages/components/primitives/tooltip';

/**
 * The tooltip holds whether it is open, and Radix asks it to change that. Radix compares each request with what it was
 * last rendered with, so what one request changed must be rendered before the next arrives, or that one is taken for
 * nothing new and dropped: a tooltip that opened as its delay ended would stay open after the pointer left.
 */
describe('a tooltip asked to open and close in quick succession', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // The delay ends in a timer of the browser, outside anything a test wraps.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('closes for a pointer that leaves in the event right after the delay opened it', async () => {
    render(<TooltipProvider delayDuration={300}><LabelTooltip label="Delete Hall"><button type="button">x</button></LabelTooltip></TooltipProvider>);
    const button = screen.getByRole('button');
    fireEvent.pointerMove(button);
    expect(screen.queryByRole('tooltip')).toBeNull();

    // The delay ends; the browser runs what is due at once (microtasks) and hands over the pointer's leave before any task React asked for.
    vi.advanceTimersByTime(300);
    await Promise.resolve();
    await Promise.resolve();
    fireEvent.pointerLeave(button);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });

    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('opens after its delay and closes when the pointer leaves', async () => {
    render(<TooltipProvider delayDuration={300}><LabelTooltip label="Delete Hall"><button type="button">x</button></LabelTooltip></TooltipProvider>);
    const button = screen.getByRole('button');
    fireEvent.pointerMove(button);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(screen.getByRole('tooltip').textContent).toBe('Delete Hall');

    fireEvent.pointerLeave(button);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});
