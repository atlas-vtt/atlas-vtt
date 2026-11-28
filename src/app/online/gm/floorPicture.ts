import type { DrawMine } from '../protocol/index.ts';
import type { SightPolicy } from '../../vision/tokenSightPolicy';
import type { SceneStore } from './atlasView.ts';
import type { RulerPaths } from './dragRulers.ts';
import { ExploredShare, type SavedMemory } from './ExploredShare.ts';
import { FeedGroup, keptWhileRead, ownScene, type FeedMember } from './feed/FeedGroup.ts';
import type { FloorSharePorts } from './floorPorts.ts';
import { InputShare } from './InputShare.ts';
import { LiveShare } from './LiveShare.ts';
import type { ToldAbove } from './mapLayerInputs.ts';
import { MapLayerShare } from './MapLayerShare.ts';
import { MineShare } from './mineShare.ts';
import type { MapSize } from './moveCheck.ts';
import { diceKey, tokenRollDice } from './rollAdvantage.ts';
import type { SceneChange } from './sceneSignal.ts';
import { ownerIn } from './seatSource.ts';
import { TokenShare } from './TokenShare.ts';

/** What a floor's pictures read of the floor beside its ports. */
export interface PictureFloor {
  /** The rulers of the drags under way, which the live lane carries. */
  rulers(): RulerPaths;
  /** Whose pointer holds a dragged token (by GM id), as players are shown it; undefined while they see no cursors. */
  holder(tokenId: string): string | undefined;
  /** Which of the drawings and texts told (`above`) `player` is told are their own; null while players may not draw. */
  drawnBy(player: string, above: ToldAbove): Pick<DrawMine, 'drawings' | 'texts' | 'seen'> | null;
  /** The floor map's size in world pixels, or null while it is unknown. */
  map(): MapSize | null;
}

export interface FloorPicturePorts extends FloorSharePorts {
  /** The players who see the floor through these eyes now. */
  members(): readonly string[];
  /** Whose tokens give sight in the players' sight inputs (`sharedSight`); unset, every one's. */
  sightPolicy?(): SightPolicy;
  /** The explored memory the picture's players remember; undefined while it cannot be said. */
  memory(): SavedMemory | undefined;
  /** That memory as a data URL, or null for none; unset, the memory the GM saved of the floor. */
  memoryMask?: (() => string | null) | undefined;
}

/**
 * What a picture is made of changed: what players see (`SceneChange`), who owns which token, the memory its players
 * remember, the map's layers beside its tokens, or the assets the store keeps.
 */
export type PictureChange = SceneChange | 'owners' | 'memory' | 'layers' | 'assets';

/**
 * What the players who see a floor through one set of eyes are sent of it beside its scene: the tokens they see, the
 * live places of dragged tokens, the inputs their fog and lighting are drawn from, what they remember, the map's
 * layers and which tokens are theirs, each a feed. Its ports reach those players alone and read that picture.
 */
export interface Picture {
  /** Its feeds, in the order they take a scene and are sent again; they reach the players `reaches` names. */
  readonly feeds: FeedGroup;
  readonly tokens: TokenShare;
  /** What players see of the map beside its tokens, the readable pins among it. */
  readonly layers: MapLayerShare;
  /** Each feed that reads what changed works its messages out again. */
  follow(change: PictureChange): void;
}

export function openPicture(store: SceneStore, ports: FloorPicturePorts, floor: PictureFloor, reaches: (player: string) => boolean): Picture {
  const seats = ports.seats;
  const ownerOf = ownerIn(seats, store);
  /** Each character's own dice by what they are read by (`diceKey`), until Atlas changes. */
  const dice = new Map<string, ReturnType<typeof tokenRollDice>>();
  // Reading a set looks the library and the template up: done once a token's statblock or art is another, not at every move.
  const diceOf = (tokenId: string): ReturnType<typeof tokenRollDice> => {
    const token = store.getState().objects.tokens[tokenId];
    if (token === undefined) return undefined;
    const key = diceKey(token);
    if (!dice.has(key)) dice.set(key, tokenRollDice(ports.dice?.() ?? null, token));
    return dice.get(key);
  };
  const mine = seats === undefined ? null : new MineShare({ onlinePlayers: () => ports.members(), ownerOf, diceOf }, ports);
  // The initiative list shows the players' look-alike numbers too: it follows them as they change
  const tokens: TokenShare = new TokenShare(store, { ...ports, numbersChanged: () => layers.update(), liveCarriedUntil: (alias) => live?.carriedUntil(alias) }, (listed) => mine?.setList(listed));
  const live: LiveShare | null = ports.sendLive === undefined ? null : new LiveShare(store, {
    ...ports, sendLive: (body, key) => ports.sendLive?.(body, key), rulers: () => floor.rulers(), holder: (tokenId) => floor.holder(tokenId),
  }, () => ({ scene: tokens.listedScene, alias: (tokenId) => tokens.listedAlias(tokenId) }));
  const inputs = new InputShare(store, { ...ports, shownTokens: () => tokens.shownIds(), tokenAlias: (id) => tokens.alias(id), fogEdge: () => ports.atlas().settings.fogEdge });
  const explored = new ExploredShare(ports);
  const layers = new MapLayerShare(store, {
    ...ports, mapLayers: () => ports.mapLayers?.() ?? null, badgeOf: (tokenId) => tokens.badgeOf(tokenId), tokenAlias: (tokenId) => tokens.listedAlias(tokenId),
    besideAlias: (tokenId) => tokens.besideAlias(tokenId),
    // Each player of the picture is told what is theirs after each change, so a page knows which message its own are counted in.
    drawnBy: (above) => new Map(ports.members().flatMap((player) => {
      const own = floor.drawnBy(player, above);
      return own === null ? [] : [[player, own] as const];
    })),
    map: () => floor.map(),
  });
  // A drag under way outlasts a read of the scene, and which tokens are a player's follows the token list.
  const members: FeedMember[] = [tokens.feed, ...(live === null ? [] : [keptWhileRead(live.feed)]), inputs.feed, explored.feed, layers.feed, ...(mine === null ? [] : [ownScene(mine.feed)])];
  const follow = (change: PictureChange): void => {
    switch (change) {
      // The GM's sight changes which tokens players see, the map's layers and the sight inputs alone.
      case 'sight':
        tokens.sightChanged();
        live?.update();
        layers.update();
        inputs.feed.update();
        return;
      case 'owners':
        tokens.update();
        mine?.update();
        return;
      case 'memory':
        explored.update();
        layers.update();
        return;
      case 'layers':
        layers.update();
        return;
      case 'assets':
        tokens.refreshArt();
        layers.refreshArt();
        explored.refreshAssets();
        return;
      default:
        // Which tokens are a player's and their dice follow the scene and Atlas.
        if (change === 'atlas') dice.clear();
        tokens.update();
        live?.update();
        layers.update();
        inputs.feed.update();
        explored.update();
        if (change === 'atlas') mine?.update();
        else mine?.feed.update();
    }
  };
  return { feeds: new FeedGroup(() => members, { reaches }), tokens, layers, follow };
}
