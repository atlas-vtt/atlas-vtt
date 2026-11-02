/**
 * Seeing a level below through the openings of the level a view shows (`LevelStack`). Looking down
 * through an opening shows the floor under it: what the viewed level's tokens see there is their
 * line of sight on their own level, cut by their own walls, kept only where the stack shows the
 * level below. The level below's walls rise to the floor above and stop nothing of that view.
 * Its own tokens see it with its own walls, as on any level. The light at a point below is that
 * level's own: its ambient light, zones, lights and darkness.
 */

import type { FogCoverage } from '../fog/fogCoverage';
import { shownAt, type LevelStack } from '../levels/levelStack';
import type { TokenEntity } from '../types';
import type { Point } from '../types/visionTypes';
import { lightLevelAt } from './lightLevels';
import { perceive, type PerceivedTarget, type Perception, type PerceptionOptions } from './perception';
import { SEES_ALL, type AmbientLight, type LightReach, type Sight } from './sight';
import { tokenPerception, type PerceptionMemo, type TokenPerception } from './tokenPerception';

/**
 * What is seen of a level below: the viewed level's regions that have a line of sight (a sense
 * that walls stop: only those look down through an opening; one that senses through walls stays
 * on its own level), and the level's own regions. Everything while the viewed level sees all.
 */
export function sightBelow(viewed: Sight, own: Sight): Sight {
  if (viewed.all) return SEES_ALL;
  return { all: false, regions: [...viewed.regions.filter((region) => region.polygon !== null), ...own.regions] };
}

/** `sightBelow`, the same object while both sights are: whoever compares sights (`PerceptionMemo`, the engine) finds it unchanged. */
export class SightBelow {
  private last: { viewed: Sight; own: Sight; sight: Sight } | null = null;

  of(viewed: Sight, own: Sight): Sight {
    if (this.last?.viewed !== viewed || this.last.own !== own) this.last = { viewed, own, sight: sightBelow(viewed, own) };
    return this.last.sight;
  }
}

/** A level below as the rules read it from a view above: where the stack shows it, what is seen of it, and its light. */
export interface BelowSight {
  stack: LevelStack;
  /** The level's index in the stack (1: the nearest level below drawn). */
  index: number;
  /** `sightBelow` of the view's sight and the level's own. */
  sight: Sight;
  ambient: AmbientLight;
  reaches: readonly LightReach[];
}

/** How something at `p` on a level below is perceived from the view above: not at all where the stack does not show that level. */
export function perceiveBelow(p: Point, below: BelowSight, target: PerceivedTarget = {}): Perception {
  if (shownAt(below.stack, p) !== below.index) return 'unseen';
  return perceive(p, below.sight, () => lightLevelAt(p, below.ambient, below.reaches), target);
}

/** The committed fog over a level: null where its geometry cannot be read, which hides everything. */
export type FogCover = FogCoverage | null | undefined;

/**
 * How the players perceive each token of a level below, at its centre: unseen where the stack does
 * not show that level, else as `tokenPerception` with the sight below and that level's light (its
 * party tokens are seen there), and unseen where the committed fog of the viewed level or of the
 * level below covers it, or a roof the players' picture draws there (`roofed`: the viewed level's, the level's own).
 */
export function belowTokenPerception(
  below: BelowSight,
  tokens: Record<string, TokenEntity>,
  fog: { viewed: FogCover; below: FogCover },
  options?: PerceptionOptions,
  memo?: PerceptionMemo,
  roofed?: (at: Point) => boolean,
): TokenPerception {
  const perceived = tokenPerception(below.sight, below.ambient, below.reaches, tokens, options, memo);
  const covered = (cover: FogCover, at: Point): boolean => cover === null || (!!cover && cover.covers(at));
  return (tokenId) => {
    const token = tokens[tokenId];
    if (!token) return 'unseen';
    const at = { x: token.x, y: token.y };
    if (shownAt(below.stack, at) !== below.index) return 'unseen';
    if (covered(fog.viewed, at) || covered(fog.below, at) || roofed?.(at)) return 'unseen';
    return perceived(tokenId);
  };
}
