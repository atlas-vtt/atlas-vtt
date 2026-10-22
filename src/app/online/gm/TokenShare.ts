import type { GmMessage, SharedToken, SnapGrid } from '../protocol/index.ts';
import { NO_INSTANCE_NUMBERS, badgeNumberInView, type InstanceNumbers } from '../../vision/instanceNumbers';
import { ArtRefs } from './artRefs.ts';
import type { PlayerTokenSource, SceneStore } from './atlasView.ts';
import type { ListedTokens } from './mineShare.ts';
import type { SeatSource } from './seatSource.ts';
import { sharedTokens, snapGridOf } from './scenePicture.ts';
import { SequencedList } from './sequencedList.ts';
import { NO_TOKEN_RULES, numberShownTokens, type TokenRules } from './tokenUI.ts';
import type { AtlasPlayerSettings } from './atlasLighting.ts';
import { movesOutOfTurn, sharedTurnTokens, type TurnShareState } from './turnShare.ts';
import { isOffMap, mapTokens, sceneTokens } from '../../tokens/offMap';

/** An image as read from the vault. */
export interface VaultImage {
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly mime: string;
}

export interface TokenSharePorts {
  /** The shared tab's renderer as it is now, or null while it has none. */
  tokenSource(): PlayerTokenSource | null;
  /** The image at a vault path, or null when it is missing or of a type players cannot be sent. */
  readImage(path: string): Promise<VaultImage | null>;
  send(body: GmMessage, to?: string): void;
  /** Whether players see token names (Atlas's nameplate setting for the player view). */
  showNames(): boolean;
  /** The map's resource and condition definitions as the GM's token renderer reads them, or null while they cannot be read: then no bar or condition is sent. */
  tokenRules?(): TokenRules | null;
  /** Which tokens are player tokens; without it every token is the GM's. */
  seats?: Pick<SeatSource, 'claimOf'> | undefined;
  /** Atlas's settings for the players' view: whether they are shown the initiative list, and so the turn. */
  atlasSettings?(): Pick<AtlasPlayerSettings, 'showInitiative' | 'movesOnTurn'>;
  /** The players' look-alike numbers changed (`badgeOf`): what shows them besides the token list is worked out again. */
  numbersChanged?(): void;
  /** Until when the live lane carries a held token's place, by the id players know it by (`LiveShare.carriedUntil`); without it every place goes in the list. */
  liveCarriedUntil?(alias: string): number | undefined;
  randomId(): string;
  now(): number;
  setTimer(run: () => void, ms: number): number;
  clearTimer(timer: number): void;
}

/**
 * The shortest time between two token lists: about 15 a second, and the last change always goes out.
 * A drag's motion goes through the faster live lane (`LiveShare`), so drags do not send lists faster.
 */
export const TOKEN_INTERVAL_MS = 66;
/**
 * How often the list is worked out again without a store change: a token's sprite appears after its
 * store write, and the players' sight may change without one.
 */
export const TOKEN_POLL_MS = 1000;

/**
 * The tokens the players see in the shared scene, sent to all whenever they change (as deltas from
 * the last list where those are smaller), at most every `TOKEN_INTERVAL_MS`. Only tokens the players' frame shows are read; players know them by
 * random ids. Artwork is named by hash and served only while a token in the list shows it.
 */
export class TokenShare {
  private readonly store: SceneStore;
  private readonly ports: TokenSharePorts;
  private readonly listed: (listed: ListedTokens | null) => void;
  private scene: string | null = null;
  /** The lists sent: whole for a new scene, a joiner or a player who asks, else as deltas. */
  private readonly list: SequencedList<'tokens'>;
  private last: { readonly scene: string; readonly text: string } | null = null;
  /** The GM ids of the tokens in the last list, by the ids players know them by, and the other way round. */
  private listedIds = new Map<string, string>();
  private listedAliases: ReadonlyMap<string, string> = new Map();
  private lastAt = Number.NEGATIVE_INFINITY;
  private timer: number | undefined;
  private poll: number | undefined;
  private readonly aliases = new Map<string, string>();
  private readonly art: ArtRefs;
  /** Vault paths of the artwork the last list shows, by hash. */
  private shownArt = new Map<string, string>();
  /** The instance numbers of the tokens players see, as their picture numbers them; anew for each scene. */
  private numbers: InstanceNumbers = NO_INSTANCE_NUMBERS;
  /** Whether the scene shows look-alike badges, as the last list read it. */
  private badgesOn = true;
  /** Where the last list put each token, by the id players know it by. */
  private listedPlaces: ReadonlyMap<string, { readonly x: number; readonly y: number }> = new Map();
  /** The GM ids of the dragged tokens the last list kept where they were listed (`heldWhereListed`). */
  private kept: ReadonlySet<string> = new Set();
  /** Looks again once the lane stops carrying a kept token. */
  private recheck: number | undefined;

