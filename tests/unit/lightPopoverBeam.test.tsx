// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderPopover } from '../mocks/lightPopoverHarness';

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
  // jsdom has no pointer capture, which the slider takes on a press.
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.releasePointerCapture = vi.fn();
  HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
});
afterAll(() => { MotionGlobalConfig.skipAnimations = false; });
afterEach(cleanup);

describe('LightPopover: darkness and beams', () => {
  it('lets a placed light shine only from dusk or at night, in one undo step, and always again', () => {
    const { light, steps, undo } = renderPopover();
    const shines = (): HTMLElement => screen.getByRole('combobox', { name: 'Shines' });
    expect(shines().textContent).toBe('Always');
    expect(light().activeBelowAmbient).toBeUndefined();
    fireEvent.click(shines());
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['Always', 'From dusk', 'At night']);
    fireEvent.click(screen.getByRole('option', { name: 'From dusk' }));
    expect(light().activeBelowAmbient).toBe(0.5);
    expect(shines().textContent).toBe('From dusk');
    expect(steps()).toBe(1);
    fireEvent.click(shines());
    fireEvent.click(screen.getByRole('option', { name: 'At night' }));
    expect(light().activeBelowAmbient).toBe(0.15);
    undo();
    expect(light().activeBelowAmbient).toBe(0.5);
    fireEvent.click(shines());
    fireEvent.click(screen.getByRole('option', { name: 'Always' }));
    expect(shines().textContent).toBe('Always');
    expect('activeBelowAmbient' in light()).toBe(false);
  });

  it('names a level that is no time of day, and offers it only while the light has it', () => {
    const { store, torch } = renderPopover();
    act(() => store.getState().updateLight(torch, { activeBelowAmbient: 0.3 }));
    const shines = screen.getByRole('combobox', { name: 'Shines' });
    expect(shines.textContent).toBe('Below 30 % light');
    fireEvent.click(shines);
    expect(screen.getAllByRole('option')).toHaveLength(4);
  });

  it('makes the light a source of magical darkness with the Darkness kind: one radius, and none of a light\'s controls', () => {
    const { light, steps } = renderPopover();
    fireEvent.click(screen.getByRole('button', { name: 'Darkness' }));
    expect(light().emission).toMatchObject({ darkness: true, kind: 'darkness', bright: 0, dim: 15 });
    expect(steps()).toBe(1);
    expect(screen.getByRole('button', { name: 'Darkness' }).getAttribute('aria-pressed')).toBe('true');
    expect((screen.getByLabelText('Radius') as HTMLInputElement).value).toBe('15');
    screen.getByRole('slider', { name: 'Darkness radius' });
    expect(screen.queryByLabelText('Bright')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Candle amber' })).toBeNull();
    for (const slider of ['Intensity', 'Softness', 'Bright range', 'Beam', 'Direction']) expect(screen.queryByRole('slider', { name: slider })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Flicker' })).toBeNull();
    expect(screen.queryByRole('switch', { name: 'Outshines magical darkness' })).toBeNull();
    // Its one radius is typed like a light's range.
    const radius = screen.getByLabelText('Radius');
    fireEvent.change(radius, { target: { value: '20' } });
    fireEvent.keyDown(radius, { key: 'Enter' });
    expect(light().emission).toMatchObject({ darkness: true, bright: 0, dim: 20 });
    // Made a custom light it stays a darkness; another kind's preset makes it a light again.
    fireEvent.click(screen.getByRole('button', { name: 'Custom light' }));
    expect(light().emission).toMatchObject({ darkness: true, kind: 'custom', dim: 20 });
    expect(screen.getByLabelText('Radius')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Torch' }));
    expect(light().emission).not.toHaveProperty('darkness');
    expect((screen.getByLabelText('Bright') as HTMLInputElement).value).toBe('20');
  });

  it('lets a light outshine magical darkness, and stores nothing for one that does not', () => {
    const { light } = renderPopover();
    const outshines = screen.getByRole('switch', { name: 'Outshines magical darkness' });
    expect(outshines.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(outshines);
    expect(light().emission.priority).toBe(1);
    expect(outshines.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(outshines);
    expect(light().emission).not.toHaveProperty('priority');
  });

  it('narrows the light to a beam, and lets its direction be set only while it has one', () => {
    const { light, steps, undo } = renderPopover();
    const beam = screen.getByRole('slider', { name: 'Beam' });
    const direction = screen.getByRole('slider', { name: 'Direction' });
    expect(screen.getByText('All')).toBeTruthy();
    expect(direction.hasAttribute('data-disabled')).toBe(true);
    act(() => beam.focus());
    fireEvent.keyDown(beam, { key: 'ArrowLeft' });
    expect(light().emission.angle).toBe(355);
    expect(screen.getByText('355°')).toBeTruthy();
    expect(direction.hasAttribute('data-disabled')).toBe(false);
    act(() => direction.focus());
    fireEvent.keyDown(direction, { key: 'ArrowRight' });
    expect(light().rotation).toBe(5);
    expect(steps()).toBe(2);
    undo();
    expect(light().rotation ?? 0).toBe(0);
    fireEvent.keyDown(beam, { key: 'End' });
    expect('angle' in light().emission).toBe(false);
    expect(direction.hasAttribute('data-disabled')).toBe(true);
  });

  it('shows the beam of a light that has one, as the map changes it', () => {
    const { store, torch, light } = renderPopover();
    act(() => store.getState().updateLight(torch, { rotation: 135, emission: { ...light().emission, angle: 53 } }));
    expect(screen.getByRole('slider', { name: 'Beam' }).getAttribute('aria-valuenow')).toBe('53');
    expect(screen.getByRole('slider', { name: 'Direction' }).getAttribute('aria-valuenow')).toBe('135');
    expect(screen.getByText('53°')).toBeTruthy();
    expect(screen.getByText('135°')).toBeTruthy();
  });
});
