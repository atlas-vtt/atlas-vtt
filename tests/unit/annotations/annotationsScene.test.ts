import { describe, expect, it } from 'vitest';
import { placedAnnotationCopies } from '../../../src/app/annotations/annotationCopies';
import { annotationList } from '../../../src/app/annotations/annotationList';
import type { DrawingInput } from '../../../src/app/annotations/annotationTypes';
import { collectMapObjects, translateMapObjects } from '../../../src/app/clipboard/mapObjectContent';
import { objectsMovedWithMap } from '../../../src/app/grid/mapStretchObjects';
import { objectsAfterLevelEdit } from '../../../src/app/levels/levelMembershipEdits';
import { migrateMapFile } from '../../../src/app/services/MapPersistence';
import type { DrawingStroke, TextElement } from '../../../src/app/types';
import { CURVE, LABEL, LEVELS, PEN, ROOM, setup, shifted, type Point } from './annotationFixtures';

describe('annotations with the rest of the scene', () => {
  const drawing = (id: string, data: DrawingInput, level?: string): DrawingStroke => ({ id, kind: 'drawing', timestamp: 1, ...data, ...(level && { level }) });

  it('go with their level when it is deleted, with every field they have', () => {
    const { store } = setup(LEVELS, 'upper');
    const objects = {
      ...store.getState().objects,
      drawings: { low: drawing('low', ROOM), high: drawing('high', { ...CURVE, hidden: true, order: 3 }, 'upper') },
      texts: { label: { id: 'label', kind: 'text' as const, ...LABEL, outline: true as const, order: 2, level: 'upper' } },
    };
    const withoutUpper = objectsAfterLevelEdit(objects, LEVELS, { rewrite: (id) => (id === 'upper' ? null : id), explicit: false });
    expect(Object.keys(withoutUpper.drawings)).toEqual(['low']);
    expect(withoutUpper.drawings.low).toBe(objects.drawings.low);
    expect(withoutUpper.texts).toEqual({});

    const merged = objectsAfterLevelEdit(objects, LEVELS, { rewrite: () => 'ground', explicit: true });
    expect(merged.drawings.high).toEqual({ ...objects.drawings.high, level: 'ground' });
    expect(merged.texts.label).toEqual({ ...objects.texts.label, level: 'ground' });
  });

  it('follow the map when it is drawn another way: points, anchors and holes, and no size', () => {
    const { store } = setup();
    const junk = { id: 'junk', kind: 'drawing', timestamp: 1, ...PEN, anchors: 'stale', holes: [[{ x: 1, y: 1 }], 'ring'] } as unknown as DrawingStroke;
    const objects = { ...store.getState().objects, drawings: { room: drawing('room', ROOM), curve: drawing('curve', CURVE, 'upper'), junk } };
    const move = (point: Point): Point => ({ x: point.x * 1.5 + 5, y: point.y * 2 });

    const all = objectsMovedWithMap(objects, move);
    expect(all.drawings.room).toEqual({ ...objects.drawings.room, points: ROOM.points.map(move), holes: [ROOM.holes![0]!.map(move)] });
    expect(all.drawings.curve).toEqual({ ...objects.drawings.curve, points: CURVE.points.map(move), anchors: CURVE.anchors!.map(move) });
    // The anchors still lie on the curve, so it keeps its handles
    expect(annotationList({ drawings: all.drawings }).find(({ id }) => id === 'curve')).toMatchObject({ shape: 'line' });
    // What cannot be read as points is left as the file has it
    expect(all.drawings.junk).toEqual({ ...junk, points: PEN.points.map(move) });

    const upperOnly = objectsMovedWithMap(objects, move, (object) => (object as DrawingStroke).level === 'upper');
    expect(upperOnly.drawings.room).toBe(objects.drawings.room);
    expect(upperOnly.drawings.curve!.anchors).toEqual(CURVE.anchors!.map(move));
  });

  it('survive a map file as they came, with fields and entries this Atlas cannot read', () => {
    const drawings = {
      room: { ...drawing('room', ROOM), hidden: true, layer: 'map', locked: true, order: 4, group: 'g', by: 'player-1', glow: { radius: 3 } },
      curve: { ...drawing('curve', CURVE), dash: 'dashed', ends: 'both', rotation: 12 },
      odd: { id: 'odd', kind: 'drawing', type: 'spiral', points: [] },
      junk: 4,
    };
    const texts = {
      label: { id: 'label', kind: 'text', ...LABEL, outline: true, breaks: [2], width: 120, hidden: true, layer: 'map', order: 1, shadow: 'soft' },
      junk: 'text',
    };
    const loaded = migrateMapFile({ schema: 'atlas-map', version: 4, objects: { tokens: {}, drawings, texts } });
    expect(loaded.objects.drawings).toBe(drawings);
    expect(loaded.objects.texts).toBe(texts);
    expect(JSON.parse(JSON.stringify(loaded.objects))).toMatchObject({ drawings, texts });
    // The curve has no order and lies lowest; what cannot be read is passed over
    expect(annotationList(loaded.objects).map(({ id }) => id)).toEqual(['curve', 'label', 'room']);

    // Read again as the written file would be: nothing changed on the way
    const again = migrateMapFile(JSON.parse(JSON.stringify({ schema: 'atlas-map', version: 4, objects: loaded.objects })));
    expect(again.objects.drawings).toEqual(drawings);
    expect(again.objects.texts).toEqual(texts);
  });

  it('are written back unchanged by a store that changes one of them', () => {
    const { store, drawings } = setup();
    const foreign = { ...drawing('a', ROOM), glow: 4 } as DrawingStroke;
    const odd = { id: 'odd', type: 'spiral' } as unknown as DrawingStroke;
    store.setState({ objects: { ...store.getState().objects, drawings: { a: foreign, odd } } });
    store.getState().updateAnnotations(['a'], { color: '#112233' });
    expect(drawings()).toEqual({ a: { ...foreign, color: '#112233' }, odd });
  });
});

