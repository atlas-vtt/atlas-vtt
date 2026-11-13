/**
 * The looks a kept area can be drawn with, as data: which there are, the colour each is usually
 * seen in and what an area starts with when it is given one. Pure, shared with whatever draws or
 * sends them; the shaders that draw them are `pixi/measure/effects`.
 */

/** A look an area is drawn with, in the area's own colour. */
export type MeasureEffect = 'fire' | 'frost' | 'lightning' | 'mist' | 'radiance' | 'shadow';

export const MEASURE_EFFECTS: readonly MeasureEffect[] = ['fire', 'frost', 'lightning', 'mist', 'radiance', 'shadow'];

/** What an area takes on when it is given an effect; the GM changes any of it after. */
export interface MeasureEffectStart {
  /** '#rrggbb': the colour the effect is usually seen in. */
  readonly color: string;
  /** The light it gives: one that flickers, a steady one, or none. */
  readonly light: 'flicker' | 'steady' | null;
  /** Whether it is a magical darkness, where the area's shape can be one. */
  readonly darkness: boolean;
}

/** Colours of the map's swatches, except frost's pale blue, which none of them is. */
export const MEASURE_EFFECT_STARTS: Readonly<Record<MeasureEffect, MeasureEffectStart>> = {
  fire: { color: '#ec7500', light: 'flicker', darkness: false },
  frost: { color: '#8ad1f8', light: null, darkness: false },
  lightning: { color: '#086ddd', light: 'flicker', darkness: false },
  mist: { color: '#ffffff', light: null, darkness: false },
  radiance: { color: '#e0ac00', light: 'steady', darkness: false },
  shadow: { color: '#7852ee', light: null, darkness: true },
};

/** The effect a file's value names; undefined for anything else, so an unknown look draws none. */
export function readMeasureEffect(value: unknown): MeasureEffect | undefined {
  return MEASURE_EFFECTS.find((effect) => effect === value);
}
