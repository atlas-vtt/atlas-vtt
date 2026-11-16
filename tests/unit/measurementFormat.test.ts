import { describe, it, expect } from 'vitest';
import type { RangeBand } from '../../src/app/types/collectionSettingsTypes';
import {
  areRangeBandsValid,
  formatDistance,
  formatReach,
  isValidRangeBandThreshold,
  rangeBandName,
  readUnitName,
  resolveMeasurementSettings,
  unitLabelFor,
  type MeasurementSettings,
} from '../../src/app/grid/measurementFormat';

describe('rangeBandName', () => {
  const bands: RangeBand[] = [
    { name: 'Melee', maxSquares: 1 },
    { name: 'Close', maxSquares: 3 },
    { name: 'Far', maxSquares: 6 },
    { name: 'Very Far', maxSquares: 12 },
  ];

  it('returns first band for distance within range', () => {
    expect(rangeBandName(0, bands)).toBe('Melee');
    expect(rangeBandName(1, bands)).toBe('Melee');
  });

  it('returns correct band at boundaries', () => {
    expect(rangeBandName(3, bands)).toBe('Close');
    expect(rangeBandName(4, bands)).toBe('Far');
    expect(rangeBandName(6, bands)).toBe('Far');
  });

  it('returns last band name for distances past all thresholds', () => {
    expect(rangeBandName(15, bands)).toBe('Very Far');
    expect(rangeBandName(100, bands)).toBe('Very Far');
  });

  it('handles empty bands with grid-square fallback', () => {
    expect(rangeBandName(5, [])).toBe('5 sq');
    expect(rangeBandName(0, [])).toBe('0 sq');
  });

  it('handles fractional grid distances via rounding', () => {
    expect(rangeBandName(1.4, bands)).toBe('Melee');
    expect(rangeBandName(1.6, bands)).toBe('Close');
  });
});

describe('formatDistance', () => {
  const metric: MeasurementSettings = { mode: 'metric', unitType: 'feet', unitDistance: 5, ruleDistance: 5, diagonalRule: 'equidistant', rangeBands: [], coneAngle: 90 };

  it('multiplies cells by the unit distance and rounds', () => {
    expect(formatDistance(6, metric)).toBe('30ft');
    expect(formatDistance(Math.SQRT2, metric)).toBe('7.1ft');
    expect(formatDistance(1, { ...metric, unitType: 'meters', unitDistance: 1.5 })).toBe('1.5m');
    expect(formatDistance(3, { ...metric, unitType: 'meters', unitDistance: 1.5 })).toBe('4.5m');
  });

  it('labels each unit type', () => {
    expect(formatDistance(2, { ...metric, unitType: 'meters', unitDistance: 1.5 })).toBe('3m');
    expect(formatDistance(2, { ...metric, unitType: 'units', unitDistance: 1 })).toBe('2u');
    expect(formatDistance(2, { ...metric, unitType: 'custom', unitDistance: 10 })).toBe('20');
  });

  it('uses range bands in abstract mode', () => {
    expect(formatDistance(2, { ...metric, mode: 'abstract', rangeBands: [{ name: 'Close', maxSquares: 3 }] })).toBe('Close');
  });

  // #243: a unit with a name of its own.
  it('shows the name the GM typed for the unit, in measured and in set distances and beside inputs', () => {
    const miles: MeasurementSettings = { ...metric, unitType: 'custom', unitDistance: 6, unitName: 'mi' };
    expect(formatDistance(2, miles)).toBe('12 mi');
    expect(formatReach(2.5, miles)).toBe('15 mi');
    expect(unitLabelFor(miles.unitType, miles.unitName)).toBe('mi');
    expect(unitLabelFor('custom')).toBe('');
    // Range bands name distances themselves
    expect(formatDistance(2, { ...miles, mode: 'abstract', rangeBands: [{ name: 'Close', maxSquares: 3 }] })).toBe('Close');
  });
});

