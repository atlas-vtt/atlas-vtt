import type { GmMessage, PlayerResync, SharedScene } from '../protocol/index.ts';
import type { ShownRollToken } from '../../services/playerRollSource';
import { narrowPolicy, PLAYER_SIGHT_POLICY, type SightPolicy } from '../../vision/tokenSightPolicy';
import type { SceneStore } from './atlasView.ts';
import { eyesKey, floorEyes, PARTY_EYES, type Eyes } from './floorEyes.ts';
import { FloorPicture, type PictureFloor } from './floorPicture.ts';
import type { FloorSharePorts, PictureSources } from './floorPorts.ts';
import type { GmMarkSource } from './MarkShare.ts';

/** What a player's own picture reads by: the tokens they see through, as a key, their policy and the sources cut by it. */
interface OwnLook {
  readonly tokens: string;
  readonly policy: SightPolicy;
  readonly sources: PictureSources;
}

/**
 * The pictures of one floor, one per set of eyes its players see it through (`floorEyes`): the party's,
 * which everyone shares under Shared vision, and one for each player who sees through their own characters
 * alone (through none, for a player without a seeing token there). A picture's messages reach its
 * players only, and a player whose eyes change is sent their new picture whole, as a player who reaches
 * the floor is; the scene stays the same. The party's picture is always kept: what players act with is
 * looked up in its lists, which hold every token anyone's picture holds.
 */
export class FloorPictures {
  readonly party: FloorPicture;
  private readonly pictures = new Map<string, FloorPicture>();
  private readonly looks = new Map<string, OwnLook>();
  private readonly narrowed = new WeakMap<GmMarkSource, GmMarkSource>();
  /** The key of each player's eyes, as last worked out. */
  private eyes = new Map<string, string>();
  private scene: SharedScene | null = null;
  private assigning = false;

  constructor(private readonly store: SceneStore, private readonly ports: FloorSharePorts, private readonly floor: PictureFloor) {
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
    } finally {
      this.assigning = false;
    }
  }

  setScene(scene: SharedScene | null): void {
    this.scene = scene;
    for (const picture of this.pictures.values()) picture.setScene(scene);
  }

  /** The scene is being read again: nothing of the one before goes out, from a picture opened meanwhile neither. */
  clear(): void {
    this.scene = null;
    for (const picture of this.pictures.values()) picture.clear();
  }

  update(): void {
    this.assign();
    for (const picture of this.pictures.values()) picture.update();
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

  /** The tokens of `party` (what the party sees) that each player's own picture shows too. */
  seenByEveryone(mapPath: string, party: ReadonlyMap<string, ShownRollToken>): ReadonlyMap<string, ShownRollToken> {
    const own = [...this.looks.values()].map(({ sources }) => sources.tokenSource()?.playerRollTokens(mapPath, [...party.keys()]) ?? new Map<string, ShownRollToken>());
    return new Map([...party].filter(([tokenId]) => own.every((shown) => shown.has(tokenId))));
  }

  /**
   * The GM's marks as every player of the floor is told them: a measurement from a token, an aura
   * around one or a range mark only where each player's own picture lists that token too. The same
   * object for the same source, which the marks follow by identity.
   */
  marks(source: GmMarkSource | null): GmMarkSource | null {
    if (source === null) return null;
    let narrowed = this.narrowed.get(source);
    if (narrowed === undefined) {
      const own = (): FloorPicture[] => [...this.pictures].flatMap(([key, picture]) => (key === eyesKey(PARTY_EYES) ? [] : [picture]));
      narrowed = { ...source, seen: () => {
        const party = source.seen();
        const pictures = own();
        return (tokenId) => party(tokenId) && pictures.every((picture) => picture.tokens.listedAlias(tokenId) !== undefined);
      } };
      this.narrowed.set(source, narrowed);
    }
    return narrowed;
  }

  /** What players see of the map beside its tokens may have changed. */
  layersChanged(): void {
    for (const picture of this.pictures.values()) picture.layers.update();
  }

  mapLoading(): void {
    for (const picture of this.pictures.values()) picture.mapLoading();
  }

  poll(): void {
    this.assign();
    for (const picture of this.pictures.values()) picture.poll();
  }

  playerLeft(player: string): void {
    this.eyes.delete(player);
  }

  stop(): void {
    for (const picture of this.pictures.values()) picture.stop();
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
    const members = (): string[] => [...this.eyes].flatMap(([player, seen]) => (seen === key ? [player] : []));
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
    } : {};
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
