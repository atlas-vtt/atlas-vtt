import { buildArtScene, type ArtFrame, type ArtScene } from './art/artScene';
import { standsOf } from './art/stands';
import { paintEngraved } from './engraved/painter';
import type { RenderEnv } from './renderEnv';
import { isDarkColour } from './stone/colours';
import { paintStone } from './stone/painter';
import type { ArtDirection } from '../style';

const PAINTERS: Record<ArtDirection, (scene: ArtScene) => void> = { stone: paintStone, engraved: paintEngraved };

/**
 * The floor plan of one floor in the look's direction (`DungeonStyle.direction`): the scene's
 * fields are worked out once for the frame, then the direction paints. The context is in cells;
 * the paper is the caller's. Without `pictures` (or on a context that cannot draw them) only what
 * an SVG can hold is drawn.
 */
export function drawDungeon(env: RenderEnv, frame: ArtFrame, pictures = true): void {
  const scene = buildArtScene(env, frame, standsOf(env), isDarkColour(env.palette.floor), pictures);
  PAINTERS[env.style.direction](scene);
}
