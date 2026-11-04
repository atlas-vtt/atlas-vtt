// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Slider } from '../../src/app/packages/components/primitives/slider';

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe(): void {} unobserve(): void {} disconnect(): void {} });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('renders one named thumb per value and reads values as labelled', () => {
  render(<Slider value={[0, 2]} min={0} max={3} thumbLabels={['Lowest CR', 'Highest CR']} getValueText={(i) => ['1/4', '1/2', '1', '2'][i] ?? ''} />);
  const [low, high] = screen.getAllByRole('slider');
  expect(low?.getAttribute('aria-label')).toBe('Lowest CR');
  expect(high?.getAttribute('aria-valuetext')).toBe('1');
});

it('keeps a single thumb for a plain slider', () => {
  render(<Slider defaultValue={[5]} min={0} max={10} aria-labelledby="size-label" />);
  const thumbs = screen.getAllByRole('slider');
  expect(thumbs).toHaveLength(1);
  expect(thumbs[0]?.getAttribute('aria-labelledby')).toBe('size-label');
});

it('commits keyboard steps', () => {
  const commit = vi.fn();
  render(<Slider defaultValue={[0, 3]} min={0} max={3} step={1} thumbLabels={['Lowest', 'Highest']} onValueCommit={commit} />);
  const highest = screen.getByRole('slider', { name: 'Highest' });
  fireEvent.focus(highest);
  fireEvent.keyDown(highest, { key: 'ArrowLeft' });
  expect(commit).toHaveBeenLastCalledWith([0, 2]);
});
