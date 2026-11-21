import type { AuraToken } from '../../measure/auraArea';
import { placeAura } from '../../measure/auraArea';
import { DrawnMeasure, type MeasureLook, type MeasureSurfaces } from '../../pixi/measure/DrawnMeasure';
import { MeasureMorph } from '../../pixi/measure/measureMorph';
import { MeasurePresence } from '../../pixi/measure/measurePresence';
import type { Point } from '../../types/visionTypes';
import { matchKept } from './keptMatching.ts';
import type { ToldMeasure } from './measureWords.ts';
import { colourOf, followerOf, samePoints, sameTold, type Kept, type Sender } from './toldMeasures.ts';

/** What the kept measurements are drawn into and by, and where the host draws the token an aura lies around. */
export interface RemoteKeptPorts {
  surfaces(): MeasureSurfaces;
  /** Null while the rules are not known. */
  look(): MeasureLook | null;
  token?(id: string): AuraToken | null;
}

/** The drawing a sender's measurement being drawn hands over when it is kept: it is already there, and comes in from nothing. */
const sameDrawing = (a: ToldMeasure, b: ToldMeasure): boolean => a.shape === b.shape && samePoints(a.points, b.points);

/**
 * The drawings of senders' kept measurements (`RemoteMeasures`), with the motion they come, go and
 * change with: a kept one grows in from where it starts and fades out when its sender deletes it
 * (`MeasurePresence`), one kept from the measurement being drawn takes its place as it stands, and
 * an edit (moved, resized) shows its way there (`MeasureMorph`).
 */
export class RemoteKept {
  /** Drawings on their way off the map, shown until they have faded out. */
  private readonly fading = new Map<DrawnMeasure, MeasurePresence>();

  constructor(private readonly ports: RemoteKeptPorts) {}

  /** Takes every drawing still fading away at once. */
  clear(): void {
    for (const [drawn, presence] of this.fading) {
      presence.stop();
      drawn.destroy();
    }
    this.fading.clear();
  }

  /** A drawing goes: once it has faded out (`fade`), shown until then, or at once. */
  drop(drawn: DrawnMeasure, presence: MeasurePresence, fade: boolean, morph?: MeasureMorph): void {
    morph?.stop();
    if (!fade) {
      presence.stop();
      drawn.destroy();
      return;
    }
    this.fading.set(drawn, presence);
    presence.exit(() => {
      this.fading.delete(drawn);
      drawn.destroy();
    });
  }

  /**
   * The kept measurements of a sender, in order (`matchKept`): one that came grows in, one that went
   * fades out, one edited shows its way there, and one in another colour is drawn anew. True when a
   * new one is the measurement being drawn that `ending` was, kept: it took that drawing's place.
   */
  draw(sender: Sender, told: readonly ToldMeasure[], recoloured: boolean, look: MeasureLook, ending: ToldMeasure | null): boolean {
    const { drawings, gone } = matchKept(sender.kept, told);
    for (const kept of gone) this.drop(kept.drawn, kept.presence, true, kept.morph);
    const before = [...sender.kept];
    let handed = false;
    sender.kept.splice(0, sender.kept.length, ...told.map((measure, index) => drawings[index] ?? this.newKept(sender, measure)));
    told.forEach((measure, index) => {
      const kept = sender.kept[index]!;
      const known = drawings[index] ?? null;
      const moved = known !== null && before.indexOf(known) !== index && measure.effect !== undefined;
      if (known !== null && !recoloured && !moved && sameTold(known.told, measure)) return;
      // An edit of its own, not an aura: it moves from where it was drawn.
      const from = known && known.follower === null && measure.aura === undefined && known.told.shape === measure.shape ? (known.morph.points ?? known.told.points) : null;
      kept.morph.stop();
      kept.told = measure;
      kept.follower = followerOf(measure);
      this.drawOne(sender, kept, index, look, true);
      if (known === null) {
        const takesOver = ending !== null && sameDrawing(ending, measure);
        handed ||= takesOver;
        if (!takesOver) kept.presence.enter();
      } else if (from) {
        kept.morph.start(from, measure.points);
      }
    });
    return handed;
  }

  /** A drawing for a kept measurement told for the first time. */
  private newKept(sender: Sender, told: ToldMeasure): Kept {
    const drawn = new DrawnMeasure(this.ports.surfaces());
    const kept: Kept = {
      told, follower: null, placed: null, drawn,
      presence: new MeasurePresence((presence) => drawn.present(presence)),
      morph: new MeasureMorph((points) => this.drawOnWay(sender, kept, points)),
    };
    return kept;
  }

  /** Draws a kept measurement on its way to where it was told, at `points`. */
  private drawOnWay(sender: Sender, kept: Kept, points: readonly Point[]): void {
    const look = this.ports.look();
    if (look === null) return;
    const { told, drawn } = kept;
    const index = sender.kept.indexOf(kept);
    const effect = told.effect ? { effect: told.effect, seed: `${sender.who}:${index}` } : null;
    drawn.draw({ ...told, points: [...points] }, colourOf(told, sender.colour), look, told.walls !== false, null, effect);
  }

  /**
   * Draws one kept measurement: in its own colour, else its sender's, with its look where it has
   * one (its pattern told from the sender's others by its place among them). An aura is laid
   * around its token as the host draws that now, and has no drawing while the host draws none;
   * unless `anew`, one whose token stands on the same cells is left as it is.
   */
  drawOne(sender: Sender, kept: Kept, index: number, look: MeasureLook, anew: boolean): void {
    const { told, follower, drawn } = kept;
    const colour = colourOf(told, sender.colour);
    const effect = told.effect ? { effect: told.effect, seed: `${sender.who}:${index}` } : null;
    if (!follower) {
      // In the place of an aura that had no token, it shows its size again.
      kept.placed = null;
      drawn.parts.label.visible = true;
      drawn.draw(told, colour, look, told.walls !== false, null, effect);
      return;
    }
    const token = this.ports.token?.(follower.follows) ?? null;
    const placed = token && placeAura(follower, token, { ...look.grid, snapToGrid: look.map.cells }, look.settings, kept.placed);
    if (!anew && placed === kept.placed) return;
    kept.placed = placed;
    drawn.parts.label.visible = placed !== null;
    if (placed) drawn.draw(told, colour, look, told.walls !== false, placed, effect);
    else drawn.clear();
  }
}
