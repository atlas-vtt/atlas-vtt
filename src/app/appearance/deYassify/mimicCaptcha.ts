import chestA from '../../assets/yassify/chest-a.webp';
import chestB from '../../assets/yassify/chest-b.webp';
import mimicA from '../../assets/yassify/mimic-a.webp';
import mimicB from '../../assets/yassify/mimic-b.webp';

/**
 * The mimic captcha that stands between a GM and turning Yassify off: a parody of reCAPTCHA's "select all
 * squares" on purpose hard to read (tiny chests and mimics drawn blocky, darkened, turned and cropped) and rigged.
 */

export type TileKind = 'chest' | 'mimic';

export interface CaptchaTile {
  id: number;
  kind: TileKind;
  picture: string;
  /** Quarter turns, in degrees. */
  turn: 0 | 90 | 180 | 270;
  /** CSS brightness: some squares are too dark to tell. */
  brightness: number;
  /** How far the picture is blown up past its square, so part of it is cut off. */
  zoom: number;
  /** Where the blown-up picture sits, in shares of the square. */
  shiftX: number;
  shiftY: number;
}

export interface CaptchaRound {
  tiles: CaptchaTile[];
  /** A chest was clicked as a mimic this round: the round fails, whatever is left. */
  clickedChest: boolean;
  /** For the next tile's id. */
  nextId: number;
}

export type Verdict = 'pass' | 'rigged' | 'chest-clicked' | 'mimic-left';

const PICTURES: Readonly<Record<TileKind, readonly string[]>> = { chest: [chestA, chestB], mimic: [mimicA, mimicB] };
export const GRID_TILES = 9;
/** Submissions that fail whatever was picked. */
export const RIGGED_ATTEMPTS = 2;
const FIRST_MIMICS = { min: 2, max: 5 } as const;
/** The chance that a clicked square comes back as another mimic. */
const REPLACEMENT_MIMIC = 0.3;
const TURNS = [0, 90, 180, 270] as const;

function pick<T>(items: readonly T[], random: () => number): T {
  return items[Math.floor(random() * items.length) % items.length]!;
}

function dealTile(id: number, kind: TileKind, random: () => number): CaptchaTile {
  const zoom = 1 + random() * 0.6;
  return {
    id,
    kind,
    picture: pick(PICTURES[kind], random),
    turn: pick(TURNS, random),
    brightness: 0.45 + random() * 0.7,
    zoom,
    shiftX: (random() - 0.5) * (zoom - 1),
    shiftY: (random() - 0.5) * (zoom - 1),
  };
}

/** A fresh grid: nine squares, two to five of them mimics, in no order. */
export function dealRound(random: () => number, firstId = 0): CaptchaRound {
  const mimics = FIRST_MIMICS.min + Math.floor(random() * (FIRST_MIMICS.max - FIRST_MIMICS.min + 1));
  const kinds: TileKind[] = Array.from({ length: GRID_TILES }, (_, at) => (at < mimics ? 'mimic' : 'chest'));
  for (let at = kinds.length - 1; at > 0; at -= 1) {
    const other = Math.floor(random() * (at + 1));
    [kinds[at], kinds[other]] = [kinds[other]!, kinds[at]!];
  }
  return { tiles: kinds.map((kind, at) => dealTile(firstId + at, kind, random)), clickedChest: false, nextId: firstId + GRID_TILES };
}

/** A square clicked as a mimic is taken away and another dealt in its place, as reCAPTCHA does; a chest taken counts. */
export function clickTile(round: CaptchaRound, id: number, random: () => number): CaptchaRound {
  const clicked = round.tiles.find((tile) => tile.id === id);
  if (!clicked) return round;
  const replacement = dealTile(round.nextId, random() < REPLACEMENT_MIMIC ? 'mimic' : 'chest', random);
  return {
    tiles: round.tiles.map((tile) => (tile.id === id ? replacement : tile)),
    clickedChest: round.clickedChest || clicked.kind === 'chest',
    nextId: round.nextId + 1,
  };
}

/**
 * Whether the GM may go on: never on the first `RIGGED_ATTEMPTS` submissions (`attempt` counts from 0), then only
 * once no mimic is left and no chest was taken for one.
 */
export function verdict(round: CaptchaRound, attempt: number): Verdict {
  if (attempt < RIGGED_ATTEMPTS) return 'rigged';
  if (round.clickedChest) return 'chest-clicked';
  if (round.tiles.some((tile) => tile.kind === 'mimic')) return 'mimic-left';
  return 'pass';
}
