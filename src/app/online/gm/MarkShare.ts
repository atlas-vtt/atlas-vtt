import { CURSOR_KEEPALIVE_MS, GM_MARKS, MARKS_INTERVAL_MS, MAX_LASER_SPAN_MS, MAX_MARK_LASER_NUMBERS, type GmMessage, type LaserState, type MarksMessage, type MeasureState, type PlayerCursor, type PlayerLaser, type PlayerMeasure } from '../protocol/index.ts';
import type { SceneSource } from '../../host/sceneSource';
import type { Measurements } from '../../pixi/MeasureRenderer';
import { CursorShare, type CursorSharePorts } from './CursorShare.ts';
import { GmMeasures, type PlayersView } from './gmMeasures.ts';
import { checkLaser, checkMeasure, markRate } from './markCheck.ts';
import type { MapSize, MoveRate } from './moveCheck.ts';
import { Pacer, type CursorSource, type LaserSource, type PacerClock } from '../marks/index.ts';

/** The GM's own marks on the shared tab: its renderer's measurements, its laser, and what players see of the tokens. */
export interface GmMarkSource extends PlayersView {
  /** The renderer's measurement records; null in an Atlas build without them, whose measurements players then do not see. */
  readonly measurements: SceneSource<Measurements> | null;
  readonly laser: LaserSource;
  /** The GM's own cursor over the map; without it players see none of the GM's. */
  readonly cursor?: CursorSource;
  /** The GM's laser colour and size (Atlas's settings). */
  laserLook(): { readonly color: string; readonly size: number };
  /** Calls `listener` whenever what the players see of the tokens may have changed; returns the function that stops it. */
  onPlayersViewChange?(listener: () => void): () => void;
}

/** Players' marks, for the GM to see over the map. */
export type PlayerMarks = Pick<MarksMessage, 'lasers' | 'measures'>;

export interface MarkSharePorts extends PacerClock, Partial<Pick<CursorSharePorts, 'nameOf' | 'showPlayerCursors'>> {
  send(body: GmMessage, to?: string): void;
  /**
   * Sends to all through the live lane, where there is one: before any game message that waits, and
   * a newer `marks` takes the place of one not sent yet, so nothing queues for a slow uplink. Without
   * it marks go in order with the rest.
   */
  sendLive?(body: GmMessage, key: string): void;
  /** The GM's measurements and laser on the shared tab, the same object while its renderer is the same; null while it has none, and without it players see none of the GM's marks. */
  gmMarks?(): GmMarkSource | null;
  /** The GM's accent colour as `#rrggbb`, which the GM's measurements are drawn in; null while it cannot be read. */
  accent?(): string | null;
  /**
   * Draws the players' marks for the GM: every player's as they are now, called as each arrives. A
   * laser's `pts` are those new since the call before, so only the laser that just arrived has any.
   */
  showPlayerMarks?(marks: PlayerMarks): void;
  /** Whether the GM lets everyone see each other's cursor; without it nobody's cursor is taken or sent. */
  cursorsShown?(): boolean;
}

/** The live lane's key for `marks`: one waits at most. */
const MARKS_KEY = 'marks';

/** A player's laser that sent nothing for this long is gone (the client sends while it shows, at least twice a second). */
export const LASER_SILENCE_MS = 1000;
const isEmpty = (marks: MarksMessage): boolean => marks.lasers.length === 0 && marks.measures.length === 0 && (marks.cursors?.length ?? 0) === 0;

/** Obsidian's default accent, for when the theme's cannot be read. */
const DEFAULT_ACCENT = '#8a5cf5';

/** A player's trail points not sent on yet, and the time they cover: null when a message of them told none. */
interface WaitingTrail {
  readonly pts: number[];
  readonly span: number | null;
}

interface PlayerLaserState {
  state: LaserState;
  /** What came since the last `marks` message; null when nothing did. */
  waiting: WaitingTrail | null;
  at: number;
}

interface PlayerMeasureState {
  state: MeasureState;
  /** The time the messages since the last `marks` message cover: null when one of them told none, undefined when none came. */
  covered: number | null | undefined;
}

type LaserEntry = MarksMessage['lasers'][number];
type MeasureEntry = MarksMessage['measures'][number];

/** A laser as `marks` and the GM's overlay take it: its look and pointer, with these trail points and the time they cover. */
const laserEntry = (who: string, { color, size, at, on }: LaserState, pts: readonly number[], span: number | null): LaserEntry => ({ who, color, size, at, pts, on, ...(span !== null && { span }) });

/** A sender's measurements as `marks` and the GM's overlay take them, with the time since the live one's end was last told. */
const measureEntry = (who: string, { color, live, kept }: MeasureState, span: number | null): MeasureEntry => ({ who, color, live, kept, ...(live !== null && span !== null && { span }) });

