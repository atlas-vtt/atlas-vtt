import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { DRAWN_PROP_KINDS, FIRST_PROP_KINDS } from '../../../src/app/dungeons/drawnKinds';
import type { DungeonProp, PropKind } from '../../../src/app/dungeons/model';
import { drawGlyph } from '../../../src/app/dungeons/render/art/glyph';
import { pathBounds } from '../../../src/app/dungeons/render/art/paths';
import { block, roundedRect } from '../../../src/app/dungeons/render/glyphPen';
import { glyphFit, propTall, type FamilyGlyphs, type PropGlyph } from '../../../src/app/dungeons/render/propShapes';
import { STATUE_PLINTH, WELL_RADIUS } from '../../../src/app/dungeons/render/propStone';
import { PROP_GLYPHS } from '../../../src/app/dungeons/render/props/registry';
import { renderMapSvg } from '../../../src/app/dungeons/render/renderMap';
import { SvgCanvas } from '../../../src/app/dungeons/render/svgCanvas';
import { DEFAULT_VIEW } from '../../../src/app/dungeons/style';
import { dungeonStyle, type DungeonStyleId } from '../../../src/app/dungeons/styleCatalog';
import { specimen } from '../../gpu/dungeonArtSpecimen';
import { recordingHand } from './glyphTestHand';

const FAMILY_KINDS = import.meta.glob<{ KINDS: readonly PropKind[] }>('../../../src/app/dungeons/render/props/*/kinds.ts', { eager: true });
const FAMILY_GLYPHS = import.meta.glob<{ GLYPHS: FamilyGlyphs }>('../../../src/app/dungeons/render/props/*/index.ts', { eager: true });

/**
 * The specimen's SVG in each look: `VITE_GLYPH_RECORD=print` prints them anew. Recorded again when
 * the furniture left the generator and its specimen, and the statue, fountain, well and dais took
 * their reworked drawings (structure only, 2026-10-24), and when the clearing before a mouth took the
 * depth each painter's ink reaches (only its clip rectangle changed).
 */
const RECORDED: Record<string, string> = {
  night: '3fe1b6f30190c36c1ba672c15a29a677d930fa5423085f52b977758c10f8a994',
  parchment: 'ae0345db06639b791da99fd0be44c7c5e1eaab4e6876f055be3f75dd0f2f419a',
  print: '1ae04adc60dc3c1522d49516f59f6bdf76dfb963cb3abf86cf0dc97e3368a09b',
};

const LOOKS: readonly DungeonStyleId[] = ['parchment', 'print', 'night'];

function svgHash(look: DungeonStyleId): string {
  const { svg } = renderMapSvg(specimen(), dungeonStyle(look), DEFAULT_VIEW, { pxPerCell: 30 });
  return createHash('sha256').update(svg).digest('hex');
}

describe('the glyph registry', () => {
  it('gives every registered kind both painters', () => {
    for (const [kind, glyph] of Object.entries(PROP_GLYPHS)) {
      expect(typeof glyph.stone, kind).toBe('function');
      expect(typeof glyph.engraved, kind).toBe('function');
      expect(glyph.radius, kind).toBeGreaterThan(0);
      expect(glyph.material, kind).toBeTruthy();
    }
  });

  it('holds four families, each registering exactly the kinds it lists', () => {
    expect(Object.keys(FAMILY_KINDS)).toHaveLength(4);
    for (const [path, { KINDS }] of Object.entries(FAMILY_KINDS)) {
      const glyphs = FAMILY_GLYPHS[path.replace(/kinds\.ts$/, 'index.ts')]!.GLYPHS;
      expect(Object.keys(glyphs).sort(), path).toEqual([...KINDS].sort());
    }
  });

  it('derives DRAWN_PROP_KINDS from the families', () => {
    const families = Object.values(FAMILY_KINDS).flatMap(module => module.KINDS);
    expect([...DRAWN_PROP_KINDS].sort()).toEqual([...FIRST_PROP_KINDS, ...families].sort());
    expect(Object.keys(PROP_GLYPHS).sort()).toEqual([...DRAWN_PROP_KINDS].sort());
  });

  it("keeps the statue's and the well's lighting outlines", () => {
    expect(propTall('statue')).toEqual({ halfW: STATUE_PLINTH / 2, halfH: STATUE_PLINTH / 2, round: false });
    expect(propTall('well')).toEqual({ halfW: WELL_RADIUS, halfH: WELL_RADIUS, round: true });
    expect(propTall('dais')).toBeUndefined();
  });

  it('draws a stretched piece to its fit, not its scale', () => {
    const glyph: PropGlyph = {
      material: 'wood',
      radius: 0.5,
      lift: 0.5,
      silhouette: (path, fit) => roundedRect(path, 0, 0, fit.along, fit.out * 0.8),
      stone: (pen, fit) => block(pen, 0, 0, fit.along, fit.out * 0.8),
      engraved: (pen, fit) => block(pen, 0, 0, fit.along, fit.out * 0.8),
    };
    const drawn = (along: number): { length: number; widths: string[] } => {
      const ctx = new SvgCanvas(400, 400);
      const { hand, calls } = recordingHand(ctx as unknown as CanvasRenderingContext2D, () => 0);
      const prop: DungeonProp = { kind: 'hearth', x: 5, y: 5, rotation: 0, scale: 1, room: 0, size: { along, out: 1 } };
      drawGlyph(hand, { ...prop, fit: glyphFit(prop) }, glyph, '#88aacc', '#aa3333');
      const box = pathBounds(calls.find(c => c.kind === 'grain')!.path!)!;
      return { length: box.maxX - box.minX, widths: [...ctx.toSvg().matchAll(/stroke-width="([^"]+)"/g)].map(m => m[1]!) };
    };
    const short = drawn(3);
    const long = drawn(6);
    expect(short.length).toBeCloseTo(3, 6);
    expect(long.length).toBeCloseTo(6, 6);
    expect(long.widths).toEqual(short.widths);
    expect(glyphFit({ kind: 'hearth', scale: 1 })).toEqual({ along: 2, out: 1 });
    expect(glyphFit({ kind: 'bust', scale: 1 })).toEqual({ along: 0.4, out: 0.4 });
  });

  it('draws the first props that stay as before', () => {
    const hashes = Object.fromEntries(LOOKS.map(look => [look, svgHash(look)]));
    if (process.env.VITE_GLYPH_RECORD === 'print') console.log(JSON.stringify(hashes, null, 2));
    expect(hashes).toEqual(RECORDED);
  });
});
