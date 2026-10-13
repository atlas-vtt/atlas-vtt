import { describe, expect, it } from 'vitest';
import { colourMismatches, coloursOf, comparedColours, malformedColourProblems } from '../helpers/lightColourCompare';

describe('light colours compared with their previous version', () => {
  it('keeps every light\'s colour to the last bit', () => {
    const colours = comparedColours();
    expect(colours.length).toBeGreaterThan(6000);
    expect(colours.filter((colour) => colour !== colour.toLowerCase() && colour !== colour.toUpperCase()).length).toBeGreaterThan(3000);
    expect(colourMismatches(colours)).toEqual([]);
  });

  it('gives the colours it always gave', () => {
    expect(coloursOf('#ff8800').now).toEqual([1, 0.5488627027469221, 0.21404114048223255]);
    expect(coloursOf('#3366cc').now).toEqual([0.318546779864347, 0.44798841668593997, 0.787412301190406]);
    // A plain division by 255 gives 0.5488626804504491 here, the same number once rounded to single precision.
    expect(coloursOf('#880000').now[0]).toBe(0.5488627027469221);
    expect(Math.fround(0.5488626804504491)).toBe(Math.fround(0.5488627027469221));
  });

  it('is never handed a colour that is not #rrggbb', () => {
    expect(malformedColourProblems()).toEqual([]);
  });
});
