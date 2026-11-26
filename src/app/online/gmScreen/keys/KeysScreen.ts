import type { Mood } from '../../../sound/soundTypes';
import type { RemoteControl, RemoteRefusal, RemoteWatch } from '../../../soundRemote/remoteControl';
import { needsThisPointer, parseRemoteCommand } from '../../../soundRemote/remoteProtocol';
import type { Timers } from '../../gm/companionTimers.ts';
import type { DeviceMessage, GmScreenMood } from '../../protocol/index.ts';
import type { GmScreen, GmScreenOutlet } from '../screens.ts';
import { gmScreenMoods, keysStateOf, moodsMessage } from './keysMessages.ts';

/**
 * Changes that come faster than this (a fader dragged in Atlas, a mood list rebuilt) go to devices as
 * one: every frame into the relay is billed, once per device.
 */
export const KEYS_GAP_MS = 200;

/** Why a device's press was not run, beyond the sound remote's own refusals. */
export type KeysRefusal =
  | RemoteRefusal
  /** The command acts on what the pointer rests on at this computer, which a device elsewhere cannot mean. */
  | 'not-here'
  /** A command this version of Atlas does not know, or one malformed. */
  | 'unknown-command';

/** The sound remote's commands and state, and the moods its keys draw: made while a device is connected. */
export interface KeysSource {
  readonly control: Pick<RemoteControl, 'run' | 'state' | 'watch' | 'dispose'>;
  moods(): readonly Mood[];
}

export interface KeysScreenDeps {
  /** Makes the commands and state when the first device opens; disposed when the last one leaves. */
  open(): KeysSource;
  readonly outlet: GmScreenOutlet;
  readonly timers: Timers;
}

/** What one device was last sent: what it shows now. */
interface Shown {
  moods: readonly GmScreenMood[];
  state: string;
}

/**
 * The Keys and Sound screens on Atlas's side: a device's press runs through the sound remote's control,
 * the one the Stream Deck uses, and is answered; the keys' state and the moods go to each device when it
 * opens and then only where what its keys show changed, after the answer to the press that changed it.
 */
export class KeysScreen implements GmScreen {
  readonly takes = ['press'] as const;
  private live: { source: KeysSource; watch: RemoteWatch } | null = null;
  private readonly shown = new Map<string, Shown>();
  private timer: number | null = null;
  private sentAt = Number.NEGATIVE_INFINITY;

  constructor(private readonly deps: KeysScreenDeps) {}

  opened(device: string): void {
    const { source } = this.start();
    const moods = gmScreenMoods(source.moods());
    const state = keysStateOf(source.control.state());
    this.shown.set(device, { moods, state: JSON.stringify(state) });
    this.deps.outlet.send({ t: 'moods', moods }, device);
    this.deps.outlet.send({ t: 'keys', state }, device);
  }

  message(device: string, message: DeviceMessage): void {
    if (message.t !== 'press' || this.live === null) return;
    const refused = this.run(this.live.source, message.command);
    this.deps.outlet.send({ t: 'press-answer', id: message.id, refused }, device);
    // What the press changed goes after its answer, so the device's state that follows the answer holds it.
    this.schedule();
  }

  closed(device: string): void {
    this.shown.delete(device);
    if (this.shown.size === 0) this.stop();
  }

  private run(source: KeysSource, raw: Readonly<Record<string, unknown>>): KeysRefusal | null {
    const command = parseRemoteCommand(raw);
    if (command === null) return 'unknown-command';
    if (needsThisPointer(command)) return 'not-here';
    return source.control.run(command);
  }

  private start(): { source: KeysSource; watch: RemoteWatch } {
    if (this.live !== null) return this.live;
    const source = this.deps.open();
    // The watch says when the state or the moods may have changed, and looks at the state every second.
    const watch = source.control.watch(() => this.schedule());
    this.live = { source, watch };
    return this.live;
  }

  private stop(): void {
    if (this.timer !== null) this.deps.timers.clearTimer(this.timer);
    this.timer = null;
    const { live } = this;
    this.live = null;
    live?.watch.stop();
    live?.source.control.dispose();
  }

  /** Never at once: a burst of changes goes as one, at most every `KEYS_GAP_MS`. */
  private schedule(): void {
    if (this.timer !== null || this.live === null) return;
    const wait = Math.max(0, this.sentAt + KEYS_GAP_MS - this.deps.timers.now());
    this.timer = this.deps.timers.setTimer(() => {
      this.timer = null;
      this.flush();
    }, wait);
  }

  /** Each open device gets what changed since it was last sent, moods first (the state names a mood); nothing where nothing did. */
  private flush(): void {
    const { live } = this;
    if (live === null) return;
    const moods = gmScreenMoods(live.source.moods());
    const state = keysStateOf(live.source.control.state());
    const json = JSON.stringify(state);
    let sent = false;
    for (const device of this.deps.outlet.devices) {
      const shown = this.shown.get(device);
      if (shown === undefined) continue;
      const change = moodsMessage(shown.moods, moods);
      if (change !== null) this.deps.outlet.send(change, device);
      if (shown.state !== json) this.deps.outlet.send({ t: 'keys', state }, device);
      sent ||= change !== null || shown.state !== json;
      this.shown.set(device, { moods, state: json });
    }
    if (sent) this.sentAt = this.deps.timers.now();
  }
}
