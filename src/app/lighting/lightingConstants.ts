import type { MapBounds } from '../vision/visibility';

/** Distances in the wall field are clamped here; sphere tracing never needs a longer step. */
export const FIELD_MAX = 128;
/** World pixels per texel of the world-space lighting textures on ordinary maps. */
export const BASE_TEXEL = 2;
/** Longest side of a world-space texture; larger maps get coarser texels. */
export const MAX_TEXELS = 4096;
/** Texels of the lighting's picture a grid cell spans at most (`pictureTexel`): a 70 px cell at `BASE_TEXEL` spans 35. */
export const CELL_TEXELS = 48;
/**
 * Farthest a light may reach, in world pixels: the side of the largest map lit at full
 * resolution. A light's tile is cut to the map, so the engine never traces more than this.
 */
export const MAX_LIGHT_REACH = MAX_TEXELS * BASE_TEXEL;
/**
 * Rays traced across a light's flame per tile texel in its penumbra, at most: the lower lighting
 * qualities trace fewer (`LightingQuality.tileRays`).
 */
export const TILE_RAYS = 32;
/**
 * Rays a moving light's tile traces across its flame (`EngineLight.moving`): its shadows are a
 * little harder while it moves, and the tile is traced in full once it rests. It keeps the
 * field's texels and is smoothed like any tile: traced on coarser texels and left unsmoothed,
 * a dragged torch showed stair steps along every wall and grainy shadows.
 */
export const MOVING_TILE_RAYS = 4;
/**
 * Most tile texels one draw traces. A light's tile is traced in bands of rows within this, each
 * handed to the driver on its own: Windows resets a graphics device whose draw runs for about two
 * seconds, and a torch's whole tile in one draw came close to that on integrated graphics, losing
 * every WebGL context of the window.
 */
export const TILE_BAND_TEXELS = 1 << 17;
/**
 * Largest radius, in texels, over which a traced tile is smoothed: it melts the steps between
 * ray counts into a ramp. Each texel smooths only within its wall clearance, so less near walls.
 */
export const TILE_SMOOTH = 4;
/**
 * Where a light ends in the picture, as a multiple of its dim radius: at it. The picture never
 * lights what the rules do not count (but for a texel of filtering), so a token on a floor that
 * looks lit is seen. Its tiles reach this far.
 */
export const LIGHT_REACH = 1;
/**
 * The fade: from its bright radius a light falls smoothly to nothing exactly at its dim radius,
 * so it sinks into the dark instead of stopping (Fabian, 2026-10-23: the light must never look
 * larger than what creatures see, and fade into blackness within it). A light bright to its end,
 * or nearly, still fades over at least this share of its dim radius.
 */
export const LIGHT_FADE_MIN = 0.3;
/**
 * The fade is shaped in what the eye sees, not in light (`FADE_GLSL`): the light itself falls as
 * that curve to this power, about the display's (sRGB is near a 2.4 power), so its brightness on
 * screen falls without a ring where the fade begins and without a step where it ends.
 */
export const FADE_POWER = 2.4;

/** The share of a light left at `distance` by its fade (`FADE_GLSL`, which this mirrors): 1 to where the fade begins, 0 from the dim radius on. */
export function lightFade(bright: number, dim: number, distance: number): number {
  const from = Math.min(bright, dim * (1 - LIGHT_FADE_MIN));
  const u = Math.min(1, Math.max(0, (dim - distance) / Math.max(dim - from, 1e-3)));
  return (u * (2 - u)) ** (1.5 * FADE_POWER);
}
/**
 * A sense with a range that shows the map (darkvision, a token's limited sight) fades in the
 * players' picture over this last share of its range, as light fades within its dim radius: what
 * it perceives is unchanged, the picture only darker towards its edge.
 */
export const SENSE_FADE = 0.4;
/**
 * How much light a light gives in its two ranges (HDR, before exposure): `bright` up to the
 * bright radius, `dim` from there to the dim radius, with a soft knee between them, and the
 * fade (`LIGHT_FADE_MIN`) over the dim range. The composite tonemaps a light at its bright level
 * and scales the result back, so a dim floor shows its share of the bright range on any floor.
 */
