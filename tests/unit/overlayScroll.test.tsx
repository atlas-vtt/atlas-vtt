// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { OverlayScroll, thumbGeometry } from '../../src/app/packages/components/primitives/OverlayScroll';

afterEach(cleanup);

describe('thumbGeometry', () => {
  it('has no thumb while the content fits', () => {
    expect(thumbGeometry(0, 300, 300, 290)).toBeNull();
  });

  it('sizes the thumb by the share of the content in view and moves it with the scroll', () => {
    expect(thumbGeometry(0, 1000, 250, 400)).toEqual({ top: 0, height: 100 });
    expect(thumbGeometry(375, 1000, 250, 400)).toEqual({ top: 150, height: 100 });
    expect(thumbGeometry(750, 1000, 250, 400)).toEqual({ top: 300, height: 100 });
  });

  it('keeps a long list grabbable and the thumb inside its track when scrolling overshoots', () => {
    expect(thumbGeometry(0, 100_000, 250, 400)?.height).toBe(24);
    expect(thumbGeometry(99_900, 100_000, 250, 400)).toEqual({ top: 376, height: 24 });
  });
});

it('hands the scroll area to the ref and keeps the classes and handlers it is given', () => {
  const ref = React.createRef<HTMLDivElement>();
  render(
    <OverlayScroll ref={ref} frameClassName="frame" className="area" data-testid="area">
      <p>Row</p>
    </OverlayScroll>,
  );
  const area = screen.getByTestId('area');
  expect(ref.current).toBe(area);
  expect(area.classList.contains('area')).toBe(true);
  expect(area.parentElement?.classList.contains('frame')).toBe(true);
  expect(area.parentElement?.querySelector('.atlas-overlay-scroll__thumb')).not.toBeNull();
});