describe('a unit\'s name', () => {
  const grid = { enabled: true, size: 70, offsetX: 0, offsetY: 0, opacity: 1 };

  it('is read trimmed and cut to a short word, and is none for text that names nothing', () => {
    expect(readUnitName(' mi ')).toBe('mi');
    expect(readUnitName('light years and more')).toBe('light years');
    expect(readUnitName('   ')).toBeUndefined();
    expect(readUnitName('')).toBeUndefined();
    expect(readUnitName(5)).toBeUndefined();
    expect(readUnitName(undefined)).toBeUndefined();
  });

  it('is the collection\'s for a custom unit only', () => {
    const custom = { unitType: 'custom', unitName: 'leagues', unitDistance: 3, measurementMode: 'metric' } as const;
    expect(resolveMeasurementSettings(custom, grid)).toMatchObject({ unitType: 'custom', unitName: 'leagues' });
    expect(formatDistance(2, resolveMeasurementSettings(custom, grid))).toBe('6 leagues');
    expect(resolveMeasurementSettings({ ...custom, unitType: 'feet' }, grid)).not.toHaveProperty('unitName');
    expect(resolveMeasurementSettings({ ...custom, unitName: '  ' }, grid)).not.toHaveProperty('unitName');
  });

  it('is the scene\'s own where it names one, whatever unit the collection measures in', () => {
    const feet = { unitType: 'feet', unitDistance: 5, measurementMode: 'metric' } as const;
    const galaxy = { ...grid, unitDistanceOverride: 5000, unitNameOverride: 'ly' };
    const settings = resolveMeasurementSettings(feet, galaxy);
    expect(settings).toMatchObject({ unitType: 'feet', unitDistance: 5000, ruleDistance: 5, unitName: 'ly' });
    expect(formatDistance(3, settings)).toBe('15000 ly');
    expect(resolveMeasurementSettings({ unitType: 'custom', unitName: 'mi', unitDistance: 1, measurementMode: 'metric' }, galaxy).unitName).toBe('ly');
    expect(resolveMeasurementSettings(undefined, { ...galaxy, measurementType: 'units' }).unitName).toBe('ly');
    // Range bands have no unit to name; the scene's stays stored for measuring again
    expect(resolveMeasurementSettings({ ...feet, measurementMode: 'abstract' }, galaxy)).not.toHaveProperty('unitName');
    expect(resolveMeasurementSettings(feet, { ...grid, unitNameOverride: 7 as never })).not.toHaveProperty('unitName');
  });
});

describe('resolveMeasurementSettings', () => {
  const grid = { enabled: true, size: 70, offsetX: 0, offsetY: 0, opacity: 1 };

  it('prefers the collection defaults', () => {
    const settings = resolveMeasurementSettings(
      { unitType: 'meters', unitDistance: 2, measurementMode: 'metric', diagonalRule: 'alternating' },
      { ...grid, unitType: 'feet', unitDistance: 5, measurementType: 'abstract' },
    );
    expect(settings).toEqual({ mode: 'metric', unitType: 'meters', unitDistance: 2, ruleDistance: 2, diagonalRule: 'alternating', difficultTerrain: 'none', rangeBands: [], coneAngle: 90, areaCellRule: 'half', coneEnd: 'round' });
  });

  it('defaults collections without a diagonal rule to every diagonal counting 1', () => {
    expect(resolveMeasurementSettings({ unitType: 'feet', unitDistance: 5, measurementMode: 'metric' }, null).diagonalRule).toBe('equidistant');
  });

  it('falls back to the map grid, measuring in range bands unless it asks for units', () => {
    expect(resolveMeasurementSettings(undefined, { ...grid, measurementType: 'units', unitType: 'meters', unitDistance: 3 }))
      .toEqual({ mode: 'metric', unitType: 'meters', unitDistance: 3, ruleDistance: 3, diagonalRule: 'equidistant', difficultTerrain: 'none', rangeBands: [], coneAngle: 90, areaCellRule: 'half', coneEnd: 'round' });
    expect(resolveMeasurementSettings(undefined, grid).mode).toBe('abstract');
    expect(resolveMeasurementSettings(undefined, null)).toMatchObject({ unitType: 'feet', unitDistance: 5 });
  });

  // #84: a map drawn at another scale than the rest of its collection.
  it("takes a scene's own distance per cell over the collection's, in the collection's unit, and keeps the rules square", () => {
    const collection = { unitType: 'feet', unitDistance: 5, measurementMode: 'metric' } as const;
    expect(resolveMeasurementSettings(collection, { ...grid, unitDistanceOverride: 10 })).toMatchObject({ unitType: 'feet', unitDistance: 10, ruleDistance: 5 });
    const loose = { ...grid, measurementType: 'units', unitDistance: 5, unitDistanceOverride: 2.5 } as const;
    expect(resolveMeasurementSettings(undefined, loose)).toMatchObject({ unitDistance: 2.5, ruleDistance: 5 });
  });

  it('leaves the override out where distances are range bands, and keeps it stored for measuring again', () => {
    const bands = { unitType: 'feet', unitDistance: 5, measurementMode: 'abstract' } as const;
    const scene = { ...grid, unitDistanceOverride: 50 };
    expect(resolveMeasurementSettings(bands, scene)).toMatchObject({ unitDistance: 5, ruleDistance: 5 });
    expect(resolveMeasurementSettings(undefined, { ...scene, unitDistance: 5 }).unitDistance).toBe(5);
    expect(resolveMeasurementSettings({ ...bands, measurementMode: 'metric' }, scene).unitDistance).toBe(50);
  });

  it("ignores the copy of the collection's distance a new scene is written with, and overrides that are no positive number", () => {
    const collection = { unitType: 'meters', unitDistance: 1.5, measurementMode: 'metric' } as const;
    expect(resolveMeasurementSettings(collection, { ...grid, unitDistance: 5 }).unitDistance).toBe(1.5);
    for (const unitDistanceOverride of [0, -5, Number.NaN, '10' as unknown as number]) {
      expect(resolveMeasurementSettings(collection, { ...grid, unitDistanceOverride }).unitDistance).toBe(1.5);
    }
  });
});

