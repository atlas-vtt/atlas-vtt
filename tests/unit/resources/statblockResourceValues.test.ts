import { describe, expect, it } from 'vitest';
import { startingResources, statblockResourceValue } from '../../../src/app/resources/statblockResourceValues';
import { HP_RESOURCE, STRESS_RESOURCE } from '../../../src/app/resources/resourceDefinitions';

const STR = { ...HP_RESOURCE, key: 'str', name: 'STR', field: 'stats.0', defeatedWhenSpent: false };

describe('statblock resource values', () => {
  it('starts each defined resource from its field', () => {
    const cairnTroll = { hp: 14, stats: [14, 12, 4] };
    expect(startingResources(cairnTroll, [HP_RESOURCE, STR])).toEqual({ hp: { current: 14, max: 14 }, str: { current: 14, max: 14 } });
  });

  it('starts filling resources empty', () => {
    expect(statblockResourceValue({ stress: 6 }, STRESS_RESOURCE)).toEqual({ current: 0, max: 6 });
  });

  it('keeps a current value the statblock states', () => {
    expect(statblockResourceValue({ hp: '12/27' }, HP_RESOURCE)).toEqual({ current: 12, max: 27 });
    expect(statblockResourceValue({ Health: { current: 12, max: 27 } }, HP_RESOURCE)).toEqual({ current: 12, max: 27 });
    expect(statblockResourceValue({ stress: '2/6' }, STRESS_RESOURCE)).toEqual({ current: 2, max: 6 });
  });

  it('gives nothing for a missing or non-numeric field', () => {
    expect(statblockResourceValue({ hp: 8 }, STR)).toBeNull();
    expect(statblockResourceValue({ hp: '2d8' }, HP_RESOURCE)).toBeNull();
    expect(startingResources({}, [HP_RESOURCE, STR])).toEqual({});
  });

  it('reads a static value of 0 and still gives no counting resource without a maximum', () => {
    const ac = { ...HP_RESOURCE, key: 'ac', name: 'AC', field: 'ac', direction: 'static' as const, defeatedWhenSpent: false };
    expect(statblockResourceValue({ ac: 0 }, ac)).toEqual({ current: 0, max: 0 });
    expect(startingResources({ ac: 0, hp: 0 }, [ac, HP_RESOURCE])).toEqual({ ac: { current: 0, max: 0 } });
  });
});