  /** `listed` hears of each list sent with the ids players know its tokens by, and of null when none is shared. */
  constructor(store: SceneStore, ports: TokenSharePorts, listed: (listed: ListedTokens | null) => void = () => undefined) {
    this.store = store;
    this.ports = ports;
    this.listed = listed;
    this.list = new SequencedList('tokens', ports);
    this.art = new ArtRefs((path) => ports.readImage(path), () => this.update());
  }

  /** The shared scene the tokens belong to; null sends none. A new scene reads its artwork afresh. */
  setScene(scene: string | null): void {
    if (scene === this.scene) return;
    this.scene = scene;
    this.last = null;
    this.list.reset();
    this.shownArt = new Map();
    this.listedIds = new Map();
    this.listedAliases = new Map();
    this.listedPlaces = new Map();
    this.kept = new Set();
    this.numbers = NO_INSTANCE_NUMBERS;
    this.badgesOn = true;
    this.art.clear();
    this.cancel();
    this.cancelPoll();
    this.cancelRecheck();
    this.listed(null);
    if (scene === null) return;
    this.update();
    this.schedulePoll();
  }

  /**
   * Works the list out again; it goes out now, or once `TOKEN_INTERVAL_MS` has passed since the last.
   * A drop of a token the list kept where it was listed goes out at once: the lane ends that drag now.
   */
  update(): void {
    if (this.scene === null) return;
    if (this.dropped()) {
      this.cancel();
      return this.flush();
    }
    if (this.timer !== undefined) return;
    const wait = this.lastAt + TOKEN_INTERVAL_MS - this.ports.now();
    if (wait > 0) {
      this.timer = this.ports.setTimer(() => {
        this.timer = undefined;
        this.flush();
      }, wait);
      return;
    }
    this.flush();
  }

  /** The last list again, whole, to one player or to all. */
  resend(to?: string): void {
    this.list.resend(this.scene, to);
  }

  /** A player's lists stopped following on: they get the last one whole (at most once a second). */
  resync(player: string, scene: string): void {
    if (scene === this.scene) this.list.resync(player, scene);
  }

  /** The GM id of a token in the last list players were sent, by the id they know it by. */
  listedToken(alias: string): string | undefined {
    return this.listedIds.get(alias);
  }

  /** The id players know a token by, while it is in the last list they were sent. */
  listedAlias(tokenId: string): string | undefined {
    return this.listedAliases.get(tokenId);
  }

  /** The scene of the last list players were sent, or null while none is. */
  get listedScene(): string | null {
    return this.last?.scene === this.scene ? this.scene : null;
  }

  /** The vault path of artwork the players' current picture shows, by its hash. */
  artPath(hash: string): string | undefined {
    return this.shownArt.get(hash);
  }

  /** The GM ids of the tokens the players see now, or null while the scene loads or the tab has no renderer. */
  shownIds(): ReadonlySet<string> | null {
    const state = this.store.getState();
    const source = this.ports.tokenSource();
    if (!state.mapLoaded || state.isMapLoading || state.mapPath === null || source === null) return null;
    return new Set(source.playerRollTokens(state.mapPath).keys());
  }

  /**
   * The number a token's look-alike badge shows the players, as the last list numbered them (the
   * tokens they see and the combatants beside the map their initiative list shows), or null
   * without a badge: a token they do not see never takes or shows one.
   */
  badgeOf(tokenId: string): number | null {
    return badgeNumberInView(this.numbers, tokenId, this.badgesOn);
  }

  /** The random id players know a token by. */
  alias(tokenId: string): string {
    let alias = this.aliases.get(tokenId);
    if (alias === undefined) {
      alias = this.ports.randomId();
      this.aliases.set(tokenId, alias);
    }
    return alias;
  }

  stop(): void {
    this.setScene(null);
  }

  private flush(): void {
    const scene = this.scene;
    const built = this.build();
    if (scene === null || built === null) return;
    const { tokens, cell, snap, art, aliases } = built;
    const text = JSON.stringify([tokens, cell, snap]);
    if (this.last?.scene === scene && this.last.text === text) return;
    this.last = { scene, text };
    this.lastAt = this.ports.now();
    this.shownArt = art;
    this.listedIds = new Map([...aliases].map(([id, alias]) => [alias, id]));
    this.listedAliases = aliases;
    this.listedPlaces = new Map(tokens.map((token) => [token.id, { x: token.x, y: token.y }]));
    this.list.publish(scene, { tokens, cell, snap });
    this.listed({ scene, aliases });
  }