/** The time messages cover together: null once one of them told none, and no more than a message may tell. */
const spansAdded = (covered: number | null, span: number | undefined): number | null => (covered === null || span === undefined ? null : Math.min(MAX_LASER_SPAN_MS, covered + span));

/**
 * Everyone's marks in the shared scene, sent to all as one `marks` message at most every
 * `MARKS_INTERVAL_MS` through the live lane, only when something changed: the GM's measurements
 * players may see (`GmMeasures`), the GM's laser, each player's checked laser and measurements, and, while the GM lets
 * everyone see them, everyone's cursors (`CursorShare`). Each client leaves out its own. The GM's own overlay does not wait for that pace: it is shown a player's marks
 * as they arrive.
 */
export class MarkShare {
  private readonly ports: MarkSharePorts;
  private readonly map: () => MapSize | null;
  private readonly pacer: Pacer;
  private readonly gm = new GmMeasures();
  private readonly lasers = new Map<string, PlayerLaserState>();
  private readonly measures = new Map<string, PlayerMeasureState>();
  private readonly laserRate: MoveRate = markRate();
  private readonly measureRate: MoveRate = markRate();
  private readonly cursors: CursorShare;
  private scene: string | null = null;
  private source: GmMarkSource | null = null;
  private stopSource: (() => void) | null = null;
  private last: { readonly body: MarksMessage; readonly text: string } | null = null;
  /** When marks last went out. */
  private sentAt = Number.NEGATIVE_INFINITY;

  /** `map` is the shared map's size, which marks must stay near; null when it is unknown. */
  constructor(ports: MarkSharePorts, map: () => MapSize | null) {
    this.ports = ports;
    this.map = map;
    this.pacer = new Pacer(ports, MARKS_INTERVAL_MS, () => this.send());
    this.cursors = new CursorShare({
      now: () => ports.now(),
      shown: () => ports.cursorsShown?.() === true,
      nameOf: (player) => ports.nameOf?.(player) ?? null,
      pointing: (who) => this.pointing(who),
      ...(ports.showPlayerCursors !== undefined && { showPlayerCursors: (cursors) => ports.showPlayerCursors?.(cursors) }),
    });
  }

  /** The shared scene; another one starts without marks. */
  setScene(scene: string | null): void {
    if (scene === this.scene) return;
    this.scene = scene;
    this.lasers.clear();
    this.measures.clear();
    this.gm.reset();
    this.cursors.reset();
    this.pacer.cancel();
    this.last = null;
    this.ports.showPlayerMarks?.({ lasers: [], measures: [] });
    this.update();
  }

  /** A player's laser, measurements or cursor: checked, then kept until they change, go silent or the player leaves. */
  receive(from: string, message: PlayerLaser | PlayerMeasure | PlayerCursor): void {
    const now = this.ports.now();
    const context = { scene: this.scene, map: this.map() };
    if (message.t === 'cursor') {
      if (!this.cursors.receive(from, message, context)) return;
    } else if (message.t === 'laser') {
      const state = this.laserRate.take(from, now) ? checkLaser(message, context) : null;
      if (state === null) return;
      const waiting = this.lasers.get(from)?.waiting ?? { pts: [], span: 0 };
      const pts = [...waiting.pts, ...state.pts].slice(-MAX_MARK_LASER_NUMBERS);
      this.lasers.set(from, { state, waiting: { pts, span: spansAdded(waiting.span, state.span) }, at: now });
      this.show({ laser: from });
    } else {
      const state = this.measureRate.take(from, now) ? checkMeasure(message, context) : null;
      if (state === null) return;
      const covered = this.measures.get(from)?.covered;
      if (state.live === null && state.kept.length === 0) this.measures.delete(from);
      else this.measures.set(from, { state, covered: spansAdded(covered === undefined ? 0 : covered, state.span) });
      this.show({ measure: from });
    }
    this.pacer.request();
  }

  /** A player left: their marks go. */
  playerLeft(player: string): void {
    const hadLaser = this.lasers.delete(player);
    const hadMeasures = this.measures.delete(player);
    const hadCursor = this.cursors.playerLeft(player);
    if (!hadLaser && !hadMeasures && !hadCursor) return;
    this.show();
    this.pacer.request();
  }

  /**
   * Looks again: the shared tab's renderer may be another, a player's laser may have gone silent, and
   * what the players see of the GM's measurements may have changed without a measurement changing.
   */
  update(): void {
    const source = this.scene === null ? null : (this.ports.gmMarks?.() ?? null);
    if (source !== this.source) this.follow(source);
    const now = this.ports.now();
    let silent = false;
    for (const [player, laser] of this.lasers) {
      if (now - laser.at > LASER_SILENCE_MS) {
        this.lasers.delete(player);
        silent = true;
      }
    }
    if (silent) this.show();
    this.cursors.update();
    if (this.scene !== null) this.pacer.request();
  }

