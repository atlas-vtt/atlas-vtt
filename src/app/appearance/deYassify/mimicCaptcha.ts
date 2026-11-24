import chestA from '../../assets/yassify/chest-a.webp';
import chestB from '../../assets/yassify/chest-b.webp';
import mimicA from '../../assets/yassify/mimic-a.webp';
import mimicB from '../../assets/yassify/mimic-b.webp';
import { dealScene, type StreetScene } from './streetScenes';

/**
 * The mimic captcha that stands between a GM and turning Yassify off: a parody of reCAPTCHA's "select all
 * squares" on purpose hard to read and rigged. A round is all chest squares (tiny chests and yassified mimics,
 * with lashes, bow, nails and tumbler, drawn blocky, darkened, turned and cropped) or all street squares (street photos with a mimic glued on badly, `streetScenes.ts`).
 */

/** What a round's squares show. */
export type RoundStyle = 'chests' | 'streets';

export type TileKind = 'chest' | 'mimic';

/**
 * How a square arrives, with reCAPTCHA's maddening timing: the square it replaces fades out, the gap stays empty for a
 * while (now and then far too long), then the new picture fades in. Gone once the new picture is shown (`settleTile`).
 */
export interface Arrival {
  /** The square being replaced, faded out first; none for a square dealt into a fresh grid. */
  leaving: CaptchaTile | null;
  outMs: number;
  gapMs: number;
  inMs: number;
}

export interface CaptchaTile {
  id: number;
  kind: TileKind;
  /** A chest square's picture; a street square draws its `scene` instead. */
  picture: string;
  scene?: StreetScene;
  /** Quarter turns, in degrees. */
  turn: 0 | 90 | 180 | 270;
  /** CSS brightness: some squares are a little dark, never too dark to tell. */
  brightness: number;
  /** How far the picture is blown up past its square, so part of it is cut off. */
  zoom: number;
  /** Where the blown-up picture sits, in shares of the square. */
  shiftX: number;
  shiftY: number;
  /** Still on its way in: it cannot be clicked, and Verify waits for it. */
  arrival?: Arrival;
}

export interface CaptchaRound {
  style: RoundStyle;
  tiles: CaptchaTile[];
  /** A chest was clicked as a mimic this round: the round fails, whatever is left. */
  clickedChest: boolean;
  /** For the next tile's id. */
  nextId: number;
}

export type Verdict = 'pass' | 'still-loading' | 'rigged' | 'chest-clicked' | 'mimic-left';

const PICTURES: Readonly<Record<TileKind, readonly string[]>> = { chest: [chestA, chestB], mimic: [mimicA, mimicB] };
export const GRID_TILES = 9;
/** Submissions that fail whatever was picked. */
export const RIGGED_ATTEMPTS = 2;
const FIRST_MIMICS = { min: 2, max: 5 } as const;
/** The chance that a clicked square comes back as another mimic. */
const REPLACEMENT_MIMIC = 0.3;
const TURNS = [0, 90, 180, 270] as const;
/** The chance that a gap stays empty far too long. */
const SLOW_GAP_SHARE = 0.3;

/** Random timing for a square on its way in, after `leaving` (or into a fresh grid, a little quicker). */
function arrivalAfter(leaving: CaptchaTile | null, random: () => number): Arrival {
  const slow = random() < SLOW_GAP_SHARE;
  const gapMs = slow ? 2500 + random() * 3500 : 200 + random() * 1300;
  return {
    leaving,
    outMs: leaving ? 300 + random() * 900 : 0,
    gapMs: leaving ? gapMs : gapMs / 2,
    inMs: 400 + random() * 2100,
  };
}

function pick<T>(items: readonly T[], random: () => number): T {
  return items[Math.floor(random() * items.length) % items.length]!;
}

function dealTile(id: number, kind: TileKind, style: RoundStyle, random: () => number): CaptchaTile {
  const zoom = 1 + random() * 0.6;
  const street = style === 'streets';
  return {
    id,
    kind,
    picture: street ? '' : pick(PICTURES[kind], random),
    ...(street && { scene: dealScene(kind === 'mimic', random) }),
    // A street photo stays upright; a chest may lie any way round.
    turn: street ? 0 : pick(TURNS, random),
    brightness: 0.7 + random() * 0.45,
    zoom,
    shiftX: (random() - 0.5) * (zoom - 1),
    shiftY: (random() - 0.5) * (zoom - 1),
  };
}

/** A fresh grid: nine squares, two to five of them mimics, in no order; `trickling` squares arrive one by one. */
export function dealRound(random: () => number, firstId = 0, trickling = false, style: RoundStyle = 'chests'): CaptchaRound {
  const mimics = FIRST_MIMICS.min + Math.floor(random() * (FIRST_MIMICS.max - FIRST_MIMICS.min + 1));
  const kinds: TileKind[] = Array.from({ length: GRID_TILES }, (_, at) => (at < mimics ? 'mimic' : 'chest'));
  for (let at = kinds.length - 1; at > 0; at -= 1) {
    const other = Math.floor(random() * (at + 1));
    [kinds[at], kinds[other]] = [kinds[other]!, kinds[at]!];
  }
  const tiles = kinds.map((kind, at) => {
    const tile = dealTile(firstId + at, kind, style, random);
    return trickling ? { ...tile, arrival: arrivalAfter(null, random) } : tile;
  });
  return { style, tiles, clickedChest: false, nextId: firstId + GRID_TILES };
}

/** A square clicked as a mimic is taken away and another dealt in its place, as reCAPTCHA does; a chest taken counts. */
export function clickTile(round: CaptchaRound, id: number, random: () => number): CaptchaRound {
  const clicked = round.tiles.find((tile) => tile.id === id);
  if (!clicked || clicked.arrival) return round;
  const replacement = { ...dealTile(round.nextId, random() < REPLACEMENT_MIMIC ? 'mimic' : 'chest', round.style, random), arrival: arrivalAfter(clicked, random) };
  return {
    style: round.style,
    tiles: round.tiles.map((tile) => (tile.id === id ? replacement : tile)),
    clickedChest: round.clickedChest || clicked.kind === 'chest',
    nextId: round.nextId + 1,
  };
}

/** `tile` as it stands once it has arrived. */
function shown(tile: CaptchaTile): CaptchaTile {
  const copy = { ...tile };
  delete copy.arrival;
  return copy;
}

/** The square `id` has arrived: its new picture is shown. */
export function settleTile(round: CaptchaRound, id: number): CaptchaRound {
  if (!round.tiles.some((tile) => tile.id === id && tile.arrival)) return round;
  return { ...round, tiles: round.tiles.map((tile) => (tile.id === id ? shown(tile) : tile)) };
}

/**
 * Whether the GM may go on: not while a square is still on its way in (which costs no attempt), never on the first
 * `RIGGED_ATTEMPTS` submissions (`attempt` counts from 0), then only once no mimic is left and no chest was taken.
 */
export function verdict(round: CaptchaRound, attempt: number): Verdict {
  if (round.tiles.some((tile) => tile.arrival)) return 'still-loading';
  if (attempt < RIGGED_ATTEMPTS) return 'rigged';
  if (round.clickedChest) return 'chest-clicked';
  if (round.tiles.some((tile) => tile.kind === 'mimic')) return 'mimic-left';
  return 'pass';
}

/** The chance that a round is street squares rather than chest squares. */
const STREET_SHARE = 0.5;

/** The next round, in either style at random. */
export function dealAnyRound(random: () => number, nextId = 0, trickling = false): CaptchaRound {
  return dealRound(random, nextId, trickling, random() < STREET_SHARE ? 'streets' : 'chests');
}
