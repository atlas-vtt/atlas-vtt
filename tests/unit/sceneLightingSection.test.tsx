// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SceneLightingSection } from '../../src/app/packages/components/toolbar/SceneLightingSection';
import { TIMES_OF_DAY } from '../../src/app/lighting/timesOfDay';
import { DEFAULT_SCENE_LIGHTING, type SceneLighting } from '../../src/app/types/lightingTypes';

afterEach(cleanup);

function renderSection(overrides: Partial<React.ComponentProps<typeof SceneLightingSection>> = {}): React.ComponentProps<typeof SceneLightingSection> {
  const props = {
    lighting: { ...DEFAULT_SCENE_LIGHTING, enabled: true },
    onChange: vi.fn(),
    onResetExplored: vi.fn(),
    onOpenSettings: vi.fn(),
    ...overrides,
  };
  render(<SceneLightingSection {...props} />);
  return props;
}

describe('SceneLightingSection', () => {
  it('switches dynamic lighting on', () => {
    const props = renderSection({ lighting: DEFAULT_SCENE_LIGHTING });
    const toggle = screen.getByRole('switch', { name: 'Dynamic lighting' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(toggle);
    expect(props.onChange).toHaveBeenCalledWith({ enabled: true });
  });

  it('switches dynamic lighting from the keyboard', () => {
    const props = renderSection();
    const toggle = screen.getByRole('switch', { name: 'Dynamic lighting' });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    fireEvent.keyDown(toggle, { key: ' ' });
    fireEvent.keyDown(toggle, { key: 'Enter' });
    expect(props.onChange.mock.calls).toEqual([[{ enabled: false }], [{ enabled: false }]]);
  });

  it('sets the ambient light from a time of day', () => {
    const props = renderSection();
    fireEvent.click(screen.getByRole('radio', { name: 'Night' }));
    expect(props.onChange).toHaveBeenCalledWith({ ambient: 0.15 });
  });

  it('shows the scene controls while lighting is off, none of them to be used', () => {
    const props = renderSection({ lighting: DEFAULT_SCENE_LIGHTING, onRevealExplored: vi.fn() });
    const controls = [
      ...screen.getAllByRole('radio'),
      screen.getByLabelText('Ambient colour'),
      ...['Mark all areas explored', 'Forget explored areas', 'Lighting settings…'].map((label) => screen.getByText(label).closest('button')!),
    ] as (HTMLButtonElement | HTMLInputElement)[];
    expect(controls).toHaveLength(TIMES_OF_DAY.length + 4);
    expect(controls.filter((control) => !control.disabled)).toEqual([]);
    expect(screen.getByRole('slider', { name: 'Ambient light' }).hasAttribute('data-disabled')).toBe(true);
    expect(screen.getByRole('radiogroup', { name: 'Time of day' }).getAttribute('aria-disabled')).toBe('true');
    for (const control of controls) fireEvent.click(control);
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Ambient light' }), { key: 'ArrowLeft' });
    expect(props.onChange).not.toHaveBeenCalled();
    expect(props.onResetExplored).not.toHaveBeenCalled();
    expect(props.onOpenSettings).not.toHaveBeenCalled();
    // The switch is what brings them back.
    fireEvent.click(screen.getByRole('switch', { name: 'Dynamic lighting' }));
    expect(props.onChange).toHaveBeenCalledWith({ enabled: true });
  });

  it('leaves every control to be used while lighting is on', () => {
    renderSection();
    expect(screen.getAllByRole('radio').some((radio) => (radio as HTMLButtonElement).disabled)).toBe(false);
    expect((screen.getByLabelText('Ambient colour') as HTMLInputElement).disabled).toBe(false);
    expect(screen.getByRole('slider', { name: 'Ambient light' }).hasAttribute('data-disabled')).toBe(false);
    expect(screen.getByRole('radiogroup', { name: 'Time of day' }).hasAttribute('aria-disabled')).toBe(false);
  });

  it('forgets explored areas', () => {
    const props = renderSection();
    fireEvent.click(screen.getByText('Forget explored areas'));
    expect(props.onResetExplored).toHaveBeenCalled();
  });

  it('has no preview of its own: the GM view switch shows the players\' lighting', () => {
    renderSection();
    expect(screen.queryByText('Preview player view')).toBeNull();
    expect(screen.getAllByRole('switch')).toHaveLength(1);
  });

  it('keeps its actions in a section of their own, as rows like every other menu\'s, and the switch last', () => {
    const { container } = render(<SceneLightingSection lighting={DEFAULT_SCENE_LIGHTING} onChange={vi.fn()} onResetExplored={vi.fn()} onOpenSettings={vi.fn()} />);
    const sections = [...container.querySelectorAll('.atlas-dropdown-section')];
    const controls = screen.getByRole('radiogroup', { name: 'Time of day' }).closest('.atlas-dropdown-section');
    const actions = screen.getByText('Forget explored areas').closest('.atlas-dropdown-section');
    const toggle = screen.getByRole('switch').closest('.atlas-dropdown-section');
    expect(sections).toEqual([controls, actions, toggle]);
    expect(screen.getByText('Lighting settings…').closest('.atlas-dropdown-section')).toBe(actions);
    expect(screen.getByText('Forget explored areas').closest('button')?.classList.contains('atlas-dropdown-menu-item')).toBe(true);
  });

  it('has the same rows in the same places whether lighting is on or off, so the switch never moves', () => {
    /** The rows of each section in order: a row's classes and its text. */
    const shape = (lighting: SceneLighting): string[][] => {
      const { container } = render(<SceneLightingSection lighting={lighting} onChange={vi.fn()} onResetExplored={vi.fn()} onOpenSettings={vi.fn()} />);
      const sections = [...container.querySelectorAll('.atlas-dropdown-section')]
        .map((section) => [...section.children].map((row) => `${row.className}: ${row.textContent}`));
      cleanup();
      return sections;
    };
    const off = shape(DEFAULT_SCENE_LIGHTING);
    expect(off).toEqual(shape({ ...DEFAULT_SCENE_LIGHTING, enabled: true }));
    expect(off.map((rows) => rows.length)).toEqual([2, 2, 1]);
  });

  it('tints the ambient light with the colour beside its slider', () => {
    const props = renderSection();
    const swatch = screen.getByLabelText('Ambient colour') as HTMLInputElement;
    expect(swatch.value).toBe('#ffffff');
    expect(swatch.classList.contains('atlas-swatch')).toBe(true);
    fireEvent.change(swatch, { target: { value: '#3366cc' } });
    expect(props.onChange).toHaveBeenCalledWith({ ambientColor: '#3366cc' });
  });

  it('shows the scene\'s ambient colour', () => {
    renderSection({ lighting: { ...DEFAULT_SCENE_LIGHTING, enabled: true, ambientColor: '#aa8844' } });
    expect((screen.getByLabelText('Ambient colour') as HTMLInputElement).value).toBe('#aa8844');
  });

  it('opens the lighting settings', () => {
    const props = renderSection();
    fireEvent.click(screen.getByText('Lighting settings…'));
    expect(props.onOpenSettings).toHaveBeenCalled();
  });
});
