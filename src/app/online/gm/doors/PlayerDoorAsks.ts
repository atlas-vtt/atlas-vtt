import { sameDoor, type DoorEnds, type GmMessage, type PlayerBump, type PlayerDoorAsk } from '../../protocol/index.ts';
import { levelObjects } from '../../../levels/levelObjects';
import { hasLevels, viewedLevelId } from '../../../levels/sceneLevels';
import { computeTokenPixelSize } from '../../../pixi/token-renderer/tokenSizing';
import type { TokenEntity } from '../../../types';
import type { WallSegment } from '../../../types/wallTypes';
import { mapTokens } from '../../../tokens/offMap';
import type { SceneState, SceneStore } from '../atlasView.ts';
import { tokenLabel } from '../atlasView.ts';
import { MoveRate } from '../moveCheck.ts';

/** How far from a door a token may ask to open it: its own radius and this many cells (a little more than a page offers, for a token on its way). */
export const ASK_REACH_CELLS = 1.5;
/** Asks per player: a few at once, then one every two seconds. */
const ASK_BURST = 3;
const ASKS_PER_SECOND = 0.5;
/** Bumps per player: a held key bumps five times a second. */
const BUMP_BURST = 4;
const BUMPS_PER_SECOND = 8;

/** What the GM is shown of an ask, and what withdraws it. */
export interface DoorAskShown {
  readonly key: string;
  readonly player: string;
  readonly who: string;
  readonly level: string | null;
  readonly at: { readonly x: number; readonly y: number };
  answer(open: boolean): void;
}

export interface PlayerDoorPorts {
  /** Whether the GM lets players ask (the player view's setting). */
  allowed(): boolean;
  /** The shared scene of the floor's token list, or null while none is. */
  scene(): string | null;
  listedToken(alias: string): string | undefined;
  ownerOf(tokenId: string): string | undefined;
  nameOf(player: string): string | null;
  send(body: GmMessage, to: string): void;
  now(): number;
  /** Shows the GM an ask; returns what withdraws it. Without it nobody is asked. */
  ask?(shown: DoorAskShown): () => void;
  /** Shows a token bump on the GM's map. */
  bump?(tokenId: string, dx: number, dy: number): void;
}

/** The door a token at `token` may ask to open in `walls`: an ordinary closed door with these ends, within reach; else why not. */
export function askedDoor(walls: Readonly<Record<string, WallSegment>>, ends: DoorEnds, token: Pick<TokenEntity, 'x' | 'y' | 'size'>, cell: number): WallSegment | 'none' | 'open' | 'far' {
  const wall = Object.values(walls).find((candidate) => candidate.type === 'door' && sameDoor(ends, [candidate.p1.x, candidate.p1.y, candidate.p2.x, candidate.p2.y]));
  if (wall === undefined) return 'none';
  if (!(wall.closed ?? true)) return 'open';
  const reach = computeTokenPixelSize(cell, token.size || 1) / 2 + ASK_REACH_CELLS * cell;
  return distanceToSegment(token, wall.p1, wall.p2) <= reach ? wall : 'far';
}

function distanceToSegment(point: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const share = length === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length));
  return Math.hypot(point.x - (a.x + share * dx), point.y - (a.y + share * dy));
}

/** An ask the GM has not answered: whose, for which door as the player named it, and what withdraws it from the GM's map. */
interface Pending {
  readonly player: string;
  readonly scene: string;
  readonly ends: DoorEnds;
  readonly withdraw: () => void;
}

/**
 * Players' asks to open doors on one floor, and their tokens' bumps. An ask is taken only while the GM
 * lets players ask, from the player who owns the token, for an ordinary closed door of the floor within
 * reach of it; the GM sees it on the map and answers. Opening writes the door open (one undo step) and
 * tells the player; keeping it shut tells them too. A door that opens another way (the GM's own click)
 * answers every ask for it; one that is gone, a player who leaves and a scene that changes withdraw theirs.
 */
export class PlayerDoorAsks {
  private readonly store: SceneStore;
  private readonly ports: PlayerDoorPorts;
  private readonly asks = new MoveRate(ASK_BURST, ASKS_PER_SECOND);
  private readonly bumps = new MoveRate(BUMP_BURST, BUMPS_PER_SECOND);
  /** By the door's wall id, then by player. */
  private readonly pending = new Map<string, Map<string, Pending>>();
  private unsubscribe: (() => void) | null = null;

  constructor(store: SceneStore, ports: PlayerDoorPorts) {
    this.store = store;
    this.ports = ports;
  }

