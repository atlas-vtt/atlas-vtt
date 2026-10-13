import { readWall } from '../../lighting/lightingObjects';
import { wallList } from '../../vision/wallList';
import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { DOOR_GLYPH_PATHS, type DoorGlyph } from '../../lighting/doorGlyphs';
import type { StoreApi } from 'zustand';
import type { ViewState } from '../../types/viewState';
import type { WallSegment } from '../../types/wallTypes';
import { doorMiddle } from '../../vision/doorSight';
import { MOTION_SLOW_MS, prefersReducedMotion } from '../../utils/motion';
import type { LayerVisibility } from '../playerSafeFrame';
import { destroyTree } from '../utils/destroyTree';
import { createGlyphTexture } from '../utils/pinIconTexture';
import { ValueTransition } from '../utils/ValueTransition';

/** Above the lighting layer and token UI, so the GM finds doors in the dark. */
export const DOOR_ICONS_Z_INDEX = 1150;
/** Badge radius as a share of a grid cell. */
const BADGE_SHARE = 0.2;
/** The door glyph's edge as a share of the badge's radius: its corners stay inside the ring. */
const GLYPH_SHARE = 1.35;
/** Both glyphs stand on the bottom of their canvas: lifted, so they sit in the badge's middle. */
const GLYPH_ANCHOR_Y = 0.53;
/** A badge grows with the map's zoom, unlike a pin: its glyph is rasterised larger, to stay sharp zoomed in. */
const GLYPH_TEXTURE_SIZE = 256;

const DOOR_COLOR = 0x44aaff;
const SECRET_DOOR_COLOR = 0xff8844;
/** The tint of a locked door's badge while it refuses to open, where motion is reduced. */
const REFUSED_COLOR = 0xff5d5d;
/** How far a refusing badge swings, as a share of its radius, and how often. */
const SHAKE_SHARE = 0.35;
const SHAKES = 2;

function isDoor(wall: WallSegment): boolean {
  return wall.type === 'door' || wall.type === 'secret-door';
}

const NO_DOORS: ReadonlySet<string> = new Set();

/** What the badges read of their view's state: the doors, the cell size they are sized by, what moves the players' sight, and the door switch. */
export type DoorIconsState = Pick<ViewState, 'grid' | 'lighting' | 'mapPath'> & {
  objects: Pick<ViewState['objects'], 'walls' | 'fog'>;
  toggleDoor(id: string): void;
};

export type DoorIconsStore = Pick<StoreApi<DoorIconsState>, 'getState' | 'subscribe'>;

/** One set of badges: the discs and padlocks in one drawing, and the door glyph of every badge that has one. */
interface BadgeSet {
  view: Container;
  graphics: Graphics;
  glyphs: Map<string, Sprite>;
}

/** What a door's badge tells: the GM's the kind of door and its lock, the players' only whether it is open. */
export function badgeLook(wall: Pick<WallSegment, 'type' | 'locked'>, forPlayers: boolean): { secret: boolean; lock: boolean } {
  return { secret: !forPlayers && wall.type === 'secret-door', lock: !forPlayers && !!wall.locked };
}

/**
 * A badge on every door for the GM: click it with any tool to open or close the door. It shows
 * the door shut or swung open (`DOOR_GLYPH_PATHS`). A locked door shows a lock in its badge and
 * does not open: the badge shakes for a moment instead (where motion is reduced it takes a tint).
 *
 * The players' view has badges of its own (`playerView`): only on the doors the players see
 * (`playersSee`), all alike but for open and closed, so a lock or a secret door is not given
 * away. They are clicked like the GM's. Both sets are redrawn only when the walls change, a
 * badge refuses or the players come to see other doors, so showing one set for a frame costs
 * no drawing.
 */
