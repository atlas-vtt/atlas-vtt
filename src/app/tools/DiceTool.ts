import type { DiceRollResult } from '../types/diceTypes';
import type { DiceRollOrigin } from '../types/diceRollOrigin';
import { EventEmitter } from 'events';
import type { DiceRules } from '../types/diceRulesTypes';
import type { AdvantageSide, DiceSet, RolledWithSet, RollingDice } from '../types/diceSetTypes';
import { rollingRules } from '../gameSystems/diceSets';
import { completeFormula } from './completeFormula';
import { withAdvantage } from './diceAdvantage';
import { getDiceCrit } from './diceCrit';
import { rollFormula } from './diceFormula';
import { dressSetDice } from './diceAppearance';
import type { FormulaError } from './parseFormula';

/** How a roll is made besides its formula. */
export interface RollOptions {
  /** Rolls a bare bonus with this set instead of the collection's (a statblock's template's). */
  set?: DiceSet | undefined;
  /** Rolls with advantage or disadvantage, as the set's rule for that side says. */
  advantage?: AdvantageSide | undefined;
  /** Gives an explicit matching pool the set’s names and colours; never changes its dice. */
  setAppearance?: boolean | undefined;
}

export interface DiceToolState {
  isTrayOpen: boolean;
  rollHistory: DiceRollResult[];
  activeFormula: string;
  quickDice: string[]; // Quick access dice buttons
}

export interface DiceRollInputs {
  random: () => number;
  rollId: () => string;
  roller: () => string;
  onFormulaError: (error: FormulaError) => void;
}

export class DiceTool {
  public state: DiceToolState;
  private eventBus: EventEmitter;
  /** The dice this tool rolls a bare bonus with: its map's dice set. */
  readonly getDiceRules: () => DiceRules | RollingDice;

  /** `getDiceRules` gives the dice a bare bonus rolls with: the collection's dice set. */
  constructor(eventBus: EventEmitter, getDiceRules: () => DiceRules | RollingDice, private readonly inputs: DiceRollInputs) {
    this.eventBus = eventBus;
    this.getDiceRules = getDiceRules;
    this.state = {
      isTrayOpen: false,
      rollHistory: [],
      activeFormula: '',
      quickDice: ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100']
    };
  }

  public toggleTray(): void {
    this.state.isTrayOpen = !this.state.isTrayOpen;
    this.eventBus.emit('dice-tray-toggled', this.state.isTrayOpen);
  }

  /**
   * Rolls `formula` for `source`. `origin` says which token of which scene the roll was
   * made for; it goes out with the `dice-rolled` event and is kept nowhere. `options` may
   * name a dice set instead of the collection's and a side of advantage.
   */
  public rollDice(formula: string, source?: DiceRollResult['source'], origin?: DiceRollOrigin, options?: RollOptions): DiceRollResult | null {
    const result = this.parseAndRoll(formula, options);
    if (!result) return null;
    if (source) {
      result.source = source;
    }
    
    // Add to history
    this.state.rollHistory.unshift(result);
    
    // Keep only last 50 rolls
    if (this.state.rollHistory.length > 50) {
      this.state.rollHistory = this.state.rollHistory.slice(0, 50);
    }
    
    this.eventBus.emit('dice-rolled', result, origin);

    return result;
  }

  /** Rolls the formula; one without dice (`+3`) is added to the dice of the set. */
  private parseAndRoll(formula: string, options: RollOptions | undefined): DiceRollResult | null {
    const { rules, shown } = rollingWith(this.getDiceRules(), options?.set);
    return rollDiceFormula(formula, rules, this.inputs, shown, options?.advantage, options?.setAppearance);
  }

  /** The dice a roll of `set` (else the collection's) is made with, and their rules: what advantage can do. */
  public rollingDice(set?: DiceSet): RollingDice {
    return rollingRules(rollingWith(this.getDiceRules(), set).rules);
  }

  public clearHistory(): void {
    this.state.rollHistory = [];
    this.eventBus.emit('dice-history-cleared');
  }

  public setActiveFormula(formula: string): void {
    this.state.activeFormula = formula;
  }

  public getQuickDice(): string[] {
    return this.state.quickDice;
  }

  public addQuickDie(die: string): void {
    if (!this.state.quickDice.includes(die)) {
      this.state.quickDice.push(die);
    }
  }

  public removeQuickDie(die: string): void {
    this.state.quickDice = this.state.quickDice.filter(d => d !== die);
  }

  // Get current state
  public getState(): DiceToolState {
    return { ...this.state };
  }
}

/**
 * The dice a bare bonus rolls with: `set` where one is given (a statblock's
 * template's), else the collection's. A roll names the set (`shown`) only
 * where it is not the collection's own.
 */
export function rollingWith(
  collection: DiceRules | RollingDice, set: DiceSet | undefined,
): { rules: DiceRules | RollingDice; shown?: RolledWithSet } {
  if (!set) return { rules: collection };
  const own = 'id' in collection && collection.id === set.id;
  return own ? { rules: collection } : { rules: set, shown: { id: set.id, name: set.name } };
}

/**
 * Rolls a formula by a dice set (or a collection's dice rules), as the dice
 * tool does but without telling anyone: one without dice (`+3`) is added to
 * the set's dice, which take their names and colours, and an empty one rolls
 * them alone. Dice written out roll as written. `advantage` rolls a roll of the
 * set's dice as its rule for that side says. A formula it refuses (advantage
 * taking it past a limit too) is reported to `inputs.onFormulaError` and rolls
 * nothing (null). `shown` names the set on the result, where it is not the
 * collection's own.
 */
export function rollDiceFormula(
  formula: string, rules: DiceRules | RollingDice, inputs: DiceRollInputs, shown?: RolledWithSet, advantage?: AdvantageSide, setAppearance = false,
): DiceRollResult | null {
  const rolling = rollingRules(rules);
  const complete = completeFormula(formula, rules);
  if (!complete.ok) {
    inputs.onFormulaError(complete);
    return null;
  }
  const looks = complete.written ? [] : rolling.dice;
  const helped = advantage ? withAdvantage(complete.parsed, looks, rolling, advantage) : null;
  if (helped && 'ok' in helped) {
    inputs.onFormulaError(helped);
    return null;
  }
  const { rolls, modifiers, named, total, linear } = helped
    ? rollFormula(helped.formula, inputs.random, helped.explodeRules, helped.looks)
    : rollFormula(complete.parsed, inputs.random, rolling, looks);

  return {
    id: inputs.rollId(),
    timestamp: Date.now(),
    formula: complete.formula,
    rolls: complete.written && setAppearance ? dressSetDice(rolls, rolling) : rolls,
    modifiers,
    ...(named.length > 0 && { namedModifiers: named }),
    total,
    ...(!linear && { linear: false as const }),
    crit: getDiceCrit(rolls, rolling),
    player: inputs.roller(),
    ...(shown && { diceSet: shown }),
    ...(helped && advantage && { advantage }),
  };
}
