import { describe, expect, it } from 'vitest';
import { annotationList } from '../../../../src/app/annotations/annotationList';
import type { Annotation } from '../../../../src/app/annotations/annotationTypes';
import { curvedPath, ellipsePoints, rectanglePoints } from '../../../../src/app/annotations/shapeOutlines';
import type { FogCoverage } from '../../../../src/app/fog/fogCoverage';
import { sharedAnnotations } from '../../../../src/app/online/gm/mapLayerInputs.ts';
import { ToldAnnotations } from '../../../../src/app/online/marks/index.ts';
import { MAX_DRAWING_POINTS, MAX_DRAWINGS, MAX_TEXT_LENGTH, MAX_TEXTS, parseAnnotations, type SharedAnnotations } from '../../../../src/app/online/protocol/index.ts';
import type { DrawingStroke, TextElement } from '../../../../src/app/types';
import { formerParseAnnotations } from '../../../oracles/annotationsBaseline/parseAnnotations.ts';
import { seeded } from './seeded.ts';

const NO_FOG: FogCoverage = { shape: [], covers: () => false };
const P = (x: number, y: number): { x: number; y: number } => ({ x, y });

const drawing = (id: string, more: Partial<DrawingStroke>): DrawingStroke => ({ id, kind: 'drawing', timestamp: 1, type: 'pen', points: [P(0, 0), P(40, 10)], color: '#e93147', width: 4, opacity: 1, ...more });
const text = (id: string, more: Partial<TextElement>): TextElement => ({ id, kind: 'text', x: 100, y: 100, text: 'Tavern', fontSize: 24, fontFamily: 'Atlas Oxanium', color: '#ffffff', ...more });

/** What a drawing or a text is drawn by: every field its picture comes from, and none that only its maker's tools read. */
function picture(annotation: Annotation): Record<string, unknown> {
  if (annotation.kind === 'text') {
    const { x, y, text: words, fontSize, scale, fontFamily, color, look, backgroundColor, padding, borderRadius, opacity, width, breaks, align, bold, italic, rotation, layer } = annotation;
    return { x, y, words, fontSize, scale, fontFamily, color, look, backgroundColor, padding, borderRadius, opacity, width, breaks, align, bold, italic, rotation, layer };
  }
  const { shape, points, closed, width, color, opacity, fill, holes, dash, ends, anchors, icon, rotation, layer } = annotation;
  // A free shape is drawn as a line with corners is; a curve by its points alone, whatever points it was clicked with.
  return { shape: shape === 'free' ? 'line' : shape, points, closed, width, color, opacity, fill, holes, dash, ends, curved: anchors !== null, icon, rotation: ((rotation % 360) + 360) % 360, layer };
}

/** The annotations a reader of `told` draws, in its order. */
function reread(told: SharedAnnotations, asMade = true): readonly Annotation[] {
  const parsed = parseAnnotations(JSON.parse(JSON.stringify(told)) as Record<string, unknown>);
  if (parsed === null) throw new Error('the message is refused');
  return annotationList(new ToldAnnotations().read(parsed, asMade));
}

const pictures = (list: readonly Annotation[], layer: Annotation['layer']): Record<string, unknown>[] => list.filter((annotation) => annotation.layer === layer).map(picture);