export class DoorIcons {
  /** The GM's badges: one of the `GmOverlays`. */
  readonly view = new Container({ label: 'door-icons' });
  /** The players' badges: shown by `playerLightingLayers`, hidden in GM view. */
  readonly playerView = new Container({ label: 'player-door-icons', visible: false });
  private readonly gmBadges: BadgeSet = { view: this.view, graphics: new Graphics(), glyphs: new Map() };
  private readonly playerBadges: BadgeSet = { view: this.playerView, graphics: new Graphics(), glyphs: new Map() };
  private readonly textures = new Map<DoorGlyph, Texture | null>();
  private seen: ReadonlySet<string> = NO_DOORS;
  private readonly unsubscribe: () => void;
  /** The locked door whose badge just refused to open, while it says so; 0 to 1 over its moment. */
  private refused: { doorId: string; reduced: boolean } | null = null;
  private readonly refusing = new ValueTransition(0, MOTION_SLOW_MS, () => this.draw(this.store.getState()));

  /** `canvas` is the map's: a popout window has its own document, whose motion setting counts. */
  constructor(
    private readonly store: DoorIconsStore,
    private readonly canvas: HTMLCanvasElement,
    /** The doors the players see now (`playerDoorSight`). */
    private readonly playersSee: () => ReadonlySet<string> = () => NO_DOORS,
  ) {
    for (const { view, graphics } of [this.gmBadges, this.playerBadges]) {
      view.zIndex = DOOR_ICONS_Z_INDEX;
      view.eventMode = 'none';
      view.addChild(graphics);
    }
    this.unsubscribe = store.subscribe((state, previous) => {
      if (state.objects.walls !== previous.objects.walls || state.grid !== previous.grid) this.draw(state);
      else if (state.lighting !== previous.lighting || state.objects.fog !== previous.objects.fog || state.mapPath !== previous.mapPath) this.refreshPlayers();
    });
    this.draw(store.getState());
  }

  /** The door whose badge is at the point, among the badges that show: the GM's, or the players' in their view. */
  hitTest(x: number, y: number): string | null {
    if (this.view.visible) return this.gmHitTest(x, y);
    return this.playerView.visible ? this.badgeAt(x, y, (wall) => this.seen.has(wall.id)) : null;
  }

  /** The door whose badge the GM's view shows at the point: what only the GM does with a door starts here. */
  gmHitTest(x: number, y: number): string | null {
    return this.view.visible ? this.badgeAt(x, y, isDoor) : null;
  }

  /** Both sets as the GM's view has them: its own by the tool and the scene, the players' never. */
  gmLayers(shown: boolean): LayerVisibility[] {
    return [{ layer: this.view, visible: shown }, { layer: this.playerView, visible: false }];
  }

  /** Draws the players' badges anew if they see other doors than before: after their sight or the light changed. */
  refreshPlayers(): void {
    const seen = this.playersSee();
    if (seen.size === this.seen.size && [...seen].every((doorId) => this.seen.has(doorId))) return;
    this.seen = seen;
    this.drawBadges(this.playerBadges, this.store.getState(), true);
  }

  private badgeAt(x: number, y: number, shown: (wall: WallSegment) => boolean): string | null {
    const state = this.store.getState();
    const radius = this.radius(state);
    for (const wall of wallList(state.objects.walls)) {
      if (!shown(wall)) continue;
      const centre = doorMiddle(wall);
      if (Math.hypot(x - centre.x, y - centre.y) <= radius) return wall.id;
    }
    return null;
  }

  /** Opens or closes the door; a locked one stays shut and its badge says no. */
  toggle(wallId: string): void {
    const state = this.store.getState();
    if (!readWall(state.objects.walls[wallId])?.locked) {
      state.toggleDoor(wallId);
      return;
    }
    this.refused = { doorId: wallId, reduced: prefersReducedMotion(this.canvas.ownerDocument.body) };
    this.refusing.jumpTo(0);
    this.refusing.animateTo(1, () => {
      this.refused = null;
      this.draw(this.store.getState());
    });
  }

