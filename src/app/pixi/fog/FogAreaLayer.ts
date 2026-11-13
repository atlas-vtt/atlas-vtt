/**
 * The fog areas of the level shown, as the GM sees them with any tool: a badge on each (an eye
 * while it is revealed, struck through while it is hidden), its name beside the badge the
 * pointer is on, and the areas' outlines while the fog tool is chosen (the one pointed at with
 * any tool). Badges keep their size on screen; a revealed area's keeps back outside the fog
 * tool (`quiet`). Nothing of it is the players': the layer hides
 * while the canvas shows their view, and their frame and a picture of the scene leave it out.
 */
import { Container, Graphics, Sprite } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { areaBadgeSpot, areaIsHidden, areaName, areaOutline, fogAreaList, type FogArea } from '../../fog/fogAreas';
import { isFogTool } from '../../fog/fogToolChoices';
import type { ViewAtlasState, ViewAtlasStore } from '../../storeFactory';
import type { Point } from '../../types/visionTypes';
import { canvasBadgeTheme, type CanvasBadgeTheme } from '../utils/canvasBadgeColors';
import { destroyTree } from '../utils/destroyTree';
import { mapMarkerScale } from '../utils/mapMarkerScale';
import { FogAreaName } from './FogAreaName';
import { drawFogBadge, FOG_BADGE_GLYPH_SIZE, FOG_BADGE_QUIET, fogBadgeAt, FogBadgeGlyphs, sameBadgeLook, type FogBadgeLook } from './fogAreaBadge';
import { drawAreaOutlines, type AreaOutline } from './fogAreaOutlines';
import { viewedFog } from './FogPicture';

/** Above the fog's picture (999), below the outline, ring and guide of a stroke under way (1001 and up). */
export const FOG_AREAS_Z_INDEX = 1000;

interface Badge {
  readonly view: Container;
  readonly disc: Graphics;
  glyph: Sprite | null;
  /** The area it was placed for: another object is another outline, name or state. */
  area: FogArea;
  spot: Point;
  /** How it was last drawn, and in which theme; null before its first drawing. */
  look: FogBadgeLook | null;
  theme: CanvasBadgeTheme;
}

export interface FogAreaLayerDeps {
  readonly viewport: Viewport;
  readonly store: Pick<ViewAtlasStore, 'getState' | 'subscribe'>;
  /**
   * Whether the canvas shows the players' view though the store's view switches say the GM's (a
   * peek); null where nobody can say yet.
   */
  readonly showsPlayers?: () => boolean | null;
  readonly readTheme?: () => CanvasBadgeTheme;
}

function sameTheme(a: CanvasBadgeTheme, b: CanvasBadgeTheme): boolean {
  return a.background === b.background && a.stroke === b.stroke && a.accent === b.accent;
}

export class FogAreaLayer {
  readonly view = new Container({ label: 'fog-areas', zIndex: FOG_AREAS_Z_INDEX, eventMode: 'none', interactiveChildren: false, visible: false });
  private readonly outlines = new Graphics();
  private readonly badgeLayer = new Container({ label: 'fog-area-badges' });
  private readonly badges = new Map<string, Badge>();
  private readonly glyphs = new FogBadgeGlyphs();
  /** Made with the first name shown. */
  private name: FogAreaName | null = null;
  private readonly readTheme: () => CanvasBadgeTheme;
  private theme: CanvasBadgeTheme;
  private readonly themeObserver: MutationObserver;
  private readonly unsubscribe: () => void;
  private areas: readonly FogArea[] = [];
  private hovered: string | null = null;
  /** What the outlines were last drawn for. */
  private outlined: { areas: readonly FogArea[]; all: boolean; hovered: string | null; zoom: number; accent: number } | null = null;
  private outlinesPending = false;
  private outlinesDrawn = false;

  private readonly onZoom = (): void => {
    if (!this.view.visible) return;
    for (const badge of this.badges.values()) this.place(badge);
    this.showName();
    this.scheduleOutlines();
  };

  private readonly flushOutlines = (): void => {
    this.outlinesPending = false;
    if (this.view.visible) this.drawOutlines();
  };

