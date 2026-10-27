import { MAX_COORDINATE, MAX_SHARED_PINS, type SharedPin } from '../../protocol/index.ts';
import type { FogCoverage } from '../../../fog/fogCoverage';
import { hexLayoutOfGrid, pinDisplayPoint } from '../../../grid/hexLinks';
import { linksReadableNote } from '../../../tools/pinNoteLink';
import type { NotePin } from '../../../types';
import type { Point } from '../../../types/visionTypes';
import type { SceneState } from '../atlasView.ts';
import { levelObjects } from '../../../levels/levelObjects';
import { sentPinFace } from './sentPinFace.ts';

/** A readable pin players see now: the GM's pin, the place they see it at and the alias they know it by. */
export interface ListedPin {
  readonly pin: NotePin;
  readonly alias: string;
  readonly place: Point;
}

/** What decides which readable pins the players see: the lit scene's sight, or for an unlit scene the committed fog alone. */
export interface PinSight {
  readonly lit: boolean;
  readonly fog: FogCoverage | null;
  /** Which of the points a lit scene's picture shows now (`pointsSeen`), or null while that cannot be read. */
  readonly seen: (points: readonly Point[]) => boolean[] | null;
}

const onMap = (point: Point): boolean => [point.x, point.y].every((value) => Number.isFinite(value) && Math.abs(value) <= MAX_COORDINATE);

/** A pin that may be offered to players: readable, not the GM's own, linking a note. */
const isOffered = (pin: NotePin): boolean => pin.readable === true && pin.gmOnly !== true && linksReadableNote(pin);

/**
 * The readable pins of the shared scene, as players may know them: only where their picture shows
 * the map now (a lit scene's sight with its rule for door badges, an unlit scene where committed fog
 * does not cover the pin; fog that cannot be read covers all), each under an alias of its own that
 * stays while the scene is shared. Nothing of a pin's note is sent: its place, its icon and the log
 * entry of whoever found it.
 */
export class ReadablePins {
  private readonly aliases = new Map<string, string>();

  constructor(private readonly randomId: () => string) {}

  /** A new scene: its pins get new aliases. */
  clear(): void {
    this.aliases.clear();
  }

  /** The pins players see now; null while a lit scene's sight cannot be read. */
  listed(state: SceneState, sight: PinSight): ListedPin[] | null {
    const layout = hexLayoutOfGrid(state.grid);
    const offered = Object.values(levelObjects(state).pins ?? {}).filter(isOffered)
      .map((pin) => ({ pin, place: pinDisplayPoint(pin, layout) }))
      .filter(({ place }) => onMap(place));
    const shown = this.shown(offered.map(({ place }) => place), sight);
    if (shown === null) return null;
    return offered.filter((_, index) => shown[index] === true).slice(0, MAX_SHARED_PINS)
      .map(({ pin, place }) => ({ pin, place, alias: this.alias(pin.id) }));
  }

  /** The pins as players are sent them, each with the entry of the log that tells who found it. */
  shared(listed: readonly ListedPin[], found: (pinId: string) => string | null): SharedPin[] {
    return listed.map(({ pin, place, alias }) => {
      return { id: alias, x: place.x, y: place.y, ...sentPinFace(pin), found: found(pin.id) };
    });
  }

  private shown(points: readonly Point[], sight: PinSight): boolean[] | null {
    if (points.length === 0) return [];
    if (sight.lit) return sight.seen(points);
    const { fog } = sight;
    return points.map((point) => fog !== null && !fog.covers(point));
  }

  private alias(pinId: string): string {
    let alias = this.aliases.get(pinId);
    if (alias === undefined) {
      alias = this.randomId();
      this.aliases.set(pinId, alias);
    }
    return alias;
  }
}
