import { type MessageKey, t } from '../../i18n';
import { LEVEL_HEIGHT } from '../../levels/levelEdits';
import { floorAbove, isAbove, levelElevation, stackOf, stairEnd } from '../floors/floorStack';
import { pitchExit } from '../layout/cavern/stairWays';
import { verticalKindOf } from '../layout/cavern/veins/caveExits';
import { holdsCell } from '../geometry';
import type { DungeonRoom, DungeonStair, DungeonTerrain, TerrainDrop, VerticalKind } from '../model';
import type { VisibleFloor } from '../render/visibleDungeon';
import { floorLetter } from './roomKeys';

/**
 * A cave chamber's ways up and down in the note: how far each rises or drops, how it is passed
 * (a shaft or aven, a chimney, a vertical squeeze) and where it leads, for avens, shafts and the
 * pitches between floors. Depths are feet, as the note's other heights are.
 */

/** The sentence of a way up or down of each kind, into the dark or to a floor; counted where several alike share a room. */
interface WayKeys {
  dark: MessageKey;
  toFloor: MessageKey;
}

const RISING: Readonly<Record<VerticalKind, WayKeys>> = {
  shaft: { dark: 'dungeonScene.rise.avenDark', toFloor: 'dungeonScene.rise.avenToFloor' },
  chimney: { dark: 'dungeonScene.rise.chimneyDark', toFloor: 'dungeonScene.rise.chimneyToFloor' },
  squeeze: { dark: 'dungeonScene.rise.squeezeDark', toFloor: 'dungeonScene.rise.squeezeToFloor' },
};

const DROPPING: Readonly<Record<VerticalKind, WayKeys>> = {
  shaft: { dark: 'dungeonScene.drop.shaftDark', toFloor: 'dungeonScene.drop.shaftToFloor' },
  chimney: { dark: 'dungeonScene.drop.chimneyDark', toFloor: 'dungeonScene.drop.chimneyToFloor' },
  squeeze: { dark: 'dungeonScene.drop.squeezeDark', toFloor: 'dungeonScene.drop.squeezeToFloor' },
};

/** One way's sentence: rising or dropping, its kind and depth, into the dark (`to` null) or to floor `to`. */
function waySentence(up: boolean, drop: TerrainDrop, to: number | null, count: number): string {
  const keys = (up ? RISING : DROPPING)[drop.kind];
  return to === null ? t(keys.dark, { count, depth: drop.depth }) : t(keys.toFloor, { count, depth: drop.depth, floor: floorLetter(to) });
}

/**
 * How far a pitch between two floors drops and how it is passed: the floors' spacing in the scene
 * (`levelElevation`), and the kind the floor exit it goes down makes of it, a shaft where the
 * chamber above rolled none.
 */
export function pitchDrop(model: Parameters<typeof stackOf>[0], index: number, stair: DungeonStair): TerrainDrop {
  const stack = stackOf(model);
  const depth = Math.abs(levelElevation(stack, index, LEVEL_HEIGHT).bottom - levelElevation(stack, stair.to, LEVEL_HEIGHT).bottom);
  const upperIndex = stairEnd(stack, index, stair.to) === 'upper' ? index : stair.to;
  const upperFloor = model.floors[upperIndex];
  const upper = upperIndex === index ? stair : upperFloor?.stairs.find((s) => s.link === stair.link);
  const exit = upper && upperFloor ? pitchExit(upper, upperFloor) : undefined;
  return { depth, kind: exit ? verticalKindOf(exit.width) : 'shaft' };
}

/** A pitch from this end: a pitch (or a chimney or vertical squeeze) dropping to the floor below, an aven rising to the floor above. */
export function pitchSentence(visible: VisibleFloor, stair: DungeonStair): string {
  const down = isAbove(stackOf(visible.model), visible.index, stair.to);
  const drop = pitchDrop(visible.model, visible.index, stair);
  if (down && drop.kind === 'shaft') return t('dungeonScene.pitchDown', { depth: drop.depth, floor: floorLetter(stair.to) });
  return waySentence(!down, drop, stair.to, 1);
}

/** Whether a piece has a sentence of its own rather than a place in the terrain's list: a cave's avens, its shafts into the dark and every way up or down with a depth. */
export function saidApart(visible: VisibleFloor, piece: DungeonTerrain): boolean {
  if (visible.floor.cave === undefined) return false;
  return piece.kind === 'aven' || (piece.kind === 'shaft' && (piece.opening?.bottom === null || piece.traits.drop !== undefined));
}

/** The sentence of ways of one kind, depth and end, counted; a piece without a depth reads as before ways had one. */
function sentenceOf(up: boolean, drop: TerrainDrop | undefined, to: number | null, count: number): string {
  if (drop) return waySentence(up, drop, to, count);
  if (!up) return t('dungeonScene.shaftDark', { count });
  return to === null ? t('dungeonScene.avenDark', { count }) : t('dungeonScene.avensUp', { count, floor: floorLetter(to) });
}

/**
 * A cave chamber's ways up and down that are no stairwell: each aven, rising to the floor above
 * where a room of it lies over the aven and into the dark where none does, then each shaft, to
 * the floor it falls to or into the dark. Ways alike in kind, depth and end are counted together.
 */
export function verticalWaySentences(visible: VisibleFloor, room: DungeonRoom): string[] {
  if (!visible.floor.cave) return [];
  const pieces = visible.floor.terrain.filter((piece) => piece.room === room.id && saidApart(visible, piece));
  const above = floorAbove(stackOf(visible.model), visible.index);
  const over = above === null ? [] : (visible.model.floors[above]?.rooms ?? []);
  const groups = new Map<string, { up: boolean; drop: TerrainDrop | undefined; to: number | null; count: number }>();
  const add = (up: boolean, drop: TerrainDrop | undefined, to: number | null): void => {
    const key = `${up}:${drop?.kind}:${drop?.depth}:${to}`;
    const group = groups.get(key);
    if (group) group.count++;
    else groups.set(key, { up, drop, to, count: 1 });
  };
  for (const aven of pieces.filter((piece) => piece.kind === 'aven')) add(true, aven.traits.drop, aven.cells.every((c) => over.some((r) => holdsCell(r, c.x, c.y))) ? above : null);
  for (const shaft of pieces.filter((piece) => piece.kind === 'shaft')) add(false, shaft.traits.drop, shaft.opening?.bottom ?? null);
  return [...groups.values()].map((group) => sentenceOf(group.up, group.drop, group.to, group.count));
}