describe('copies of annotations', () => {
  it('lie above everything of the level they land on, as their originals lay among themselves, in groups of their own', () => {
    const { store, steps, drawings, texts, shown } = setup();
    const a = store.getState().addDrawing({ ...PEN, group: 'sketch' });
    const label = store.getState().addText({ ...LABEL, group: 'sketch' });
    const b = store.getState().addDrawing({ ...ROOM, hidden: true, layer: 'map' });
    const top = store.getState().addDrawing(PEN);
    const before = steps();

    // Picked in another order than they lie in
    const copies = store.getState().insertMapObjects(collectMapObjects(store.getState().objects, [b, label, a]));
    expect(steps()).toBe(before + 1);
    const [copyB, copyA, copyLabel] = copies as [string, string, string];
    expect(shown()).toEqual([a, label, b, top, copyA, copyLabel, copyB]);
    expect(drawings()[copyB]).toMatchObject({ ...ROOM, hidden: true, layer: 'map', order: 7 });
    const group = drawings()[copyA]!.group;
    expect(group).not.toBe('sketch');
    expect(texts()[copyLabel]!.group).toBe(group);
    expect(drawings()[copyB]).not.toHaveProperty('group');
    expect(drawings()[a]!.group).toBe('sketch');
  });

  it('numbers copies from the order they are given, each group once', () => {
    const one = { id: 'one', kind: 'drawing', timestamp: 1, ...PEN, order: 9, group: 'g' } as DrawingStroke;
    const two = { id: 'two', kind: 'drawing', timestamp: 1, ...PEN, group: 'h' } as DrawingStroke;
    const label = { id: 'label', kind: 'text', ...LABEL, order: 9, group: 'g' } as TextElement;
    let made = 0;
    const placed = placedAnnotationCopies([one, two], [label], 20, () => `new-${++made}`);
    expect(placed.drawings.map(({ order, group }) => [order, group])).toEqual([[22, 'new-1'], [20, 'new-2']]);
    expect(placed.texts.map(({ order, group }) => [order, group])).toEqual([[21, 'new-1']]);
    expect(one).toMatchObject({ order: 9, group: 'g' });
  });

  it('take their anchors and holes along when they are put down elsewhere', () => {
    const room = { id: 'room', kind: 'drawing', timestamp: 1, ...ROOM } as DrawingStroke;
    const curve = { id: 'curve', kind: 'drawing', timestamp: 1, ...CURVE } as DrawingStroke;
    const moved = translateMapObjects({ tokens: [], drawings: [room, curve], texts: [], pins: [], levelLinks: [] }, { x: 70, y: -70 });
    expect(moved.drawings[0]).toEqual({ ...room, points: shifted(ROOM.points, 70, -70), holes: [shifted(ROOM.holes![0]!, 70, -70)] });
    expect(moved.drawings[1]!.anchors).toEqual(shifted(CURVE.anchors!, 70, -70));
    expect(room.holes).toEqual(ROOM.holes);
  });
});
