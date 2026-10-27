import { Pacer, type PacerClock } from '../marks/index.ts';
import { LIVE_INTERVAL_MS, MAX_COORDINATE, MAX_LIVE_PATH, MAX_LIVE_TOKENS, type GmMessage, type LivePlace, type MarkPoint } from '../protocol/index.ts';
import { sightOnDropOn } from '../../lighting/sceneLightingOptions';
import type { PlayerTokenSource, SceneStore } from './atlasView.ts';
import type { RulerPaths } from './dragRulers.ts';
import { roundPlace } from './scenePicture.ts';
import { levelObjects } from '../../levels/levelObjects';
import { mapTokens } from '../../tokens/offMap';

export interface LiveSharePorts extends PacerClock {
  /** Sends a live message to all: it goes before other waiting frames, and a newer one replaces it while it waits. */
  sendLive(body: GmMessage, key: string): void;
  /** The shared tab's renderer as it is now, or null while it has none. */
  tokenSource(): PlayerTokenSource | null;
  /** Where the GM's canvas draws these tokens now; without it places are read from the store. */
  drawnPlaces?(tokenIds: readonly string[]): ReadonlyMap<string, Place>;
  /** The rulers of the drags under way (`dragRulerPaths`); without it players see none. */
  rulers?(): RulerPaths;
}

/** The token list players were last sent: its scene and the id they know a token by. */
export interface ListedTokens {
  readonly scene: string | null;
  alias(tokenId: string): string | undefined;
}

type Place = { readonly x: number; readonly y: number };
/** A place as players were sent it, with its ruler written out to compare, and the token's GM id. */
type SentPlace = Place & { readonly path?: readonly MarkPoint[]; readonly ruler: string; readonly tokenId: string };

/**
 * How long after the lane last told of a held token the token list still keeps it where it was
 * listed (`carriedUntil`): a drag that rests longer lands its place in the list, well before a page
 * gives up on a drag it hears nothing of (1.5 s) and hands the token back to the list.
 */
export const CARRY_MS = 1_000;

const onMap = (value: number): boolean => Number.isFinite(value) && Math.abs(value) <= MAX_COORDINATE;
const NO_RULERS: RulerPaths = new Map();

/** A ruler as players get it, or undefined for none, or one with a point off every map or too many points. */
function sharedPath(points: readonly Place[] | undefined): MarkPoint[] | undefined {
  if (points === undefined || points.length < 2 || points.length > MAX_LIVE_PATH || !points.every(({ x, y }) => onMap(x) && onMap(y))) return undefined;
  return points.map(({ x, y }) => [roundPlace(x), roundPlace(y)]);
}

/**
 * The fast lane of a drag: while tokens are held (the GM's drag in Atlas, or a player's drag the GM
 * follows, `PlayerDrags`), their places go to all players about 30 times a second as `live`
 * messages, read from the store as it is when the message goes, the latest winning. Only tokens in
 * the list players were last sent that their picture shows now are in it (`playerRollTokens`), so the
 * lane says nothing the list would not: a token that leaves their sight or is hidden goes out once
 * more with `end` at the last place they were sent, and never again; a token let go of ends where
 * it was dropped. A message holds every token it may, moved or not, so the newest stands for all
 * before it. While the lane carries a token the token list keeps it where it was listed
 * (`carriedUntil`), and the drop, or a drag resting longer than `CARRY_MS`, lands it there; a
 * drag that rests is told again every `CARRY_MS` all the same, so a page whose list is held up behind
 * other messages (artwork, a join) never gives it up. Each token carries its drag's ruler while it measures
 * something, as Atlas's player window shows it: whenever the token is in the message, so only while
 * the players see it, and never a ruler of a token they do not see.
 */
export class LiveShare {
  private readonly store: SceneStore;
  private readonly ports: LiveSharePorts;
  private readonly listed: () => ListedTokens;
  private readonly pacer: Pacer;
  /** The places players were last sent, by the id they know each token by, while its drag lasts. */
  private sent = new Map<string, SentPlace>();
  private scene: string | null = null;
  private lit = false;
  /** Messages with an end sent so far: each waits under its own key. */
  private ended = 0;
  /** When the lane last told of each token it carries moving, by the id players know it by. */
  private sentAt = new Map<string, number>();
  /** Tells the drags under way again once the lane has said nothing for `CARRY_MS`. */
  private keepAlive: number | undefined;
  /** The next message holds the drags under way though none moved. */
  private keepAliveDue = false;

  constructor(store: SceneStore, ports: LiveSharePorts, listed: () => ListedTokens) {
    this.store = store;
    this.ports = ports;
    this.listed = listed;
    this.pacer = new Pacer(ports, LIVE_INTERVAL_MS, () => this.flush());
  }

  /** The shared scene and whether it is lit; a new one forgets the drags of the last (players drop them with it). */
  setScene(scene: { readonly id: string; readonly lit: boolean } | null): void {
    this.lit = scene?.lit === true;
    if ((scene?.id ?? null) === this.scene) return;
    this.scene = scene?.id ?? null;
    this.sent = new Map();
    this.sentAt = new Map();
    this.cancelKeepAlive();
    this.pacer.cancel();
  }

  /** The store changed: while tokens are held, or a drag just ended, their places go out. */
  update(): void {
    if (this.scene === null) return;
    if (this.sent.size > 0 || Object.keys(this.store.getState().heldTokens).length > 0) this.pacer.request();
  }