describe('what players are told of drawings and texts', () => {
  const outline = rectanglePoints(P(10, 10), P(90, 70));
  const curve = [P(0, 0), P(60, 40), P(120, 0)];
  const drawings: Record<string, DrawingStroke> = {
    pen: drawing('pen', {}),
    dot: drawing('dot', { points: [P(5, 5)], opacity: 0.5 }),
    room: drawing('room', { type: 'rectangle', points: outline, fill: 'soft', dash: 'dashed', order: 3 }),
    pond: drawing('pond', { type: 'circle', points: ellipsePoints(P(200, 200), P(320, 260)), fill: 'solid', width: 0, order: 2 }),
    path: drawing('path', { type: 'line', points: curvedPath(curve, false), anchors: curve, ends: 'both', dash: 'dotted', opacity: 0.5, order: 7 }),
    cut: drawing('cut', { type: 'rectangle', points: [P(0, 0), P(50, 0), P(50, 30)], order: 5 }),
    floor: drawing('floor', { type: 'line', points: [...outline], width: 0, fill: 'solid', cells: true, opacity: 0.4, holes: [[P(20, 20), P(40, 20), P(40, 40), P(20, 40)]], layer: 'map', order: 1 }),
    stamp: drawing('stamp', { type: 'icon', icon: 'cauldron', points: [P(300, 80)], width: 70, rotation: 405, order: 6 }),
    secret: drawing('secret', { hidden: true, color: '#123456', order: 9 }),
  };
  const texts: Record<string, TextElement> = {
    plate: text('plate', { backgroundColor: '#000000', padding: 8, borderRadius: 4, opacity: 0.7, order: 4 }),
    wrapped: text('wrapped', { text: 'The road to the long barrow', width: 120, breaks: [9, 16], outline: true, align: 'left', bold: true, rotation: 30, scale: 1.5, order: 8 }),
    name: text('name', { text: 'Old Mill', layer: 'map', outline: true, order: 1 }),
    secret: text('secret', { text: 'Ambush', hidden: true }),
  };
  const told = sharedAnnotations(drawings, texts, NO_FOG);

  it('says each drawing as its line and, beside it, what it is drawn by', () => {
    expect(told.drawings).toEqual([
      { type: 'pen', points: [0, 0, 40, 10], colour: '#e93147', width: 4, opacity: 1 },
      { type: 'pen', points: [5, 5], colour: '#e93147', width: 4, opacity: 0.5 },
      { type: 'pen', points: expect.any(Array) as number[], colour: '#e93147', width: 0, opacity: 1, shape: 'ellipse', fill: 'solid', order: 2 },
      { type: 'pen', points: outline.flatMap(({ x, y }) => [x, y]), colour: '#e93147', width: 4, opacity: 1, shape: 'rectangle', fill: 'soft', dash: 'dashed', order: 3 },
      // A rectangle whose points are none any more is a line with corners.
      { type: 'pen', points: [0, 0, 50, 0, 50, 30], colour: '#e93147', width: 4, opacity: 1, shape: 'line', order: 5 },
      { type: 'icon', points: [300, 80], colour: '#e93147', width: 70, opacity: 1, icon: 'cauldron', turn: 45, order: 6 },
      { type: 'pen', points: expect.any(Array) as number[], colour: '#e93147', width: 4, opacity: 0.5, shape: 'line', curved: true, dash: 'dotted', ends: 'both', order: 7 },
    ]);
    expect(told.texts).toEqual([
      expect.objectContaining({ text: 'Tavern', background: '#000000', radius: 4, opacity: 0.7, order: 4 }),
      expect.objectContaining({ text: 'The road to the long barrow', outline: true, wrap: 120, breaks: [9, 16], align: 'left', bold: true, rotation: 30, scale: 1.5, order: 8 }),
    ]);
    expect(told.texts[0]).not.toHaveProperty('outline');
    expect(told.texts[0]).not.toHaveProperty('wrap');
  });

  it('tells those on the map apart from those above the tokens', () => {
    expect(told.onMap?.drawings).toEqual([expect.objectContaining({ width: 0, opacity: 0.4, shape: 'line', fill: 'solid', holes: [[20, 20, 40, 20, 40, 40, 20, 40]], order: 1 })]);
    expect(told.onMap?.texts).toEqual([expect.objectContaining({ text: 'Old Mill', outline: true })]);
    expect(sharedAnnotations({ pen: drawings.pen! }, {}, NO_FOG)).not.toHaveProperty('onMap');
  });

  it('tells nothing of what the GM keeps to themselves, and of the rest nothing its picture does not come from', () => {
    const sent = JSON.stringify(told);
    expect(sent).not.toContain('#123456');
    expect(sent).not.toContain('Ambush');
    for (const word of ['hidden', 'layer', 'locked', 'group', 'cells', 'anchors', 'timestamp', '"id"', '"by"', 'secret', 'wrapped', 'pond']) expect(sent, word).not.toContain(word);
    const marked = sharedAnnotations({ a: drawing('a', { locked: true, group: 'g-1', by: 'p'.repeat(20) }) }, { t: text('t', { locked: true, group: 'g-1', by: 'p'.repeat(20) }) }, NO_FOG);
    expect(JSON.stringify(marked)).not.toMatch(/locked|g-1|pppp/);
  });

  it('is drawn by its reader as the GM draws it, each layer in the GM\'s one order', () => {
    const own = annotationList({ drawings, texts }).filter((annotation) => !annotation.hidden);
    const theirs = reread(told);
    for (const layer of ['above', 'map'] as const) expect(pictures(theirs, layer), layer).toEqual(pictures(own, layer));
    // Texts and drawings lie in one order: the wrapped text over every drawing, the plate between two of them.
    expect(theirs.filter(({ layer }) => layer === 'above').map((annotation) => (annotation.kind === 'text' ? annotation.text : annotation.shape))).toEqual(
      ['pen', 'pen', 'ellipse', 'rectangle', 'Tavern', 'line', 'stamp', 'line', 'The road to the long barrow'],
    );
  });

  it('is read by a reader of before as the lines, stamps and texts above the tokens, and nothing on the map', () => {
    const former = formerParseAnnotations(JSON.parse(JSON.stringify(told)) as Record<string, unknown>);
    expect(former?.drawings.map(({ type, points }) => ({ type, points }))).toEqual(told.drawings.map(({ type, points }) => ({ type, points })));
    expect(former?.texts.map((entry) => entry.text)).toEqual(['Tavern', 'The road to the long barrow']);
    expect(JSON.stringify(former)).not.toContain('Old Mill');
  });

  it('keeps a message within what it may carry, above the tokens and on the map together', () => {
    const many: Record<string, DrawingStroke> = {};
    for (let index = 0; index < MAX_DRAWINGS + 10; index += 1) many[`d${index}`] = drawing(`d${index}`, index % 2 === 0 ? {} : { layer: 'map' });
    const manyTexts: Record<string, TextElement> = {};
    for (let index = 0; index < MAX_TEXTS + 10; index += 1) manyTexts[`t${index}`] = text(`t${index}`, index % 2 === 0 ? {} : { layer: 'map' });
    const full = sharedAnnotations(many, manyTexts, NO_FOG);
    expect(full.drawings.length + (full.onMap?.drawings.length ?? 0)).toBe(MAX_DRAWINGS);
    expect(full.texts.length + (full.onMap?.texts.length ?? 0)).toBe(MAX_TEXTS);
    expect(formerParseAnnotations(JSON.parse(JSON.stringify(full)) as Record<string, unknown>)).not.toBeNull();

    // Points are counted with the holes; a drawing they have no room for is left out, a smaller one after it is told.
    const ring = Array.from({ length: 19_990 }, (_, index) => P(index % 100, Math.floor(index / 100)));
    const heavy: Record<string, DrawingStroke> = {};
    for (let index = 0; index < 11; index += 1) heavy[`h${index}`] = drawing(`h${index}`, { points: ring });
    heavy.last = drawing('last', { color: '#00ff00' });
    const capped = sharedAnnotations(heavy, {}, NO_FOG);
    expect(capped.drawings.reduce((sum, entry) => sum + entry.points.length / 2, 0)).toBeLessThanOrEqual(MAX_DRAWING_POINTS);
    expect(capped.drawings).toHaveLength(11);
    expect(capped.drawings.at(-1)?.colour).toBe('#00ff00');
  });

  it('cuts a text to the longest a message carries, with the breaks that still lie in it', () => {
    const long = text('long', { text: 'word '.repeat(600), width: 300, breaks: [100, 1000, 2000, 2500] });
    const [sent] = sharedAnnotations({}, { long }, NO_FOG).texts;
    expect(sent?.text).toHaveLength(MAX_TEXT_LENGTH);
    expect(sent?.breaks).toEqual([100, 1000, 2000]);
    expect(parseAnnotations(JSON.parse(JSON.stringify({ drawings: [], texts: [sent] })) as Record<string, unknown>)?.texts[0]?.breaks).toEqual([100, 1000, 2000]);
  });

  it('gives a drawing or text that says the same again the record it had, and another one otherwise', () => {
    const reader = new ToldAnnotations();
    const first = reader.read(told, true);
    const again = reader.read(JSON.parse(JSON.stringify(told)) as SharedAnnotations, true);
    expect(Object.values(again.drawings)).toHaveLength(Object.values(first.drawings).length);
    for (const [id, record] of Object.entries(again.drawings)) expect(first.drawings[id]).toBe(record);
    for (const [id, record] of Object.entries(again.texts)) expect(first.texts[id]).toBe(record);
    const moved = { ...told, drawings: told.drawings.map((entry, index) => (index === 0 ? { ...entry, colour: '#00ff00' } : entry)) };
    const next = reader.read(moved, true);
    expect(Object.values(next.drawings).filter((record) => !Object.values(first.drawings).includes(record))).toHaveLength(1);
    // Two that say the same are two drawings still.
    const twice = new ToldAnnotations().read({ drawings: [told.drawings[0]!, told.drawings[0]!], texts: [] }, true);
    expect(Object.keys(twice.drawings)).toHaveLength(2);
  });

  it('draws a stroke told by a GM of before as that GM draws it: the line through its points', () => {
    const before = { drawings: [{ type: 'pen' as const, points: [0, 0, 10, 10, 20, 0], colour: '#ffffff', width: 4, opacity: 1 }], texts: [] };
    expect(reread(before, false).map((annotation) => annotation.kind === 'drawing' && annotation.shape)).toEqual(['line']);
    expect(reread(before, true).map((annotation) => annotation.kind === 'drawing' && annotation.shape)).toEqual(['pen']);
  });

  it('holds for generated drawings and texts: the reader draws what the GM draws', () => {
    for (let trial = 1; trial <= 40; trial += 1) {
      const random = seeded(trial);
      const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)]!;
      const at = (): { x: number; y: number } => P(random() * 2000 - 200, random() * 2000 - 200);
      const some: Record<string, DrawingStroke> = {};
      const words: Record<string, TextElement> = {};
      for (let index = 0; index < 30; index += 1) {
        const kind = pick(['pen', 'line', 'closed', 'rectangle', 'circle', 'curve', 'icon'] as const);
        const a = at();
        const b = P(a.x + 20 + random() * 200, a.y + 20 + random() * 200);
        const corners = [a, at(), at(), at()];
        const look: Partial<DrawingStroke> = {
          color: pick(['#e93147', '#086ddd', '#ffffff']), width: pick([0, 3, 12]), opacity: pick([1, 0.5]),
          ...(random() < 0.4 && { fill: pick(['soft', 'solid'] as const) }), ...(random() < 0.3 && { dash: pick(['dashed', 'dotted'] as const) }),
          ...(random() < 0.3 && { ends: pick(['end', 'both'] as const) }), ...(random() < 0.3 && { layer: 'map' as const }),
          ...(random() < 0.2 && { hidden: true as const }), ...(random() < 0.6 && { order: Math.floor(random() * 6) }),
          ...(random() < 0.2 && { holes: [[P(a.x + 5, a.y + 5), P(a.x + 15, a.y + 5), P(a.x + 10, a.y + 15)]] }),
        };
        const shapes: Record<typeof kind, Partial<DrawingStroke>> = {
          pen: { type: 'pen', points: corners },
          line: { type: 'line', points: corners },
          closed: { type: 'line', points: [...corners, a] },
          rectangle: { type: 'rectangle', points: rectanglePoints(a, b) },
          circle: { type: 'circle', points: ellipsePoints(a, b) },
          curve: { type: 'line', points: curvedPath(corners, random() < 0.5), anchors: corners },
          icon: { type: 'icon', icon: pick(['skull', 'cauldron']), points: [a], width: 70, rotation: Math.floor(random() * 720) - 360 },
        };
        some[`d${index}`] = drawing(`d${index}`, { ...look, ...shapes[kind] });
      }
      for (let index = 0; index < 12; index += 1) {
        const place = at();
        const wraps = random() < 0.5;
        words[`t${index}`] = text(`t${index}`, {
          x: place.x, y: place.y, text: `Hall ${index} of the keep`, fontFamily: pick(['Atlas Fantaisie Artistique', 'Atlas Oxanium', 'Atlas Courier Prime', 'serif']),
          ...(random() < 0.4 && { backgroundColor: '#000000', padding: 8, borderRadius: 4, opacity: 0.7 }), ...(random() < 0.5 && { outline: true as const }),
          ...(wraps && { width: 60 + random() * 100 }), ...(wraps && random() < 0.7 && { breaks: [5, 11] }), align: pick(['left', 'center', 'right'] as const),
          bold: random() < 0.3, italic: random() < 0.3, rotation: Math.floor(random() * 360), scale: pick([1, 1.5]),
          ...(random() < 0.3 && { layer: 'map' as const }), ...(random() < 0.2 && { hidden: true as const }), ...(random() < 0.6 && { order: Math.floor(random() * 6) }),
        });
      }
      const sent = sharedAnnotations(some, words, NO_FOG);
      const own = annotationList({ drawings: some, texts: words }).filter((annotation) => !annotation.hidden);
      const theirs = reread(sent);
      for (const layer of ['above', 'map'] as const) expect(pictures(theirs, layer), `trial ${trial}, ${layer}`).toEqual(pictures(own, layer));
      expect(formerParseAnnotations(JSON.parse(JSON.stringify(sent)) as Record<string, unknown>), `trial ${trial}`).not.toBeNull();
    }
  });
});
