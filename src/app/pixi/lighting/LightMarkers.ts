import { lightList } from '../../lighting/lightingObjects';
import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { LIGHT_GLYPH_PATHS } from '../../lighting/lightGlyphs';
import { lightZoneList, withZones } from '../../lighting/lightZones';
import type { ViewAtlasState, ViewAtlasStore } from '../../storeFactory';
import type { LightKind, LightSource } from '../../types/lightingTypes';
import { MOTION_NORMAL_MS, prefersReducedMotion } from '../../utils/motion';
import { ambientAt } from '../../vision/lightLevels';
import { destroyTree } from '../utils/destroyTree';
import { mapMarkerScale } from '../utils/mapMarkerScale';
import { createGlyphTexture } from '../utils/pinIconTexture';
import { ValueTransition } from '../utils/ValueTransition';
import {
  LIGHT_MARKER_GLYPH_SIZE,
  LIGHT_MARKER_RADIUS,
  lightMarkerAt,
  lightMarkerLook,
  lightMarkerTheme,
  type LightMarkerLook,
  type LightMarkerTheme,
} from './lightMarker';

/** Above the lighting layer (90), so the GM finds lights in the dark; below token UI (100). */
export const LIGHT_MARKERS_Z_INDEX = 95;

/** The pointer of a light with a beam: how far past the badge's edge it reaches (past a selected marker's ring too), and half its width as an angle. */
const POINTER_LENGTH = 9;
const POINTER_SPREAD = 0.45;

const MOON_RADIUS = 5.5;

type MarkerState = Pick<ViewAtlasState, 'lighting' | 'activeTool'>;

/** Lit scenes show their lights' markers, and the lighting tool shows them in any scene. */
export function lightMarkersShown({ lighting, activeTool }: MarkerState): boolean {
  return lighting.enabled || activeTool === 'wall';
}

interface Marker {
  view: Container;
  badge: Graphics;
  glyph: Sprite | null;
  light: LightSource;
  look: LightMarkerLook;
  /** The theme its badge was drawn in. */
  theme: LightMarkerTheme;
  /** Eases the hover and drag lift; made on the first lift. */
  lift: ValueTransition | null;
}

/**
 * A light with a beam: the badge grows a tip the way the light faces, in the light's colour.
 * Drawn under the badge, which covers its base, so the two read as one shape.
 */
function drawPointer(g: Graphics, { direction, ringColor, ringAlpha }: LightMarkerLook, background: number): void {
  if (direction === null) return;
  const point = (radius: number, turn: number): [number, number] => [Math.cos(direction + turn) * radius, Math.sin(direction + turn) * radius];
  const tip = [...point(LIGHT_MARKER_RADIUS - 2, -POINTER_SPREAD), ...point(LIGHT_MARKER_RADIUS + POINTER_LENGTH, 0), ...point(LIGHT_MARKER_RADIUS - 2, POINTER_SPREAD)];
  // On the badge's own colour, so a faint tip (a light switched off) is faint as its ring is.
  g.poly(tip).fill({ color: background }).stroke({ width: 1, color: 0x000000, alpha: 0.35 });
  g.poly(tip).fill({ color: ringColor, alpha: ringAlpha });
}

/** A light that follows the ambient light: a small disc on the badge's upper right edge with a crescent in the light's colour. */
function drawMoon(g: Graphics, { ringColor, ringAlpha }: LightMarkerLook, background: number): void {
  const at = LIGHT_MARKER_RADIUS * Math.SQRT1_2;
  g.circle(at, -at, MOON_RADIUS + 0.5).stroke({ width: 1, color: 0x000000, alpha: 0.35 });
  g.circle(at, -at, MOON_RADIUS).fill({ color: background });
  // The crescent: a disc, and the badge's colour over its upper right.
  g.circle(at, -at, MOON_RADIUS - 1.5).fill({ color: ringColor, alpha: Math.max(ringAlpha, 0.6) });
  g.circle(at + 1.6, -at - 1.2, MOON_RADIUS - 2.2).fill({ color: background });
}

