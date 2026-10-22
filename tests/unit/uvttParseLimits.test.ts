import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseUvtt } from '../../src/app/import/uvtt/parseUvtt';
import { readPoint } from '../../src/app/import/uvtt/uvttFields';
import { cryptWith } from '../fixtures/uvttFiles';

vi.mock('../../src/app/import/uvtt/uvttFields', async (importOriginal) => {
  const fields = await importOriginal<typeof import('../../src/app/import/uvtt/uvttFields')>();
  return { ...fields, readPoint: vi.fn(fields.readPoint) };
});

const line = (points: number): Array<{ x: number; y: number }> => Array.from({ length: points }, (_, index) => ({ x: index % 10, y: index % 8 }));
const problemOf = (file: unknown): string => {
  const result = parseUvtt(JSON.stringify(file));
  if (result.ok) throw new Error('The file was accepted');
  return result.problem;
};
/** Positions read, the map's origin aside. */
const pointsRead = (): number => vi.mocked(readPoint).mock.calls.length - 1;

beforeEach(() => { vi.mocked(readPoint).mockClear(); });

describe('a Universal VTT file with more walls than a scene takes', () => {
  it('is refused at the line that goes over, without reading the points after it', () => {
    const file = cryptWith((crypt) => {
      crypt.line_of_sight = Array.from({ length: 300 }, () => line(5_001));
      crypt.objects_line_of_sight = [line(5_001)];
    });

    expect(problemOf(file)).toBe('The file has more than 20,000 wall segments.');
    // Four lines of 5,000 segments fill the scene; the fifth is not read
    expect(pointsRead()).toBe(4 * 5_001);
  });

  it('is refused by one line that is too long before any of its points is read', () => {
    const file = cryptWith((crypt) => { crypt.line_of_sight = [line(20_002)]; crypt.objects_line_of_sight = []; });

    expect(problemOf(file)).toBe('The file has more than 20,000 wall segments.');
    expect(pointsRead()).toBe(0);
  });

  it('is refused for its object outlines and doors as for its wall lines, before they are read', () => {
    const outlines = cryptWith((crypt) => { crypt.line_of_sight = [line(15_001)]; crypt.objects_line_of_sight = [line(4_000), line(2_000)]; });
    expect(problemOf(outlines)).toBe('The file has more than 20,000 wall segments.');
    expect(pointsRead()).toBe(15_001 + 4_000);

    vi.mocked(readPoint).mockClear();
    const door = { bounds: [{ x: 1, y: 1 }, { x: 2, y: 1 }] };
    const doors = cryptWith((crypt) => { crypt.line_of_sight = [line(19_991)]; crypt.objects_line_of_sight = []; crypt.portals = Array.from({ length: 11 }, () => door); });
    expect(problemOf(doors)).toBe('The file has more than 20,000 wall segments.');
    expect(pointsRead()).toBe(19_991);
  });

  it('reads every point of a file that stays within the limit', () => {
    const file = cryptWith((crypt) => { crypt.line_of_sight = [line(12_001), line(8_000)]; crypt.objects_line_of_sight = []; crypt.portals = []; crypt.lights = []; });

    expect(parseUvtt(JSON.stringify(file)).ok).toBe(true);
    expect(pointsRead()).toBe(20_001);
  });
});
