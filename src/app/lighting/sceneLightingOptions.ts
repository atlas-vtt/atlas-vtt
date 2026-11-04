import { DEFAULT_SCENE_LIGHTING, type DarkSightLook, type SceneLighting } from '../types/lightingTypes';
import { isRecord } from '../utils/guards';
import { isHexColor } from '../utils/hexColor';

/** Ambient light from which everything in sight counts as lit, when the scene sets none. */
export const DEFAULT_LIT_THRESHOLD = 0.25;
/** Ambient light from which the scene is brightly lit, when it sets none: dusk (0.5) is dim, day bright. */
export const DEFAULT_BRIGHT_THRESHOLD = 0.75;
/** Ambient light without a tint. */
export const DEFAULT_AMBIENT_COLOR = '#ffffff';
/** Remembered areas keep the map's own (dimmed, desaturated) colours. */
export const DEFAULT_EXPLORED_COLOR = '#ffffff';
export const DEFAULT_UNEXPLORED_COLOR = '#000000';
/** The looks a scene may give what its tokens perceive without light and without colour. */
export const DARK_SIGHT_LOOKS: readonly DarkSightLook[] = ['system', 'grey', 'colour'];

/**
 * The scene options the composite draws with; the others decide what is seen and recorded. The
 * thresholds are among them: where dim light is perceived as bright, dim ambient light is raised.
 */
export type SceneLook = Pick<SceneLighting, 'ambient' | 'ambientColor' | 'exploredMemory' | 'exploredColor' | 'unexploredColor' | 'litThreshold' | 'brightThreshold' | 'darkSightLook' | 'darkSightTint'>;

export function tokenVisionOn(lighting: Pick<SceneLighting, 'tokenVision'>): boolean {
  return lighting.tokenVision !== false;
}

export function exploredMemoryOn(lighting: Pick<SceneLighting, 'exploredMemory'>): boolean {
  return lighting.exploredMemory !== false;
}

/** Sight and light wait for the drop of a dragged token only where the scene asks for it; unset, they follow the drag. */
export function sightOnDropOn(lighting: Pick<SceneLighting, 'sightOnDrop'>): boolean {
  return lighting.sightOnDrop === true;
}

/** A scene has explored memory to edit by hand while it is lit and remembers. */
export function exploredMemoryEditable(lighting: Pick<SceneLighting, 'enabled' | 'exploredMemory'>): boolean {
  return lighting.enabled && exploredMemoryOn(lighting);
}

function isDarkSightLook(value: unknown): value is DarkSightLook {
  return DARK_SIGHT_LOOKS.some((look) => look === value);
}

/** How the scene draws senses with a look without colour: its own choice, or as the game system says. */
export function darkSightLookOf(lighting: Pick<SceneLighting, 'darkSightLook'>): DarkSightLook {
  return isDarkSightLook(lighting.darkSightLook) ? lighting.darkSightLook : 'system';
}

/** The tint the scene gives that picture, or null when it sets none it could draw. */
export function darkSightTintOf(lighting: Pick<SceneLighting, 'darkSightTint'>): string | null {
  return isHexColor(lighting.darkSightTint) ? lighting.darkSightTint : null;
}

/**
 * Whether two lightings give the GM a different picture of the scene: lighting on or off, the
 * ambient light, token vision (what no token sees is faded) and how darkvision looks. The other
 * options change only what the players see and what is recorded.
 */
export function gmPictureDiffers(a: SceneLighting, b: SceneLighting): boolean {
  if (a === b) return false;
  return a.enabled !== b.enabled || a.ambient !== b.ambient || a.ambientColor !== b.ambientColor || tokenVisionOn(a) !== tokenVisionOn(b)
    || darkSightLookOf(a) !== darkSightLookOf(b) || darkSightTintOf(a) !== darkSightTintOf(b);
}

/** A threshold within 0..1; anything that is not a number falls back to the default. */
export function clampLitThreshold(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : DEFAULT_LIT_THRESHOLD;
}

export function litThresholdOf(lighting: Pick<SceneLighting, 'litThreshold'>): number {
  return lighting.litThreshold === undefined ? DEFAULT_LIT_THRESHOLD : clampLitThreshold(lighting.litThreshold);
}

/**
 * Ambient light from which the scene is brightly lit, dimly below it down to the lit threshold:
 * the scene's own, or the default when it sets none or something that is not a number, kept
 * between the lit threshold and 1.
 */
export function brightThresholdOf(lighting: Pick<SceneLighting, 'litThreshold' | 'brightThreshold'>): number {
  const bright = lighting.brightThreshold;
  const wanted = bright === undefined || !Number.isFinite(bright) ? DEFAULT_BRIGHT_THRESHOLD : bright;
  return Math.min(1, Math.max(litThresholdOf(lighting), wanted));
}

/** The options `lighting` sets for the composite; unset ones stay unset, so the composite keeps its defaults. */
export function sceneLook({ ambient, ambientColor, exploredMemory, exploredColor, unexploredColor, litThreshold, brightThreshold, darkSightLook, darkSightTint }: SceneLighting): SceneLook {
  return {
    ambient,
    ...(ambientColor !== undefined && { ambientColor }),
    ...(exploredMemory !== undefined && { exploredMemory }),
    ...(exploredColor !== undefined && { exploredColor }),
    ...(unexploredColor !== undefined && { unexploredColor }),
    ...(litThreshold !== undefined && { litThreshold }),
    ...(brightThreshold !== undefined && { brightThreshold }),
    ...(darkSightLook !== undefined && { darkSightLook }),
    ...(darkSightTint !== undefined && { darkSightTint }),
  };
}

const COLOR_FIELDS = ['ambientColor', 'exploredColor', 'unexploredColor', 'darkSightTint'] as const;

/**
 * A scene's lighting as loaded from its map file: missing fields take their defaults, and a colour
 * that is not `#rrggbb` (a hand edit) is dropped, since the composite could not read it; so is a
 * darkvision look that is none of `DARK_SIGHT_LOOKS`.
 */
export function readSceneLighting(saved: unknown): SceneLighting {
  const lighting: SceneLighting = { ...DEFAULT_SCENE_LIGHTING, ...(isRecord(saved) ? saved : {}) };
  for (const field of COLOR_FIELDS) {
    if (field in lighting && !isHexColor(lighting[field])) delete lighting[field];
  }
  if ('darkSightLook' in lighting && !isDarkSightLook(lighting.darkSightLook)) delete lighting.darkSightLook;
  return lighting;
}
