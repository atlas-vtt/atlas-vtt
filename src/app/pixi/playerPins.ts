import { Container } from 'pixi.js';
import type { NotePin } from '../types';
import type { Point } from '../types/visionTypes';
import type { DrawnPin } from './pinFace';
import type { PinNameLabel } from './pinNameLabel';
import { pinNameBoxes } from './pinNameLayout';
import { MAP_LAYER_Z } from './mapLayerOrder';
import { destroyTree } from './utils/destroyTree';
import { shownToPlayers } from '../tools/pinSharing';

/** Which of `points` the players' picture shows the map at now; null while that cannot be read (nothing is shown then). */
export type PlayerPointSight = (points: readonly Point[]) => readonly boolean[] | null;

export interface PlayerPinsDeps {
  /** The pins of the level shown. */
  readonly pins: () => Readonly<Record<string, NotePin>>;
  /** Where a pin stands on the map (a hex link in its hex's centre). */
  readonly place: (pin: NotePin) => Point;
  /** A pin as players see it: its face and name, without the GM's marks. */
  readonly draw: (pin: NotePin) => DrawnPin;
  /** The pins' scale, the GM's markers' (`mapMarkerScale`), so the players' picture keeps the map's proportions. */
  readonly scale: () => number;
  /** The viewport's zoom, for how finely names are rasterised. */
  readonly zoom: () => number;
}

/**
 * The pins the players' picture shows: those the GM shows to players (`shownToPlayers`), where the
 * players see the map now, each with its name where it shows one. One layer, which the players'
 * frame and session view show in place of the GM's pins; a pin is drawn again only when it changed.
 */
export class PlayerPins {
  readonly view = new Container({ label: 'pins-players', eventMode: 'none', interactiveChildren: false });
  private readonly drawn = new Map<string, { pin: NotePin; group: Container; name: PinNameLabel | null }>();
  private sight: PlayerPointSight | null = null;

  constructor(private readonly deps: PlayerPinsDeps) {
    this.view.zIndex = MAP_LAYER_Z.pins;
    this.view.visible = false;
  }

  /** How the players' sight is read; until it is set, players see no pin. */
  setSight(sight: PlayerPointSight): void {
    this.sight = sight;
  }

  /** Draws the pins players see now; called before a players' frame and while the canvas shows their view. */
  refresh(): void {
    const offered = Object.values(this.deps.pins()).filter(shownToPlayers);
    const places = offered.map((pin) => this.deps.place(pin));
    const seen = places.length === 0 ? [] : this.sight?.(places) ?? null;
    const shown = new Map(offered.flatMap((pin, index) => (seen?.[index] === true ? [[pin.id, { pin, place: places[index]! }] as const] : [])));

    for (const [id, entry] of this.drawn) {
      const next = shown.get(id);
      if (next && next.pin === entry.pin) continue;
      destroyTree(entry.group);
      this.drawn.delete(id);
    }
    for (const [id, { pin, place }] of shown) {
      if (!this.drawn.has(id)) {
        const { view, name } = this.deps.draw(pin);
        const group = new Container({ label: `player-pin-${id}`, eventMode: 'none' });
        group.addChild(view);
        this.view.addChild(group);
        this.drawn.set(id, { pin, group, name });
      }
      this.drawn.get(id)!.group.position.set(place.x, place.y);
    }
    this.rescale();
  }

  /** Scales the pins for the zoom and hides names that would crowd. */
  rescale(): void {
    if (this.drawn.size === 0) return;
    const scale = this.deps.scale();
    const zoom = this.deps.zoom();
    const groups: Record<string, Container> = {};
    const names = new Map<string, PinNameLabel>();
    for (const [id, { group, name }] of this.drawn) {
      group.scale.set(scale);
      groups[id] = group;
      if (name) {
        name.draw(scale, zoom);
        names.set(id, name);
      }
    }
    const visible = pinNameBoxes(names, groups, scale);
    for (const [id, name] of names) name.view.visible = visible.has(id);
  }

  /** Forgets every drawn pin: the theme changed, or the pins of another level are shown. */
  clear(): void {
    for (const { group } of this.drawn.values()) destroyTree(group);
    this.drawn.clear();
  }

  destroy(): void {
    this.clear();
    destroyTree(this.view);
  }
}
