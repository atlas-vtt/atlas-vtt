import { describe, expect, it } from 'vitest';
import { dungeonStyle } from '../../../src/app/dungeons/styleCatalog';
import { sheetRoom } from '../../gpu/glyphSheetModel';
import { mixDistance, monochromeCorners } from '../../gpu/monochromeMix';

/** The glyph sheets' own measures (`tests/gpu/glyphSheet*.ts`), held where they are pure. */
describe('the monochrome check', () => {
  it('finds a hue off every look\'s mix, the flat ones too', () => {
    for (const look of ['parchment', 'night', 'vellum', 'print', 'contrast', 'blueprint']) {
      const corners = monochromeCorners(dungeonStyle(look));
      expect(mixDistance([220, 30, 30], corners), look).toBeGreaterThan(6);
      expect(mixDistance(corners[0], corners), look).toBeLessThan(1e-6);
      expect(mixDistance([128, 128, 128], corners), look).toBeLessThan(1e-6);
    }
  });
});

describe('the sheet room', () => {
  it('hangs a crowded wall piece on the wall, however deep its group', () => {
    const room = sheetRoom([], [
      { kind: 'boulder', rotation: 0, at: { x: 0, y: 0 } },
      { kind: 'boulder', rotation: 0, at: { x: 0, y: 1 } },
      { kind: 'flowstone', rotation: 0, at: { x: 2, y: 0 } },
      { kind: 'bust', rotation: 0, against: 'wall', at: { x: 3.5, y: 0 } },
    ], true);
    const at = (kind: string) => room.placed.find(p => p.prop.kind === kind)!.prop;
    // The boulders' cells end on the bottom wall; the flowstone hangs 0.1 off it; the bust stands before it.
    expect(at('boulder').y).toBeCloseTo(room.h - 1.5, 9);
    expect(at('flowstone').y).toBeCloseTo(room.h - 0.1, 9);
    expect(at('bust').y).toBeCloseTo(room.h - 0.5, 9);
  });
});
