import { describe, expect, it } from 'vitest';
import { migrateMapFile } from '../../src/app/services/MapPersistence';

function legacyGrid(grid: Record<string, unknown>): unknown {
  return { grid: { enabled: true, size: 70, offsetX: 0, offsetY: 0, opacity: 0.7, ...grid } };
}

describe('migrateMapFile grid numbering', () => {
  it('reads an older hexNumbers field as cellNumbers', () => {
    const migrated = migrateMapFile(legacyGrid({ hexNumbers: 'column-row' }));
    expect(migrated.grid?.cellNumbers).toBe('column-row');
  });

  it('reads an older hexNumberOpacity field as cellNumberOpacity', () => {
    const migrated = migrateMapFile(legacyGrid({ hexNumbers: 'column-row', hexNumberOpacity: 0.5 }));
    expect(migrated.grid?.cellNumberOpacity).toBe(0.5);
  });
});

describe('migrateMapFile grid origin', () => {
  it('moves an origin farther than 100,000 px from the map next to zero by whole cells, so the grid draws the same', () => {
    const square = migrateMapFile(legacyGrid({ size: 50, offsetX: 1e87 + 0, offsetY: -250_020 })).grid!;
    expect(Math.abs(square.offsetX)).toBeLessThan(50);
    expect(square.offsetY).toBeCloseTo(30);
    const hex = migrateMapFile(legacyGrid({ type: 'hex-vertical', size: 40, offsetX: 5.53816e87, offsetY: 5.53816e87 })).grid!;
    expect(Math.abs(hex.offsetX)).toBeLessThanOrEqual(40);
    expect(Math.abs(hex.offsetY)).toBeLessThanOrEqual(Math.sqrt(3) * 40);
  });

  it('leaves an origin within 100,000 px as it was', () => {
    expect(migrateMapFile(legacyGrid({ offsetX: 99_999, offsetY: -12.5 })).grid).toMatchObject({ offsetX: 99_999, offsetY: -12.5 });
  });
});
