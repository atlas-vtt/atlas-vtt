import type { GmMessage, SharedFloor } from '../protocol/index.ts';
import { PLAYER_SIGHT_POLICY, type SightPolicy } from '../../vision/tokenSightPolicy';
import type { MapLayerSource } from './atlasMapLayers.ts';
import type { PlayerTokenSource, SceneState } from './atlasView.ts';
import { EyesSight, type EyesContext, type PartyLighting, type PictureBasis } from './eyesSight.ts';
import { FloorSight } from './floorSight.ts';
import type { MapSize } from './moveCheck.ts';
import type { SceneSharePorts } from './sceneSharePorts.ts';

/** A picture's token source, map layers and sight, as one set of eyes reads them. */
export interface PictureSources {
  tokenSource(): PlayerTokenSource | null;
  mapLayers(): MapLayerSource | null;
  /** What the eyes see of the floor now, which their memory records; null while it cannot be worked out. */
  seen(): PartyLighting | null;
}

export interface FloorSharePorts extends SceneSharePorts {
  /** Which floor of its map this scene is, for players to tell; none for a map of one floor. */
  floor?(): SharedFloor | undefined;
  /** The picture of eyes that see by `policy` (one player's own, `narrowPolicy`), cut from the party's picture of this floor. */
  eyes(policy: SightPolicy): PictureSources;
}

/** What makes a floor's ports out of the scene's. */
export interface FloorPortsDeps {
  /** Whether the GM's view shows this floor now: only then is the GM's renderer its picture. */
  viewed(): boolean;
  /** The floor's state: the shared scene with this floor shown. */
  state(): SceneState;
  /** The size of the floor's map, or null while it is not known. */
  map(): MapSize | null;
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
 * renderer as the party's picture only while the GM's view shows the floor (else the picture worked
 * out here, `FloorSight`), a player's own picture cut from whichever of the two, and the GM's marks,
 * rulers and the players' marks on the GM's canvas only for that floor.
 */
export function floorPorts(ports: SceneSharePorts, deps: FloorPortsDeps): FloorSharePorts {
  const viewed = (): boolean => deps.viewed();
  const sight = new FloorSight({ state: () => deps.state(), map: () => deps.map(), lightingSource: () => ports.lightingSource(), cell: () => deps.cell() });
  const context: EyesContext = { state: () => deps.state(), rules: () => ports.lightingSource()?.rules() };
  const sources = (eyes: EyesSight, basis: () => PictureBasis): PictureSources => ({
    tokenSource: () => {
      const grid = ports.tokenSource();
      return grid === null ? null : eyes.tokens(basis(), grid);
    },
    mapLayers: () => {
      const base = ports.mapLayers?.() ?? null;
      return base === null ? null : eyes.layers(basis(), base);
    },
    seen: () => eyes.seen(basis()),
  });
  const party = sources(new EyesSight(PLAYER_SIGHT_POLICY, context), () => sight);
  const seats = ports.seats;
  return {
    ...ports,
    aliases: deps.aliases,
    send: (body, to) => deps.send(body, to),
    ...(ports.sendLive !== undefined && { sendLive: (body: GmMessage, key: string, to?: string) => deps.sendLive(body, key, to) }),
    tokenSource: () => (viewed() ? ports.tokenSource() : party.tokenSource()),
    mapLayers: () => (viewed() ? ports.mapLayers?.() ?? null : party.mapLayers()),
    eyes: (policy: SightPolicy) => sources(new EyesSight(policy, context), () => (viewed() ? ports.pictureBasis?.() ?? sight : sight)),
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
    showPlayerStrokes: (strokes) => {
      if (viewed()) ports.showPlayerStrokes?.(strokes);
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
