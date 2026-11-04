import { applyDelta, isDeltaOf, type DeltaOf } from './delta.ts';
import { parseGmMessage, type GmMessage } from './game.ts';
import type { JsonRecord } from './lighting.ts';

type Sequenced = Extract<GmMessage, { t: DeltaOf }>;

/**
 * Follows the sequenced messages (`tokens`, `sight`, `fog`) as a player receives them: a whole one is kept
 * as it is, a delta that follows the one kept makes the next whole one, checked as if it had come
 * whole. A delta that does not follow (another scene, a missed number, or nothing kept yet) is a gap:
 * the player asks for the whole message.
 */
export class DeltaReader {
  private readonly held = new Map<DeltaOf, Sequenced>();

  /**
   * The message a received one stands for: itself for anything but a delta, the whole message a
   * delta makes, null for a delta older than what is held, or `gap` for one that does not follow.
   */
  read(message: GmMessage): GmMessage | null | 'gap' {
    if (isDeltaOf(message.t)) {
      this.held.set(message.t, message as Sequenced);
      return message;
    }
    if (message.t !== 'delta') return message;
    const held = this.held.get(message.of);
    if (held === undefined || held.scene !== message.scene || held.seq === undefined) return 'gap';
    if (message.seq <= held.seq) return null;
    if (message.seq !== held.seq + 1) return 'gap';
    const content = applyDelta(message.of, held as unknown as JsonRecord, message);
    const next = content === null ? null : parseGmMessage({ ...content, t: message.of, scene: message.scene, seq: message.seq });
    if (next === null || next.t !== message.of) return 'gap';
    this.held.set(message.of, next);
    return next;
  }
}
