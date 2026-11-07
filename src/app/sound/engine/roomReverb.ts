import type { RoomId, SoundRoom } from '../soundTypes';
import type { SoundContext, SoundConvolverNode, SoundGainNode, SoundNode } from './audioNodes';
import { GainTrack } from './gainTrack';
import { roomImpulse, roomTailSeconds } from './roomImpulse';
import type { SoundClockMap } from './soundClockMap';

interface Bus {
  input: SoundGainNode;
  track: GainTrack;
  convolver: SoundConvolverNode;
  /** 1 while it is the table's room, 0 once another took over. */
  target: number;
  /** Context time from which it is silent and may go: its fade out and its tail are over. */
  quietFrom: number | null;
}

/**
 * The table's reverb: what every voice sends goes into `input` and rings through the room of the state.
 * A room change crossfades what goes into the rooms, so the old room's tail rings out as it should. A
 * room is built only while something sends to it and let go once its tail is over: a convolver costs
 * the same whether anything reaches it or not, which a phone feels.
 */
export class RoomReverb {
  readonly input: SoundGainNode;
  private readonly buses = new Map<RoomId, Bus>();
  /** When the last send stopped; null while some voice sends. */
  private dryFrom: number | null = null;

  constructor(
    private readonly context: SoundContext,
    private readonly output: SoundNode,
  ) {
    this.input = context.createGain();
  }

  /** Follows the state's room. `sending`: whether any voice asks for reverb now. */
  follow(room: SoundRoom, sending: boolean, map: SoundClockMap): void {
    const now = map.ctxSeconds;
    if (sending) {
      this.dryFrom = null;
      this.ensure(room.id);
    } else {
      this.dryFrom ??= now;
    }
    for (const [id, bus] of this.buses) {
      const target = id === room.id ? 1 : 0;
      if (bus.target !== target) {
        bus.target = target;
        const end = map.ctxSecondsOf(room.fade.at + room.fade.ms);
        const at = Math.max(now, map.ctxSecondsOf(room.fade.at));
        if (end <= now) bus.track.move(target, now, 0);
        else bus.track.fade(target, at, end - at);
        bus.quietFrom = target === 0 ? Math.max(now, end) + roomTailSeconds(id) : null;
      }
      const quiet = bus.quietFrom !== null && now >= bus.quietFrom;
      const unused = this.dryFrom !== null && now - this.dryFrom >= roomTailSeconds(id);
      if (quiet || unused) this.drop(id, bus);
    }
  }

  /** The rooms built now, for tests and for what a phone keeps. */
  get rooms(): RoomId[] {
    return [...this.buses.keys()];
  }

  disconnect(): void {
    for (const [id, bus] of this.buses) this.drop(id, bus);
    this.input.disconnect();
  }

  private ensure(id: RoomId): void {
    if (this.buses.has(id) || !this.context.createConvolver) return;
    const convolver = this.context.createConvolver();
    const [left, right] = roomImpulse(id, this.context.sampleRate);
    const buffer = this.context.createBuffer(2, left.length, this.context.sampleRate);
    buffer.copyToChannel(left, 0);
    buffer.copyToChannel(right, 1);
    convolver.normalize = false;
    convolver.buffer = buffer;
    // The first room is there at once: nothing rang before it. Another comes in on the change's fade.
    const first = this.buses.size === 0;
    const input = this.context.createGain();
    const track = new GainTrack(input.gain, first ? 1 : 0);
    this.input.connect(input);
    input.connect(convolver);
    convolver.connect(this.output);
    this.buses.set(id, { input, track, convolver, target: first ? 1 : 0, quietFrom: null });
  }

  private drop(id: RoomId, bus: Bus): void {
    this.input.disconnect(bus.input);
    bus.input.disconnect();
    bus.convolver.disconnect();
    this.buses.delete(id);
  }
}
