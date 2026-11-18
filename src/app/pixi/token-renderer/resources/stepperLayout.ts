import { barDimensions } from '../../../styles/designTokens';
import { BAR_BUTTON_SIZE, type ResourceSlot } from './ResourceStack';
import { WHEEL_STEPPER } from './ResourceWheels';

/**
 * Diameter of a +/- button under a finger, in UI units: a selected token's UI never has fewer
 * than 2.25 screen pixels to the unit, so the button is 45 px across at least, where a mouse's
 * (a bar's height) is 22.
 */
export const FINGER_STEPPER_SIZE = 20;

/** Where the two buttons of one resource stand, by their middles, in the units of the resource's anchor. */
export interface StepperLayout {
  /** Diameter of both buttons. */
  readonly size: number;
  readonly minusX: number;
  readonly minusY: number;
  readonly plusX: number;
  readonly plusY: number;
}

const { gap } = barDimensions.token;

/**
 * A mouse's buttons: a bar's at its two ends, level with it; a wheel's on its outer side, away
 * from the token, + above -.
 */
function fineLayout(slot: ResourceSlot): StepperLayout {
  const centerY = slot.top + slot.height / 2;
  const right = slot.left + slot.width;
  if (slot.kind === 'bar') {
    const reach = BAR_BUTTON_SIZE / 2 + gap;
    return { size: BAR_BUTTON_SIZE, minusX: slot.left - reach, minusY: centerY, plusX: right + reach, plusY: centerY };
  }
  const { size } = WHEEL_STEPPER;
  const x = slot.kind === 'wheel-left' ? slot.left - WHEEL_STEPPER.gap - size / 2 : right + WHEEL_STEPPER.gap + size / 2;
  return { size, minusX: x, minusY: centerY + (size + 1) / 2, plusX: x, plusY: centerY - (size + 1) / 2 };
}

/**
 * A finger's buttons are twice as tall as a bar, so they cannot stand level with bars that lie
 * one under the other. A bar's hang from its own top line at its two ends, and the second
 * bar's stand one column further out, so no button meets a bar, the nameplate above the bars or
 * another button. A wheel's stand side by side on its outer side, - before +, as tall as the wheel.
 */
function fingerLayout(slot: ResourceSlot, column: number): StepperLayout {
  const size = FINGER_STEPPER_SIZE;
  const step = size + gap;
  const right = slot.left + slot.width;
  if (slot.kind === 'bar') {
    const reach = gap + size / 2 + column * step;
    const y = slot.top + size / 2;
    return { size, minusX: slot.left - reach, minusY: y, plusX: right + reach, plusY: y };
  }
  const y = slot.top + slot.height / 2;
  const near = WHEEL_STEPPER.gap + size / 2;
  return slot.kind === 'wheel-left'
    ? { size, minusX: slot.left - near - step, minusY: y, plusX: slot.left - near, plusY: y }
    : { size, minusX: right + near, minusY: y, plusX: right + near + step, plusY: y };
}

/**
 * Where the +/- buttons of the resource in `slot` stand. `column` counts the bars with buttons
 * above it, which only a finger's layout reads.
 */
export function stepperLayout(slot: ResourceSlot, column: number, finger: boolean): StepperLayout {
  return finger ? fingerLayout(slot, column) : fineLayout(slot);
}

/** How far the bars' buttons stand out beyond a bar's end, in UI units, when `bars` bars have them: what the wheels beside the token make room for. */
export function barButtonSpan(bars: number, finger: boolean): number {
  return finger ? Math.max(1, bars) * (gap + FINGER_STEPPER_SIZE) : gap + BAR_BUTTON_SIZE;
}

/** The band a finger's press on a bar is taken in, from `top` to `bottom`, in the units of the bar's anchor. */
export interface BarReach {
  readonly top: number;
  readonly bottom: number;
}

/**
 * Where a finger's press counts as one on the bar in `slot`: a bar is half as tall as a finger
 * needs, so its band is taller than it is drawn. It reaches up to the token's edge above the
 * first bar (the nameplate lies beyond) and down to a finger's height below the last, and bars
 * that lie one under the other share the gap between them, so no band meets another. It is as
 * wide as its bar, whose +/- buttons stand past its ends: no band meets a button either.
 * `bars` are the bars pressed for their values, `slot` among them.
 */
export function fingerBarReach(slot: ResourceSlot, bars: readonly ResourceSlot[]): BarReach {
  const stack = bars.filter((bar) => bar.kind === 'bar').sort((a, b) => a.top - b.top);
  const index = stack.findIndex((bar) => bar.key === slot.key);
  const above = stack[index - 1];
  const below = stack[index + 1];
  const top = above ? (above.top + above.height + slot.top) / 2 : slot.top - gap;
  const bottom = below ? (slot.top + slot.height + below.top) / 2 : Math.max(slot.top + slot.height, top + FINGER_STEPPER_SIZE);
  return { top, bottom };
}
