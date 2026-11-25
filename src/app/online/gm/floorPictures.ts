import type { GmMessage, PlayerResync, SharedScene } from '../protocol/index.ts';
import { viewedLevelId } from '../../levels/sceneLevels';
import type { TokenSeen } from '../../vision/measureOrigin';
import { narrowPolicy, PLAYER_SIGHT_POLICY, type SightPolicy } from '../../vision/tokenSightPolicy';
import type { SceneState, SceneStore } from './atlasView.ts';
import type { SavedMemory } from './ExploredShare.ts';
import { ExploredRemovals } from './exploredRemovals.ts';
import { eyesKey, floorEyes, PARTY_EYES, playerEyesKey, sightHides, type Eyes } from './floorEyes.ts';
import { FloorPicture, type PictureFloor } from './floorPicture.ts';
import type { FloorSharePorts, PictureSources } from './floorPorts.ts';
import type { MarkAudience } from './gmMeasureAudiences.ts';
import { FloorMemories } from './memory/FloorMemories.ts';
import type { MemoryFloor } from './memory/memoryPorts.ts';
import { partyMemory } from './partyMemory.ts';

/** What a player's own picture reads by: the tokens they see through, as a key, their policy and the sources cut by it. */
interface OwnLook {
  readonly tokens: string;
  readonly policy: SightPolicy;
  readonly sources: PictureSources;
}

/** The floor `state` shows, whose memory each player keeps apart; null without a map. */
const memoryFloorOf = (state: SceneState): MemoryFloor | null => (state.mapPath === null ? null : { mapPath: state.mapPath, level: viewedLevelId(state) });

/**
 * The pictures of one floor, one per set of eyes its players see it through (`floorEyes`): the party's,
 * which everyone shares under Shared vision, and one for each player who sees through their own characters
 * alone (through none, for a player without a seeing token there). A picture's messages reach its
 * players only, and a player whose eyes change is sent their new picture whole, as a player who reaches
 * the floor is; the scene stays the same. The party's picture is always kept: what players act with is
 * looked up in its lists, which hold every token anyone's picture holds. The party's picture sends the
 * memory the GM saved; a player's own picture sends that player's own memory (`FloorMemories`), which
 * the GM's removals reach too. Each player remembers what they are shown, the party's picture as well,
 * so what they saw under Shared vision stays theirs once it is switched off.
 */
