import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { formatReach, type MeasurementSettings } from '../../grid/measurementFormat';
import { unitScaleOf } from '../../lighting/lightingUnits';
import type { ViewAtlasStore } from '../../storeFactory';
import type { Point } from '../../types/visionTypes';
import { gmSightSource } from '../../vision/tokenSightPolicy';
import { sightSources } from '../../vision/sight';
import type { SightRules } from '../../vision/sightRules';
import type { MapBounds } from '../../vision/visibility';
import type { VisionCone } from '../../vision/visionCone';
import { canvasBadgeColors } from '../utils/canvasBadgeColors';
import { destroyTree } from '../utils/destroyTree';
import { senseRings, type SenseRing, type SenseRings } from './senseRings';

/** Screen pixels. */
const LINE_WIDTH = 1.25;
const UNDER_WIDTH = 3.5;
/** A light line on a dark rim: the line reads on a dark map, the rim on a pale one. */
const LINE = 0xf2efe9;
const UNDER_ALPHA = 0.7;
/** Dash and gap of each line style; sight is solid. */
const DASHES: Record<SenseRing['style'], readonly [number, number] | null> = { sight: null, sense: [7, 5], creatures: [2, 5] };
/** A ring with more dashes than this is drawn only where the screen shows it. */
const MAX_DASHES = 240;
const LABEL_FONT_SIZE = 11;
const LABEL_PADDING = 4;
const LABEL_RADIUS = 5;
const FALLBACK_FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
/** Labels of neighbouring rings are set this far apart along their rings, so they do not cover each other. */
const LABEL_STEP = (24 * Math.PI) / 180;
/** Where the first label sits on a ring that runs all around: up and to the right. */
const FIRST_LABEL = -Math.PI / 3;
/** More selected tokens than this draw no rings: they would cover the map. */
const MAX_TOKENS = 4;

/** The part of the map the screen shows, in world pixels. */
interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface SenseRangeRingsDeps {
  viewport: Viewport;
  store: ViewAtlasStore;
  /** A lit scene in the GM's view: else there are no rings. */
  shown: () => boolean;
  measurement: () => MeasurementSettings;
  bounds: () => MapBounds | null;
  rules: () => SightRules;
}

/**
 * The ranges of the selected vision tokens for the GM: a thin ring for the sight range and for
 * each sense with a distance, an arc where the token looks one way, the cone's two edges, and
 * the sense's name with its distance at each ring; what reaches without limit has no ring and
 * no label. They show how far each reaches, not what walls leave of it. Lines and labels keep their size on screen; the label is a badge in the
 * theme's colours, so it reads on any map. Part of the GM's sight aids (`GmSightAids`).
 */
export class SenseRangeRings {
  readonly view = new Container({ label: 'sense-range-rings', eventMode: 'none', interactiveChildren: false });
  private readonly lines = this.view.addChild(new Graphics());
  private readonly badges = this.view.addChild(new Container());
  /** The label badges by token, text and theme: text is costly to set, so a label stays while it reads the same. */
  private readonly pool = new Map<string, Container>();
  /** What the last drawing showed: the same again draws nothing anew. */
  private drawn = '';
  /** The last drawing left dashes out that the screen did not show, so it follows the camera. */
  private culled = false;
  private readonly redraw = (): void => this.draw();
  private readonly moved = (): void => {
    if (this.culled) this.draw();
  };

  constructor(private readonly deps: SenseRangeRingsDeps) {
    this.view.visible = false;
    deps.viewport.on('zoomed', this.redraw);
    deps.viewport.on('zoomed-end', this.redraw);
    deps.viewport.on('moved', this.moved);
  }

