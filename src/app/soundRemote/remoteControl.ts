import type { Mood } from '../sound/soundTypes';
import { RemoteCommands, type RemoteDirector, type SoundRefusal } from './remoteCommands';
import type { RemoteCommand, RemoteMood, RemoteState } from './remoteProtocol';
import { remoteMoods, remoteState, type RemoteSource } from './remoteState';
import { isTableCommand, runTableCommand, type TableRefusal, type TableSource } from './remoteTable';

/** A list goes on through its tracks with nobody telling the director, so the state is looked at this often. */
const LOOK_EVERY_MS = 1000;

/** The GM's moods, as the mood store keeps them. */
export interface MoodSource {
  moods(): readonly Mood[];
  mood(id: string): Mood | null;
  onChange(listener: () => void): () => void;
}

export interface RemoteControlDeps {
  director: RemoteDirector & RemoteSource & { subscribe(listener: () => void): () => void };
  moods: MoodSource;
  /** The fight on the GM's map and the player window, which keys act on whether sound is on or not. */
  table: TableSource;
}

/** Why a command did nothing. */
export type RemoteRefusal = SoundRefusal | TableRefusal;

/** The moods or the state, whole, with the JSON text they were compared by. */
export type RemoteChange = { kind: 'moods'; moods: RemoteMood[]; json: string } | { kind: 'state'; state: RemoteState; json: string };

/** One sender's view of the changes: it is handed the moods and the state only when their text changed since it was last handed them. */
export interface RemoteWatch {
  /** Hands out the moods and the state again, as to a sender that has just begun. */
  resend(): void;
  stop(): void;
}

class Watch implements RemoteWatch {
  private sentMoods = '';
  private sentState = '';
  private readonly looking: number;

  constructor(private readonly control: RemoteControl, private readonly send: (change: RemoteChange) => void, private readonly stopped: (watch: Watch) => void) {
    this.resend();
    this.looking = window.setInterval(() => this.stateChanged(), LOOK_EVERY_MS);
  }

  resend(): void {
    const moods = this.control.moods();
    const state = this.control.state();
    this.sentMoods = JSON.stringify(moods);
    this.sentState = JSON.stringify(state);
    this.send({ kind: 'moods', moods, json: this.sentMoods });
    this.send({ kind: 'state', state, json: this.sentState });
  }

  /** The moods, read only when the mood store says they changed: crests make the list large. */
  moodsChanged(): void {
    const moods = this.control.moods();
    const json = JSON.stringify(moods);
    if (json === this.sentMoods) return;
    this.sentMoods = json;
    this.send({ kind: 'moods', moods, json });
  }

  stateChanged(): void {
    const state = this.control.state();
    const json = JSON.stringify(state);
    if (json === this.sentState) return;
    this.sentState = json;
    this.send({ kind: 'state', state, json });
  }

  stop(): void {
    window.clearInterval(this.looking);
    this.stopped(this);
  }
}

/**
 * The remote's commands and state, whatever carries them: runs a command through the same intents the palette,
 * the Sound page, the tracker and the player window's bar send, reads the moods and the state a controller's keys
 * draw, and hands each sender what changed. It holds no sound or table state of its own.
 */
export class RemoteControl {
  private readonly commands: RemoteCommands;
  private readonly watches = new Set<Watch>();
  private readonly stops: Array<() => void>;

  constructor(private readonly deps: RemoteControlDeps) {
    this.commands = new RemoteCommands(deps.director, (id) => deps.moods.mood(id));
    this.stops = [
      deps.director.subscribe(() => this.stateChanged()),
      deps.moods.onChange(() => {
        for (const watch of this.watches) watch.moodsChanged();
        this.stateChanged();
      }),
    ];
  }

  /** Null where it was done. */
  run(command: RemoteCommand): RemoteRefusal | null {
    if (!isTableCommand(command)) return this.commands.run(command);
    const refused = runTableCommand(this.deps.table, command);
    // The table tells nobody it changed; the next look would find it within a second
    if (!refused) this.stateChanged();
    return refused;
  }

  moods(): RemoteMood[] {
    return remoteMoods(this.deps.moods.moods());
  }

  state(): RemoteState {
    return remoteState(this.deps.director, (id) => this.deps.moods.mood(id), this.deps.table);
  }

  /** Hands `send` the moods and the state at once, then whatever changes of them, until the watch stops. */
  watch(send: (change: RemoteChange) => void): RemoteWatch {
    const watch = new Watch(this, send, (stopped) => this.watches.delete(stopped));
    this.watches.add(watch);
    return watch;
  }

  /** Stops every watch, and writes the levels a dial moved. */
  dispose(): void {
    for (const stop of this.stops.splice(0)) stop();
    for (const watch of [...this.watches]) watch.stop();
    this.commands.dispose();
  }

  private stateChanged(): void {
    for (const watch of this.watches) watch.stateChanged();
  }
}
