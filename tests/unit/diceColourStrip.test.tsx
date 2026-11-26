// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { DICE_COLOUR_OPTIONS, type DiceColour } from '../../src/app/dice3d/diceLook';
import type { DicePreviews } from '../../src/app/dice3d/dicePreviews';
import { DiceColourStrip } from '../../src/app/react/components/command-palette/DiceColourStrip';

const SET: DicePreviews = {
  images: Object.fromEntries(DICE_COLOUR_OPTIONS.map(({ value }) => [value, `data:image/png;base64,${value}`])) as Record<DiceColour, string>,
  ring: 'data:image/png;base64,ring',
};

afterEach(cleanup);

function strip(previews: DicePreviews | null, value: DiceColour = 'light'): React.ReactElement {
  return <DiceColourStrip value={value} previews={previews} onChange={() => undefined} />;
}

it('shows dice there when it opens without bringing them in', () => {
  const { container } = render(strip(SET));
  expect(container.querySelectorAll('img')).toHaveLength(DICE_COLOUR_OPTIONS.length);
  expect(container.querySelector('.atlas-dice-colour-strip--arriving')).toBeNull();
});

it('shows empty wells until the set comes, then brings every die in at once, and only that once', () => {
  const { container, rerender } = render(strip(null));
  expect(container.querySelectorAll('img')).toHaveLength(0);
  expect(container.querySelectorAll('.atlas-dice-colour-strip__die--pending')).toHaveLength(DICE_COLOUR_OPTIONS.length);

  rerender(strip(SET));
  expect(container.querySelectorAll('img')).toHaveLength(DICE_COLOUR_OPTIONS.length);
  const row = container.querySelector('.atlas-dice-colour-strip')!;
  expect(row.classList).toContain('atlas-dice-colour-strip--arriving');

  fireEvent.animationEnd(row);
  rerender(strip(SET, 'dark'));
  // Choosing another colour after it came rings that die without bringing anything in again.
  expect(row.classList).not.toContain('atlas-dice-colour-strip--arriving');
  expect(container.querySelector('[aria-checked="true"] .atlas-dice-colour-strip__ring')).not.toBeNull();
});
