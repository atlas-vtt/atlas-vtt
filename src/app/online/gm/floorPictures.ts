import type { GmMessage } from '../protocol/index.ts';
import type { TokenSeen } from '../../vision/measureOrigin';
import { ownPolicy, PLAYER_SIGHT_POLICY, type SightPolicy } from '../../vision/tokenSightPolicy';
import type { SceneStore } from './atlasView.ts';
import type { SavedMemory } from './ExploredShare.ts';
import { ExploredRemovals } from './exploredRemovals.ts';
import { eyesKey, PARTY_EYES, playerEyesKey, sightHides, type Eyes } from './floorEyes.ts';
import type { FeedScene } from './feed/Feed.ts';
import { FeedGroup } from './feed/FeedGroup.ts';
import { openPicture, type Picture, type PictureChange, type PictureFloor } from './floorPicture.ts';
import type { FloorSharePorts } from './floorPorts.ts';
import type { PictureSources } from './floorSource.ts';
import { PARTY } from './floorRoutes.ts';
import type { MarkAudience } from './gmMeasureAudiences.ts';
import { FloorMemories } from './memory/FloorMemories.ts';
import { memoryFloorOf } from './memory/PlayerMemoryEdits.ts';
import { partyMemory } from './partyMemory.ts';

/** What a player's own picture reads by: the tokens they see through, as a key, their policy and the sources cut by it. */
interface OwnLook {
  readonly tokens: string;
  readonly policy: SightPolicy;
  readonly sources: PictureSources;
}

/**
 * The pictures of one floor, one per set of eyes its players see it through (`FloorRoutes` places them): the
 * party's, which everyone shares under Shared vision, and one for each player who sees through their own characters
 * alone (through none, for a player without a seeing token there). A picture's messages reach its
 * players only, and a player whose eyes change is sent their new picture whole, as a player who reaches
 * the floor is; the scene stays the same. The party's picture is always kept: what players act with is
 * looked up in its lists, which hold every token anyone's picture holds. The party's picture sends the
 * memory the GM saved; a player's own picture sends that player's own memory (`FloorMemories`), which
 * the GM's removals reach too. Each player remembers what they are shown, the party's picture as well,
 * so what they saw under Shared vision stays theirs once it is switched off.
 */
export class FloorPictures {
  readonly party: Picture;
  /**
   * Every picture's feeds as one: a new scene reaches each picture once the floor's own part of it is done, a read
   * of the scene clears each, and a resend or resync for one player reaches the picture they see, placed first.
   */
  readonly feeds: FeedGroup;
  private readonly pictures = new Map<string, Picture>();
  private readonly looks = new Map<string, OwnLook>();
  private scene: FeedScene | null = null;
  /** The times the GM took explored memory away from this floor. */
  private readonly removals: ExploredRemovals;
  /** What each player who sees by their own eyes remembers of the floor; null without anywhere to keep it. */
  private readonly memories: FloorMemories | null;
  /** How many of the players' own pictures were opened: each sends its memory with a count of removals of its own. */
  private opened = 0;
  /** Whether sight hides anything of the floor, so its players remember what they are shown. */
  private remembering = false;
  /** The party's eyes, which a player shown the party's picture remembers by. */
  private partySources: PictureSources | null = null;

  constructor(private readonly store: SceneStore, private readonly ports: FloorSharePorts, private readonly floor: PictureFloor) {
    this.removals = new ExploredRemovals(() => store.shown?.() ?? true);
    const memory = ports.playerMemory;
    this.memories = memory === undefined ? null : new FloorMemories({
      now: () => ports.now(), setTimer: (run, ms) => ports.setTimer(run, ms), clearTimer: (timer) => ports.clearTimer(timer),
      memory,
      // Where sight hides something, what each player is shown is theirs to remember, the party's picture under Shared vision too.
      players: () => (this.remembering ? ports.routes.placed() : []),
      seenBy: (player) => (ports.routes.eyesOf(player) === PARTY ? this.partyEyes().seen() : this.looks.get(playerEyesKey(player))?.sources.seen() ?? null),
      lighting: () => store.getState().lighting,
      changed: (player) => this.pictures.get(playerEyesKey(player))?.follow('memory'),
    });
    this.feeds = new FeedGroup(() => [...this.pictures.values()].map(({ feeds }) => feeds), {
      seat: (player) => this.seat(player),
      sceneChanged: (scene) => this.sceneChanged(scene),
      // Nothing of the scene before goes out from a picture opened while the scene is read.
      cleared: () => {
        this.scene = null;
      },
    });
    this.party = this.open(PARTY_EYES);
    this.pictures.set(PARTY, this.party);
  }

  /** The picture a placed player sees; none for a player not placed on the floor. */
  of(player: string): Picture | undefined {
    const key = this.ports.routes.eyesOf(player);
    return key === undefined ? undefined : this.pictures.get(key);
  }

  /** Places a player of the floor not placed behind eyes yet, about to be sent their picture or heard from. */
  seat(player: string): void {
    if (this.ports.routes.eyesOf(player) === undefined) this.assign([player]);
  }

  /**
   * Places each player of the floor (and `joining`) behind the eyes they see it through, opens the pictures
   * of eyes that are new, closes those nobody sees through, and sends a player whose eyes changed their picture.
   */
  assign(joining: readonly string[] = []): void {
    const seats = this.ports.seats;
    const { eyes, before, closed } = this.ports.routes.placeEyes({ rules: this.ports.lightingSource()?.rules(), ownerOf: (id, token) => seats?.ownerOf(id, token) }, joining);
    this.remembering = sightHides(this.store.getState());
    for (const key of closed) {
      this.pictures.get(key)?.feeds.stop();
      this.pictures.delete(key);
      this.looks.delete(key);
    }
    const opened = new Set([...eyes.values()].flatMap((seen) => (this.look(seen) ? [eyesKey(seen)] : [])));
    for (const [player, seen] of eyes) {
      const key = eyesKey(seen);
      if (before.has(player) && before.get(player) !== key && !opened.has(key)) this.pictures.get(key)?.feeds.resend(player);
    }
    this.memories?.update();
  }

