import type { GmMessage, SharedFloor } from '../protocol/index.ts';
import { PLAYER_SIGHT_POLICY, type SightPolicy } from '../../vision/tokenSightPolicy';
import type { SceneState } from './atlasView.ts';
import type { PerceivedFloor } from '../../perception/playersPerception';
import { EyesSight } from './eyesSight.ts';
import type { FloorRoutes } from './floorRoutes.ts';
import { FloorSight } from './floorSight.ts';
import { cpuFloorSource, eyesPicture, floorReads, type FloorReads, type FloorSource, type GmTab, type PictureSources } from './floorSource.ts';
import type { MapSize } from './moveCheck.ts';
import type { Floor } from './playerFloors.ts';
import type { SceneSharePorts } from './sceneSharePorts.ts';

export interface FloorSharePorts extends SceneSharePorts, FloorReads {
  /** Where the floor is read now, as the GM's tab names it (`GmTab.sourceOf`). */
  source(): FloorSource;
  /** Which floor of its map this scene is, for players to tell; none for a map of one floor. */
  floor?(): SharedFloor | undefined;
  /** The picture of eyes that see by `policy` (one player's own, `ownPolicy`), cut from the party's picture of this floor. */
  eyes(policy: SightPolicy): PictureSources;
  /** Whose eyes the floor's players see it through, and who hears each of its messages. */
  readonly routes: FloorRoutes;
}

/** What makes a floor's ports out of the scene's. */
export interface FloorPortsDeps {
  readonly floor: Floor;
  /** The floor's state: the shared scene with this floor shown. */
  state(): SceneState;
  /** The size of the floor's map, or null while it is not known. */
  map(): MapSize | null;
  /** The grid's cell, which a sensed token's outline is sized by. */
  cell(): number;
  /** The ids players know tokens by, the same on every floor. */
  readonly aliases: Map<string, string>;
  /** Who hears the floor's messages. */
  readonly routes: FloorRoutes;
  notice(text: string): void;
  /** Which floor of its map this is, for players to tell; none for a scene of one floor. */
  describe(): SharedFloor | undefined;
}

/**
 * The ports of one floor's share: the scene's, with messages going to the floor's players (`FloorRoutes`), and
 * the floor read from the source the GM's tab names for it at each read: the tab itself while its view shows the
 * floor, the floor worked out here on the CPU otherwise (`FloorSight`), nothing while the scene is held. A
 * player's own picture is cut from the same source's basis.
 */
export function floorPorts(ports: SceneSharePorts, deps: FloorPortsDeps): FloorSharePorts {
  const tab = (): GmTab => ports.tab();
  const sight = new FloorSight({ state: () => deps.state(), map: () => deps.map(), lightingSource: () => tab().lightingSource(), cell: () => deps.cell() });
  const context: PerceivedFloor = { state: () => deps.state(), rules: () => tab().lightingSource()?.rules() };
  const cpu = cpuFloorSource(sight, eyesPicture(new EyesSight(PLAYER_SIGHT_POLICY, context), () => sight, tab));
  const source = (): FloorSource => tab().sourceOf(deps.floor, cpu);
  const { routes } = deps;
  const seats = ports.seats;
  return {
    ...ports,
    ...floorReads(source, tab),
    source,
    aliases: deps.aliases,
    routes,
    send: (body, to) => routes.send(body, to),
    ...(ports.sendLive !== undefined && { sendLive: (body: GmMessage, key: string, to?: string) => routes.sendLive(body, key, to) }),
    eyes: (policy: SightPolicy) => eyesPicture(new EyesSight(policy, context), () => source().basis() ?? sight, tab),
    seats: seats === undefined ? undefined : {
      onlinePlayers: () => routes.playersOn(),
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
