import { CURSOR_KEEPALIVE_MS, GM_MARKS, MARKS_INTERVAL_MS, MAX_LASER_SPAN_MS, MAX_MARK_KEPT, MAX_MARK_LASER_NUMBERS, type GmMessage, type LaserState, type MarksMessage, type MeasureState, type PlayerCursor, type PlayerLaser, type PlayerMeasure } from '../protocol/index.ts';
import type { UnderWaySource } from '../../annotations/underWay';
import type { FogCoverage } from '../../fog/fogCoverage';
import type { SceneSource } from '../../host/sceneSource';
import type { Measurements } from '../../pixi/measure/measurements';
import { CursorShare, type CursorSharePorts } from './CursorShare.ts';
import { GmMeasures, type PlayersView, type TokenAlias } from './gmMeasures.ts';
import { GmStrokes } from './gmStrokes.ts';
import { checkLaser, checkMeasure, markRate } from './markCheck.ts';
import type { MapSize, MoveRate } from './moveCheck.ts';
import { legacyMeasures, Pacer, type CursorSource, type LaserSource, type PacerClock } from '../marks/index.ts';

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
  /** The drawing the GM is making on the shared tab; without it players see a drawing once it is made. */
  readonly stroke?: UnderWaySource;
  /** The committed fog of the level shown, which a drawing under way is judged by as a finished one is; null while it cannot be read. */
  fog?(): FogCoverage | null;
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
  sendLive?(body: GmMessage, key: string, to?: string): void;
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
  /** The id players know a token by, which an aura names the token it lies around by; without it players are told no aura. */
  tokenAlias?: TokenAlias;
}

/** The live lane's key for `marks`: one waits at most. */
const MARKS_KEY = 'marks';

/** A player's laser that sent nothing for this long is gone (the client sends while it shows, at least twice a second). */
export const LASER_SILENCE_MS = 1000;
const isEmpty = (marks: MarksMessage): boolean => marks.lasers.length === 0 && marks.measures.length === 0 && (marks.cursors?.length ?? 0) === 0 && (marks.strokes?.length ?? 0) === 0;

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

/** Whether a sender is drawing a measurement, which a span then times: by what it tells in full, where it tells any. */
const isDrawing = ({ live, full }: MeasureState): boolean => (full ? full.live : live) !== null;

/** Whether a sender has no measurement at all. */
const hasNone = (state: MeasureState): boolean => !isDrawing(state) && (state.full ?? state).kept.length === 0;

/** A sender's measurements as `marks` and the GM's overlay take them, with the time since the live one's end was last told. */
const measureEntry = (who: string, state: MeasureState, span: number | null): MeasureEntry => {
  const { color, live, kept, full } = state;
  return { who, color, live, kept, ...(isDrawing(state) && span !== null && { span }), ...(full && { full }) };
};

/** The time messages cover together: null once one of them told none, and no more than a message may tell. */
const spansAdded = (covered: number | null, span: number | undefined): number | null => (covered === null || span === undefined ? null : Math.min(MAX_LASER_SPAN_MS, covered + span));

/**
 * Everyone's marks in the shared scene, sent to all as one `marks` message at most every
 * `MARKS_INTERVAL_MS` through the live lane, only when something changed: the GM's measurements
 * players may see (`GmMeasures`), the drawing the GM is making where players will see it (`GmStrokes`),
 * the GM's laser, each player's checked laser and measurements, and, while the GM lets
 * everyone see them, everyone's cursors (`CursorShare`). Each client leaves out its own. The GM's own overlay does not wait for that pace: it is shown a player's marks
 * as they arrive.
 *
 * A player's measurements told in full go on in full, and beside them in the older words, which
 * are made from them here as the GM's own are (`legacyMeasures`): whatever a page said in those
 * words beside its full ones is not sent on. Only the GM's measurements have a colour of their
 * own, an effect or an aura: a player's are taken without (`checkMeasure`).
 */
export class MarkShare {
  private readonly ports: MarkSharePorts;
  private readonly map: () => MapSize | null;
  private readonly pacer: Pacer;
  private readonly gm = new GmMeasures();
  private readonly strokes = new GmStrokes();
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
    this.strokes.reset();
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
      if (hasNone(state)) this.measures.delete(from);
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

  /**
   * The last marks to a player whose map shows again, also where there are none (so marks they held
   * from before go): through the live lane under a key of that player's, where a newer one replaces it.
   */
  catchUp(to: string): void {
    if (this.last === null) return;
    if (this.ports.sendLive === undefined) this.ports.send(this.last.body, to);
    else this.ports.sendLive(this.last.body, MARKS_KEY, to);
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
    this.strokes.reset();
    if (source === null) return;
    // Atlas tells of a measurement several times within one event (drawn, kept, cleared): it is read once the event is done.
    const { measurements } = source;
    const measured = (): void => queueMicrotask(() => {
      if (this.source !== source || measurements === null) return;
      this.gm.follow(measurements.get(), source, this.ports.now());
      this.pacer.request();
    });
    const request = (): void => this.pacer.request();
    const drawn = (): void => {
      this.strokes.moved(this.ports.now());
      this.pacer.request();
    };
    const stops = [
      measurements?.subscribe(measured) ?? (() => undefined), source.laser.subscribe(request), source.cursor?.subscribe(request) ?? (() => undefined),
      source.onPlayersViewChange?.(request) ?? (() => undefined), source.stroke?.subscribe(drawn) ?? (() => undefined),
    ];
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
    const playerMeasures = [...this.measures].map(([who, { state, covered }]) => measureEntry(who, this.inBothWords(state), covered ?? null));
    for (const held of this.measures.values()) held.covered = undefined;
    const cursors = this.cursors.take(this.source?.cursor ?? null);
    const now = this.ports.now();
    const stroke = this.source?.stroke === undefined ? undefined : this.strokes.take(this.source.stroke.get(), this.source.fog?.() ?? null, now);
    const body: MarksMessage = {
      t: 'marks',
      scene: this.scene,
      lasers: [...this.gmLaser(), ...playerLasers.filter((laser) => laser.at !== null || laser.on || laser.pts.length > 0)],
      measures: [...this.gmMeasures(), ...playerMeasures],
      ...(cursors !== undefined && { cursors }),
      ...(stroke !== undefined && { strokes: [{ who: GM_MARKS, ...stroke }] }),
    };
    const text = JSON.stringify(body);
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
    const state: MeasureState = { color: this.ports.accent?.() ?? DEFAULT_ACCENT, ...this.gm.shown(this.source.seen(), this.ports.tokenAlias) };
    const span = this.gm.takeSpan();
    return hasNone(state) ? [] : [measureEntry(GM_MARKS, state, span ?? null)];
  }

  /** A player's measurements told in full, with the older words made from them for the pages that read no others; others as they came. */
  private inBothWords(state: MeasureState): MeasureState {
    return state.full ? { ...state, ...legacyMeasures(state.full, this.gm.walled, MAX_MARK_KEPT) } : state;
  }
}