function sameTheme(a: LightMarkerTheme, b: LightMarkerTheme): boolean {
  return a.background === b.background && a.stroke === b.stroke && a.accent === b.accent;
}

function sameLook(a: LightMarkerLook, b: LightMarkerLook): boolean {
  return a.kind === b.kind && a.glyphTint === b.glyphTint && a.glyphAlpha === b.glyphAlpha
    && a.ringColor === b.ringColor && a.ringAlpha === b.ringAlpha && a.accent === b.accent && a.direction === b.direction && a.moon === b.moon;
}

/**
 * A badge on every placed light, in the pins' language and a size smaller: the theme's badge,
 * the glyph of the light's kind and a thin ring, both in the light's colour. It is the one
 * marker of a light: at rest in a lit scene, and as the lighting tool's handle. Markers keep
 * their size on screen, move in place when their light changes and are only updated while
 * shown. They never reach the players' view (`GmOverlays`).
 */
export class LightMarkers {
  readonly view = new Container({ label: 'light-markers', zIndex: LIGHT_MARKERS_Z_INDEX, eventMode: 'none', interactiveChildren: false });
  private readonly markers = new Map<string, Marker>();
  private readonly textures = new Map<LightKind, Texture | null>();
  private readonly unsubscribe: () => void;
  private readonly themeObserver: MutationObserver;
  private theme: LightMarkerTheme;
  /** The canvas shows the players' view, which has no markers. */
  private suppressed = false;
  private hovered: string | null = null;
  private dragging: string | null = null;
  private selected: ReadonlySet<string> = new Set();
  private readonly rescale = (): void => {
    for (const marker of this.markers.values()) this.applyScale(marker);
  };

  constructor(private readonly viewport: Viewport, private readonly store: ViewAtlasStore, private readonly readTheme: () => LightMarkerTheme = lightMarkerTheme) {
    this.theme = readTheme();
    viewport.addChild(this.view);
    viewport.on('zoomed', this.rescale);
    viewport.on('zoomed-end', this.rescale);
    this.unsubscribe = store.subscribe((state, previous) => {
      if (
        state.objects.lights !== previous.objects.lights
        || state.objects.lightZones !== previous.objects.lightZones
        || state.lighting.enabled !== previous.lighting.enabled
        || state.lighting.ambient !== previous.lighting.ambient
        || state.activeTool !== previous.activeTool
        || state.lightPopover !== previous.lightPopover
      ) this.sync();
    });
    // The badge and the accent follow the theme, like the pins.
    this.themeObserver = new MutationObserver(() => {
      const theme = this.readTheme();
      if (sameTheme(theme, this.theme)) return;
      this.theme = theme;
      this.sync();
    });
    this.themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    this.sync();
  }

  /** Hides the markers while the canvas shows the players' view (session view or the peek key). */
  setSuppressed(on: boolean): void {
    if (this.suppressed === on) return;
    this.suppressed = on;
    this.sync();
  }

  setHovered(lightId: string | null): void {
    if (this.hovered === lightId) return;
    this.hovered = lightId;
    this.sync();
  }

  setDragging(lightId: string | null): void {
    if (this.dragging === lightId) return;
    this.dragging = lightId;
    this.sync();
  }

  /** The lights selected with the lighting tool. The light whose popover is open counts as selected too. */
  setSelected(lightIds: readonly string[]): void {
    this.selected = new Set(lightIds);
    this.sync();
  }

  /** The light whose marker is at the world point, while the markers show. */
  hitTest(x: number, y: number): string | null {
    if (!this.view.visible) return null;
    return lightMarkerAt(lightList(this.store.getState().objects.lights), { x, y }, this.viewport.scale.x);
  }

  private glyphTexture(kind: LightKind): Texture | null {
    if (!this.textures.has(kind)) this.textures.set(kind, createGlyphTexture(LIGHT_GLYPH_PATHS[kind]));
    return this.textures.get(kind) ?? null;
  }

  private applyScale(marker: Marker): void {
    marker.view.scale.set(mapMarkerScale(this.viewport.scale.x) * (marker.lift?.value ?? 1));
  }

