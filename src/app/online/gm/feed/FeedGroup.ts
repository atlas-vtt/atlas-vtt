import type { PlayerResync } from '../../protocol/index.ts';
import type { FeedScene } from './Feed.ts';

/** What the engine drives through a group: one feed, or a group of them. */
export interface FeedMember {
  setScene(scene: FeedScene | null): void;
  /** The scene is being read again: nothing of the one before goes out until it is set. */
  clear(): void;
  resend(to?: string): void;
  resync(player: string, message: PlayerResync): void;
  stop(): void;
}

/** What a group of feeds says of itself beside its members. */
export interface FeedGroupRules {
  /** Whether a player hears the group's messages: a resend to them, or their resync, goes only to groups they hear. */
  reaches?(player: string): boolean;
  /** Places a player who is to be sent the group's messages or asks for one, before any member is told. */
  seat?(player: string): void;
  /** The group's own part of a new scene, before its members take it. */
  sceneChanged?(scene: FeedScene | null): void;
  /** The group's own part of the scene being read again, before its members are cleared. */
  cleared?(): void;
}

/** A feed that keeps its scene while the scene is read again (the live lane: a drag under way outlasts the read). */
export function keptWhileRead(member: FeedMember): FeedMember {
  return { ...bound(member), clear: () => undefined };
}

/** A feed that takes its scene from another feed's messages (owned tokens follow the token list), not from the group. */
export function ownScene(member: Pick<FeedMember, 'resend' | 'stop'>): FeedMember {
  return { setScene: () => undefined, clear: () => undefined, resend: (to) => member.resend(to), resync: () => undefined, stop: () => member.stop() };
}

const bound = (member: FeedMember): FeedMember => ({
  setScene: (scene) => member.setScene(scene), clear: () => member.clear(), resend: (to) => member.resend(to), resync: (player, message) => member.resync(player, message), stop: () => member.stop(),
});

/**
 * Feeds driven as one, in order: a new scene, a read, a resend, a resync and a stop reach every member, a message
 * for one player only the members they hear. A picture's feeds are one group, a floor's pictures another.
 */
export class FeedGroup implements FeedMember {
  constructor(private readonly members: () => Iterable<FeedMember>, private readonly rules: FeedGroupRules = {}) {}

  setScene(scene: FeedScene | null): void {
    this.rules.sceneChanged?.(scene);
    for (const member of [...this.members()]) member.setScene(scene);
  }

  clear(): void {
    this.rules.cleared?.();
    for (const member of [...this.members()]) member.clear();
  }

  resend(to?: string): void {
    if (to !== undefined) {
      if (this.rules.reaches?.(to) === false) return;
      this.rules.seat?.(to);
    }
    for (const member of [...this.members()]) member.resend(to);
  }

  resync(player: string, message: PlayerResync): void {
    if (this.rules.reaches?.(player) === false) return;
    this.rules.seat?.(player);
    for (const member of [...this.members()]) member.resync(player, message);
  }

  stop(): void {
    for (const member of [...this.members()]) member.stop();
  }
}
