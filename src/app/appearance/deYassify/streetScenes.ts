import busShelterCity from '../../assets/yassify/street-bus-shelter-city.webp';
import busShelterField from '../../assets/yassify/street-bus-shelter-field.webp';
import busStopBench from '../../assets/yassify/street-bus-stop-bench.webp';
import crossingButton from '../../assets/yassify/street-crossing-button.webp';
import crossingIntersection from '../../assets/yassify/street-crossing-intersection.webp';
import crossingLane from '../../assets/yassify/street-crossing-lane.webp';
import storefront from '../../assets/yassify/street-storefront.webp';
import mimicSticker from '../../assets/yassify/sticker-mimic.webp';
import chestSticker from '../../assets/yassify/sticker-chest.webp';
import { getDomHost } from '../../host/dom';
import { loadImage } from '../../dice3d/dieNumerals';

/**
 * The captcha's street squares, after reCAPTCHA's "select all images with a bus": every square its own street photo
 * (a random part of a public-domain photo, sources in THIRD_PARTY_NOTICES.md), with a mimic glued on badly in some
 * and a plain chest in others, each drawn at its own random size from nearly sharp to hopelessly blocky.
 */

/** A cut-out glued onto a square: where its middle sits and how wide it is, in shares of the square; its tilt. */
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

/** What one street square shows. */
export interface StreetScene {
  photo: string;
  /** The part of the photo shown: its top left corner and side, in shares of the photo. */
  cropX: number;
  cropY: number;
  cropSide: number;
  /** A mimic in a mimic's square; in a chest's square a plain chest or nothing. */
  sticker: Sticker | null;
  /** The width the square is drawn at before it is blown up: small is blocky. */
  pixels: number;
}

const PHOTOS = [busShelterCity, busShelterField, busStopBench, crossingButton, crossingIntersection, crossingLane, storefront] as const;
const MIMIC = { picture: mimicSticker, aspect: 110 / 148 } as const;
const CHEST = { picture: chestSticker, aspect: 90 / 148 } as const;
/** From nearly sharp to hopeless: a third of the squares are drawn 12 or 18 pixels wide. */
const PIXEL_WIDTHS = [12, 18, 28, 44, 70, 120] as const;
/** The share of chest squares that get a plain chest as a decoy. */
const DECOY_SHARE = 0.35;

const between = (random: () => number, low: number, high: number): number => low + random() * (high - low);
const pick = <T>(items: readonly T[], random: () => number): T => items[Math.floor(random() * items.length) % items.length]!;

function stickerOf(kind: typeof MIMIC | typeof CHEST, random: () => number): Sticker {
  return {
    picture: kind.picture,
    aspect: kind.aspect,
    // Now and then half out of the square.
    x: between(random, 0.15, 0.85),
    y: between(random, 0.35, 0.85),
    width: between(random, 0.25, 0.75),
    turn: between(random, -30, 30),
  };
}

/** A street square for a mimic's square (`mimic`) or a chest's. */
export function dealScene(mimic: boolean, random: () => number): StreetScene {
  const cropSide = between(random, 0.45, 1);
  return {
    photo: pick(PHOTOS, random),
    cropX: random() * (1 - cropSide),
    cropY: random() * (1 - cropSide),
    cropSide,
    sticker: mimic ? stickerOf(MIMIC, random) : random() < DECOY_SHARE ? stickerOf(CHEST, random) : null,
    pixels: pick(PIXEL_WIDTHS, random),
  };
}

/** The pictures a street square is drawn from, loaded once: every photo and both stickers. */
export type ScenePictures = ReadonlyMap<string, HTMLImageElement>;

let loading: Promise<ScenePictures> | null = null;

export function loadScenePictures(): Promise<ScenePictures> {
  loading ??= Promise.all([...PHOTOS, MIMIC.picture, CHEST.picture].map(async (url) => [url, await loadImage(url)] as const))
    .then((loaded) => new Map(loaded))
    .catch((error: unknown) => {
      loading = null;
      throw error;
    });
  return loading;
}

/** A street square as an image URL: its part of the photo with its sticker glued on, `pixels` wide; the bare photo where no canvas draws. */
export function drawScene(scene: StreetScene, pictures: ScenePictures): string {
  const photo = pictures.get(scene.photo);
  const size = scene.pixels;
  const canvas = getDomHost().createCanvas(undefined, { width: size, height: size });
  const context = canvas.getContext('2d');
  if (!context || !photo) return scene.photo;
  const side = scene.cropSide * photo.naturalWidth;
  context.drawImage(photo, scene.cropX * photo.naturalWidth, scene.cropY * photo.naturalHeight, side, side, 0, 0, size, size);
  const sticker = scene.sticker;
  const image = sticker && pictures.get(sticker.picture);
  if (sticker && image) {
    // Glued on badly: hard edges, no shadow, tilted, the size it happens to be.
    const width = sticker.width * size;
    context.save();
    context.translate(sticker.x * size, sticker.y * size);
    context.rotate((sticker.turn * Math.PI) / 180);
    context.drawImage(image, -width / 2, (-width * sticker.aspect) / 2, width, width * sticker.aspect);
    context.restore();
  }
  return canvas.toDataURL('image/png');
}