  /** The rings of every selected token with vision, in a lit scene. */
  rings(): SenseRings[] {
    const { store, shown, measurement, bounds, rules } = this.deps;
    const state = store.getState();
    const map = bounds();
    if (!shown() || !map) return [];
    const tokens = state.selectedIds.flatMap((id) => {
      const token = state.objects.tokens[id];
      return token?.vision?.enabled ? [token] : [];
    });
    if (tokens.length === 0 || tokens.length > MAX_TOKENS) return [];
    const settings = measurement();
    const scale = unitScaleOf(settings, state.grid);
    const unlimited = Math.hypot(map.width, map.height);
    const distance = (radius: number): string => formatReach(radius / scale.cellSize, settings);
    return tokens.flatMap((token) => sightSources({ [token.id]: token }, scale, map, rules(), gmSightSource).map((source) => senseRings(source, unlimited, distance)));
  }

  /**
   * Draws the rings of the selected tokens. Called on every update of the sight aids and on
   * every zoom, it draws anew only when what it shows changed: the selected tokens' ranges and
   * places, the zoom, the theme, or the part on screen of a ring too long to dash all around.
   */
  draw(): void {
    const all = this.rings();
    const zoom = this.deps.viewport.scale.x;
    const theme = canvasBadgeColors().background;
    const screen = all.some(({ rings }) => rings.some((ring) => dashCount(ring, zoom) > MAX_DASHES)) ? this.onScreen(zoom) : null;
    const key = all.length === 0 ? '' : JSON.stringify([zoom, theme, screen, all]);
    if (key === this.drawn) return;
    this.drawn = key;
    this.culled = screen !== null;
    this.view.visible = all.length > 0;
    this.lines.clear();
    const kept = new Set<string>();
    all.forEach((token, index) => this.drawToken(token, zoom, screen, (text) => {
      const label = `${index}|${text}|${theme}`;
      kept.add(label);
      return label;
    }));
    for (const [label, badge] of this.pool) {
      if (kept.has(label)) continue;
      destroyTree(badge);
      this.pool.delete(label);
    }
  }

  /** The part of the map on screen, a dash and a half wider on every side; null for a viewport that does not tell its size. */
  private onScreen(zoom: number): Rect | null {
    const { position, screenWidth, screenHeight } = this.deps.viewport;
    if (!(screenWidth > 0) || !(screenHeight > 0)) return null;
    const margin = 16 / zoom;
    const left = -position.x / zoom;
    const top = -position.y / zoom;
    return { left: left - margin, top: top - margin, right: left + screenWidth / zoom + margin, bottom: top + screenHeight / zoom + margin };
  }

  /** The texts of the labels shown now. */
  labels(): string[] {
    return [...this.pool.keys()].map((key) => key.split('|')[1]!);
  }

  private drawToken({ center, rings, cone, coneReach }: SenseRings, zoom: number, screen: Rect | null, keyOf: (text: string) => string): void {
    const pixel = 1 / zoom;
    const g = this.lines;
    // Dark under light: first every hairline, then every line, so no line is cut by another's rim.
    for (const [width, color, alpha] of [[UNDER_WIDTH, 0x000000, UNDER_ALPHA], [LINE_WIDTH, LINE, 0.95]] as const) {
      for (const ring of rings) {
        this.trace(center, ring, zoom, screen);
        g.stroke({ width: width * pixel, color, alpha });
      }
      // The cone's edges run as far as the eyes see: to the widest ring, or across the map without a sight range.
      const from = cone?.apex ?? 0;
      if (cone && coneReach > from) {
        for (const side of [-1, 1]) {
          const angle = cone.facing + (side * cone.angle) / 2;
          g.moveTo(center.x + Math.cos(angle) * from, center.y + Math.sin(angle) * from);
          g.lineTo(center.x + Math.cos(angle) * coneReach, center.y + Math.sin(angle) * coneReach);
        }
        g.stroke({ width: width * pixel, color, alpha });
      }
    }
    rings.forEach((ring, index) => {
      const angle = labelAngle(ring, index, rings.length);
      this.label(keyOf(ring.label), ring.label, { x: center.x + Math.cos(angle) * ring.radius, y: center.y + Math.sin(angle) * ring.radius }, pixel);
    });
  }

