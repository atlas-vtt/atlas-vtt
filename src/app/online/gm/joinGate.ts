import { newJoinCode } from '../../utils/joinCode.ts';
import { JOIN_CODE_PATTERN, type PlayerInfo } from '../protocol/index.ts';
import type { ArmedCards } from './armedCards.ts';
import type { Timers } from './companionTimers.ts';
import { ARM_MS, WaitingKnocks, type WaitingPlayer } from './waitingKnocks.ts';

export { ARM_MS, FULL_NOTE_MS, type WaitingPlayer } from './waitingKnocks.ts';
export { newJoinCode };

/**
 * A table's gates as the companion keeps them with the table: the join code players are told apart
 * from the link, and the two switches. The code is kept while it is not asked for, so switching it
 * back on shows the one the players already have.
 */
export interface GateSettings {
  readonly code: string;
  readonly requireCode: boolean;
  readonly askToJoin: boolean;
}

/** What the relay is told of the gates: the code it asks newcomers for, or null, and whether they wait for the GM. */
export interface GateFrame {
  readonly code: string | null;
  readonly ask: boolean;
}

/** The longest a pause is shown, whatever the relay's clock says: the relay's own length of one. */
const MAX_PAUSE_MS = 10 * 60_000;
/** What the GM reads while too many wrong codes keep newcomers out. */
export const PAUSED_TEXT = 'Joins paused: too many wrong codes';

/** A new table's gates: a fresh code that is none of `taken` (the players' own codes), and both switches on. */
export const newGate = (random?: () => number, taken?: ReadonlySet<string>): GateSettings => ({ code: newJoinCode(random, taken), requireCode: true, askToJoin: true });

/** The gates with a new code where theirs is one of `taken` (a player's own code now: they share the page's one field); else these very gates. */
export const freeGate = (gate: GateSettings, taken: ReadonlySet<string>, random?: () => number): GateSettings => (taken.has(gate.code) ? { ...gate, code: newJoinCode(random, taken) } : gate);

/** The gates from the plugin's data, each field checked; a table saved before it had gates gets new ones. */
export function readGate(data: unknown, random?: () => number): GateSettings {
  const fresh = newGate(random);
  if (typeof data !== 'object' || data === null) return fresh;
  const { code, requireCode, askToJoin } = data as Record<string, unknown>;
  return {
    code: typeof code === 'string' && JOIN_CODE_PATTERN.test(code) ? code : fresh.code,
    requireCode: typeof requireCode === 'boolean' ? requireCode : true,
    askToJoin: typeof askToJoin === 'boolean' ? askToJoin : true,
  };
}

export const gateFrame = (settings: GateSettings): GateFrame => ({ code: settings.requireCode ? settings.code : null, ask: settings.askToJoin });

/** What the panels show of the gates. */
export interface GateView {
  /** The join code, six digits, or null while none is asked for. */
  readonly code: string | null;
  readonly requireCode: boolean;
  readonly askToJoin: boolean;
  readonly waiting: readonly WaitingPlayer[];
  /** Too many wrong codes: the relay lets no newcomer in for now. */
  readonly paused: boolean;
  /**
   * The line that says so has stood for `ARM_MS`. Whoever sends wrong codes chooses the moment it
   * appears, and it comes with New code: until then that button takes no press, and looks it.
   */
  readonly pauseArmed: boolean;
}

/** What the GM does at the gates. */
export interface GateActions {
  newCode(): void;
  setRequireCode(on: boolean): void;
  setAskToJoin(on: boolean): void;
  /** Lets a waiting newcomer in, or turns them away; nothing while their card has not stood long enough to be meant. */
  admit(id: string): void;
  decline(id: string): void;
  /** The cards moved on screen (the control under them changed its size): each takes no answer again for a moment. */
  moved(): void;
}

/** What the gates need of their table. */
export interface GatePorts {
  /** Tells the relay the gates as they are now. */
  send(frame: GateFrame): void;
  /** Lets a waiting newcomer in (`admit`), or turns them away. */
  answer(id: string, admit: boolean): void;
  /** The settings changed: they are kept with the table. */
  save(settings: GateSettings): void;
  /** Anything the panels show changed. */
  changed(): void;
  /** Tells the GM that joins are paused, wherever the panel is. */
  paused?(): void;
  readonly timers: Timers;
  readonly random?: () => number;
  /** The campaign's players' own codes, which a new join code never is: they share the page's one field. */
  taken?(): ReadonlySet<string>;
  /** The arming clock the knocks share with the other cards over the control; one of their own without it. */
  readonly cards?: ArmedCards;
}