  /**
   * The list now with the vault paths of its artwork by hash and the players' ids of its tokens by
   * GM id, or null while the scene loads or the tab has no renderer.
   */
  private build(): { readonly tokens: SharedToken[]; readonly cell: number; readonly snap: SnapGrid | null; readonly art: Map<string, string>; readonly aliases: Map<string, string> } | null {
    const state = this.store.getState();
    const source = this.ports.tokenSource();
    if (!state.mapLoaded || state.isMapLoading || state.mapPath === null || source === null) return null;
    const gridSize = source.getGridOptions()?.size ?? state.grid?.size;
    if (gridSize === undefined || !(gridSize > 0)) return null;
    const art = new Map<string, string>();
    const gmIds = new Map<string, string>();
    const { mapPath } = state;
    const seats = this.ports.seats;
    const shown = source.playerRollTokens(state.mapPath);
    // As Atlas's player window numbers them: the tokens they see, and the combatants beside the map their list shows unless hidden
    const scene = sceneTokens(state.objects);
    const inView = (id: string): boolean => (isOffMap(scene[id]) ? scene[id]?.isHidden !== true : shown.has(id));
    const before = { numbers: this.numbers, badgesOn: this.badgesOn };
    const badges = numberShownTokens(this.numbers, scene, inView, state.tokenSettings?.showInstanceBadges ?? true);
    this.numbers = badges.numbers;
    this.badgesOn = state.tokenSettings?.showInstanceBadges ?? true;
    if (before.numbers !== this.numbers || before.badgesOn !== this.badgesOn) this.ports.numbersChanged?.();
    // The store holds the fight too: the scene's type names only what every share reads
    const turnState: TurnShareState = state;
    const rules = this.ports.tokenRules?.() ?? NO_TOKEN_RULES;
    const settings = this.ports.atlasSettings?.();
    const showInitiative = settings?.showInitiative === true;
    const turn = sharedTurnTokens(turnState, showInitiative, rules.resources);
    // The GM decides which tokens wait for their turn: the page never works it out itself
    const moveRules = { movesOnTurn: settings?.movesOnTurn === true, showInitiative, definitions: rules.resources };
    const held = new Set([...shown.keys()].filter((id) => movesOutOfTurn(turnState, moveRules, id)));
    const tokens = sharedTokens({
      tokens: mapTokens(state.objects),
      shown,
      gridSize,
      showNames: this.ports.showNames(),
      claimOf: (id, token) => seats?.claimOf(mapPath, id, token) ?? null,
      rules,
      badge: (id) => badges.badge(id),
      turn,
      held,
      art: (path) => {
        const ref = this.art.get(path);
        if (ref !== null) art.set(ref.hash, path);
        return ref;
      },
      alias: (id) => {
        const alias = this.alias(id);
        gmIds.set(alias, id);
        return alias;
      },
    });
    const aliases = new Map(tokens.flatMap((token): [string, string][] => {
      const id = gmIds.get(token.id);
      return id === undefined ? [] : [[id, token.id]];
    }));
    return { tokens: this.heldWhereListed(tokens, state.heldTokens), cell: gridSize, snap: snapGridOf(state.grid), art, aliases };
  }

  /**
   * The tokens with each one being dragged at the place the last list gave it while the live lane
   * carries it: players follow the drag there, and the list lands it with the drop, not as many
   * times again as the drag moves.
   */
  private heldWhereListed(tokens: SharedToken[], held: Readonly<Record<string, unknown>>): SharedToken[] {
    const now = this.ports.now();
    const kept = new Set<string>();
    let until = Number.POSITIVE_INFINITY;
    const shown = tokens.map((token) => {
      const listed = this.listedPlaces.get(token.id);
      const id = this.listedIds.get(token.id);
      const carried = id !== undefined && Object.hasOwn(held, id) ? this.ports.liveCarriedUntil?.(token.id) : undefined;
      if (listed === undefined || id === undefined || carried === undefined || carried <= now) return token;
      kept.add(id);
      until = Math.min(until, carried);
      return listed.x === token.x && listed.y === token.y ? token : { ...token, x: listed.x, y: listed.y };
    });
    this.kept = kept;
    this.cancelRecheck();
    // A drag that rests lands its place once the lane has said nothing of it for a while
    if (kept.size > 0) {
      this.recheck = this.ports.setTimer(() => {
        this.recheck = undefined;
        this.update();
      }, until - now + 1);
    }
    return shown;
  }

  /** Whether a token the last list kept where it was listed is no longer held. */
  private dropped(): boolean {
    if (this.kept.size === 0) return false;
    const held = this.store.getState().heldTokens;
    return [...this.kept].some((id) => !Object.hasOwn(held, id));
  }

  private cancelRecheck(): void {
    if (this.recheck !== undefined) this.ports.clearTimer(this.recheck);
    this.recheck = undefined;
  }

  private schedulePoll(): void {
    this.poll = this.ports.setTimer(() => {
      this.poll = undefined;
      this.update();
      this.schedulePoll();
    }, TOKEN_POLL_MS);
  }

  private cancel(): void {
    if (this.timer !== undefined) this.ports.clearTimer(this.timer);
    this.timer = undefined;
  }

  private cancelPoll(): void {
    if (this.poll !== undefined) this.ports.clearTimer(this.poll);
    this.poll = undefined;
  }
}