  /** The last marks again, to one player or to all. */
  resend(to?: string): void {
    if (this.last !== null && !isEmpty(this.last.body)) this.ports.send(this.last.body, to);
  }

  stop(): void {
    this.follow(null);
    this.pacer.cancel();
  }

  private follow(source: GmMarkSource | null): void {
    this.stopSource?.();
    this.stopSource = null;
    this.source = source;
    this.gm.reset();
    if (source === null) return;
    // Atlas tells of a new measurement inside the press that began it, before the press reaches the
    // laser's tap: the press is read once the event is done.
    const { measurements } = source;
    const measured = (): void => queueMicrotask(() => {
      if (this.source !== source || measurements === null) return;
      this.gm.follow(measurements.get(), source.laser.lastPress(), source, this.ports.now());
      this.pacer.request();
    });
    const request = (): void => this.pacer.request();
    const stops = [measurements?.subscribe(measured) ?? (() => undefined), source.laser.subscribe(request), source.cursor?.subscribe(request) ?? (() => undefined), source.onPlayersViewChange?.(request) ?? (() => undefined)];
    this.stopSource = () => stops.forEach((stop) => stop());
    measured();
  }

  /**
   * Shows the GM every player's marks as they are now. `arrived` names the player whose laser or
   * measurements just came: only that mark is shown with what its message brought, its new trail
   * points and its span, since the overlay adds each to what it has.
   */
  private show(arrived: { readonly laser?: string; readonly measure?: string } = {}): void {
    if (this.ports.showPlayerMarks === undefined) return;
    const lasers = [...this.lasers].map(([who, { state }]) => (who === arrived.laser ? laserEntry(who, state, state.pts, state.span ?? null) : laserEntry(who, state, [], null)));
    const measures = [...this.measures].map(([who, { state }]) => measureEntry(who, state, who === arrived.measure ? (state.span ?? null) : null));
    this.ports.showPlayerMarks({ lasers, measures });
  }

  private send(): void {
    if (this.scene === null) return;
    const playerLasers = [...this.lasers].map(([who, { state, waiting }]) => laserEntry(who, state, waiting?.pts ?? [], waiting?.span ?? null));
    for (const laser of this.lasers.values()) laser.waiting = null;
    const playerMeasures = [...this.measures].map(([who, { state, covered }]) => measureEntry(who, state, covered ?? null));
    for (const held of this.measures.values()) held.covered = undefined;
    const cursors = this.cursors.take(this.source?.cursor ?? null);
    const body: MarksMessage = {
      t: 'marks',
      scene: this.scene,
      lasers: [...this.gmLaser(), ...playerLasers.filter((laser) => laser.at !== null || laser.on || laser.pts.length > 0)],
      measures: [...this.gmMeasures(), ...playerMeasures],
      ...(cursors !== undefined && { cursors }),
    };
    const text = JSON.stringify(body);
    const now = this.ports.now();
    // Cursors that show go out now and then while nothing changes, so a page can tell a GM that went silent.
    const keepAlive = (body.cursors?.length ?? 0) > 0 && now - this.sentAt >= CURSOR_KEEPALIVE_MS;
    // Nothing to tell before anyone made a mark: players start without any.
    if ((text === this.last?.text && !keepAlive) || (this.last === null && isEmpty(body))) return;
    this.last = { body, text };
    this.sentAt = now;
    if (this.ports.sendLive === undefined) this.ports.send(body);
    else this.ports.sendLive(body, MARKS_KEY);
  }

  /** Whether someone's laser shows its pointer now. */
  private pointing(who: string): boolean {
    if (who === GM_MARKS) return this.source !== null && this.source.laser.state().at !== null;
    return (this.lasers.get(who)?.state.at ?? null) !== null;
  }

  private gmLaser(): MarksMessage['lasers'] {
    const source = this.source;
    if (source === null) return [];
    const { at, on } = source.laser.state();
    const { pts, span } = source.laser.takeTrail(MAX_MARK_LASER_NUMBERS);
    return at === null && !on && pts.length === 0 ? [] : [{ who: GM_MARKS, ...source.laserLook(), at, pts, on, ...(span !== undefined && { span }) }];
  }

  private gmMeasures(): MarksMessage['measures'] {
    if (this.source === null) return [];
    const { live, kept } = this.gm.shown(this.source.seen());
    const span = this.gm.takeSpan();
    return live === null && kept.length === 0 ? [] : [measureEntry(GM_MARKS, { color: this.ports.accent?.() ?? DEFAULT_ACCENT, live, kept }, span ?? null)];
  }
}