/**
 * The gates of a running table: the settings, who waits for an answer, and whether joins are paused.
 * The relay decides everything; this keeps what it said, for the panels, and the GM's choices.
 */
export class TableGate implements GateActions {
  private current: GateSettings;
  private readonly ports: GatePorts;
  private readonly knocks: WaitingKnocks;
  private isPaused = false;
  private pauseTimer: number | undefined;
  private pauseArmed = false;
  private pauseArmTimer: number | undefined;

  constructor(settings: GateSettings, ports: GatePorts) {
    this.current = settings;
    this.ports = ports;
    this.knocks = new WaitingKnocks(ports.timers, () => ports.changed(), ports.cards);
  }

  get settings(): GateSettings {
    return this.current;
  }

  /** What the relay is told on each welcome. */
  frame(): GateFrame {
    return gateFrame(this.current);
  }

  view(): GateView {
    const { code, requireCode, askToJoin } = this.current;
    return { code: requireCode ? code : null, requireCode, askToJoin, waiting: this.knocks.players, paused: this.isPaused, pauseArmed: this.pauseArmed };
  }

  /** A new code, at once: the old one stops working, and a pause is over. */
  newCode(): void {
    this.set({ ...this.current, code: newJoinCode(this.ports.random, this.ports.taken?.()) });
  }

  setRequireCode(on: boolean): void {
    this.set({ ...this.current, requireCode: on });
  }

  setAskToJoin(on: boolean): void {
    this.set({ ...this.current, askToJoin: on });
  }

  admit(id: string): void {
    if (this.knocks.answer(id)) this.ports.answer(id, true);
  }

  decline(id: string): void {
    if (this.knocks.answer(id)) this.ports.answer(id, false);
  }

  moved(): void {
    this.knocks.moved();
  }

  /** The relay's welcome: who waits now, in place of whoever was listed. */
  welcomed(waiting: readonly PlayerInfo[]): void {
    this.knocks.welcomed(waiting);
  }

  /** A newcomer knocked. */
  knocked(player: PlayerInfo): void {
    this.knocks.knocked(player);
  }

  /** A knock ended; `full`: admitted, but the table had no seat left. */
  gone(id: string, full: boolean): void {
    this.knocks.gone(id, full);
  }

  /**
   * The relay paused joins until `until`, by its clock. A pause already known keeps the time its line
   * has stood (the relay says it again on every welcome) and only its end is timed anew; a new one
   * starts with nothing of the one before it, tells the GM once, and arms its line after `ARM_MS`.
   */
  paused(until: number): void {
    const { timers } = this.ports;
    const left = Math.min(MAX_PAUSE_MS, until - timers.now());
    if (left <= 0) this.endPause();
    else {
      if (!this.isPaused) this.beginPause();
      if (this.pauseTimer !== undefined) timers.clearTimer(this.pauseTimer);
      this.pauseTimer = timers.setTimer(() => {
        this.endPause();
        this.ports.changed();
      }, left);
    }
    this.ports.changed();
  }

  /** The table is over: no timer is left running. */
  dispose(): void {
    this.endPause();
    this.knocks.dispose();
  }

  private set(next: GateSettings): void {
    const before = this.frame();
    this.current = next;
    const frame = this.frame();
    // The relay ends a pause with another code or none.
    if (frame.code !== before.code) this.endPause();
    this.ports.save(next);
    this.ports.send(frame);
    this.ports.changed();
  }

  /** A pause that was not there: whatever the last one left is cleared first, so its time never arms this one's line. */
  private beginPause(): void {
    this.endPause();
    this.isPaused = true;
    this.ports.paused?.();
    this.pauseArmTimer = this.ports.timers.setTimer(() => {
      this.pauseArmTimer = undefined;
      this.pauseArmed = true;
      this.ports.changed();
    }, ARM_MS);
  }

  /** The pause is over in every part, however it ended: both timers cleared, its line unarmed. */
  private endPause(): void {
    const { timers } = this.ports;
    if (this.pauseTimer !== undefined) timers.clearTimer(this.pauseTimer);
    if (this.pauseArmTimer !== undefined) timers.clearTimer(this.pauseArmTimer);
    this.pauseTimer = undefined;
    this.pauseArmTimer = undefined;
    this.isPaused = false;
    this.pauseArmed = false;
  }
}
