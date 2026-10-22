import { COLOUR_PATTERN, MAX_COORDINATE, MAX_NAME, MAX_TOKEN_CELLS, MAX_TOKEN_SIZE, MAX_TOKENS, type AssetRef, type Claim, type SharedToken, type SnapGrid } from '../protocol/index.ts';
import { getTokenRingOuterDiameter } from '../../pixi/token-renderer/tokenRingMetrics';
import { computeTokenPixelSize, computeTokenStrokeWidth } from '../../pixi/token-renderer/tokenSizing';
import type { ShownRollToken } from '../../services/playerRollSource';
import type { TokenEntity } from '../../types';
import type { GridState } from '../../types/gridTypes';
import { tokenUIOf, type TokenRules } from './tokenUI.ts';

/** What the players' token list is made of. */
export interface PictureInputs {
  readonly tokens: Readonly<Record<string, TokenEntity>>;
  /** The tokens the players' frame shows (`playerRollTokens`): only these are sent. */
  readonly shown: ReadonlyMap<string, ShownRollToken>;
  /** The grid's cell size in world pixels, by which tokens are sized. */
  readonly gridSize: number;
  /** Whether players see token names (Atlas's nameplate setting for the player view); without, only player tokens' names are sent. */
  readonly showNames: boolean;
  /** What players may know of a token: a player token, or the GM's. */
  claimOf(tokenId: string, token: TokenEntity): Claim;
  /** The artwork at a vault path as players are sent it, or null while it is unknown or cannot be sent. */
  art(path: string): AssetRef | null;
  /** The random id players know a token by. */
  alias(tokenId: string): string;
  /** The map's resource and condition definitions, by which bars and condition badges are drawn. */
  readonly rules: TokenRules;
  /** The number of a token's instance badge as players number what they see, or null without one. */
  badge(tokenId: string): number | null;
  /** The tokens players are told hold the turn (`sharedTurnTokens`); none without. */
  readonly turn?: ReadonlySet<string>;
  /** The tokens that fight and may not move now, for they do not hold the turn (`movesOutOfTurn`); none without. */
  readonly held?: ReadonlySet<string>;
}

const WHITE = '#ffffff';

/** A colour as players are sent it: `#rrggbb` (a `#rgb` written out), or null for none or anything else. */
export function hexColour(colour: string | undefined): string | null {
  const value = (colour ?? '').trim().toLowerCase();
  const full = /^#[0-9a-f]{3}$/.test(value) ? `#${[...value.slice(1)].map((digit) => digit + digit).join('')}` : value;
  return COLOUR_PATTERN.test(full) ? full : null;
}

/** A ring colour as players are sent it: `#rrggbb`, white where the token names none or something else. */
export function ringColour(colour: string | undefined): string {
  return hexColour(colour) ?? WHITE;
}

/**
 * Whether players are sent a token's name: always for a player token or a token a player has (they pick
 * theirs by name), else only while Atlas shows players nameplates.
 */
export const nameSent = (claim: Claim, showNames: boolean): boolean => claim !== null || showNames;

/** A place as players are sent it: to a hundredth of a world pixel, finer than any screen shows; more digits only cost bytes. */
export const roundPlace = (value: number): number => Math.round(value * 100) / 100;

const finiteOr = (value: number | undefined, fallback: number): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
const onMap = (value: number): boolean => Number.isFinite(value) && Math.abs(value) <= MAX_COORDINATE;

/**
 * The tokens the players see, as the GM's map draws them: centre, artwork diameter, rotation,
 * artwork, name, ring, claim, instance badge and what Atlas's player window draws around a creature
 * (`tokenUIOf`), in drawing order (`layer`, the last on top; the topmost `MAX_TOKENS`). Nothing of a token the
 * players' frame does not show is read.
 */
export function sharedTokens(inputs: PictureInputs): SharedToken[] {
  const stroke = computeTokenStrokeWidth(inputs.gridSize);
  const shared: { readonly layer: number; readonly token: SharedToken }[] = [];
  for (const [id, shown] of inputs.shown) {
    const token = inputs.tokens[id];
    if (token === undefined || !onMap(token.x) || !onMap(token.y)) continue;
    const cells = finiteOr(token.size, 1) || 1;
    const size = computeTokenPixelSize(inputs.gridSize, cells);
    if (!(size > 0 && size <= MAX_TOKEN_SIZE && cells > 0 && cells <= MAX_TOKEN_CELLS)) continue;
    const claim = inputs.claimOf(id, token);
    const name = shown.name === null || !nameSent(claim, inputs.showNames) ? null : shown.name.slice(0, MAX_NAME);
    shared.push({
      layer: finiteOr(token.layer, 0),
      token: {
        id: inputs.alias(id),
        x: roundPlace(token.x),
        y: roundPlace(token.y),
        size,
        cells,
        rotation: ((finiteOr(token.rotation, 0) % 360) + 360) % 360,
        art: shown.imagePath === undefined ? null : inputs.art(shown.imagePath),
        name,
        ring: shown.showRing ? { colour: ringColour(shown.ringColor), size: getTokenRingOuterDiameter(size, stroke) } : null,
        claim,
        badge: inputs.badge(id),
        // Atlas's player window shows nameplates by its own setting alone, player tokens included.
        ui: tokenUIOf(token, inputs.rules, inputs.showNames && name !== null),
        ...(inputs.turn?.has(id) ? { turn: true as const } : {}),
        ...(inputs.held?.has(id) ? { held: true as const } : {}),
      },
    });
  }
  return shared.sort((a, b) => a.layer - b.layer).slice(-MAX_TOKENS).map(({ token }) => token);
}

/** The grid players' tokens snap to as Atlas's drop snaps them (`snapToGrid`, on unless switched off), or null. */
export function snapGridOf(grid: Pick<GridState, 'type' | 'size' | 'offsetX' | 'offsetY' | 'snapToGrid'> | null): SnapGrid | null {
  if (grid === null || !(grid.snapToGrid ?? true) || !onMap(grid.size) || !(grid.size > 0)) return null;
  const offsetX = finiteOr(grid.offsetX, 0);
  const offsetY = finiteOr(grid.offsetY, 0);
  if (!onMap(offsetX) || !onMap(offsetY)) return null;
  return { type: grid.type ?? 'square', size: grid.size, offsetX, offsetY };
}
