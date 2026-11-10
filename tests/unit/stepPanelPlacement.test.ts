import { describe, expect, it } from 'vitest';
import { placeStepPanel } from '../../src/app/react/components/collection-settings/dice-lab/stepPanelPlacement';

const FRAME = { left: 0, top: 0, right: 600, bottom: 500 };
/** A die of 136 px whose centre is at (200, 200), its label ending at 290; its fan reaches 104 px. */
const DIE = { x: 200, y: 200, top: 132, bottom: 290, reach: 104 };

describe('placeStepPanel', () => {
  it('opens under the die where there is room, centred on it', () => {
    expect(placeStepPanel(DIE, 264, 180, FRAME)).toEqual({ left: 68, top: 298, side: 'below', maxHeight: null });
  });

  it('opens beside the die, clear of its fan, before it takes the fan\'s place over the die', () => {
    expect(placeStepPanel(DIE, 264, 250, FRAME)).toEqual({ left: 312, top: 75, side: 'right', maxHeight: null });
    expect(placeStepPanel({ ...DIE, x: 450 }, 264, 250, FRAME)).toEqual({ left: 74, top: 75, side: 'left', maxHeight: null });
  });

  it('opens over the die where neither under nor beside holds it', () => {
    const middle = { x: 300, y: 380, top: 312, bottom: 470, reach: 104 };
    expect(placeStepPanel(middle, 264, 250, { ...FRAME, bottom: 600 })).toEqual({ left: 168, top: 54, side: 'above', maxHeight: null });
  });

  it('keeps within the frame and caps its height on the roomier side where nothing holds it', () => {
    expect(placeStepPanel({ ...DIE, x: 300 }, 264, 700, FRAME)).toEqual({ left: 168, top: 298, side: 'below', maxHeight: 194 });
    expect(placeStepPanel({ ...DIE, x: 20 }, 264, 100, FRAME).left).toBe(8);
  });
});
