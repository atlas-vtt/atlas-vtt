import type { GmMessage, SharedFloor } from '../protocol/index.ts';
import type { FloorSharePorts } from './FloorShare.ts';
import { floorLayerSource, floorTokenSource, type FloorSight } from './floorSight.ts';
import type { SceneSharePorts } from './sceneSharePorts.ts';

/** What makes a floor's ports out of the scene's. */
export interface FloorPortsDeps {
  /** Whether the GM's view shows this floor now: only then is the GM's renderer its picture. */
  viewed(): boolean;
  /** The floor's picture worked out on the CPU, for while the GM's view shows another floor. */
  readonly sight: FloorSight;
  /** The grid's cell, which a sensed token's outline is sized by. */
  cell(): number;
  /** The ids players know tokens by, the same on every floor. */
  readonly aliases: Map<string, string>;
  send(body: GmMessage, to?: string): void;
  sendLive(body: GmMessage, key: string, to?: string): void;
  /** The connected players on the floor, or null where everyone is (a scene of one floor). */
  playersOn(): readonly string[] | null;
  notice(text: string): void;
  /** Which floor of its map this is, for players to tell; none for a scene of one floor. */
  describe(): SharedFloor | undefined;
}

/**
 * The ports of one floor's share: the scene's, with messages going to the floor's players, the GM's
 * renderer as the players' picture only while the GM's view shows the floor (else the picture worked
 * out here), and the GM's marks, rulers and the players' marks on the GM's canvas only for that floor.
 */
export function floorPorts(ports: SceneSharePorts, deps: FloorPortsDeps): FloorSharePorts {
  const viewed = (): boolean => deps.viewed();
  const cell = (): number => deps.cell();
  const { sight } = deps;
  const seats = ports.seats;
  return {
    ...ports,
    aliases: deps.aliases,
    send: (body, to) => deps.send(body, to),
    ...(ports.sendLive !== undefined && { sendLive: (body: GmMessage, key: string, to?: string) => deps.sendLive(body, key, to) }),
    tokenSource: () => (viewed() ? ports.tokenSource() : floorTokenSource(sight, ports.tokenSource())),
    mapLayers: () => (viewed() ? ports.mapLayers?.() ?? null : floorLayerSource(sight, ports.mapLayers?.() ?? null, cell)),
    gmMarks: () => (viewed() ? ports.gmMarks?.() ?? null : null),
    gmDragRuler: () => (viewed() ? ports.gmDragRuler?.() ?? null : null),
    drawnPlaces: (tokenIds) => (viewed() ? ports.drawnPlaces?.(tokenIds) : undefined) ?? new Map(),
    showPlayerMarks: (marks) => {
      if (viewed()) ports.showPlayerMarks?.(marks);
    },
    showPlayerDrags: (drags) => {
      if (viewed()) ports.showPlayerDrags?.(drags);
    },
    showPlayerCursors: (cursors) => {
      if (viewed()) ports.showPlayerCursors?.(cursors);
    },
    seats: seats === undefined ? undefined : {
      onlinePlayers: () => deps.playersOn() ?? seats.onlinePlayers(),
      ownerOf: (tokenId, token) => seats.ownerOf(tokenId, token),
      claimOf: (mapPath, tokenId, token) => seats.claimOf(mapPath, tokenId, token),
    },
    notice: (text) => deps.notice(text),
    floor: () => deps.describe(),
  };
}

/** How long the same notice is not shown again: every floor tells it alike. */
const NOTICE_REPEAT_MS = 5000;

/** The GM's notices, each shown once while every floor of the scene tells it. */
export function noticeOnce(ports: Pick<SceneSharePorts, 'notice' | 'now'>): (text: string) => void {
  let last: { readonly text: string; readonly at: number } | null = null;
  return (text) => {
    const now = ports.now();
    if (last?.text === text && now - last.at < NOTICE_REPEAT_MS) return;
    last = { text, at: now };
    ports.notice(text);
  };
}
