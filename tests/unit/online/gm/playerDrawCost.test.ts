import { describe, expect, it } from 'vitest';
import { annotationList } from '../../../../src/app/annotations/annotationList';
import { drawingInk } from '../../../../src/app/annotations/drawingInk';
import { crossesItself, seeThroughWeight, sweepCost } from '../../../../src/app/online/gm/drawCost.ts';
import {
  ERASE_BURST, ERASE_COST_BUDGET, ERASE_PAUSE_MS, MAX_PLAYER_DASHES, MAX_PLAYER_SEE_THROUGH, PEN_TOLERANCE, playerDrawing, WRITE_BURST,
} from '../../../../src/app/online/gm/drawCheck.ts';
import { JOIN_MS } from '../../../../src/app/online/gm/joinedSteps.ts';
import { PlayerAliases } from '../../../../src/app/online/gm/playerDrawingState.ts';
import { MAX_PLAYER_FILL_CORNERS, MAX_PLAYER_SEE_THROUGH_POINTS, MAX_PLAYER_STROKE_POINTS, MAX_SWEEP_POINTS, type DrawLook } from '../../../../src/app/online/protocol/index.ts';
import { runUntracked } from '../../../../src/app/stores/history';
import type { DrawingStroke } from '../../../../src/app/types';
import { CELL, flat, LOOK, next, pen, steps, table, type Table } from './drawTable.ts';
import { ANA, BEN, SCENE } from './realStore.ts';

type Pair = readonly [number, number];

