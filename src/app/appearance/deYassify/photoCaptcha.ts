import busShelterCity from '../../assets/yassify/street-bus-shelter-city.webp';
import busShelterField from '../../assets/yassify/street-bus-shelter-field.webp';
import busStopBench from '../../assets/yassify/street-bus-stop-bench.webp';
import crossingButton from '../../assets/yassify/street-crossing-button.webp';
import crossingIntersection from '../../assets/yassify/street-crossing-intersection.webp';
import crossingLane from '../../assets/yassify/street-crossing-lane.webp';
import storefront from '../../assets/yassify/street-storefront.webp';
import mimicSticker from '../../assets/yassify/sticker-mimic.webp';
import chestSticker from '../../assets/yassify/sticker-chest.webp';

/**
 * The captcha's other kind of round, after reCAPTCHA's street photos: one public-domain street photo (sources in
 * THIRD_PARTY_NOTICES.md) cut into squares, with a mimic glued onto it badly, now and then an ordinary chest beside
 * it, and the whole drawn at a random size from almost sharp to hopelessly blocky. Every square holding any of the
 * mimic counts, a sliver in a corner too.
 */

/** A cut-out glued onto the photo: where its middle sits and how wide it is, in shares of the photo; its tilt. */
export interface Sticker {
  picture: string;
  /** Its height over its width. */
  aspect: number;
  x: number;
  y: number;
  width: number;
  /** Degrees. */
  turn: number;
}

export interface PhotoRound {
  kind: 'photo';
  photo: string;
  /** Squares along each side. */
  side: 3 | 4;
  /** The width the photo is drawn at before it is blown up: small is blocky. */
  pixels: number;
  mimic: Sticker;
  decoy: Sticker | null;
  picked: ReadonlySet<number>;
  nextId: number;
}

export type PhotoVerdict = 'pass' | 'rigged' | 'wrong-squares';

const PHOTOS = [busShelterCity, busShelterField, busStopBench, crossingButton, crossingIntersection, crossingLane, storefront] as const;
const MIMIC = { picture: mimicSticker, aspect: 110 / 148 } as const;
const CHEST = { picture: chestSticker, aspect: 90 / 148 } as const;
/** From nearly sharp to hopeless: a third of the rounds are drawn 24 or 36 pixels wide. */
const PIXEL_WIDTHS = [24, 36, 56, 90, 150, 320] as const;
const FOUR_BY_FOUR = 0.25;
const DECOY_SHARE = 0.4;

const between = (random: () => number, low: number, high: number): number => low + random() * (high - low);

function stickerOn(random: () => number, kind: typeof MIMIC | typeof CHEST, left: number, right: number): Sticker {
  return {
    picture: kind.picture,
    aspect: kind.aspect,
    x: between(random, left, right),
    // Low in the picture, where benches, kerbs and pavements are.
    y: between(random, 0.4, 0.85),
    width: between(random, 0.16, 0.5),
    turn: between(random, -30, 30),
  };
}

/** A photo round with its mimic glued on badly, and in some rounds a chest on the photo's other side. */
export function dealPhotoRound(random: () => number, nextId = 0): PhotoRound {
  const photo = PHOTOS[Math.floor(random() * PHOTOS.length) % PHOTOS.length]!;
  const side = random() < FOUR_BY_FOUR ? 4 : 3;
  const pixels = PIXEL_WIDTHS[Math.floor(random() * PIXEL_WIDTHS.length) % PIXEL_WIDTHS.length]!;
  const mimicLeft = random() < 0.5;
  const mimic = stickerOn(random, MIMIC, mimicLeft ? 0.15 : 0.5, mimicLeft ? 0.5 : 0.85);
  const decoy = random() < DECOY_SHARE ? stickerOn(random, CHEST, mimicLeft ? 0.6 : 0.15, mimicLeft ? 0.85 : 0.4) : null;
  return { kind: 'photo', photo, side, pixels, mimic, decoy, picked: new Set(), nextId: nextId + 1 };
}

/** The squares (row by row from the top left) that any of `sticker` covers: the box around it, turned. */
export function squaresUnder(sticker: Sticker, side: number): number[] {
  const radians = (sticker.turn * Math.PI) / 180;
  const width = sticker.width;
  const height = sticker.width * sticker.aspect;
  const halfX = (Math.abs(Math.cos(radians)) * width + Math.abs(Math.sin(radians)) * height) / 2;
  const halfY = (Math.abs(Math.sin(radians)) * width + Math.abs(Math.cos(radians)) * height) / 2;
  const first = (edge: number): number => Math.max(0, Math.floor(edge * side));
  const last = (edge: number): number => Math.min(side - 1, Math.ceil(edge * side) - 1);
  const squares: number[] = [];
  for (let row = first(sticker.y - halfY); row <= last(sticker.y + halfY); row += 1) {
    for (let column = first(sticker.x - halfX); column <= last(sticker.x + halfX); column += 1) squares.push(row * side + column);
  }
  return squares;
}

export function togglePick(round: PhotoRound, square: number): PhotoRound {
  const picked = new Set(round.picked);
  if (picked.has(square)) picked.delete(square);
  else picked.add(square);
  return { ...round, picked };
}

/** Never on the first `rigged` submissions, then only when exactly the squares holding the mimic are picked. */
export function photoVerdict(round: PhotoRound, attempt: number, rigged: number): PhotoVerdict {
  if (attempt < rigged) return 'rigged';
  const wanted = squaresUnder(round.mimic, round.side);
  const exact = wanted.length === round.picked.size && wanted.every((square) => round.picked.has(square));
  return exact ? 'pass' : 'wrong-squares';
}
