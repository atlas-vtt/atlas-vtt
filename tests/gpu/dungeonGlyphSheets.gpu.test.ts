import { describe, expect, it } from 'vitest';
import { commands } from 'vitest/browser';
import { DRAWN_PROP_KINDS, FIRST_PROP_KINDS } from '../../src/app/dungeons/drawnKinds';
import { renderMapSvg } from '../../src/app/dungeons/render/renderMap';
import { DEFAULT_VIEW, type DungeonView } from '../../src/app/dungeons/style';
import { DUNGEON_STYLES, dungeonStyle, type DungeonStyleId } from '../../src/app/dungeons/styleCatalog';
import { drawToken, drawWhole } from './dungeonArtSheets';
import { RENDER_OUT, savePng } from './dungeonRenderHarness';
import { drawRoom, drawWindow, farthestInk, FOOTPRINT_SLACK, inkMask, offMonochrome, OUTLINE_CONTRAST, outlineContrast, pathCount, type Drawn } from './glyphSheetChecks';
import { aloneRoom, sheetRoom, turnsRoom, type SheetRoom } from './glyphSheetModel';
import type { GlyphSpecimen, SpecimenPiece } from './glyphSheets/types';

/**
 * Every family's pieces on sheets of every look (`glyphSheets/<family>.ts`, style guide §10):
 * at play zoom (150 px a cell) with a token on a piece, at 100 px, at 300 px with every piece at
 * four turns, at 24 px (the thumbnail), in monochrome and as SVG, into
 * `out/dungeon-render/glyph-sheets/<family>/`. `VITE_GLYPH_FAMILY=<family>` draws one family.
 * Each piece is also drawn alone, to hold its ink to its footprint, its outline apart from its
 * floor and its paths in the SVG.
 */

const SPECIMENS = Object.entries(import.meta.glob<{ SPECIMEN: GlyphSpecimen }>('./glyphSheets/*.ts', { eager: true }))
  .filter(([path]) => !path.endsWith('/types.ts'))
  .map(([, module]) => module.SPECIMEN)
  .filter(specimen => !import.meta.env.VITE_GLYPH_FAMILY || specimen.family === import.meta.env.VITE_GLYPH_FAMILY);

const LOOKS: readonly DungeonStyleId[] = DUNGEON_STYLES.map(entry => entry.id);
/** The first props, drawn before the families: the bar the families are held to, measured but not held to the families' rules. */
const FIRST_PROPS = new Set<string>(FIRST_PROP_KINDS);
const SHEET: DungeonView = { ...DEFAULT_VIEW };
/** A piece drawn alone shows its own ink only: no shadow, occlusion or grid. */
const ALONE: DungeonView = { ...DEFAULT_VIEW, shadow: false, grid: 'off' };
const CLOSE_PX = 300;
/** Pixels at the edge of a piece's ink taken as its outline: about an outline's width at 150 px a cell, and its antialiasing. */
const OUTLINE_RING = 3;
/** The most pixels one close sheet holds; a taller one is written in bands. */
const CLOSE_PIXELS = 15_000_000;

function out(specimen: GlyphSpecimen, name: string): string {
  return `glyph-sheets/${specimen.family}/${name}`;
}

function keepText(drawn: Drawn, texts: string[]): Drawn {
  texts.push(...drawn.texts);
  return drawn;
}

/** The sheet at 150 px with a token over the first piece, and the same at 100 px, 24 px and in monochrome. */
async function writeSheets(specimen: GlyphSpecimen, room: SheetRoom, look: DungeonStyleId, texts: string[], failures: string[]): Promise<void> {
  const style = dungeonStyle(look);
  const sheet = keepText(drawRoom(room.model, style, SHEET, 150, room.w, room.h), texts);
  const first = room.placed.find(p => !FIRST_PROPS.has(p.piece.kind) || specimen.family === 'reference');
  if (first) drawToken(sheet.canvas.getContext('2d')!, (first.prop.x - sheet.origin.x) * 150, (first.prop.y - sheet.origin.y) * 150, 150 * 0.42, '#2e86c1');
  await savePng(sheet.canvas, out(specimen, look));
  await savePng(keepText(drawRoom(room.model, style, SHEET, 100, room.w, room.h), texts).canvas, out(specimen, `${look}-100`));
  await savePng(keepText(drawRoom(room.model, style, SHEET, 24, room.w, room.h), texts).canvas, out(specimen, `${look}-24`));
  const mono = keepText(drawRoom(room.model, style, { ...SHEET, monochrome: true }, 150, room.w, room.h), texts);
  await savePng(mono.canvas, out(specimen, `${look}-mono`));
  const off = offMonochrome(mono.canvas, style);
  if (off > 0) failures.push(`${look}: ${(off * 100).toFixed(3)} % of the monochrome sheet is no mix of ink, paper, white and black`);
  const { svg } = renderMapSvg(room.model, style, SHEET, { pxPerCell: 30 });
  if (/<text/.test(svg)) texts.push('<text> in the SVG');
  await commands.writeFile(`${RENDER_OUT}/${out(specimen, look)}.svg`, svg);
}

/** Every piece at four turns at 300 px, in bands that each fit what the browser can hand over. */
async function writeClose(specimen: GlyphSpecimen, look: DungeonStyleId, texts: string[]): Promise<void> {
  const room = turnsRoom(specimen.pieces);
  const rows = Math.max(1, Math.floor(CLOSE_PIXELS / ((room.w + 2) * CLOSE_PX * CLOSE_PX)));
  for (let top = 0, band = 1; top < room.h + 2; top += rows, band++) {
    const drawn = keepText(drawWindow(room.model, dungeonStyle(look), SHEET, CLOSE_PX, { x: -1, y: top - 1, cells: room.w + 2, rows: Math.min(rows, room.h + 2 - top) }), texts);
    await savePng(drawn.canvas, out(specimen, band === 1 ? `${look}-close` : `${look}-close-${band}`));
  }
}