  /** The token a player's message names on this floor, when it is theirs and shown on the shared scene. */
  private ownToken(from: string, scene: string, alias: string): { readonly id: string; readonly token: TokenEntity } | null {
    if (scene !== this.ports.scene()) return null;
    const id = this.ports.listedToken(alias);
    const token = id === undefined ? undefined : mapTokens(levelObjects(this.store.getState()))[id];
    return id === undefined || token === undefined || token.isHidden === true || this.ports.ownerOf(id) !== from ? null : { id, token };
  }

  receive(from: string, message: PlayerDoorAsk | PlayerBump): void {
    if (message.t === 'bump') {
      const own = this.ownToken(from, message.scene, message.id);
      if (own !== null && this.bumps.take(from, this.ports.now())) this.ports.bump?.(own.id, message.dx, message.dy);
      return;
    }
    if (!this.ports.allowed() || this.ports.ask === undefined) return;
    const own = this.ownToken(from, message.scene, message.id);
    const state = this.store.getState();
    const cell = state.grid?.size;
    if (own === null || cell === undefined || !(cell > 0) || !this.asks.take(from, this.ports.now())) return;
    const door = askedDoor(levelObjects(state).walls, message.door, own.token, cell);
    if (door === 'open') return this.ports.send({ t: 'door-answer', scene: message.scene, door: message.door, open: true }, from);
    if (typeof door === 'string' || this.pending.get(door.id)?.has(from) === true) return;
    this.watch();
    const answer = (open: boolean): void => this.answer(door.id, from, open);
    const withdraw = this.ports.ask({
      key: `${door.id}:${from}`,
      player: from,
      who: this.ports.nameOf(from) ?? tokenLabel(own.token),
      level: hasLevels(state.levels) ? viewedLevelId(state) : null,
      at: { x: (door.p1.x + door.p2.x) / 2, y: (door.p1.y + door.p2.y) / 2 },
      answer,
    });
    const asks = this.pending.get(door.id) ?? new Map<string, Pending>();
    asks.set(from, { player: from, scene: message.scene, ends: message.door, withdraw });
    this.pending.set(door.id, asks);
  }

  /** A player left: their asks go. */
  playerLeft(player: string): void {
    for (const [wallId, asks] of this.pending) {
      asks.get(player)?.withdraw();
      asks.delete(player);
      if (asks.size === 0) this.pending.delete(wallId);
    }
  }

  /** The scene stops being shared, or changes: every ask goes. */
  stop(): void {
    for (const asks of this.pending.values()) for (const ask of asks.values()) ask.withdraw();
    this.pending.clear();
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private answer(wallId: string, player: string, open: boolean): void {
    const ask = this.pending.get(wallId)?.get(player);
    if (ask === undefined) return;
    if (!open) {
      this.settle(wallId, player, false);
      return;
    }
    // The GM chose to open it: a lock gives way too. Every ask for the door is answered as the store tells (`check`).
    this.store.setState((draft) => {
      const wall = draft.objects.walls[wallId];
      if (wall?.type !== 'door') return;
      wall.closed = false;
      delete wall.locked;
      draft._audioDirty = true;
    });
    // A store that took no write (players held on the presented scene) leaves the ask standing.
    this.check(this.store.getState());
  }

  /** Answers one player's ask and takes it from the GM's map. */
  private settle(wallId: string, player: string, open: boolean): void {
    const asks = this.pending.get(wallId);
    const ask = asks?.get(player);
    if (asks === undefined || ask === undefined) return;
    asks.delete(player);
    if (asks.size === 0) this.pending.delete(wallId);
    ask.withdraw();
    if (ask.scene === this.ports.scene()) this.ports.send({ t: 'door-answer', scene: ask.scene, door: ask.ends, open }, player);
  }

  private watch(): void {
    this.unsubscribe ??= this.store.subscribe((state) => this.check(state));
  }

  /** Doors that opened answer their asks; doors that are gone, or no longer doors, withdraw theirs. */
  private check(state: SceneState): void {
    const walls = state.objects.walls;
    for (const [wallId, asks] of [...this.pending]) {
      const wall = walls[wallId];
      if (wall?.type === 'door' && (wall.closed ?? true)) continue;
      for (const player of [...asks.keys()]) {
        if (wall?.type === 'door') this.settle(wallId, player, true);
        else {
          asks.get(player)?.withdraw();
          asks.delete(player);
        }
      }
      if (asks.size === 0) this.pending.delete(wallId);
    }
    if (this.pending.size === 0) {
      this.unsubscribe?.();
      this.unsubscribe = null;
    }
  }
}