  private sync(): void {
    const state = this.store.getState();
    const shown = lightMarkersShown(state) && !this.suppressed;
    this.view.visible = shown;
    if (!shown) return;
    // The lights that can be read: what else the record holds has no marker.
    const lights = lightList(state.objects.lights);
    const ids = new Set(lights.map((light) => light.id));
    // A lamp that follows the ambient light goes by the light where it stands, as the rule does (`activeLights`).
    const ambient = withZones(state.lighting, lightZoneList(state.objects.lightZones));
    for (const [id, marker] of this.markers) {
      if (ids.has(id)) continue;
      marker.lift?.cancel();
      destroyTree(marker.view);
      this.markers.delete(id);
    }
    for (const light of lights) {
      const look = lightMarkerLook(light, {
        hovered: this.hovered === light.id,
        selected: this.selected.has(light.id) || state.lightPopover === light.id,
        dragging: this.dragging === light.id,
      }, this.theme, ambientAt(light, ambient));
      const previous = this.markers.get(light.id);
      const marker = previous ?? this.create(light, look);
      // The badge takes the theme's colours too, whatever its look: a marker drawn in another theme is redrawn.
      if (!previous || previous.theme !== this.theme || !sameLook(previous.look, look)) this.draw(marker, look);
      this.lift(marker, look.lift);
      marker.view.position.set(light.x, light.y);
      marker.light = light;
      marker.look = look;
      marker.theme = this.theme;
    }
  }

  private create(light: LightSource, look: LightMarkerLook): Marker {
    const view = this.view.addChild(new Container());
    const marker: Marker = { view, badge: view.addChild(new Graphics()), glyph: null, light, look, theme: this.theme, lift: null };
    this.markers.set(light.id, marker);
    this.applyScale(marker);
    return marker;
  }

  private draw(marker: Marker, look: LightMarkerLook): void {
    const { background } = this.theme;
    const g = marker.badge;
    g.clear();
    drawPointer(g, look, background);
    // A dark hairline keeps the badge's edge on a map as light as the badge.
    g.circle(0, 0, LIGHT_MARKER_RADIUS + 0.5).stroke({ width: 1, color: 0x000000, alpha: 0.35 });
    g.circle(0, 0, LIGHT_MARKER_RADIUS).fill({ color: background, alpha: 0.95 });
    g.circle(0, 0, LIGHT_MARKER_RADIUS - 1.25).stroke({ width: 1.5, color: look.ringColor, alpha: look.ringAlpha });
    if (look.accent !== null) {
      g.circle(0, 0, LIGHT_MARKER_RADIUS + 3).stroke({ width: 2, color: look.accent });
    }
    if (look.moon) drawMoon(g, look, background);
    const texture = this.glyphTexture(look.kind);
    if (!texture) return;
    if (!marker.glyph) {
      marker.glyph = marker.view.addChild(new Sprite(texture));
      marker.glyph.anchor.set(0.5);
    } else {
      marker.glyph.texture = texture;
    }
    marker.glyph.setSize(LIGHT_MARKER_GLYPH_SIZE);
    marker.glyph.tint = look.glyphTint;
    marker.glyph.alpha = look.glyphAlpha;
  }

  /** Eases the marker to its lift; reduced motion takes it there at once. */
  private lift(marker: Marker, lift: number): void {
    if ((marker.lift?.targetValue ?? 1) === lift) return;
    marker.lift ??= new ValueTransition(1, MOTION_NORMAL_MS, () => {
      if (!marker.view.destroyed) this.applyScale(marker);
    });
    if (prefersReducedMotion(document.body)) marker.lift.jumpTo(lift);
    else marker.lift.animateTo(lift);
  }

  destroy(): void {
    this.unsubscribe();
    this.themeObserver.disconnect();
    this.viewport.off('zoomed', this.rescale);
    this.viewport.off('zoomed-end', this.rescale);
    for (const marker of this.markers.values()) marker.lift?.cancel();
    this.markers.clear();
    destroyTree(this.view);
    for (const texture of this.textures.values()) {
      if (texture && !texture.destroyed) texture.destroy(true);
    }
    this.textures.clear();
  }
}