/** How far a piece drawn alone reaches past its footprint, and how far its outline lies from its floor. */
function measure(piece: SpecimenPiece, look: DungeonStyleId, view: DungeonView, texts: string[]): { reach: number; contrast: number } {
  const style = dungeonStyle(look);
  const room = aloneRoom(piece);
  const alone = keepText(drawRoom(room.model, style, view, 150, room.w, room.h), texts);
  const ink = inkMask(alone, drawRoom(room.empty, style, view, 150, room.w, room.h));
  return { reach: farthestInk(alone, ink.mask, room.placed[0]!), contrast: outlineContrast(alone, ink, OUTLINE_RING) };
}

const referenceContrasts = new Map<string, number>();

/**
 * The outline contrast a piece must reach in a look: the plan's 40, or what the first props reach
 * there (their middle), where the look's own colours allow no more (the dark looks ink a piece in
 * a deep shade of its fill, close to a dark floor).
 */
function contrastLimit(look: DungeonStyleId, view: DungeonView): number {
  const key = `${look}:${view.monochrome}`;
  if (!referenceContrasts.has(key)) {
    const contrasts = FIRST_PROP_KINDS.map(kind => measure({ kind, rotation: 0 }, look, view, []).contrast).sort((a, b) => a - b);
    referenceContrasts.set(key, contrasts[Math.floor(contrasts.length / 2)]!);
  }
  return Math.min(OUTLINE_CONTRAST, referenceContrasts.get(key)!);
}

/** Each piece alone, in colour and monochrome: its ink within its footprint, its outline apart from its floor, its paths in the SVG; the numbers into `<look>-checks.txt`. */
async function checkPieces(specimen: GlyphSpecimen, look: DungeonStyleId, texts: string[], failures: string[]): Promise<void> {
  const style = dungeonStyle(look);
  const mono: DungeonView = { ...ALONE, monochrome: true };
  const limits = { colour: contrastLimit(look, ALONE), mono: contrastLimit(look, mono) };
  const report = [`outline limit ${limits.colour.toFixed(1)}, monochrome ${limits.mono.toFixed(1)}`, 'piece\tink past footprint (cells)\toutline from floor\tin monochrome\tSVG paths'];
  for (const piece of specimen.pieces) {
    const name = `${piece.kind} at ${Math.round((piece.rotation * 180) / Math.PI)}°${piece.size ? ` × ${piece.size.along}` : ''}`;
    const colour = measure(piece, look, ALONE, texts);
    const grey = measure(piece, look, mono, texts);
    const room = aloneRoom(piece);
    const paths = pathCount(renderMapSvg(room.model, style, ALONE, { pxPerCell: 30 }).svg) - pathCount(renderMapSvg(room.empty, style, ALONE, { pxPerCell: 30 }).svg);
    report.push(`${name}\t${colour.reach.toFixed(3)}\t${colour.contrast.toFixed(1)}\t${grey.contrast.toFixed(1)}\t${paths}`);
    if (paths <= 0) failures.push(`${look}: ${name}: no path in the SVG`);
    if (FIRST_PROPS.has(piece.kind)) continue;
    if (colour.reach > FOOTPRINT_SLACK) failures.push(`${look}: ${name}: ink ${colour.reach.toFixed(3)} cells past its footprint`);
    if (colour.contrast < limits.colour) failures.push(`${look}: ${name}: outline ${colour.contrast.toFixed(1)} from its floor, under ${limits.colour.toFixed(1)}`);
    if (grey.contrast < limits.mono) failures.push(`${look}: ${name}: outline in monochrome ${grey.contrast.toFixed(1)} from its floor, under ${limits.mono.toFixed(1)}`);
  }
  await commands.writeFile(`${RENDER_OUT}/${out(specimen, `${look}-checks`)}.txt`, `${report.join('\n')}\n`);
}

describe('glyph sheets', () => {
  it('has a specimen for every family it is asked for', () => {
    expect(SPECIMENS.length).toBeGreaterThan(0);
    for (const specimen of SPECIMENS) for (const piece of [...specimen.pieces, ...specimen.crowded]) expect(DRAWN_PROP_KINDS.has(piece.kind), piece.kind).toBe(true);
  });

  for (const specimen of SPECIMENS) {
    for (const look of LOOKS) {
      it(`draws the ${specimen.family} family in ${look}`, async () => {
        const texts: string[] = [];
        const failures: string[] = [];
        if (specimen.pieces.length || specimen.crowded.length) {
          const room = sheetRoom(specimen.pieces, specimen.crowded, specimen.family === 'reference');
          await writeSheets(specimen, room, look, texts, failures);
          await writeClose(specimen, look, texts);
          await checkPieces(specimen, look, texts, failures);
        }
        for (const scene of specimen.scenes ?? []) {
          const model = scene.model();
          const whole = drawWhole(model, look, SHEET, scene.floor);
          await savePng(whole, out(specimen, `${scene.name}-${look}`));
          if (scene.window) await savePng(keepText(drawWindow(model, dungeonStyle(look), SHEET, 150, scene.window, scene.floor), texts).canvas, out(specimen, `${scene.name}-${look}-window`));
        }
        expect(texts, 'draws no text').toEqual([]);
        expect(failures).toEqual([]);
      });
    }
  }
});
