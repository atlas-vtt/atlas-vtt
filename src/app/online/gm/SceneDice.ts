import type { AdvantageSide, DiceSet } from '../../types/diceSetTypes';
import type { PlayerRoll, SharedRoll } from '../protocol/index.ts';
import type { RollSceneLookup } from '../../services/playerRollSource';
import type { DiceSource } from './atlasDice.ts';
import type { SceneStore } from './atlasView.ts';
import { rollFaceOf } from './log/logEntries.ts';
import type { SpokenAs } from './log/TableLog.ts';
import { LogSpeakers } from './logSpeakers.ts';
import { PlayerRolls } from './PlayerRolls.ts';
import { quietRoll } from './quietRoll.ts';
import { RollShare, type RollNotes } from './RollShare.ts';
import type { SceneSharePorts } from './sceneSharePorts.ts';
import { ownerIn } from './seatSource.ts';

/** What the dice read of the rest of the shared scene: the token lists of its floors. */
export interface SceneDiceParts {
  /** The random id players know a token by. */
  alias(tokenId: string): string;
  /** The scene of the token list player `player` was last sent (their floor's), or null while none is. */
  listedScene(player: string): string | null;
  /** The GM id of a token in the list player `player` was last sent, by the id players know it by. */
  listedToken(player: string, alias: string): string | undefined;
  /** The id players know a token by, while it is in a list they were sent. */
  listedAlias(tokenId: string): string | undefined;
  /** A token of the scene as the players' frame shows it now; null when they do not see it. */
  shownToken(mapPath: string, tokenId: string): ReturnType<RollSceneLookup['shownToken']>;
}

/**
 * The shared scene's rolls and speakers: every roll of the tab to the players and the log
 * (`RollShare`), players' rolls made by the GM's Atlas (`PlayerRolls`), the GM's rolls from the log,
 * rolls in a message and private rolls rolled quietly, and the tokens authors speak as (`LogSpeakers`).
 */
export class SceneDice {
  private readonly store: SceneStore;
  private readonly ports: SceneSharePorts;
  private readonly share: RollShare;
  private readonly rolls: PlayerRolls;
  private readonly speakers: LogSpeakers;
  private readonly parts: SceneDiceParts;

  constructor(store: SceneStore, ports: SceneSharePorts, parts: SceneDiceParts) {
    this.store = store;
    this.ports = ports;
    this.parts = parts;
    const seats = ports.seats;
    this.share = new RollShare({
      send: (body, to) => ports.send(body, to),
      showGmRolls: () => ports.atlasSettings().showDiceRolls,
      scene: () => ({ shownToken: (origin) => parts.shownToken(origin.mapPath, origin.tokenId) }),
      alias: (id) => parts.alias(id),
      logged: (roll, source) => ports.logRoll?.({ ...roll, ...rollFaceOf(source, store.getState().objects.tokens) }),
    });
    this.rolls = new PlayerRolls({
      context: (from) => ({
        scene: parts.listedScene(from),
        mapPath: store.getState().mapPath,
        listedToken: (alias) => parts.listedToken(from, alias),
        ownerOf: ownerIn(seats, store),
        tokens: store.getState().objects.tokens,
      }),
      dice: () => ports.dice?.() ?? null,
      rollAs: (who, run, notes) => this.share.rollAs(who, run, notes),
      quietRoll: (formula, set, setAppearance, advantage) => this.quietRoll(formula, set, setAppearance, advantage),
      request: (from, answer) => ports.rollRequest?.(from, answer) ?? null,
      logged: (roll) => ports.logRoll?.(roll),
      alias: (id) => parts.alias(id),
      send: (body, to) => ports.send(body, to),
      now: () => ports.now(),
    });
    this.speakers = new LogSpeakers((path) => ports.readImage(path), ports.stored);
  }

  start(): void {
    this.share.start(this.ports.dice?.() ?? null);
  }

  stop(): void {
    this.share.stop();
  }

  /** Reads the speakers' artwork again: its reference may go out another way now (without a stored id). */
  refreshArt(): void {
    this.speakers.clear();
  }

  receive(from: string, message: PlayerRoll): void {
    this.rolls.receive(from, message);
  }

  /** The token `who` may speak as in the log by `key`, or null (`LogSpeakers`). */
  speaker(who: string, key: string): Promise<SpokenAs | null> {
    const { parts } = this;
    const seats = this.ports.seats;
    return this.speakers.speaker(who, key, {
      tokens: this.store.getState().objects.tokens,
      listedToken: (alias) => parts.listedToken(who, alias),
      listedAlias: (tokenId) => parts.listedAlias(tokenId),
      ownerOf: ownerIn(seats, this.store),
    });
  }

  /** A formula rolled by the shared map's rules without a throw; null where it does not roll or the tab has no dice now. */
  quietRoll(formula: string, set?: DiceSet, setAppearance?: true, advantage?: AdvantageSide): SharedRoll | null {
    const dice = this.ports.dice?.() ?? null;
    return dice === null ? null : quietRoll(formula, set ?? dice.rules(), this.ports.randomId(), Date.now(), undefined, setAppearance, advantage);
  }

  /** Runs a GM's roll on the shared tab's dice, carrying `notes` into the log; false where the tab has no dice or nothing was rolled. */
  rollAsGm(run: (dice: DiceSource) => boolean, notes: RollNotes): boolean {
    const dice = this.ports.dice?.() ?? null;
    if (dice === null) return false;
    let rolled = false;
    this.share.rollAs('gm', () => {
      rolled = run(dice);
    }, notes);
    return rolled;
  }
}