describe('range band validation', () => {
  it('accepts whole thresholds of at least one square', () => {
    expect(isValidRangeBandThreshold(1)).toBe(true);
    expect(isValidRangeBandThreshold(12)).toBe(true);
  });

  it('rejects empty, zero, negative and fractional thresholds', () => {
    for (const value of [NaN, 0, -3, 1.5, Infinity]) {
      expect(isValidRangeBandThreshold(value)).toBe(false);
    }
  });

  it('requires every band to be valid', () => {
    expect(areRangeBandsValid(undefined)).toBe(true);
    expect(areRangeBandsValid([{ name: 'Close', maxSquares: 3 }])).toBe(true);
    expect(areRangeBandsValid([{ name: 'Close', maxSquares: 3 }, { name: 'Far', maxSquares: NaN }])).toBe(false);
  });
});

describe('unitLabelFor', () => {
  it('labels feet, yards and metres, nothing for generic units, and feet for maps without a unit', () => {
    expect(['feet', 'yards', 'meters', 'units', 'custom', undefined].map((unit) => unitLabelFor(unit as never)))
      .toEqual(['ft', 'yd', 'm', '', '', 'ft']);
  });
});

describe('formatReach', () => {
  const metric = (unitDistance: number, unitType: 'feet' | 'meters'): MeasurementSettings => ({ mode: 'metric', unitType, unitDistance, ruleDistance: unitDistance, diagonalRule: 'equidistant', rangeBands: [], coneAngle: 90 });

  it('words a set distance with one decimal where it has one', () => {
    expect(formatReach(12, metric(5, 'feet'))).toBe('60ft');
    expect(formatReach(5, metric(1.5, 'meters'))).toBe('7.5m');
    expect(formatReach(3, metric(1.5, 'meters'))).toBe('4.5m');
    expect(formatReach(12.04, metric(5, 'feet'))).toBe('60.2ft');
  });

  it('names the range band, or counts squares where the collection has none', () => {
    const bands = { mode: 'abstract', unitType: 'feet', unitDistance: 5, ruleDistance: 5, diagonalRule: 'equidistant', rangeBands: [{ name: 'Close', maxSquares: 2 }, { name: 'Far', maxSquares: 10 }], coneAngle: 90 } as MeasurementSettings;
    expect(formatReach(6, bands)).toBe('Far');
    expect(formatReach(1.5, { ...bands, rangeBands: [] })).toBe('1.5 sq');
  });
});
