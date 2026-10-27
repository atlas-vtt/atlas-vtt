import { Container, type Ticker } from 'pixi.js';
import { turnKey, currentTurn, turnTokenIds } from '../../../initiative/turnHolders';
import type { TokenEntity } from '../../../types';
import type { GridState } from '../../../types/gridTypes';
import type { InitiativeState } from '../../../types/initiativeTypes';
import type { TokenSeen } from '../../../vision/measureOrigin';
import { mapTokens, sceneTokens, type TokenHolder } from '../../../tokens/offMap';
import { everyLevelObjects, levelObjects } from '../../../levels/levelObjects';
import type { LevelView } from '../../../levels/sceneLevels';
import { MAP_LAYER_Z } from '../../mapLayerOrder';
import type { LayerVisibility } from '../../playerSafeFrame';
import { destroyTree } from '../../utils/destroyTree';
import { getTokenRingOuterDiameter } from '../tokenRingMetrics';
import { computeTokenStrokeWidth, restingTokenUIScale } from '../tokenSizing';
import type { TokenGroupContainer } from '../types';
import { TurnMarker } from './TurnMarker';
import { FLASH } from './turnMarkerShape';
import { TurnTextures } from './turnTextures';

/** What the markers read of a view's store. */
/** What the flashes read of a view's state; of a scene with levels, only the tokens on the level shown flash. */
export interface TurnMarkerState extends LevelView {
  readonly initiative: Pick<InitiativeState, 'isActive' | 'round' | 'entries' | 'sides'>;
  readonly objects: TokenHolder<TokenEntity>;
  readonly grid?: Pick<GridState, 'size'> | null | undefined;
  readonly isMapLoading?: boolean | undefined;
}

export interface TurnMarkerDeps {
  /** The world the flashes stand in (the viewport). */
  readonly parent: Container;
  getState(): TurnMarkerState;
  subscribe(listener: (state: TurnMarkerState) => void): () => void;
  /** The sprite of a token on the map, or null for one without (beside the map, not loaded yet). */
  spriteOf(tokenId: string): TokenGroupContainer | null;
  /** The ticker the flashes run and follow their tokens by. */
  ticker(): Ticker | null;
  reducedMotion(): boolean;
  /** The entry ids of the defeated combatants, which hold no turn of their side; none without. */
  defeated?(state: TurnMarkerState): ReadonlySet<string>;
  /** Whether the renderer has alpha masks to keep the spotlight off the art (PIXI's Canvas renderer has none); yes without. */
  canMask?(): boolean;
  /** The time in milliseconds; `performance.now` without. */
  now?(): number;
}

/**
 * The flash on each token whose turn begins in a running fight (`turnTokenIds`): drawn above the
 * lighting and below the tokens' bars and the selection, it swells in, holds a moment and fades
 * away (a plain fade with reduced motion), following its token meanwhile; then it is gone, and the
 * ticker does nothing more. A turn begins when the turn's holder or round changes (`turnKey`): not
 * on the first look at a running fight, during a load, or on a change that keeps the holder. A
 * combatant beside the map gets none, and a token that loses the turn loses its flash at once.
 * What the players see of it is `playerLayers`, and pictures of the scene show none.
 */
export class TurnMarkers {
  /** The layer every flash stands in. */
  readonly layer = new Container({ label: 'turnMarkers', eventMode: 'none', zIndex: MAP_LAYER_Z.turn });
  private readonly markers = new Map<string, TurnMarker>();
  private readonly unsubscribe: () => void;
  private readonly textures = new TurnTextures();
  private following: Ticker | null = null;
  private shownKey: string | null = null;
  private last: TurnMarkerState | null = null;

  constructor(private readonly deps: TurnMarkerDeps) {
    deps.parent.addChild(this.layer);
    this.unsubscribe = deps.subscribe((state) => this.sync(state));
    this.sync(deps.getState(), false);
  }

  /** The tokens flashing now. */
  get tokenIds(): string[] {
    return [...this.markers.keys()];
  }

  /** Runs the flashes by the ticker there is now (the app's, once the renderer has one). */
  followTicker(): void {
    if (this.markers.size > 0) this.startFollowing();
  }

  /** Works the turn out again: the collection's resources, which say who is defeated, may have changed. */
  refresh(): void {
    this.last = null;
    this.sync(this.deps.getState());
  }

  /**
   * Whether the canvas shows the flashes. While it shows the players' view (session view, the peek,
   * the palette's player mode) it shows them only where the players are shown their initiative list.
   */
  showOnCanvas(shown: boolean): void {
    if (this.layer.visible !== shown) this.layer.visible = shown;
  }