  stop(): void {
    this.setScene(null);
  }

  /**
   * Until when players follow a token's drag through this lane, by the id they know it by: `CARRY_MS`
   * after the lane last told of it, while its drag lasts; undefined for a token the lane does not
   * carry. Meanwhile the token list keeps it where it was listed.
   */
  carriedUntil(alias: string): number | undefined {
    const at = this.sent.has(alias) ? this.sentAt.get(alias) : undefined;
    return at === undefined ? undefined : at + CARRY_MS;
  }

  private flush(): void {
    const scene = this.scene;
    const state = this.store.getState();
    const listed = this.listed();
    const source = this.ports.tokenSource();
    if (scene === null || listed.scene !== scene || source === null || !state.mapLoaded || state.isMapLoading || state.mapPath === null) return;
    // At most half a message's room, so the ends that follow always fit.
    const held = Object.keys(state.heldTokens).slice(0, MAX_LIVE_TOKENS / 2);
    const shown = held.length === 0 ? new Map<string, never>() : source.playerRollTokens(state.mapPath, held);
    const sightFollows = !sightOnDropOn(state.lighting);
    const drawn = state.isDragging ? this.ports.drawnPlaces?.(held) : undefined;
    // Atlas writes the GM's own drag to the store every 50 ms: its canvas is read again on the lane's own beat.
    if (drawn !== undefined && held.length > 0) this.pacer.request();
    const rulers = this.ports.rulers?.() ?? NO_RULERS;
    const places = new Map<string, SentPlace>();
    for (const id of held) {
      const token = mapTokens(levelObjects(state))[id];
      const alias = listed.alias(id);
      if (token === undefined || alias === undefined || token.isHidden === true || !shown.has(id)) continue;
      // The GM's own drag runs ahead of the store on the canvas. Its drawn place is what players' sight
      // was asked about (fog is tested at the drawn place) only where the lighting's own place does not
      // matter: on an unlit scene, and for a token with vision, which the players always see unless
      // the scene's sight waits for the drop (then only within the sight left behind).
      const drawnCounts = !this.lit || (sightFollows && token.vision?.enabled === true);
      const place = (drawnCounts ? drawn?.get(id) : undefined) ?? token;
      if (!onMap(place.x) || !onMap(place.y)) continue;
      const path = sharedPath(rulers.get(id));
      places.set(alias, { x: roundPlace(place.x), y: roundPlace(place.y), ...(path !== undefined && { path }), ruler: JSON.stringify(path ?? null), tokenId: id });
    }
    const moved = [...places].some(([id, place]) => {
      const last = this.sent.get(id);
      return last?.x !== place.x || last.y !== place.y || last.ruler !== place.ruler;
    });
    const ends = [...this.sent].filter(([id]) => !places.has(id));
    const ending = ends.length > 0;
    const resting = !moved && !ending && this.keepAliveDue && places.size > 0;
    this.keepAliveDue = false;
    if (!moved && !ending && !resting) return;
    // Every held token is in every message, so a newer one may replace a waiting one and lose nothing.
    const tokens: LivePlace[] = [...places].map(([id, { x, y, path }]) => ({ id, x, y, ...(path !== undefined && { path }) }));
    const dropped = this.droppedPlaces(ends.map(([, place]) => place.tokenId));
    for (const [id, place] of ends) tokens.push({ id, ...(dropped.get(place.tokenId) ?? { x: place.x, y: place.y }), end: true });
    const now = this.ports.now();
    this.sent = places;
    // Telling a drag that rests again keeps it on the pages, not in the list's way: the list lands it.
    if (!resting) this.sentAt = new Map([...places.keys()].map((id) => [id, now]));
    this.cancelKeepAlive();
    if (places.size > 0) {
      this.keepAlive = this.ports.setTimer(() => {
        this.keepAlive = undefined;
        this.keepAliveDue = true;
        this.pacer.request();
      }, CARRY_MS);
    }
    // An end is said once: its message waits under a key of its own, which no later message replaces.
    if (ending) this.ended += 1;
    this.ports.sendLive({ t: 'live', scene, at: now, tokens }, ending ? `${scene}\n${this.ended}` : scene);
  }

  private cancelKeepAlive(): void {
    if (this.keepAlive !== undefined) this.ports.clearTimer(this.keepAlive);
    this.keepAlive = undefined;
    this.keepAliveDue = false;
  }

  /**
   * Where the drag of each of these tokens ends: a token let go of that players still see ends where
   * it was dropped, as the token list lands it; one that left their sight or is hidden (absent here)
   * ends where they last saw it.
   */
  private droppedPlaces(tokenIds: readonly string[]): Map<string, Place> {
    const state = this.store.getState();
    const source = this.ports.tokenSource();
    const free = tokenIds.filter((id) => !Object.hasOwn(state.heldTokens, id));
    if (free.length === 0 || source === null || state.mapPath === null) return new Map();
    const shown = source.playerRollTokens(state.mapPath, free);
    return new Map(free.flatMap((id): [string, Place][] => {
      const token = mapTokens(state.objects)[id];
      if (token === undefined || token.isHidden === true || !shown.has(id) || !onMap(token.x) || !onMap(token.y)) return [];
      return [[id, { x: roundPlace(token.x), y: roundPlace(token.y) }]];
    }));
  }
}
