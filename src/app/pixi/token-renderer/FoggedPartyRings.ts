import { Container, Graphics } from 'pixi.js';
import { fogSparesToken } from '../../characters/partyTokens';
import { subscribePlayerTokens } from '../../characters/playerTokens';
import { levelObjects, type LevelObjectsState } from '../../levels/levelObjects';
import { mapTokens } from '../../tokens/offMap';
import { canvasBadgeTheme } from '../utils/canvasBadgeColors';
import type { FogCoverage } from '../../fog/fogCoverage';
import type { TokenEntity } from '../../types';
import { MAP_LAYER_Z } from '../mapLayerOrder';
import { destroyTree } from '../utils/destroyTree';

/** What the rings are drawn from, read on every update. */
export interface FoggedPartySource {
  /** The tokens of the level shown. */
  tokens(): Readonly<Record<string, TokenEntity>>;
  /** The committed fog, or null while there is none to read. */
  coverage(): FogCoverage | null;
  /** The grid's cell size in world pixels, which a token's size counts in. */
  cellSize(): number;
  /** The ring's colour where a token has no ring colour of its own. */
  accent(): number;
}

/** How far the ring stands outside the token, and its stroke, in shares of the token's diameter. */
const OUTSET = 0.08;
const STROKE = 0.05;
const HALO = 0.14;

const parseColour = (colour: string | undefined, fallback: number): number => {
  const match = colour === undefined ? null : /^#([0-9a-f]{6})$/i.exec(colour);
  return match?.[1] === undefined ? fallback : Number.parseInt(match[1], 16);
};

/**
 * A ring above the fog around every party token committed fog covers (`fogSparesToken`), so everyone at
 * the table sees where the party stands though the fog hides the token: the GM's canvas, the player window
 * and its frames alike (a layer of the map above the fog, `MAP_LAYER_Z.foggedParty`, in no GM-only list).
 * Online pages draw their own over the tokens they are sent under their fog. Drawn anew only when what it
 * shows changed: which tokens, where, how large, in which colour.
 */
export class FoggedPartyRings {
  readonly view = new Container({ label: 'foggedPartyRings', zIndex: MAP_LAYER_Z.foggedParty, eventMode: 'none' });
  private readonly graphics = new Graphics();
  private drawn = '[]';

  constructor(private readonly source: FoggedPartySource) {
    this.view.addChild(this.graphics);
  }

  /** Looks again at the tokens and the fog; returns whether the picture changed. */
  update(): boolean {
    const coverage = this.source.coverage();
    const cell = this.source.cellSize();
    const accent = this.source.accent();
    const rings = coverage === null || coverage.shape.length === 0 ? [] : Object.values(this.source.tokens()).flatMap((token) => {
      if (!Number.isFinite(token.x) || !Number.isFinite(token.y) || !fogSparesToken(token) || !coverage.covers(token)) return [];
      const diameter = (token.size || 1) * cell;
      return [{ x: token.x, y: token.y, diameter, colour: parseColour(token.ringColor, accent) }];
    });
    const key = JSON.stringify(rings);
    if (key === this.drawn) return false;
    this.drawn = key;
    this.graphics.clear();
    for (const { x, y, diameter, colour } of rings) {
      const radius = diameter * (0.5 + OUTSET);
      this.graphics.circle(x, y, radius).stroke({ width: diameter * HALO, color: colour, alpha: 0.22 });
      this.graphics.circle(x, y, radius).stroke({ width: diameter * STROKE, color: colour, alpha: 0.95 });
      this.graphics.circle(x, y, diameter * 0.5).fill({ color: colour, alpha: 0.12 });
    }
    return true;
  }

  destroy(): void {
    destroyTree(this.view);
  }
}

/** What the rings read of a view's store. */
interface RingStore {
  getState(): LevelObjectsState<{ tokens: Record<string, TokenEntity> }> & { grid?: { size?: number } | null };
  subscribe(listener: () => void): () => void;
}

/**
 * Puts the rings on `viewport` and keeps them following the store (tokens, fog, grid, the level shown) and
 * which tokens are the players' (the library, the played campaign); returns what takes them away again.
 */
export function installFoggedPartyRings(viewport: Container, store: RingStore, coverage: () => FogCoverage | null): () => void {
  const rings = new FoggedPartyRings({
    tokens: () => mapTokens(levelObjects(store.getState())),
    coverage,
    cellSize: () => store.getState().grid?.size ?? 70,
    accent: () => canvasBadgeTheme().accent,
  });
  viewport.addChild(rings.view);
  const update = (): void => void rings.update();
  const stops = [store.subscribe(update), subscribePlayerTokens(update)];
  update();
  return () => {
    for (const stop of stops) stop();
    rings.destroy();
  };
}