export const LIGHT_LEVELS = { bright: 1.25, dim: 0.4 } as const;
export const EXPOSURE = 0.9;
/**
 * How bright lights may make a floor together. They add up in the light map, as light does, but an
 * eye adapts: four torches held together do not make a floor four times as bright, and their sum
 * (bounce included) whitened the picture without end. So the composite takes the brightest light
 * at a point whole, as it would show alone (halo and all), and lets what the others add ease
 * towards `reach` of it: two equal lights together about a quarter brighter than one, any number
 * never more than a third.
 */
export const LIGHT_CEILING = { reach: 0.35 } as const;
/** Light colours are mixed this far towards white, so tinted light keeps the map readable. */
export const TINT_TO_WHITE = 0.5;
/** Smallest flame, as a share of the dim radius, so shadow edges never look cut out. */
export const MIN_SOFTNESS = 0.12;
/** Strength of the cool grey shift where the light is low and none of it a light's own (ambient, bounce). */
export const PURKINJE = 0.55;

/** How wide, in world pixels, a beam's sides fade at most: as wide as its far end fades. */
export function softEdge(dim: number): number {
  return LIGHT_FADE_MIN * dim;
}
/**
 * A light that shines one way gives its light inside its cone, where the rules count it, and
 * fades towards the cone's sides as towards its dim radius (`FADE_GLSL`), to nothing on them:
 * over its soft edge inside the cone (`softEdge`, a width, not an angle: an angle grows with the
 * distance), held to a share (`BEAM_EDGE`) of the beam's half-width at that distance
 * (`beamEdge`), so a narrow beam has narrow soft sides that widen with the distance, as a real
 * beam's penumbra does. A beam wider than a half turn leaves a dark wedge behind the light, and
 * the edge is held to that wedge's half-width instead. Its far end fades like any light's, and its
 * own space (the cone's apex), which is lit all around, fades to nothing at its radius.
 */
export const BEAM_EDGE = 0.25;
/** A beam's edge is never narrower than this many texels of the light map, where it is drawn: a narrower one shows the texels as steps. */
export const BEAM_EDGE_TEXELS = 1;

/**
 * The width of a beam's soft edge at `distance` from its light: `edge` (`softEdge`), and no more
 * than `BEAM_EDGE` of the half-width there of the beam of `angle` (radians), or of the dark wedge
 * behind it, but for the `BEAM_EDGE_TEXELS` it takes to draw it smoothly.
 */
export function beamEdge(edge: number, distance: number, angle: number, texel: number): number {
  return Math.min(edge, Math.max(BEAM_EDGE_TEXELS * texel, BEAM_EDGE * distance * Math.sin(Math.min(angle / 2, Math.PI - angle / 2))));
}


/**
 * A source of magical darkness swallows all light up to its radius; over the last `rim` world
 * pixels inside it (and no more than `rimShare` of its radius) the light comes back,
 * so its edge is soft and nothing beyond the radius is darkened. The rule counts the rim as dark:
 * it is kept narrow, since a wide one shows daylight where a token is hidden. `veil` is the faint cool tint (linear light) the players see in place of the map
 * there, to tell magical darkness from the unlit dark; `gmVeil` the stronger one the GM sees
 * over the dim map.
 */
export const DARKNESS = {
  rim: 6,
  rimShare: 0.08,
  veil: [0.003, 0.0026, 0.011],
  gmVeil: [0.03, 0.022, 0.085],
} as const;

/**
 * Reflected light: what a light's lit floor gives back into the shadows next to it, one bounce,
 * so a room round a corner from a torch is dimly lit and a token standing there is seen.
 * *Rule*: the floor along the edges of the light's shadows reflects; a point with a clear line to
 * such a point of the floor is in dim light while the whole way, light to floor to point, is no
 * longer than the light's dim range, and the second part no longer than `share` of it (where
 * the floor is brightly lit, less where it is less lit) or `cells` grid cells. So a light never
 * reaches past its own range, and the next room gets what of it is left. *Picture*: in the
 * light's colour at `level` (HDR) next to brightly lit floor it comes from (less next to less lit
 * floor), fading as a light does (`FADE_GLSL`) over the last `fade` of its reach to nothing
 * where the rule stops counting it, blurred within the free floor over `blur` of its longest
 * reach, so the points it is traced from show as one soft spill.
 */
