import { describe, expect, it } from 'vitest';
import { WIZARD_GAP, WIZARD_MARGIN, wizardLayout, type Box } from '../../../src/app/packages/components/dungeon-generator/wizardLayout';

const PANEL = { width: 360, height: 420 };
const VIEW = { width: 1400, height: 900 };

const inside = (box: Box, view: { width: number; height: number }): boolean =>
  box.left >= WIZARD_MARGIN && box.top >= WIZARD_MARGIN
  && box.left + box.width <= view.width - WIZARD_MARGIN && box.top + box.height <= view.height - WIZARD_MARGIN;

const overlaps = (a: Box, b: Box): boolean =>
  a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;

describe('where the wizard stands', () => {
  it('takes the dropdown’s place and floats the preview on the side with more room, tops in line', () => {
    const anchor = { left: 200, top: 150, width: 320, height: 380 };
    const { panel, preview } = wizardLayout(VIEW, PANEL, anchor);
    expect(panel).toEqual({ left: 200, top: 150 });
    expect(preview.left).toBe(200 + PANEL.width + WIZARD_GAP);
    expect(preview.top).toBe(150);
    expect(preview.width / preview.height).toBeCloseTo(4 / 3, 1);
    expect(inside(preview, VIEW)).toBe(true);
  });

  it('puts the preview to the panel’s left where the dropdown opened near the right edge', () => {
    const anchor = { left: 1000, top: 100, width: 320, height: 380 };
    const { panel, preview } = wizardLayout(VIEW, PANEL, anchor);
    expect(preview.left + preview.width).toBe(panel.left - WIZARD_GAP);
    expect(overlaps({ ...panel, ...PANEL }, preview)).toBe(false);
  });

  it('keeps the panel inside the view, its top where it was until the view’s foot pushes it up', () => {
    const low = wizardLayout(VIEW, PANEL, { left: -40, top: 800, width: 320, height: 80 });
    expect(low.panel).toEqual({ left: WIZARD_MARGIN, top: VIEW.height - WIZARD_MARGIN - PANEL.height });
    // A taller step pushes it no further than the view needs
    const taller = wizardLayout(VIEW, { ...PANEL, height: 500 }, { left: 200, top: 100, width: 320, height: 80 });
    expect(taller.panel.top).toBe(100);
  });

  it('stands panel and preview side by side in the middle without an anchor', () => {
    const { panel, preview } = wizardLayout(VIEW, PANEL, null);
    const left = panel.left;
    const right = VIEW.width - (preview.left + preview.width);
    expect(Math.abs(left - right)).toBeLessThanOrEqual(1);
    expect(preview.left).toBe(panel.left + PANEL.width + WIZARD_GAP);
    expect(preview.top).toBe(panel.top);
    expect(inside(preview, VIEW)).toBe(true);
  });

  it('stacks the preview above or below the panel in a view too narrow for it beside', () => {
    const narrow = { width: 520, height: 1000 };
    const { panel, preview } = wizardLayout(narrow, PANEL, { left: 100, top: 40, width: 320, height: 380 });
    expect(overlaps({ ...panel, ...PANEL }, preview)).toBe(false);
    expect(preview.top).toBe(panel.top + PANEL.height + WIZARD_GAP);
    expect(inside(preview, narrow)).toBe(true);
  });

  it('never grows the preview past its largest size', () => {
    const { preview } = wizardLayout({ width: 4000, height: 2400 }, PANEL, null);
    expect(preview.width).toBeLessThanOrEqual(640);
  });
});
