// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { popover, renderPopover } from '../mocks/lightPopoverHarness';
import { handledByAnotherControl, noteTooltipDismissal } from '../../src/app/keyboard/tooltipEscape';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../src/app/packages/components/primitives/tooltip';
import type { LightKind } from '../../src/app/types/lightingTypes';

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
  // jsdom has no pointer capture, which the slider takes on a press.
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.releasePointerCapture = vi.fn();
  HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
});
afterAll(() => { MotionGlobalConfig.skipAnimations = false; });
afterEach(cleanup);

describe('LightPopover', () => {
  it('is closed until a light is opened', () => {
    renderPopover(false);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('names every control: kinds, colours, ranges, sliders, flicker and the actions', () => {
    renderPopover();
    for (const kind of ['Candle', 'Torch', 'Lantern', 'Magical light', 'Darkness', 'Custom light']) screen.getByRole('button', { name: kind });
    expect(screen.getByRole('group', { name: 'Kind of light' })).toBeTruthy();
    for (const colour of ['Candle amber', 'Torch orange', 'Lantern gold', 'Warm white', 'Arcane blue', 'Fey green', 'Ember red']) screen.getByRole('button', { name: colour });
    expect(screen.getByLabelText('Custom colour')).toBeTruthy();
    expect((screen.getByLabelText('Bright') as HTMLInputElement).value).toBe('20');
    expect((screen.getByLabelText('Dim') as HTMLInputElement).value).toBe('40');
    expect(screen.getByText('ft')).toBeTruthy();
    for (const slider of ['Bright range', 'Dim range', 'Intensity', 'Softness', 'Beam']) screen.getByRole('slider', { name: slider });
    expect(screen.getByRole('combobox', { name: 'Flicker' }).textContent).toBe('Torch');
    screen.getByRole('button', { name: 'Turn off' });
    screen.getByRole('button', { name: 'Delete' });
    expect(popover().querySelector('[title]')).toBeNull();
  });

  it('marks the light\'s kind and gives it another kind\'s preset in one undo step', () => {
    const { light, steps, undo } = renderPopover();
    expect(screen.getByRole('button', { name: 'Torch' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Lantern' }));
    expect(light().emission).toMatchObject({ kind: 'lantern', bright: 30, dim: 60, color: '#ffd28a' });
    expect(screen.getByRole('button', { name: 'Lantern' }).getAttribute('aria-pressed')).toBe('true');
    expect(steps()).toBe(1);
    undo();
    expect(light().emission.kind).toBe('torch');
  });

  it('marks a light whose stored kind it does not know as the preset it equals, else as custom', () => {
    const { store, torch, light } = renderPopover();
    const unknown = 'brazier' as LightKind;
    act(() => store.getState().updateLight(torch, { emission: { ...light().emission, kind: unknown } }));
    expect(screen.getByRole('button', { name: 'Torch' }).getAttribute('aria-pressed')).toBe('true');
    act(() => store.getState().updateLight(torch, { emission: { ...light().emission, bright: 12 } }));
    expect(screen.getByRole('button', { name: 'Custom light' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('keeps the light as it is when it is made a custom light', () => {
    const { light } = renderPopover();
    fireEvent.click(screen.getByRole('button', { name: 'Custom light' }));
    expect(light().emission).toMatchObject({ kind: 'custom', bright: 20, dim: 40, color: '#ff9a3c' });
  });

  it('keeps its kind when a value is changed', () => {
    const { light } = renderPopover();
    fireEvent.click(screen.getByRole('button', { name: 'Arcane blue' }));
    expect(light().emission).toMatchObject({ kind: 'torch', color: '#8fb8ff' });
    expect(screen.getByRole('button', { name: 'Torch' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Arcane blue' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('takes every colour tried in the system picker as one undo step', () => {
    const { light, steps, undo } = renderPopover();
    const picker = screen.getByLabelText('Custom colour') as HTMLInputElement;
    // The picker sends `input` while a colour is tried and `change` once, when it closes.
    fireEvent.input(picker, { target: { value: '#112233' } });
    fireEvent.input(picker, { target: { value: '#445566' } });
    expect(light().emission.color).toBe('#445566');
    act(() => { picker.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(steps()).toBe(1);
    undo();
    expect(light().emission.color).toBe('#ff9a3c');
  });

  it('commits a typed range on Enter, never leaving dim below bright', () => {
    const { light, steps } = renderPopover();
    const bright = screen.getByLabelText('Bright') as HTMLInputElement;
    fireEvent.change(bright, { target: { value: '55' } });
    expect(light().emission.bright).toBe(20);
    fireEvent.keyDown(bright, { key: 'Enter' });
    expect(light().emission).toMatchObject({ bright: 55, dim: 55 });
    expect((screen.getByLabelText('Dim') as HTMLInputElement).value).toBe('55');
    expect(steps()).toBe(1);
    fireEvent.change(bright, { target: { value: 'far' } });
    fireEvent.blur(bright);
    expect(bright.value).toBe('55');
  });

  it('stops a typed range at the farthest a light may reach, and shows what it took', () => {
    const { light } = renderPopover();
    const bright = screen.getByLabelText('Bright') as HTMLInputElement;
    fireEvent.change(bright, { target: { value: '1e9' } });
    fireEvent.keyDown(bright, { key: 'Enter' });
    // 8,192 px on the 70 px, 5 ft grid
    expect(light().emission).toMatchObject({ bright: 585, dim: 585 });
    expect(bright.value).toBe('585');
    expect((screen.getByLabelText('Dim') as HTMLInputElement).value).toBe('585');
  });

  it('puts back the range when what was typed is not a number', () => {
    const { light, steps } = renderPopover();
    const bright = screen.getByLabelText('Bright') as HTMLInputElement;
    for (const text of ['abc', '1,000', '']) {
      fireEvent.change(bright, { target: { value: text } });
      fireEvent.blur(bright);
      expect(bright.value).toBe('20');
    }
    expect(light().emission.bright).toBe(20);
    expect(steps()).toBe(0);
  });

  it('takes a whole slider drag as one undo step', () => {
    const { store, torch, light, steps, undo } = renderPopover();
    const slider = screen.getByRole('slider', { name: 'Intensity' }).closest('.slider-root')!;
    fireEvent.pointerDown(slider);
    act(() => {
      store.getState().updateLight(torch, { emission: { ...light().emission, intensity: 1.2 } });
      store.getState().updateLight(torch, { emission: { ...light().emission, intensity: 1.5 } });
    });
    fireEvent.pointerUp(window);
    expect(steps()).toBe(1);
    expect(screen.getByText('150 %')).toBeTruthy();
    undo();
    expect(light().emission.intensity).toBe(1);
  });

  it('raises a bright range of nothing again, which has no ring handle on the map', () => {
    const { store, torch, light } = renderPopover();
    act(() => store.getState().updateLight(torch, { emission: { ...light().emission, bright: 0 } }));
    const bright = screen.getByLabelText('Bright') as HTMLInputElement;
    expect(bright.value).toBe('0');
    fireEvent.change(bright, { target: { value: '10' } });
    fireEvent.keyDown(bright, { key: 'Enter' });
    expect(light().emission.bright).toBe(10);
  });

  it('steps a range from the keyboard with its slider thumb', () => {
    const { light } = renderPopover();
    const bright = screen.getByRole('slider', { name: 'Bright range' });
    const dim = screen.getByRole('slider', { name: 'Dim range' });
    act(() => bright.focus());
    fireEvent.keyDown(bright, { key: 'ArrowRight' });
    expect(light().emission).toMatchObject({ bright: 21, dim: 40 });
    act(() => dim.focus());
    fireEvent.keyDown(dim, { key: 'ArrowLeft' });
    expect(light().emission).toMatchObject({ bright: 21, dim: 39 });
  });

  it('follows the light when the map changes it, as a ring drag does', () => {
    const { store, torch, light } = renderPopover();
    act(() => store.getState().updateLight(torch, { emission: { ...light().emission, bright: 12.5 } }));
    expect((screen.getByLabelText('Bright') as HTMLInputElement).value).toBe('12.5');
  });

  it('switches the light off and on', () => {
    const { light, steps } = renderPopover();
    fireEvent.click(screen.getByRole('button', { name: 'Turn off' }));
    expect(light().hidden).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Turn on' }));
    expect(light().hidden).toBe(false);
    expect(steps()).toBe(2);
  });

  it('deletes the light, and undo brings it back', () => {
    const { store, torch, steps, undo } = renderPopover();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(store.getState().objects.lights[torch]).toBeUndefined();
    expect(steps()).toBe(1);
    undo();
    expect(store.getState().objects.lights[torch]).toBeDefined();
  });

  it('shows another light in the same popover when that one is opened', () => {
    const { store, lantern } = renderPopover();
    const element = popover();
    act(() => store.getState().openLightPopover(lantern));
    expect(popover()).toBe(element);
    expect(screen.getByRole('button', { name: 'Lantern' }).getAttribute('aria-pressed')).toBe('true');
    expect((screen.getByLabelText('Dim') as HTMLInputElement).value).toBe('60');
  });

  it('goes when the store closes it, taking no more input while it leaves', async () => {
    const { store } = renderPopover();
    const element = popover();
    act(() => store.getState().closeLightPopover());
    expect(element.hasAttribute('inert')).toBe(true);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('closes on Escape, which does not reach the map\'s shortcuts', () => {
    const { store, mapKeys } = renderPopover();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Torch' }), { key: 'Escape' });
    expect(store.getState().lightPopover).toBeNull();
    expect(mapKeys).not.toHaveBeenCalled();
  });

  it('closes on an Escape that a tooltip took to close itself, and stays open on one a list inside used', () => {
    const { store, torch } = renderPopover();
    const press = (note: boolean): void => {
      // What listens before the popover (a tooltip's layer, a list inside) prevents the key's default.
      const first = (event: Event): void => {
        if (note) noteTooltipDismissal(event);
        event.preventDefault();
      };
      document.addEventListener('keydown', first, true);
      fireEvent.keyDown(popover(), { key: 'Escape' });
      document.removeEventListener('keydown', first, true);
    };
    press(false);
    expect(store.getState().lightPopover).toBe(torch);
    press(true);
    expect(store.getState().lightPopover).toBeNull();
  });

  it('stays open on the Escape that closes a select\'s list while a tooltip shows, and closes on the next', () => {
    const { store, torch } = renderPopover();
    fireEvent.click(screen.getByRole('combobox', { name: 'Shines' }));
    const list = screen.getByRole('listbox');
    // A tooltip that shows now is the topmost layer: Escape is its own first, and it marks the key.
    const tooltip = render(<TooltipProvider><Tooltip open><TooltipTrigger>Hovered</TooltipTrigger><TooltipContent>Tip</TooltipContent></Tooltip></TooltipProvider>);
    fireEvent.keyDown(within(list).getAllByRole('option')[0]!, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(store.getState().lightPopover).toBe(torch);
    tooltip.unmount();
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Shines' }), { key: 'Escape' });
    expect(store.getState().lightPopover).toBeNull();
  });

  it('shows a tooltip that closes on Escape and marks the key as its own', () => {
    render(<TooltipProvider><Tooltip open><TooltipTrigger>Trigger</TooltipTrigger><TooltipContent>Tip</TooltipContent></Tooltip></TooltipProvider>);
    const seen: boolean[] = [];
    const after = (event: Event): void => { seen.push(event.defaultPrevented, handledByAnotherControl(event)); };
    document.addEventListener('keydown', after);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    document.removeEventListener('keydown', after);
    expect(seen).toEqual([true, false]);
  });

  it('keeps Tab, Space and the arrows to its controls, and lets undo through to the map', () => {
    const { mapKeys } = renderPopover();
    const chip = screen.getByRole('button', { name: 'Torch' });
    for (const key of ['Tab', ' ', 'Enter', 'ArrowLeft', 'ArrowDown']) fireEvent.keyDown(chip, { key });
    expect(mapKeys).not.toHaveBeenCalled();
    fireEvent.keyDown(chip, { key: 'z', metaKey: true });
    expect(mapKeys).toHaveBeenCalledTimes(1);
  });

  it('takes the focus when it opens and gives it back when it closes', () => {
    const { store, torch } = renderPopover(false);
    const map = screen.getByRole('button', { name: 'Map' });
    map.focus();
    act(() => store.getState().openLightPopover(torch));
    expect(document.activeElement).toBe(popover());
    act(() => store.getState().closeLightPopover());
    expect(document.activeElement).toBe(map);
  });
});
