import type { DiceRules } from '../../types/diceRulesTypes';
import type { AdvantageSide, DiceSet, RollingDice } from '../../types/diceSetTypes';
import { completeFormula } from '../../tools/completeFormula';
import { withoutConstantLabels } from '../../tools/namedModifiers';
import type { RollOptions } from '../../tools/DiceTool';
import type { GmMessage, PlayerRoll, RollMode, RollRefusal, RollRequestAnswer, SharedRoll } from '../protocol/index.ts';
import { parseFormula } from '../../tools/parseFormula';
import { isRollFormula } from '../../tools/textRolls';
import type { TokenEntity } from '../../types';
import type { DiceRollResult } from '../../types/diceTypes';
import type { DiceSource } from './atlasDice.ts';
import { tokenLabel } from './atlasView.ts';
import type { LoggedRoll, RollRequest } from './log/TableLog.ts';
import { rollFaceOf } from './log/logEntries.ts';
import { MoveRate } from './moveCheck.ts';
import { playerSide } from './rollAdvantage.ts';
import type { RollNotes } from './RollShare.ts';

/**
 * Who is shown a private roll whole besides its roller: the GM (`gm`, and `blind`, where the roller
 * is not), or nobody else (`self`). A `gm` roll answering a button in a whisper is shown to the
 * whisper's people instead (`whisper`): the GM sees it only where the whisper was the GM's too.
 */
export function rollAudience(mode: Exclude<RollMode, 'public'>, who: string, whisper?: readonly string[]): readonly string[] {
  if (mode === 'self') return [who];
  if (mode === 'blind' || whisper === undefined) return ['gm'];
  const to = whisper.filter((id) => id !== who);
  return to.length === 0 ? [who] : to;
}

/** The mode a roll button is rolled in: as its author set it, but never in the open from a whisper. */
export function buttonMode(request: RollRequest): RollMode {
  return request.to !== undefined && request.mode === 'public' ? 'gm' : request.mode;
}

/** Rolls a player may make: a burst of `ROLL_BURST`, then `ROLLS_PER_SECOND`. */
export const ROLL_BURST = 3;
export const ROLLS_PER_SECOND = 1;

/** What a player's roll is checked against. */
export interface RollContext {
  /** The shared scene whose token list players were last sent, or null while none is. */
  readonly scene: string | null;
  readonly mapPath: string | null;
  /** The GM id of a token in that list, by the id players know it by. */
  listedToken(alias: string): string | undefined;
  ownerOf(tokenId: string): string | undefined;
  readonly tokens: Readonly<Record<string, TokenEntity>>;
}

/** How a private roll is made besides its formula: the whisper a roll button stood in, the set, its dice's look and the side of advantage. */
interface PrivateRoll {
  readonly whisper: readonly string[] | undefined;
  readonly set: DiceSet | undefined;
  readonly setAppearance: true | undefined;
  readonly advantage: AdvantageSide | undefined;
}

export type RollVerdict = { readonly ok: true; readonly tokenId: string | null } | { readonly ok: false; readonly reason: RollRefusal };

/**
 * Whether Atlas's dice tool rolls a formula as it stands: it parses, and holds at least one die.
 * Atlas completes a formula without dice with the map's default roll, which a player causes only
 * with a bonus from their sheet (`playerFormula`), and tells a formula it cannot parse with a notice
 * on the GM's screen, which is never for a player to cause.
 */
export function rollableFormula(formula: string): boolean {
  const parsed = parseFormula(formula);
  return parsed.ok && parsed.terms.some((term) => term.kind === 'dice' && term.count > 0);
}

/**
 * Whether a player's formula is rolled: one with dice (`rollableFormula`), or a bonus from their sheet
 * as a page sends it, signed and without spaces but in a label (`+2`, `+4+1`, `+4+3[Str mod]`, a roll
 * by `isRollFormula`), which the map's dice complete as they complete a bonus clicked on a statblock
 * (`1d20+2`, `2d12+5`).
 */
export function playerFormula(formula: string): boolean {
  return rollableFormula(formula) || (!/\s(?![^[]*\])/.test(formula) && isRollFormula(formula));
}

/**
 * A player's formula as it is rolled by `rules`: as sent (a labelled bonus, `+4[Agility]`, completed
 * with the map's dice as a plain one is: `completeFormula`), or without the labels of its constants
 * where only those keep the dice tool from rolling it (a completed formula past its length), so a
 * roll that names its numbers is never refused where the plain one rolls.
 */
export function rolledFormula(formula: string, rules: DiceRules | RollingDice | undefined): string {
  if (rules === undefined || completeFormula(formula, rules).ok) return formula;
  const plain = withoutConstantLabels(formula);
  return plain !== formula && completeFormula(plain, rules).ok ? plain : formula;
}

/**
 * Whether the GM rolls a player's formula: it names the shared scene and is rollable. It names its
 * token only when that token is in the list players see, not hidden now and the sender's (by the id
 * the relay stamped); any other token is left out and the roll names nobody.
 */
export function checkRoll(from: string, message: PlayerRoll, context: RollContext): RollVerdict {
  if (context.scene === null || context.mapPath === null || message.scene !== context.scene) return { ok: false, reason: 'scene' };
  if (!playerFormula(message.formula)) return { ok: false, reason: 'formula' };
  const tokenId = message.token === null ? undefined : context.listedToken(message.token);
  const token = tokenId === undefined ? undefined : context.tokens[tokenId];
  const named = tokenId !== undefined && token !== undefined && token.isHidden !== true && context.ownerOf(tokenId) === from;
  return { ok: true, tokenId: named ? tokenId : null };
}