  constructor(private readonly deps: FogAreaLayerDeps) {
    this.readTheme = deps.readTheme ?? canvasBadgeTheme;
    this.theme = this.readTheme();
    this.outlines.eventMode = 'none';
    this.view.addChild(this.outlines, this.badgeLayer);
    deps.viewport.on('zoomed', this.onZoom);
    deps.viewport.on('zoomed-end', this.onZoom);
    this.unsubscribe = deps.store.subscribe((state, previous) => {
      if (
        viewedFog(state) !== viewedFog(previous)
        || state.activeTool !== previous.activeTool
        || state.isMapLoading !== previous.isMapLoading
        || state.isGMView !== previous.isGMView
        || state.isPlayerView !== previous.isPlayerView
      ) this.sync();
    });
    // The badges and the accent follow the theme, like the pins.
    this.themeObserver = new MutationObserver(() => {
      const theme = this.readTheme();
      if (sameTheme(theme, this.theme)) return;
      this.theme = theme;
      this.sync();
    });
    this.themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    this.sync();
  }

  /** The canvas shows another view (the GM's, or the players'): the layer shows or hides. */
  refreshVisibility(): void {
    this.sync();
  }

  /** The area whose badge is at the world point, while the badges show; null over none. */
  hitTest(x: number, y: number): string | null {
    if (!this.view.visible) return null;
    return fogBadgeAt(this.spots(), { x, y }, this.zoom());
  }

  /** The badge the pointer is on (null: none): its ring is lit, and its name and its area's outline show. */
  setHovered(areaId: string | null): void {
    const hovered = areaId !== null && this.badges.has(areaId) ? areaId : null;
    if (hovered === this.hovered) return;
    this.hovered = hovered;
    this.sync();
  }

  /** Whether area `id` shows a badge and is revealed. */
  isRevealed(id: string): boolean {
    const badge = this.badges.get(id);
    return badge !== undefined && !areaIsHidden(badge.area);
  }

  /** Where the badge of area `id` sits in the world, or null where it has none. */
  badgeSpot(id: string): Point | null {
    return this.badges.get(id)?.spot ?? null;
  }

  destroy(): void {
    this.unsubscribe();
    this.themeObserver.disconnect();
    this.deps.viewport.off('zoomed', this.onZoom);
    this.deps.viewport.off('zoomed-end', this.onZoom);
    this.deps.viewport.options.ticker?.remove(this.flushOutlines);
    this.badges.clear();
    if (!this.view.destroyed) destroyTree(this.view);
    this.glyphs.destroy();
  }

  private zoom(): number {
    const zoom = this.deps.viewport.scale.x;
    return Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  }

  private *spots(): Generator<readonly [string, Point, number]> {
    for (const [id, badge] of this.badges) yield [id, badge.spot, this.quiet(badge) ? FOG_BADGE_QUIET.scale : 1];
  }

  /**
   * A revealed area's badge keeps back while another tool than the fog tool is chosen: smaller
   * and dimmer than a hidden area's, which is the one the table waits for.
   */
  private quiet(badge: Badge): boolean {
    return !areaIsHidden(badge.area) && !isFogTool(this.deps.store.getState().activeTool);
  }

  /** Whether the canvas shows the GM's view of a loaded scene: only then are the areas marked. */
  private shown(state: ViewAtlasState): boolean {
    if (state.isMapLoading || !state.isGMView || state.isPlayerView === true) return false;
    return this.deps.showsPlayers?.() !== true;
  }

  private sync(): void {
    const state = this.deps.store.getState();
    // While the canvas shows the players' view the badges wait as they are: a peek ends, and they are back.
    if (!this.shown(state)) {
      this.view.visible = false;
      this.hovered = null;
      return;
    }
    const areas = fogAreaList(viewedFog(state));
    if (areas !== this.areas) this.syncBadges(areas);
    this.view.visible = this.badges.size > 0;
    if (!this.view.visible) return;
    for (const badge of this.badges.values()) {
      // The zoom may have changed while the layer was hidden.
      this.place(badge);
      this.look(badge);
    }
    this.showName();
    this.drawOutlines();
  }

  private syncBadges(areas: readonly FogArea[]): void {
    this.areas = areas;
    const kept = new Set<string>();
    for (const area of areas) {
      const known = this.badges.get(area.id);
      if (known?.area === area) {
        kept.add(area.id);
        continue;
      }
      // An area that encloses nothing has no place for a badge.
      const spot = areaBadgeSpot(area);
      if (!spot) continue;
      kept.add(area.id);
      const badge = known ?? this.create(area, spot);
      badge.area = area;
      badge.spot = spot;
      this.place(badge);
    }
    for (const [id, badge] of this.badges) {
      if (kept.has(id)) continue;
      destroyTree(badge.view);
      this.badges.delete(id);
    }
    if (this.hovered !== null && !this.badges.has(this.hovered)) this.hovered = null;
  }