/** Points anywhere on the map, the same at every run. */
function scribble(count: number, seed = 7): Pair[] {
  let state = seed;
  const random = (): number => (state = (state * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  return Array.from({ length: count }, (): Pair => [Math.round(random() * 190000) / 100, Math.round(random() * 140000) / 100]);
}

/** A polygon that does not cross itself: `count` corners around a circle. */
const ring = (count: number, radius = 300): Pair[] => Array.from({ length: count }, (_, index): Pair => [800 + radius * Math.cos((2 * Math.PI * index) / count), 700 + radius * Math.sin((2 * Math.PI * index) / count)]);
/** A line that waves, so that no point of it can be thinned away. */
const wave = (count: number, y = 300): Pair[] => Array.from({ length: count }, (_, index): Pair => [100 + index * 9, y + (index % 2) * 40]);
const line = (points: readonly Pair[], look: DrawLook, closed = false): Parameters<Table['send']>[1] => ({ t: 'draw-add', scene: SCENE, n: next(), mode: 'line', pts: flat(points), ...(closed && { closed: true as const }), look });
/** Puts drawings of Ana's on the map as they are, past every check: what a scene may hold from before. */
function given(harness: Table, drawings: readonly Omit<DrawingStroke, 'id' | 'kind' | 'timestamp' | 'by'>[]): void {
  runUntracked(harness.store, () => harness.store.setState((draft) => {
    drawings.forEach((drawing, index) => {
      draft.objects.drawings[`given${index}`] = { id: `given${index}`, kind: 'drawing', timestamp: 1, by: ANA, ...drawing };
    });
  }));
}
const erase = (points: readonly Pair[], size: 's' | 'xl' = 's'): Parameters<Table['send']>[1] => ({ t: 'draw-erase', scene: SCENE, n: next(), pts: flat(points), size });

describe('an erasing a player asks for', () => {
  it('is held to a rate of its own, which one that cuts nothing takes from like any other', () => {
    const harness = table();
    harness.send(ANA, pen([[100, 100], [200, 100]]));
    for (let index = 0; index < ERASE_BURST; index += 1) harness.send(ANA, erase([[900, 900]]));
    expect(harness.refusals()).toEqual([]);
    // Nothing was cut and nothing refused so far, and still the next one is one too many.
    harness.send(ANA, erase([[150, 100]]));
    expect(harness.refusals()).toEqual(['rate']);
    expect(harness.drawn()).toHaveLength(1);
    // Another player's erasing is their own, and so is every other kind of request.
    harness.send(BEN, erase([[900, 900]]));
    harness.send(ANA, pen([[100, 300], [200, 300]]));
    expect(harness.refusals()).toEqual(['rate']);
    harness.now += 1000;
    harness.send(ANA, erase([[150, 100]]));
    expect(harness.drawn().filter((drawing) => drawing.points[0]?.y === 100)).toHaveLength(2);
    harness.send(ANA, erase([[150, 100]]));
    expect(harness.refusals()).toEqual(['rate', 'rate']);
  });

  it('is refused before anything is cut where its sweep may reach more than a cut may cost', () => {
    const harness = table();
    // Ten strokes of the most points a stroke may have, zigzagging along one diagonal: what a scene could hold of a player's.
    const zigzag = Array.from({ length: MAX_PLAYER_STROKE_POINTS }, (_, index) => (index % 2 === 0 ? { x: index * 0.01, y: 0 } : { x: 1400, y: 1400 + index * 0.01 }));
    given(harness, Array.from({ length: 10 }, () => ({ type: 'pen' as const, points: zigzag, color: '#ff0000', width: 2, opacity: 1 })));
    const before = harness.store.getState().objects.drawings;
    // A sweep beside them, just out of reach: it would cut nothing, and trying would take a tenth of a second.
    const beside = Array.from({ length: MAX_SWEEP_POINTS }, (_, index): Pair => (index % 2 === 0 ? [55, 0] : [1455, 1400]));
    const own = annotationList(harness.store.getState().objects).filter((annotation) => annotation.by === ANA);
    expect(sweepCost(own, beside.map(([x, y]) => ({ x, y })), 8.75)).toBeGreaterThan(ERASE_COST_BUDGET);
    harness.send(ANA, erase(beside));
    // Too much at once, as the player is told.
    expect(harness.refusals()).toEqual(['rate']);
    expect(harness.store.getState().objects.drawings).toBe(before);
    // A sweep in more points than a page tells one in is none.
    harness.send(ANA, erase(Array.from({ length: MAX_SWEEP_POINTS + 1 }, (_, index): Pair => [1900, index])));
    expect(harness.refusals()).toEqual(['rate', 'shape']);
    // A dab far from them reaches none of them and costs nothing.
    harness.send(ANA, erase([[1900, 100]]));
    expect(harness.refusals()).toEqual(['rate', 'shape']);
    expect(steps(harness.history)).toBe(0);
  });

  it('pauses for a while once a cut took the GM too long, whatever the reason', () => {
    const harness = table();
    harness.send(ANA, pen([[100, 100], [200, 100]]));
    // Every look at the clock finds it 60 ms on: the cut "took" that long.
    harness.tick = 60;
    harness.send(ANA, erase([[900, 900]]));
    harness.tick = 0;
    harness.now += 2000;
    harness.send(ANA, erase([[150, 100]]));
    expect(harness.refusals()).toEqual(['busy']);
    expect(harness.drawn()).toHaveLength(1);
    harness.now += ERASE_PAUSE_MS;
    harness.send(ANA, erase([[150, 100]]));
    expect(harness.drawn()).toHaveLength(2);
  });
});

describe('a drawing a player may make is cheap by what it is', () => {
  it('fills a line only where it ends where it began, has few corners and does not cross itself', () => {
    const harness = table();
    const fill: DrawLook = { ...LOOK, fill: 'solid' };
    harness.send(ANA, line(ring(MAX_PLAYER_FILL_CORNERS), fill, true));
    expect(harness.drawn()).toHaveLength(1);
    expect(harness.drawn()[0]).toMatchObject({ fill: 'solid' });
    harness.send(ANA, line(ring(MAX_PLAYER_FILL_CORNERS + 1), fill, true));
    // A bow tie: four corners, and its two long sides cross.
    harness.send(ANA, line([[100, 100], [300, 300], [300, 100], [100, 300]], fill, true));
    // The scribble of 1,999 corners that took two thirds of a second to cut and gave 4,020 pieces.
    const n = next();
    const corners = scribble(1999);
    for (let from = 0; from < 1800; from += 200) harness.send(ANA, { t: 'draw-points', scene: SCENE, n, from, pts: flat(corners.slice(from, from + 200)) });
    harness.send(ANA, { t: 'draw-add', scene: SCENE, n, mode: 'line', pts: flat(corners.slice(1800)), from: 1800, closed: true, look: fill });
    expect(harness.refusals()).toEqual(['shape', 'shape', 'shape']);
    expect(harness.drawn()).toHaveLength(1);
    // Without a fill each of them is a line like any other; a rectangle's and an ellipse's fill crosses nothing.
    harness.send(ANA, line([[100, 100], [300, 300], [300, 100], [100, 300]], LOOK, true));
    harness.send(ANA, { t: 'draw-add', scene: SCENE, n: next(), mode: 'ellipse', pts: [500, 500, 700, 600], look: fill });
    expect(harness.drawn()).toHaveLength(3);
    expect(harness.refusals()).toHaveLength(3);
  });

  it('gives a fill later, and sets a filled line anew, only by the same rule; a fill the eraser cut stays the player\'s to move', () => {
    const harness = table();
    harness.send(ANA, line([[100, 100], [300, 300], [300, 100], [100, 300]], LOOK, true));
    harness.send(ANA, line(ring(12), { ...LOOK, fill: 'soft' }, true));
    const [tie, round] = Object.keys(harness.mine(ANA).drawings) as [string, string];
    harness.send(ANA, { t: 'draw-change', scene: SCENE, n: next(), ids: [tie], style: { fill: 'solid' } });
    harness.send(ANA, { t: 'draw-change', scene: SCENE, n: next(), ids: [round], line: { pts: [100, 100, 300, 300, 300, 100, 100, 300, 100, 100] } });
    expect(harness.refusals()).toEqual(['shape', 'shape']);
    expect(harness.drawn()[0]).not.toHaveProperty('fill');
    // A dab in its middle leaves the fill with a hole in it: more points than a player may fill, and nothing they could not have.
    harness.send(ANA, erase([[800, 700]], 'xl'));
    const piece = harness.drawn().find((drawing) => drawing.holes !== undefined);
    expect(piece?.holes?.[0]?.length).toBeGreaterThan(8);
    const alias = Object.entries(harness.mine(ANA).drawings).find(([, id]) => id === piece?.id)?.[0] ?? '';
    harness.send(ANA, { t: 'draw-change', scene: SCENE, n: next(), ids: [alias], map: [1, 0, 0, 1, 50, 0, 0] });
    harness.send(ANA, { t: 'draw-change', scene: SCENE, n: next(), ids: [alias], style: { fill: 'solid' } });
    expect(harness.refusals()).toEqual(['shape', 'shape']);
    expect(harness.store.getState().objects.drawings[piece?.id ?? '']).toMatchObject({ fill: 'solid' });
  });

  it('thins a pen\'s stroke itself, whatever the page did', () => {
    const harness = table();
    harness.send(ANA, pen(Array.from({ length: 200 }, (_, index): Pair => [100 + index, 100 + (index === 120 ? PEN_TOLERANCE / 2 : 0)])));
    expect(harness.drawn()[0]?.points).toEqual([{ x: 100, y: 100 }, { x: 299, y: 100 }]);
  });

  it('takes see-through ink only in few points, a curve by the points it was clicked with, and only so much of it from one player', () => {
    const harness = table();
    const sheer: DrawLook = { ...LOOK, size: 'xl', seeThrough: true };
    harness.send(ANA, pen(wave(MAX_PLAYER_SEE_THROUGH_POINTS), sheer));
    harness.send(ANA, pen(wave(MAX_PLAYER_SEE_THROUGH_POINTS + 1), sheer));
    harness.send(ANA, line(wave(MAX_PLAYER_SEE_THROUGH_POINTS / 4, 600), { ...sheer, curved: true }));
    harness.send(ANA, line(wave(MAX_PLAYER_SEE_THROUGH_POINTS / 4 + 1, 600), { ...sheer, curved: true }));
    expect(harness.refusals()).toEqual(['shape', 'shape']);
    expect(harness.drawn().map((drawing) => drawing.opacity)).toEqual([0.5, 0.5]);
    // The same stroke in ink that hides what it covers may be as long as any.
    harness.send(ANA, pen(wave(200, 900)));
    const solid = Object.keys(harness.mine(ANA).drawings).at(-1) ?? '';
    harness.send(ANA, { t: 'draw-change', scene: SCENE, n: next(), ids: [solid], style: { seeThrough: true } });
    expect(harness.refusals()).toEqual(['shape', 'shape', 'shape']);
    expect(harness.drawn().at(-1)).toMatchObject({ opacity: 1 });
    // The stroke of 2,000 points anywhere on the map that took every device 2.8 s to draw.
    expect(playerDrawing('pen', scribble(MAX_PLAYER_STROKE_POINTS).map(([x, y]) => ({ x, y })), false, sheer, CELL)).toBeNull();

    const full = table();
    const most = Math.floor(MAX_PLAYER_SEE_THROUGH / MAX_PLAYER_SEE_THROUGH_POINTS);
    for (let index = 0; index < most + 1; index += 1) {
      full.send(ANA, pen(wave(MAX_PLAYER_SEE_THROUGH_POINTS, 100 + index * 60), sheer));
      full.now += 1000;
    }
    expect(full.drawn()).toHaveLength(most);
    expect(full.refusals()).toEqual(['full']);
    full.send(BEN, pen(wave(MAX_PLAYER_SEE_THROUGH_POINTS), sheer));
    expect(full.drawn()).toHaveLength(most + 1);
  });

  it('builds the dearest see-through stroke a player may make in a few milliseconds', () => {
    const made = playerDrawing('pen', scribble(MAX_PLAYER_SEE_THROUGH_POINTS).map(([x, y]) => ({ x, y })), false, { ...LOOK, size: 'xl', seeThrough: true }, CELL);
    const [drawing] = annotationList({ drawings: { d: { id: 'd', kind: 'drawing', timestamp: 0, ...made!, points: [...made!.points] } }, texts: {} });
    if (drawing?.kind !== 'drawing') throw new Error('no drawing');
    expect(seeThroughWeight(drawing)).toBe(MAX_PLAYER_SEE_THROUGH_POINTS);
    drawingInk(drawing, 0.5);
    const started = performance.now();
    drawingInk(drawing, 0.5);
    // Seven on the machine this was written on; far from the seconds of the stroke without a limit, on any.
    expect(performance.now() - started).toBeLessThan(100);
  });

  it('draws a line in dashes or dots only as long as few of them make it', () => {
    const harness = table();
    const dotted: DrawLook = { ...LOOK, size: 's', dash: 'dotted' };
    // A dot every two widths: S on cells of 70 px is a dot about every 5.8 px, so 1,900 px are some 330 of them and three times that too many.
    expect(Math.ceil(5700 / ((CELL / 24) * 2))).toBeGreaterThan(MAX_PLAYER_DASHES);
    harness.send(ANA, line([[0, 100], [1900, 100]], dotted));
    harness.send(ANA, line([[0, 200], [1900, 200], [0, 260], [1900, 320]], dotted));
    expect(harness.refusals()).toEqual(['shape']);
    expect(harness.drawn()).toHaveLength(1);
    // A whole line made dotted later is held to the same.
    harness.send(ANA, line([[0, 200], [1900, 200], [0, 260], [1900, 320]], { ...LOOK, size: 's' }));
    const whole = Object.keys(harness.mine(ANA).drawings).at(-1) ?? '';
    harness.send(ANA, { t: 'draw-change', scene: SCENE, n: next(), ids: [whole], style: { dash: 'dotted' } });
    expect(harness.refusals()).toEqual(['shape', 'shape']);
  });
});

describe('whether a line crosses itself', () => {
  const points = (pairs: readonly Pair[]): { x: number; y: number }[] => pairs.map(([x, y]) => ({ x, y }));
  it('says so of two stretches that meet, of one that runs back along the last, and of a ring that touches itself', () => {
    expect(crossesItself(points([[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]), true)).toBe(false);
    expect(crossesItself(points([[0, 0], [10, 10], [10, 0], [0, 10], [0, 0]]), true)).toBe(true);
    expect(crossesItself(points([[0, 0], [10, 0], [5, 0], [5, 10]]), false)).toBe(true);
    // Two squares that share a corner, drawn as one ring through it.
    expect(crossesItself(points([[0, 0], [10, 0], [10, 10], [20, 10], [20, 20], [10, 20], [10, 10], [0, 10], [0, 0]]), true)).toBe(true);
    expect(crossesItself(points([[0, 0], [10, 0], [10, 0], [10, 10]]), false)).toBe(false);
    expect(crossesItself(points([[0, 0], [10, 0], [10, 10], [5, -5]]), false)).toBe(true);
    // The last stretch of a closed line running back along its first.
    expect(crossesItself(points([[0, 0], [10, 0], [10, 10], [5, 0], [0, 0]]), true)).toBe(true);
  });

  it('finds no crossing in any ring around a circle, and one in every star drawn through its corners and in every scribble', () => {
    for (let count = 3; count <= 40; count += 1) {
      const round = points(ring(count));
      expect(crossesItself([...round, round[0]!], true), `ring of ${count}`).toBe(false);
      // Every second corner of a ring with an odd number of them: a star, whose sides all cross.
      if (count % 2 === 0 || count < 5) continue;
      const star = round.map((_, index) => round[(index * 2) % count]!);
      expect(crossesItself([...star, star[0]!], true), `star of ${count}`).toBe(true);
    }
    for (let seed = 1; seed <= 20; seed += 1) expect(crossesItself(points(scribble(40, seed)), false), `scribble ${seed}`).toBe(true);
  });
});

describe('requests that follow each other', () => {
  it('are held to a slower rate where they are no drawing made', () => {
    const harness = table();
    harness.send(ANA, pen([[100, 100], [200, 100]]));
    const [own] = Object.keys(harness.mine(ANA).drawings) as [string];
    for (let index = 0; index < WRITE_BURST + 3; index += 1) harness.send(ANA, { t: 'draw-change', scene: SCENE, n: next(), ids: [own], map: [1, 0, 0, 1, 1, 0, 0] });
    expect(harness.refusals()).toEqual(['rate', 'rate', 'rate']);
    expect(harness.drawn()[0]?.points[0]).toEqual({ x: 100 + WRITE_BURST, y: 100 });
    // Drawing goes on: a stroke's end has a rate of its own.
    harness.send(ANA, pen([[100, 300], [200, 300]]));
    expect(harness.drawn()).toHaveLength(2);
    harness.now += 1000;
    for (let index = 0; index < 3; index += 1) harness.send(ANA, { t: 'draw-change', scene: SCENE, n: next(), ids: [own], map: [1, 0, 0, 1, 1, 0, 0] });
    expect(harness.refusals()).toHaveLength(4);
  });

  it('are one undo step where they change the same drawings closely after each other', () => {
    const harness = table();
    harness.send(ANA, pen([[100, 100], [200, 100]]));
    harness.send(ANA, pen([[100, 300], [200, 300]]));
    harness.send(BEN, pen([[100, 500], [200, 500]]));
    const [first, second] = Object.keys(harness.mine(ANA).drawings) as [string, string];
    const [bens] = Object.keys(harness.mine(BEN).drawings) as [string];
    const colour = (from: string, id: string, value: string): void => harness.send(from, { t: 'draw-change', scene: SCENE, n: next(), ids: [id], style: { colour: value } });
    const colours = (): (string | undefined)[] => harness.drawn().map((drawing) => drawing.color);
    harness.history.getState().clear();
    for (const value of ['#111111', '#222222', '#333333', '#444444']) {
      colour(ANA, first, value);
      harness.now += JOIN_MS / 2;
    }
    expect(steps(harness.history)).toBe(1);
    harness.history.getState().undo();
    expect(colours()).toEqual(['#e93147', '#e93147', '#e93147']);
    harness.history.getState().redo();
    expect(colours()).toEqual(['#444444', '#e93147', '#e93147']);

    // Another drawing, another player, a pause, and a write of the GM's in between are each a step of their own.
    colour(ANA, second, '#555555');
    colour(ANA, first, '#666666');
    colour(BEN, bens, '#777777');
    colour(BEN, bens, '#888888');
    expect(steps(harness.history)).toBe(4);
    harness.now += JOIN_MS + 1;
    colour(BEN, bens, '#999999');
    expect(steps(harness.history)).toBe(5);
    harness.store.getState().addDrawing({ type: 'pen', points: [{ x: 1, y: 1 }], color: '#ffffff', width: 3, opacity: 1 });
    colour(BEN, bens, '#aaaaaa');
    expect(steps(harness.history)).toBe(7);
    harness.history.getState().undo();
    expect(colours().slice(0, 3)).toEqual(['#666666', '#555555', '#999999']);
  });

  it('forget the ids of what is gone', () => {
    const aliases = new PlayerAliases();
    const told = Array.from({ length: 500 }, (_, index) => aliases.of(ANA, `drawing-${index}`));
    aliases.keep(ANA, (id) => id === 'drawing-499');
    expect(told.slice(0, 499).every((alias) => aliases.idOf(ANA, alias) === undefined)).toBe(true);
    expect(aliases.idOf(ANA, told[499]!)).toBe('drawing-499');
    // An id told anew is another: no request still on its way can mean it.
    expect(told).not.toContain(aliases.of(ANA, 'drawing-0'));

    const harness = table();
    harness.send(ANA, pen([[100, 100], [200, 100]]));
    const [own] = Object.keys(harness.mine(ANA).drawings) as [string];
    harness.send(ANA, { t: 'draw-remove', scene: SCENE, n: next(), ids: [own] });
    // The players are told what is theirs after every request: the id of what went is forgotten then.
    expect(harness.mine(ANA).drawings).toEqual({});
    harness.history.getState().undo();
    expect(harness.drawn()).toHaveLength(1);
    expect(Object.keys(harness.mine(ANA).drawings)).not.toContain(own);
    harness.send(ANA, { t: 'draw-remove', scene: SCENE, n: next(), ids: [own] });
    expect(harness.refusals()).toEqual(['gone']);
  });
});