export class FloorPictures {
  readonly party: FloorPicture;
  private readonly pictures = new Map<string, FloorPicture>();
  private readonly looks = new Map<string, OwnLook>();
  /** The key of each player's eyes, as last worked out. */
  private eyes = new Map<string, string>();
  private scene: SharedScene | null = null;
  private assigning = false;
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
      players: () => (this.remembering ? [...this.eyes.keys()] : []),
      seenBy: (player) => (this.eyes.get(player) === eyesKey(PARTY_EYES) ? this.partyEyes().seen() : this.looks.get(playerEyesKey(player))?.sources.seen() ?? null),
      lighting: () => store.getState().lighting,
      changed: (player) => this.pictures.get(playerEyesKey(player))?.memoryChanged(),
    });
    this.party = this.open(PARTY_EYES);
    this.pictures.set(eyesKey(PARTY_EYES), this.party);
  }

  /** Whether a player of the floor sees it through their own eyes. */
  private get split(): boolean {
    return this.pictures.size > 1;
  }

  /** The picture `player` sees, worked out now for a player not yet placed. */
  of(player: string): FloorPicture {
    return this.pictures.get(this.keyOf(player)) ?? this.party;
  }

  /**
   * Works out whose eyes each player of the floor (and `extra`) sees through, opens the pictures of eyes
   * that are new, closes those nobody sees through, and sends a player whose eyes changed their picture.
   */
  assign(extra: readonly string[] = []): void {
    if (this.assigning) return;
    this.assigning = true;
    try {
      const seats = this.ports.seats;
      const players = [...new Set([...(seats?.onlinePlayers() ?? []), ...extra])];
      const inputs = { state: this.store.getState(), sharedVision: this.ports.atlasSettings().sharedVision === true, rules: this.ports.lightingSource()?.rules() };
      const eyes = floorEyes({ ...inputs, ownerOf: (id, token) => seats?.ownerOf(id, token) }, players);
      this.remembering = sightHides(inputs.state);
      const before = this.eyes;
      this.eyes = new Map([...eyes].map(([player, seen]) => [player, eyesKey(seen)]));
      for (const [key, picture] of this.pictures) {
        if (key === eyesKey(PARTY_EYES) || [...this.eyes.values()].includes(key)) continue;
        picture.stop();
        this.pictures.delete(key);
        this.looks.delete(key);
      }
      const opened = new Set([...eyes.values()].flatMap((seen) => (this.look(seen) ? [eyesKey(seen)] : [])));
      for (const [player, key] of this.eyes) if (before.has(player) && before.get(player) !== key && !opened.has(key)) this.pictures.get(key)?.resend(player);
      this.memories?.update();
    } finally {
      this.assigning = false;
    }
  }

  setScene(scene: SharedScene | null): void {
    if (scene !== null && scene.id !== this.scene?.id) this.removals.shared(scene.id);
    this.scene = scene;
    this.memories?.setFloor(scene === null ? null : memoryFloorOf(this.store.getState()), this.floor.map());
    this.observeRemovals();
    for (const picture of this.pictures.values()) picture.setScene(scene);
  }

  /** The scene is being read again: nothing of the one before goes out, from a picture opened meanwhile neither. */
  clear(): void {
    this.scene = null;
    for (const picture of this.pictures.values()) picture.clear();
  }

  update(): void {
    this.assign();
    this.observeRemovals();
    for (const picture of this.pictures.values()) picture.update();
  }

  /** Counts what the GM took away from a lit floor's memory since it last looked; what a load took reaches each player's own memory too. */
  private observeRemovals(): void {
    if (this.scene?.lit !== true) return;
    const state = this.store.getState();
    if (!state.mapLoaded || state.isMapLoading) return this.removals.loading();
    const removals = this.removals.observe(state);
    if (removals.length > 0) this.memories?.removed(removals);
  }

  /** Each picture again, whole, to its players; or to one player, the picture they see. */
  resend(to?: string): void {
    if (to !== undefined) return this.of(to).resend(to);
    for (const picture of this.pictures.values()) picture.resend();
  }

  resync(from: string, message: PlayerResync): void {
    this.of(from).resync(from, message);
  }

  refreshAssets(): void {
    for (const picture of this.pictures.values()) picture.refreshAssets();
  }

  ownersChanged(): void {
    this.assign();
    for (const picture of this.pictures.values()) picture.ownersChanged();
  }

  /** The players of the floor whose picture shows `tokenId` now: every player while all see the party's, which shows it. */
  seers(mapPath: string, tokenId: string): string[] {
    if (!this.split) return [...(this.ports.seats?.onlinePlayers() ?? [])];
    return [...this.looks].flatMap(([key, { sources }]) => (sources.tokenSource()?.playerRollTokens(mapPath, [tokenId]).has(tokenId) === true ? this.members(key) : []));
  }

  /**
   * Who is told the GM's measurements alike, given the tokens the party sees (`seen`): everyone, by the
   * party's picture, while all share it; else the players of each picture, a measurement from a token, an
   * aura around one or a range mark only where their own picture lists that token.
   */
  markAudiences(seen: TokenSeen): MarkAudience[] {
    if (!this.split) return [{ key: eyesKey(PARTY_EYES), seen }];
    return [...this.pictures].flatMap(([key, picture]) => {
      const players = this.members(key);
      return players.length === 0 ? [] : [{ key, players, seen: (tokenId: string) => seen(tokenId) && picture.tokens.listedAlias(tokenId) !== undefined }];
    });
  }

  /** What players see of the map beside its tokens may have changed. */
  layersChanged(): void {
    for (const picture of this.pictures.values()) picture.layers.update();
  }

  /** The floor's map is loading: what the load ends with is compared with the memory before it. */
  mapLoading(): void {
    this.removals.loading();
  }

  poll(): void {
    this.assign();
    for (const picture of this.pictures.values()) picture.poll();
  }

  playerLeft(player: string): void {
    this.eyes.delete(player);
    this.memories?.update();
  }

  /** Stops every picture; settles once the players' memories are written. */
  stop(): Promise<void> {
    for (const picture of this.pictures.values()) picture.stop();
    return this.memories?.stop() ?? Promise.resolve();
  }

  /** The players who see the floor through the eyes of `key` now. */
  private members(key: string): string[] {
    return [...this.eyes].flatMap(([player, seen]) => (seen === key ? [player] : []));
  }

  private partyEyes(): PictureSources {
    this.partySources ??= this.ports.eyes(PLAYER_SIGHT_POLICY);
    return this.partySources;
  }

  /** The key of a player's eyes, worked out now for a player not yet placed; the party's while that cannot be. */
  private keyOf(player: string): string {
    if (!this.eyes.has(player)) this.assign([player]);
    return this.eyes.get(player) ?? eyesKey(PARTY_EYES);
  }

  /**
   * The picture of `eyes`, opened where it is new with the scene shared now (it sends its players
   * everything whole as it begins); whether it was. A player's own picture reads by the tokens they see
   * through, and reads anew when those changed.
   */
  private look(eyes: Eyes): boolean {
    const key = eyesKey(eyes);
    if (eyes.kind === 'player') {
      const tokens = eyes.tokens.join('\n');
      if (this.looks.get(key)?.tokens !== tokens) {
        const owned = new Set(eyes.tokens);
        const policy = narrowPolicy(PLAYER_SIGHT_POLICY, (token) => owned.has(token.id));
        this.looks.set(key, { tokens, policy, sources: this.ports.eyes(policy) });
        this.pictures.get(key)?.update();
      }
    }
    if (this.pictures.has(key)) return false;
    this.pictures.set(key, this.open(eyes));
    return true;
  }

  private open(eyes: Eyes): FloorPicture {
    const key = eyesKey(eyes);
    const epoch = ++this.opened;
    const members = (): string[] => this.members(key);
    // The party's picture goes to all at once while nobody sees by their own eyes: a player who joins meanwhile sees it too.
    const route = (to: string | undefined, send: (to?: string) => void): void => {
      if (to !== undefined) return void (this.keyOf(to) === key && send(to));
      if (eyes.kind === 'party' && !this.split) return send();
      for (const player of members()) send(player);
    };
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
    const seats = this.ports.seats;
    const picture = new FloorPicture(this.store, {
      ...this.ports,
      ...own,
      members: () => (eyes.kind === 'party' && !this.split ? seats?.onlinePlayers() ?? [] : members()),
      send: (body, to) => route(to, (player) => this.ports.send(body, player)),
      ...(this.ports.sendLive !== undefined && { sendLive: (body: GmMessage, live: string, to?: string) => route(to, (player) => this.ports.sendLive?.(body, live, player)) }),
    }, this.floor);
    if (this.scene !== null) picture.setScene(this.scene);
    return picture;
  }
}