export const REFLECTION = {
  share: 0.4,
  cells: 3,
  level: 0.4,
  fade: 0.6,
  blur: 0.1,
} as const;

export const BOUNCE = {
  probe: 16,
  interval: 16,
  /** Grid cell (world px) at which the bounce is built at `probe`: maps with larger cells build it as coarse per cell (`bounceScale`). */
  cell: 70,
  cascades: 4,
  emitTexel: 4,
  spread: 250,
  floorGain: 0.001,
  wallGain: 0.6,
  gain: 1,
  /** While lights change, bounce is rebuilt at most this often; a moving light's banded builds follow each other (`LightingWorld.animate`). */
  throttleMs: 100,
  /** Texels of cascade a frame draws of the bounce while a light moves (`RadianceCascades.step`). */
  movingTexels: 1 << 18,
} as const;

/**
 * Animated lights are redrawn at most this often, about 30 times a second: flicker walks step
 * every 45–120 ms and are interpolated in between. A little under two 60 Hz frames, so a frame
 * that comes early never waits for the next one.
 */
export const FLICKER_INTERVAL_MS = 30;

/**
 * A soft glow around each flame, drawn with the light so it stays inside its walls; an
 * image-space bloom would blur light across walls. `gain` is its peak on top of the falloff
 * (HDR), `size` its Gaussian sigma as a share of the bright radius.
 */
export const HALO = { gain: 0.8, size: 0.25 } as const;

/**
 * World pixels per texel for a map: 2 px, coarser on maps longer than 8,192 px, or than twice
 * `maxTexels` where the lighting quality holds its textures smaller (`LightingQuality`). The
 * rules always read the map at the default: what is sealed must not depend on the device.
 */
export function worldTexel(bounds: MapBounds, maxTexels = MAX_TEXELS): number {
  return Math.max(BASE_TEXEL, Math.max(bounds.width, bounds.height) / maxTexels);
}

/**
 * Walls are capsules this wide around their centre line: at least a texel's diagonal, so a
 * bilinear sample of a world texture never carries light past the centre line.
 */
export function wallRadius(texel: number): number {
  return Math.max(3, texel * Math.SQRT2 + 0.01);
}

/** Bilinear interpolation of a 1-Lipschitz field overestimates it by less than this. */
export function fieldMargin(texel: number): number {
  return texel * 0.75;
}

/**
 * Within this distance of a wall's centre line a pixel keeps its own light: closer in, the wall
 * field's gradient may point across the line.
 */
export function wallCore(texel: number): number {
  return 1.5 * texel;
}

/**
 * How far before a limited wall that stops it a light ends in the light map: as far as a solid
 * wall's capsule reaches for a trace, so the two look alike and no bilinear read of the light
 * map carries light across the wall's centre line.
 */
export function limitedMargin(texel: number): number {
  return wallRadius(texel) + fieldMargin(texel);
}

/**
 * Distance from a wall's centre line at which the light map is fully lit again: past the capsule
 * (tiles are lit wherever the trace clears it) and the light map's bilinear texel.
 */
export function wallBand(texel: number): number {
  return wallRadius(texel) + fieldMargin(texel) + texel;
}

/**
 * How far from its centre line a wall still changes a tile: smoothing reads a texel's clearance
 * up to `TILE_SMOOTH` texels, plus a texel for the bilinear field.
 */
export function tileWallReach(texel: number): number {
  return wallRadius(texel) + fieldMargin(texel) + (TILE_SMOOTH + 1) * texel;
}

/**
 * Wall ends closer than this to another wall are joined by a bridge, for light and sight
 * alike: wider than any gap the field closes by itself (two capsules with their bilinear
 * margin, plus the tile's contact fade), so light and sight always agree on what is closed.
 */
export function sealTolerance(texel: number): number {
  return 2 * (wallRadius(texel) + fieldMargin(texel)) + 2 * texel;
}

/**
 * Limited walls that run within this distance of each other without crossing are one hedge to
 * a ray that meets both there: the seal tolerance of a map at the base texel, so hedge ends
 * the sealing joins, drawn short of each other or past each other, count once.
 */
export const LIMITED_JOIN = sealTolerance(BASE_TEXEL);