  /**
   * The ring's line: all around, or the arc within the cone; dashed by its style, in dashes of
   * one length on screen at every zoom. A ring too long to dash all around is dashed only where
   * the screen shows it.
   */
  private trace(center: Point, ring: SenseRing, zoom: number, screen: Rect | null): void {
    const g = this.lines;
    const { start, sweep } = arcOf(ring);
    const dashes = DASHES[ring.style];
    if (!dashes) {
      g.moveTo(center.x + Math.cos(start) * ring.radius, center.y + Math.sin(start) * ring.radius);
      g.arc(center.x, center.y, ring.radius, start, start + sweep);
      return;
    }
    const [dash, gap] = dashes;
    const count = dashCount(ring, zoom);
    const step = sweep / count;
    const on = step * (dash / (dash + gap));
    const cull = count > MAX_DASHES ? screen : null;
    for (let i = 0; i < count; i++) {
      const from = start + i * step;
      const x = center.x + Math.cos(from) * ring.radius;
      const y = center.y + Math.sin(from) * ring.radius;
      if (cull && (x < cull.left || x > cull.right || y < cull.top || y > cull.bottom)) continue;
      g.moveTo(x, y);
      g.arc(center.x, center.y, ring.radius, from, from + on);
    }
  }

  /** A small badge with the text, centred on `at`, at a constant size on screen. */
  private label(key: string, text: string, at: Point, pixel: number): void {
    let badge = this.pool.get(key);
    if (!badge) this.pool.set(key, badge = this.badges.addChild(drawLabel(text)));
    badge.position.set(at.x, at.y);
    badge.scale.set(pixel);
  }

  destroy(): void {
    this.deps.viewport.off('zoomed', this.redraw);
    this.deps.viewport.off('zoomed-end', this.redraw);
    this.deps.viewport.off('moved', this.moved);
    destroyTree(this.view);
  }
}

/** Where a ring's line begins and how far around it runs. */
function arcOf(ring: SenseRing): { start: number; sweep: number } {
  return ring.cone ? { start: ring.cone.facing - ring.cone.angle / 2, sweep: ring.cone.angle } : { start: 0, sweep: 2 * Math.PI };
}

/** How many dashes a ring's line has at `zoom`, each one length on screen; 0 for a solid line. */
function dashCount(ring: SenseRing, zoom: number): number {
  const dashes = DASHES[ring.style];
  if (!dashes) return 0;
  return Math.max(4, Math.round((arcOf(ring).sweep * ring.radius * zoom) / (dashes[0] + dashes[1])));
}

function drawLabel(text: string): Container {
  const colors = canvasBadgeColors();
  const font = getComputedStyle(document.body).getPropertyValue('--font-interface').trim() || FALLBACK_FONT;
  const label = new Text({
    text,
    style: new TextStyle({ fontFamily: font, fontSize: LABEL_FONT_SIZE, fontWeight: '500', fill: colors.stroke }),
    resolution: Math.max(2, window.devicePixelRatio || 1),
  });
  const width = label.width + LABEL_PADDING * 2;
  const height = label.height + LABEL_PADDING;
  const badge = new Container();
  badge.addChild(
    new Graphics()
      // A dark hairline keeps the badge's edge on a map as light as the badge.
      .roundRect(-width / 2 - 0.5, -height / 2 - 0.5, width + 1, height + 1, LABEL_RADIUS + 0.5).stroke({ width: 1, color: 0x000000, alpha: 0.35 })
      .roundRect(-width / 2, -height / 2, width, height, LABEL_RADIUS).fill({ color: colors.background, alpha: 0.94 }),
    label,
  );
  label.position.set(-label.width / 2, -label.height / 2);
  return badge;
}

/** Where a ring's label sits: spread along the rings, within the cone for a sense of the eyes that looks one way. */
function labelAngle(ring: SenseRing, index: number, count: number): number {
  if (!ring.cone) return FIRST_LABEL + index * LABEL_STEP;
  const cone: VisionCone = ring.cone;
  const step = Math.min(LABEL_STEP, cone.angle / (count + 1));
  return cone.facing + (index - (count - 1) / 2) * step;
}