  /** The badge that is refusing to open right now: how far it has swung aside (world pixels), or that it is tinted instead. */
  refusal(): { doorId: string; offset: number; tint: boolean } | null {
    if (!this.refused) return null;
    const { doorId, reduced } = this.refused;
    const progress = this.refusing.value;
    // A swing that dies away: a few times left and right, less each time.
    const offset = reduced ? 0 : Math.sin(progress * Math.PI * 2 * SHAKES) * (1 - progress) * this.radius(this.store.getState()) * SHAKE_SHARE;
    return { doorId, offset, tint: reduced };
  }

  private radius(state: DoorIconsState): number {
    return (state.grid?.size ?? 70) * BADGE_SHARE;
  }

  private draw(state: DoorIconsState): void {
    this.seen = this.playersSee();
    this.drawBadges(this.gmBadges, state, false);
    this.drawBadges(this.playerBadges, state, true);
  }

  private drawBadges(badges: BadgeSet, state: DoorIconsState, forPlayers: boolean): void {
    const { view, graphics: g, glyphs } = badges;
    g.clear();
    const r = this.radius(state);
    const withGlyph = new Set<string>();
    const refusal = this.refusal();
    for (const wall of wallList(state.objects.walls)) {
      if (forPlayers ? !this.seen.has(wall.id) : !isDoor(wall)) continue;
      const refusing = refusal?.doorId === wall.id ? refusal : null;
      const centre = doorMiddle(wall);
      const x = centre.x + (refusing?.offset ?? 0);
      const { y } = centre;
      const { secret, lock } = badgeLook(wall, forPlayers);
      const color = refusing?.tint ? REFUSED_COLOR : secret ? SECRET_DOOR_COLOR : DOOR_COLOR;
      const open = !(wall.closed ?? true);
      g.circle(x, y, r).fill({ color: 0x1b1b1f, alpha: 0.85 }).stroke({ width: r * 0.14, color });
      if (lock) {
        drawLock(g, x, y, r, color);
        continue;
      }
      const texture = this.glyphTexture(open ? 'open' : 'closed');
      if (!texture) continue;
      let glyph = glyphs.get(wall.id);
      if (!glyph) {
        glyph = view.addChild(new Sprite({ anchor: { x: 0.5, y: GLYPH_ANCHOR_Y } }));
        glyphs.set(wall.id, glyph);
      }
      withGlyph.add(wall.id);
      glyph.texture = texture;
      glyph.position.set(x, y);
      glyph.setSize(r * GLYPH_SHARE);
      glyph.tint = color;
    }
    for (const [doorId, glyph] of glyphs) {
      if (withGlyph.has(doorId)) continue;
      destroyTree(glyph);
      glyphs.delete(doorId);
    }
  }

  /** The glyph in white, rasterised once and tinted per badge; null where no 2D canvas is available. */
  private glyphTexture(glyph: DoorGlyph): Texture | null {
    if (!this.textures.has(glyph)) this.textures.set(glyph, createGlyphTexture(DOOR_GLYPH_PATHS[glyph], GLYPH_TEXTURE_SIZE));
    return this.textures.get(glyph) ?? null;
  }

  destroy(): void {
    this.unsubscribe();
    this.refusing.cancel();
    destroyTree(this.view);
    destroyTree(this.playerView);
    for (const texture of this.textures.values()) {
      if (texture && !texture.destroyed) texture.destroy(true);
    }
    this.textures.clear();
  }
}

/** A padlock in a badge of radius `r`: its body, its shackle above it and a keyhole. */
function drawLock(g: Graphics, x: number, y: number, r: number, color: number): void {
  const w = r * 0.9;
  const h = r * 0.62;
  const top = y - r * 0.17;
  // The shackle's path starts at its own left end: an arc alone is joined to wherever the last path ended.
  g.moveTo(x - r * 0.28, top).arc(x, top, r * 0.28, Math.PI, 0).stroke({ width: r * 0.14, color });
  g.roundRect(x - w / 2, top, w, h, r * 0.12).fill({ color });
  g.circle(x, top + h * 0.5, r * 0.1).fill({ color: 0x1b1b1f });
}
