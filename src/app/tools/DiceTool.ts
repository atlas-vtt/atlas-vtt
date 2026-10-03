import { EventEmitter } from 'events';
import { DEFAULT_DICE_RULES } from '../gameSystems/diceRules';
import type { DiceRules } from '../types/diceRulesTypes';
import { getDiceCrit, type DiceCrit } from './diceCrit';
import { hasDiceTerm, rollFormula, type RolledDie } from './diceFormula';

export interface DiceRollResult {
  id: string;
  timestamp: number;
  formula: string;
  rolls: RolledDie[];
  modifiers: number;
  total: number;
  /** Decided by the collection's critical rule when rolled; missing on rolls logged before rules existed. */
  crit?: DiceCrit;
  /** Set only on a roll the GM made secret in the dice tray; the player window never shows it. */
  secret?: true;
  player?: string;
  source?: {
    type: 'toolbar' | 'statblock';
    /** Let the roll follow its token's or statblock's current artwork. */
    tokenId?: string;
    statblockPath?: string;
    tokenName?: string;
    tokenImagePath?: string;
    abilityName?: string;
  };
}

export interface DiceRollOptions {
  secret?: boolean;
}

export interface DiceToolState {
  isTrayOpen: boolean;
  rollHistory: DiceRollResult[];
  activeFormula: string;
  quickDice: string[]; // Quick access dice buttons
}

export class DiceTool {
  public state: DiceToolState;
  private eventBus: EventEmitter;
  private readonly getDiceRules: () => DiceRules;

  constructor(eventBus: EventEmitter, getDiceRules: () => DiceRules = () => DEFAULT_DICE_RULES) {
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

  public rollDice(
    formula: string,
    source?: DiceRollResult['source'],
    options?: DiceRollOptions
  ): DiceRollResult {
    const result = this.parseAndRoll(formula);
    if (source) {
      result.source = source;
    }
    if (options?.secret) {
      result.secret = true;
    }

    // Add to history
    this.state.rollHistory.unshift(result);
    
    // Keep only last 50 rolls
    if (this.state.rollHistory.length > 50) {
      this.state.rollHistory = this.state.rollHistory.slice(0, 50);
    }
    
    document.dispatchEvent(new CustomEvent('atlas-dice-rolled', { detail: result }));

    return result;
  }

  /** Rolls the formula; one without dice (`+3`) is added to the collection's default roll. */
  private parseAndRoll(formula: string): DiceRollResult {
    const rules = this.getDiceRules();
    const complete = hasDiceTerm(formula) ? formula : withDefaultRoll(formula, rules.defaultRoll);
    const { rolls, modifiers, total } = rollFormula(complete, Math.random, rules);

    return {
      id: `roll_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      timestamp: Date.now(),
      formula: complete,
      rolls,
      modifiers,
      total,
      crit: getDiceCrit(rolls, rules),
      player: 'Player' // TODO: Get actual player name from session
    };
  }

  public clearHistory(): void {
    this.state.rollHistory = [];
    this.eventBus.emit('dice-history-cleared');
    document.dispatchEvent(new CustomEvent('atlas-dice-history-cleared'));
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

/** `+3` with `1d20` gives `1d20+3`; a bare number counts as a bonus. */
function withDefaultRoll(modifier: string, defaultRoll: string): string {
  const bonus = modifier.replace(/\s+/g, '');
  return bonus === '' || /^[+-]/.test(bonus) ? `${defaultRoll}${bonus}` : `${defaultRoll}+${bonus}`;
}