export interface PlayerRollsPorts {
  context(): RollContext;
  /** The shared tab's dice, or null when it has none. */
  dice(): DiceSource | null;
  /** Runs a roll as `who`'s, so the roll's announcement goes to players as theirs (`RollShare.rollAs`). */
  rollAs(who: string, run: () => void, notes: RollNotes): void;
  /** A formula rolled by the shared map's rules without a throw, for a private roll; null where it does not roll. */
  quietRoll(formula: string, set?: DiceSet, setAppearance?: true, advantage?: AdvantageSide): SharedRoll | null;
  /** The roll button of the log a roll answers, as its presser may roll it; null where there is none. */
  request(from: string, answer: RollRequestAnswer): RollRequest | null;
  /** Takes a private roll into the table's log. */
  logged(roll: LoggedRoll): void;
  /** The id players know a token by. */
  alias(tokenId: string): string;
  send(body: GmMessage, to?: string): void;
  now(): number;
}

/**
 * Players' rolls, made by the GM's own Atlas: the shared tab's dice tool rolls the formula by the map's
 * rules (criticals, exploding dice), throws it on the GM's screen and logs it, for the player's token
 * when the check lets it name one. A roll that asks for advantage or disadvantage takes it where the
 * dice it is rolled with rule that side for it (`playerSide`), and is rolled plain elsewhere. A roll
 * that is not made is refused to its sender alone.
 */
export class PlayerRolls {
  private readonly rate = new MoveRate(ROLL_BURST, ROLLS_PER_SECOND);
  private readonly ports: PlayerRollsPorts;

  constructor(ports: PlayerRollsPorts) {
    this.ports = ports;
  }

  /**
   * A roll answering a roll button of the log is rolled as the button says (its formula and the
   * mode its author set), not as sent. A private roll is rolled quietly: Atlas's dice tool would
   * throw it on the GM's screen and on Atlas's own player window.
   */
  receive(from: string, sent: PlayerRoll): void {
    if (!this.rate.take(from, this.ports.now())) return this.refuse('rate', from);
    const asked = sent.request;
    const request = asked === undefined ? undefined : this.ports.request(from, asked);
    if (request === null) return this.refuse('formula', from);
    const message: PlayerRoll = request === undefined ? sent : { ...sent, formula: request.formula, mode: buttonMode(request) };
    const context = this.ports.context();
    const verdict = checkRoll(from, message, context);
    if (!verdict.ok) return this.refuse(verdict.reason, from);
    const { tokenId } = verdict;
    const token = tokenId === null ? undefined : context.tokens[tokenId];
    const source: NonNullable<DiceRollResult['source']> = tokenId === null || token === undefined ? { type: 'toolbar' } : { type: 'toolbar', tokenId, tokenName: tokenLabel(token) };
    const notes: RollNotes = request !== undefined && asked !== undefined
      ? { flavor: request.label, request: { id: asked.id, label: request.label } }
      : sent.flavor === undefined ? {} : { flavor: sent.flavor };
    const mode = message.mode ?? 'public';
    const dice = this.ports.dice();
    const set = token === undefined ? undefined : dice?.setFor?.(token);
    const setAppearance = request === undefined ? message.setAppearance : undefined;
    const rules = set ?? dice?.rules();
    const formula = rolledFormula(message.formula, rules);
    const advantage = rules === undefined ? undefined : playerSide(formula, rules, message.advantage);
    if (mode !== 'public') return this.rollPrivately(from, formula, mode, tokenId, source, context, notes, { whisper: request?.to, set, setAppearance, advantage });
    if (dice === null || context.mapPath === null) return this.refuse('unavailable', from);
    const options: RollOptions = { ...(set && { set }), ...(setAppearance && { setAppearance }), ...(advantage && { advantage }) };
    const origin = tokenId === null ? undefined : { viewId: dice.viewId, mapPath: context.mapPath, tokenId };
    let rolled = false;
    this.ports.rollAs(from, () => {
      rolled = dice.rollDice(formula, source, origin, options) !== null;
    }, notes);
    if (!rolled) this.refuse('unavailable', from);
  }

  /** A private roll: into the log for its audience, and thrown on the roller's page unless it is blind. */
  private rollPrivately(from: string, formula: string, mode: Exclude<RollMode, 'public'>, tokenId: string | null, source: NonNullable<DiceRollResult['source']>, context: RollContext, notes: RollNotes, how: PrivateRoll): void {
    const { whisper, set, setAppearance, advantage } = how;
    const roll = this.ports.quietRoll(formula, set, setAppearance, advantage);
    if (roll === null) return this.refuse('formula', from);
    const token = tokenId === null ? null : this.ports.alias(tokenId);
    this.ports.logged({ who: from, roll, token, shared: true, mode, to: rollAudience(mode, from, whisper), ...notes, ...rollFaceOf(source, context.tokens) });
    if (mode !== 'blind') this.ports.send({ t: 'roll', who: from, result: roll, token }, from);
  }

  private refuse(reason: RollRefusal, to: string): void {
    this.ports.send({ t: 'roll-refused', reason }, to);
  }
}