  private create(area: FogArea, spot: Point): Badge {
    const view = this.badgeLayer.addChild(new Container());
    const badge: Badge = { view, disc: view.addChild(new Graphics()), glyph: null, area, spot, look: null, theme: this.theme };
    this.badges.set(area.id, badge);
    return badge;
  }

  private place(badge: Badge): void {
    const quiet = this.quiet(badge);
    badge.view.position.set(badge.spot.x, badge.spot.y);
    badge.view.scale.set(mapMarkerScale(this.zoom()) * (quiet ? FOG_BADGE_QUIET.scale : 1));
    // The badge pointed at shows whole, whatever it is.
    badge.view.alpha = quiet && this.hovered !== badge.area.id ? FOG_BADGE_QUIET.alpha : 1;
  }

  /** Draws the badge as its area is now, where that is another look or another theme than it was drawn in. */
  private look(badge: Badge): void {
    const look: FogBadgeLook = { glyph: areaIsHidden(badge.area) ? 'hidden' : 'revealed', hovered: this.hovered === badge.area.id };
    if (badge.look && badge.theme === this.theme && sameBadgeLook(badge.look, look)) return;
    badge.look = look;
    badge.theme = this.theme;
    drawFogBadge(badge.disc, look, this.theme);
    const texture = this.glyphs.of(look.glyph);
    if (!texture) return;
    if (!badge.glyph) badge.glyph = badge.view.addChild(new Sprite({ texture, anchor: 0.5 }));
    else badge.glyph.texture = texture;
    badge.glyph.setSize(FOG_BADGE_GLYPH_SIZE);
    badge.glyph.tint = this.theme.stroke;
  }

  private showName(): void {
    const badge = this.hovered === null ? undefined : this.badges.get(this.hovered);
    const name = badge ? areaName(badge.area) ?? null : null;
    if (name === null && !this.name) return;
    if (!this.name) {
      this.name = new FogAreaName();
      this.view.addChild(this.name.view);
    }
    const scale = mapMarkerScale(this.zoom());
    this.name.show(name, badge?.spot ?? null, scale, this.theme, badge ? this.roomRightOf(badge.spot, scale) : Infinity);
  }

  /** How far the view reaches to the right of a world point, in a marker's own pixels at `scale`. */
  private roomRightOf(spot: Point, scale: number): number {
    const { viewport } = this.deps;
    const room = (viewport.screenWidth - viewport.toScreen(spot.x, spot.y).x) / (scale * this.zoom());
    return Number.isFinite(room) ? room : Infinity;
  }

  /** Draws the outlines in the frame's tick, once however many zoom events it brought; at once where the viewport has no ticker. */
  private scheduleOutlines(): void {
    if (this.outlinesPending) return;
    const ticker = this.deps.viewport.options.ticker;
    if (!ticker) {
      this.drawOutlines();
      return;
    }
    this.outlinesPending = true;
    ticker.addOnce(this.flushOutlines);
  }

  /** Every area's outline while the fog tool is chosen, else that of the area pointed at; drawn only where something of it changed. */
  private drawOutlines(): void {
    const all = isFogTool(this.deps.store.getState().activeTool);
    const zoom = this.zoom();
    const { accent } = this.theme;
    const last = this.outlined;
    if (last && last.areas === this.areas && last.all === all && last.zoom === zoom && last.accent === accent && (all || last.hovered === this.hovered)) return;
    this.outlined = { areas: this.areas, all, hovered: this.hovered, zoom, accent };
    const drawn: AreaOutline[] = [];
    for (const { area } of this.badges.values()) {
      if (all || area.id === this.hovered) drawn.push({ outline: areaOutline(area), dashed: !areaIsHidden(area) });
    }
    // Nothing to draw over nothing drawn changes no picture.
    if (drawn.length === 0 && !this.outlinesDrawn) return;
    this.outlinesDrawn = drawn.length > 0;
    drawAreaOutlines(this.outlines, drawn, zoom, accent);
  }
}
