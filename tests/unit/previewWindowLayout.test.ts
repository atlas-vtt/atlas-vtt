import { describe, expect, it } from 'vitest';
import { fitPreviewWindowLayout, previewReach, shiftIntoFrame, visiblePart } from '../../src/app/services/previewWindowLayout';

const FRAME = { left: 300, top: 40, right: 1300, bottom: 840 };
const box = (left: number, top: number, width: number, height: number): { left: number; top: number; right: number; bottom: number } =>
  ({ left, top, right: left + width, bottom: top + height });

describe('shiftIntoFrame', () => {
  it('leaves a reach inside the frame where it is', () => {
    expect(shiftIntoFrame(box(400, 100, 120, 40), FRAME)).toEqual({ x: 0, y: 0 });
  });

  it('brings a reach back over each edge it crossed', () => {
    expect(shiftIntoFrame(box(100, 100, 120, 40), FRAME)).toEqual({ x: 200, y: 0 });
    expect(shiftIntoFrame(box(1250, 100, 120, 40), FRAME)).toEqual({ x: -70, y: 0 });
    expect(shiftIntoFrame(box(400, -20, 120, 40), FRAME)).toEqual({ x: 0, y: 60 });
    expect(shiftIntoFrame(box(400, 830, 120, 40), FRAME)).toEqual({ x: 0, y: -30 });
  });

  it('keeps the top right corner, where pin and close are, in a frame smaller than the reach', () => {
    const tiny = { left: 0, top: 0, right: 100, bottom: 30 };
    expect(shiftIntoFrame(box(50, 50, 120, 40), tiny)).toEqual({ x: -70, y: -50 });
  });

  it('asks for no shift in a frame that is not laid out', () => {
    expect(shiftIntoFrame(box(5000, 5000, 120, 40), { left: 0, top: 0, right: 0, bottom: 0 })).toEqual({ x: 0, y: 0 });
  });
});

describe('previewReach', () => {
  const controls = box(500, 60, 80, 36);

  it('is the controls and the stretch of the grab area beside them', () => {
    expect(previewReach(controls, box(200, 100, 400, 50))).toEqual({ left: 404, top: 60, right: 600, bottom: 150 });
    expect(previewReach(controls, box(450, 100, 150, 50))).toEqual({ left: 450, top: 60, right: 600, bottom: 150 });
    expect(previewReach(controls, null)).toEqual(controls);
  });

  it('is nothing while the window is hidden', () => {
    expect(previewReach({ left: 0, top: 0, right: 0, bottom: 0 }, null)).toBeNull();
  });
});

describe('visiblePart', () => {
  const card = box(100, 100, 400, 300);

  it('is the part of a header its card shows, or nothing once it is scrolled out', () => {
    expect(visiblePart(box(100, 120, 400, 50), [card])).toEqual(box(100, 120, 400, 50));
    expect(visiblePart(box(100, 80, 400, 50), [card])).toEqual(box(100, 100, 400, 30));
    expect(visiblePart(box(100, -900, 400, 50), [card, box(0, 0, 1000, 1000)])).toBeNull();
  });
});

describe('fitPreviewWindowLayout', () => {
  it('brings a pinned preview saved off the view back into it', () => {
    const bounds = { width: 1000, height: 800 };
    expect(fitPreviewWindowLayout({ left: 4000, top: -300, width: 400, height: 300 }, bounds))
      .toEqual({ left: 600, top: 0, width: 400, height: 300 });
    expect(fitPreviewWindowLayout({ left: -900, top: 2000, width: 400, height: 300 }, bounds))
      .toEqual({ left: 0, top: 500, width: 400, height: 300 });
  });
});