  /**
   * Something the pictures are made of changed: whose eyes each player sees through follows the store, Atlas and who owns
   * which token, what the GM took from the memory the store and Atlas, and each picture all of them.
   */
  follow(change: PictureChange): void {
    if (change === 'store' || change === 'atlas' || change === 'owners') this.assign();
    if (change === 'store' || change === 'atlas') this.observeRemovals();
    for (const picture of this.pictures.values()) picture.follow(change);
  }

  /** The floor's own part of a new scene, before its pictures take it: the memory's removals and the players' memories follow it. */
  private sceneChanged(scene: FeedScene | null): void {
    if (scene !== null && scene.id !== this.scene?.id) this.removals.shared(scene.id);
    this.scene = scene;
    this.memories?.setFloor(scene === null ? null : memoryFloorOf(this.store.getState()), this.floor.map());
    this.observeRemovals();
  }

  /** Counts what the GM took away from a lit floor's memory since it last looked; what a load took reaches each player's own memory too. */
  private observeRemovals(): void {
    if (this.scene?.lit !== true) return;
    const state = this.store.getState();
    if (!state.mapLoaded || state.isMapLoading) return this.removals.loading();
    const removals = this.removals.observe(state);
    if (removals.length > 0) this.memories?.removed(removals);
  }

  /** The players of the floor whose picture shows `tokenId` now: every player while all see the party's, which shows it. */
  seers(mapPath: string, tokenId: string): string[] {
    return this.ports.routes.seers((key) => this.looks.get(key)?.sources.tokenSource()?.playerRollTokens(mapPath, [tokenId]).has(tokenId) === true);
  }

  /**
   * Who is told the GM's measurements alike, given the tokens the party sees (`seen`): everyone, by the
   * party's picture, while all share it; else the players of each picture, a measurement from a token, an
   * aura around one or a range mark only where their own picture lists that token.
   */
  markAudiences(seen: TokenSeen): MarkAudience[] {
    const audiences = this.ports.routes.audiences();
    if (audiences === 'all') return [{ key: PARTY, seen }];
    return audiences.flatMap((key) => {
      const picture = this.pictures.get(key);
      return picture === undefined ? [] : [{ key, seen: (tokenId: string) => seen(tokenId) && picture.tokens.listedAlias(tokenId) !== undefined }];
    });
  }

  /** The floor's map is loading: what the load ends with is compared with the memory before it. */
  mapLoading(): void {
    this.removals.loading();
  }

  playerLeft(player: string): void {
    this.ports.routes.playerLeft(player);
    this.memories?.update();
  }

  /** Stops every picture; settles once the players' memories are written. */
  stop(): Promise<void> {
    this.feeds.stop();
    return this.memories?.stop() ?? Promise.resolve();
  }

  private partyEyes(): PictureSources {
    this.partySources ??= this.ports.eyes(PLAYER_SIGHT_POLICY);
    return this.partySources;
  }

  /**
   * The picture of `eyes`, opened where it is new with the scene shared now (it sends its players
   * everything whole as it begins); whether it was. A player's own picture reads by the tokens they see
   * through, and reads anew when those changed.
   */
  private look(eyes: Eyes): boolean {
    const key = eyesKey(eyes);
    if (eyes.kind === 'player') {
      const tokens = `${eyes.tokens.join('\n')}|${eyes.owns.join('\n')}`;
      if (this.looks.get(key)?.tokens !== tokens) {
        const seeing = new Set(eyes.tokens);
        const owned = new Set(eyes.owns);
        const policy = ownPolicy((token) => seeing.has(token.id), (token) => owned.has(token.id));
        this.looks.set(key, { tokens, policy, sources: this.ports.eyes(policy) });
        this.pictures.get(key)?.follow('store');
      }
    }
    if (this.pictures.has(key)) return false;
    this.pictures.set(key, this.open(eyes));
    return true;
  }

  private open(eyes: Eyes): Picture {
    const key = eyesKey(eyes);
    const epoch = ++this.opened;
    const { routes } = this.ports;
    const own = eyes.kind === 'player' ? {
      tokenSource: () => this.looks.get(key)?.sources.tokenSource() ?? null,
      mapLayers: () => this.looks.get(key)?.sources.mapLayers() ?? null,
      sightPolicy: () => this.looks.get(key)?.policy ?? PLAYER_SIGHT_POLICY,
      // The log hears of the map's pins from the party's picture alone
      pinsChanged: () => undefined,
      // Never the party's: a player is sent what they themselves saw, under a count their page has not taken yet, so it replaces whatever it held.
      memory: (): SavedMemory | undefined => {
        const serial = this.removals.serial + epoch;
        return this.memories === null ? { key: null, serial, png: () => null } : this.memories.memoryOf(eyes.player, serial);
      },
      memoryMask: () => this.memories?.memoryUrl(eyes.player) ?? null,
    } : { memory: () => partyMemory(this.store.getState(), this.removals.serial) };
    const picture = openPicture(this.store, {
      ...this.ports,
      ...own,
      members: () => routes.members(key),
      send: (body, to) => routes.send(body, to, key),
      ...(this.ports.sendLive !== undefined && { sendLive: (body: GmMessage, live: string, to?: string) => routes.sendLive(body, live, to, key) }),
    }, this.floor, (player) => routes.eyesOf(player) === key);
    if (this.scene !== null) picture.feeds.setScene(this.scene);
    return picture;
  }
}
