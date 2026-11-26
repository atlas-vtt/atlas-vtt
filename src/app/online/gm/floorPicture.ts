import type { DrawMine, PlayerResync, SharedScene } from '../protocol/index.ts';
import type { SightPolicy } from '../../vision/tokenSightPolicy';
import type { SceneStore } from './atlasView.ts';
import type { RulerPaths } from './dragRulers.ts';
import { ExploredShare, type SavedMemory } from './ExploredShare.ts';
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
 * What the players who see a floor through one set of eyes are sent of it beside its scene: the tokens
 * they see, the inputs their fog and lighting are drawn from, what they remember, the map's layers, the
 * live places of dragged tokens and which tokens are theirs. Its ports reach those players alone and read that picture.
 */
export class FloorPicture {
  readonly tokens: TokenShare;
  /** What players see of the map beside its tokens, the readable pins among it. */
  readonly layers: MapLayerShare;
  private readonly inputs: InputShare;
  private readonly explored: ExploredShare;
  private readonly live: LiveShare | null;
  private readonly mine: MineShare | null;
  /** Each character's own dice by what they are read by (`diceKey`), until Atlas changes. */
  private readonly dice = new Map<string, ReturnType<typeof tokenRollDice>>();

  constructor(store: SceneStore, ports: FloorPicturePorts, floor: PictureFloor) {
    const seats = ports.seats;
    const ownerOf = ownerIn(seats, store);
    // Reading a set looks the library and the template up: done once a token's statblock or art is another, not at every move.
    const diceOf = (tokenId: string): ReturnType<typeof tokenRollDice> => {
      const token = store.getState().objects.tokens[tokenId];
      if (token === undefined) return undefined;
      const key = diceKey(token);
      if (!this.dice.has(key)) this.dice.set(key, tokenRollDice(ports.dice?.() ?? null, token));
      return this.dice.get(key);
    };
    const mine = seats === undefined ? null : new MineShare({ onlinePlayers: () => ports.members(), ownerOf, diceOf }, ports);
    this.mine = mine;
    // The initiative list shows the players' look-alike numbers too: it follows them as they change
    this.tokens = new TokenShare(store, { ...ports, numbersChanged: () => this.layers.update(), liveCarriedUntil: (alias) => this.live?.carriedUntil(alias) }, (listed) => mine?.setList(listed));
    this.live = ports.sendLive === undefined ? null : new LiveShare(store, {
      ...ports, sendLive: (body, key) => ports.sendLive?.(body, key), rulers: () => floor.rulers(), holder: (tokenId) => floor.holder(tokenId),
    }, () => ({ scene: this.tokens.listedScene, alias: (tokenId) => this.tokens.listedAlias(tokenId) }));
    this.inputs = new InputShare(store, { ...ports, shownTokens: () => this.tokens.shownIds(), tokenAlias: (id) => this.tokens.alias(id), fogEdge: () => ports.atlas().settings.fogEdge });
    this.explored = new ExploredShare(ports);
    this.layers = new MapLayerShare(store, {
      ...ports, mapLayers: () => ports.mapLayers?.() ?? null, badgeOf: (tokenId) => this.tokens.badgeOf(tokenId), tokenAlias: (tokenId) => this.tokens.listedAlias(tokenId),
      // Each player of the picture is told what is theirs after each change, so a page knows which message its own are counted in.
      drawnBy: (above) => new Map(ports.members().flatMap((player) => {
        const own = floor.drawnBy(player, above);
        return own === null ? [] : [[player, own] as const];
      })),
      map: () => floor.map(),
    });
  }

  /** The floor's scene from now on, or none; null also forgets what was sent of the scene before. */
  setScene(scene: SharedScene | null): void {
    this.tokens.feed.setScene(scene);
    this.live?.feed.setScene(scene);
    this.inputs.feed.setScene(scene);
    this.explored.feed.setScene(scene);
    this.layers.feed.setScene(scene);
  }

  /** The scene is being read again: nothing goes out until it is set. */
  clear(): void {
    this.tokens.feed.setScene(null);
    this.inputs.feed.setScene(null);
    this.explored.feed.setScene(null);
    this.layers.feed.setScene(null);
  }

  /**
   * Something the picture is made of changed: its scene, the GM's sight, or Atlas. The GM's sight changes which
   * tokens players see, the map's layers and the sight inputs alone; which tokens are a player's and their dice
   * follow the scene and Atlas.
   */
  changed(change: SceneChange): void {
    if (change === 'sight') {
      this.tokens.sightChanged();
      this.live?.update();
      this.layers.update();
      this.inputs.feed.update();
      return;
    }
    if (change === 'atlas') this.dice.clear();
    this.tokens.update();
    this.live?.update();
    this.layers.update();
    this.inputs.feed.update();
    this.explored.update();
    if (change === 'atlas') this.mine?.update();
    else this.mine?.feed.update();
  }

  /** The tokens, inputs, layers and owned tokens again, whole, to one player or to all of the picture's. */
  resend(to?: string): void {
    this.tokens.feed.resend(to);
    this.inputs.feed.resend(to);
    this.explored.feed.resend(to);
    this.layers.feed.resend(to);
    this.mine?.feed.resend(to);
  }

  resync(from: string, message: PlayerResync): void {
    if (message.of === 'tokens') this.tokens.feed.resync(from, message);
    else this.inputs.feed.resync(from, message);
  }

  refreshAssets(): void {
    this.tokens.refreshArt();
    this.layers.refreshArt();
    this.explored.refreshAssets();
  }

  /** Who owns which token changed: which tokens are each player's is told again. */
  ownersChanged(): void {
    this.tokens.update();
    this.mine?.update();
  }

  /** The memory the picture's players remember changed: it goes out, and what they know by it is told again. */
  memoryChanged(): void {
    this.explored.update();
    this.layers.update();
  }

  stop(): void {
    this.tokens.feed.stop();
    this.live?.feed.stop();
    this.inputs.feed.stop();
    this.explored.feed.stop();
    this.layers.feed.stop();
  }
}