  /**
   * The flashes in the players' frame: only on tokens they see (`seen`: not hidden, seen, not under
   * fog), and none while their initiative list is not shown (`shown`), each as strong as on the
   * canvas; the GM's translucency of a hidden token is no concern of theirs.
   */
  playerLayers(seen: TokenSeen, shown: boolean): LayerVisibility[] {
    return [
      { layer: this.layer, visible: shown },
      ...[...this.markers].flatMap(([tokenId, marker]) => marker.playerLayers(shown && seen(tokenId))),
    ];
  }

  /** A picture of the scene shows no flash. */
  pictureLayers(): LayerVisibility[] {
    return [{ layer: this.layer, visible: false }];
  }

  destroy(): void {
    this.unsubscribe();
    this.stopFollowing();
    for (const marker of this.markers.values()) marker.destroy();
    this.markers.clear();
    this.textures.destroy();
    destroyTree(this.layer);
  }

  private now(): number {
    return this.deps.now?.() ?? performance.now();
  }

  private sync(state: TurnMarkerState, animate = true): void {
    const previous = this.last;
    this.last = state;
    const scene = sceneTokens(everyLevelObjects(state));
    const onMap = mapTokens(levelObjects(state));
    if (previous && previous.initiative === state.initiative && sceneTokens(everyLevelObjects(previous)) === scene && mapTokens(levelObjects(previous)) === onMap && previous.grid === state.grid) return;
    const turn = currentTurn(state.initiative);
    const key = turn ? turnKey(turn) : null;
    // Sides are read off every combatant's token; only those on the map, on the level shown, flash
    const ids = new Set(turnTokenIds(state.initiative, scene, this.deps.defeated?.(state)).filter((tokenId) => onMap[tokenId] !== undefined));
    const began = key !== null && key !== this.shownKey && animate && !state.isMapLoading;
    this.shownKey = key;
    for (const [tokenId, marker] of this.markers) {
      if (!ids.has(tokenId)) this.remove(tokenId, marker);
    }
    if (began) for (const tokenId of ids) this.flash(tokenId);
    if (this.markers.size > 0) this.startFollowing();
    else this.stopFollowing();
  }

  private flash(tokenId: string): void {
    const now = this.now();
    let marker = this.markers.get(tokenId);
    if (marker) {
      marker.restart(now);
    } else {
      marker = new TurnMarker(this.textures, this.deps.reducedMotion() ? FLASH.reduced : FLASH.full, now);
      this.markers.set(tokenId, marker);
      this.layer.addChild(marker.view);
    }
    this.place(tokenId, marker);
  }

  private remove(tokenId: string, marker: TurnMarker): void {
    marker.destroy();
    this.markers.delete(tokenId);
  }

  /** Draws the flash for its token as the map shows it now and puts it in the token's place. */
  private place(tokenId: string, marker: TurnMarker): void {
    const sprite = this.deps.spriteOf(tokenId);
    const state = this.deps.getState();
    const gridSize = state.grid?.size ?? 70;
    const token = mapTokens(levelObjects(state))[tokenId];
    const size = sprite?.tokenSize ?? 0;
    if (sprite && token && size > 0) {
      // The ring as drawn, which the scene's ring size may have scaled: the selection reads it so too
      const outer = token.showRing === false
        ? size
        : (sprite.getChildByLabel('tokenRing')?.width || getTokenRingOuterDiameter(size, computeTokenStrokeWidth(gridSize)));
      marker.draw(outer / 2, restingTokenUIScale(gridSize), this.deps.parent.scale.x || 1);
      marker.keepOffArt(this.deps.canMask?.() ?? true);
    }
    marker.follow(sprite);
  }

  /** Each frame the flashes run on and take their tokens' places, visibility and size; one that has faded goes. */
  private readonly followAll = (): void => {
    const now = this.now();
    for (const [tokenId, marker] of this.markers) {
      if (marker.advance(now)) this.place(tokenId, marker);
      else this.remove(tokenId, marker);
    }
    if (this.markers.size === 0) this.stopFollowing();
  };

  private startFollowing(): void {
    const ticker = this.deps.ticker();
    if (this.following === ticker) return;
    this.stopFollowing();
    ticker?.add(this.followAll);
    this.following = ticker;
  }

  private stopFollowing(): void {
    this.following?.remove(this.followAll);
    this.following = null;
  }
}
