import { EventEmitter } from 'events';
import type { DiceRules } from '../types/diceRulesTypes';
import { getDiceCrit, type DiceCrit } from './diceCrit';
import { rollFormula, type RolledDie } from './diceFormula';
import { parseFormula, type FormulaError } from './parseFormula';

export interface DiceRollResult {
  id: string;
  timestamp: number;
  formula: string;
  rolls: RolledDie[];
  modifiers: number;
  total: number;
  /** Decided by the collection's critical rule when rolled; missing on rolls logged before rules existed. */
  crit?: DiceCrit;
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
  private readonly getDiceRules: () => DiceRules;

  constructor(eventBus: EventEmitter, getDiceRules: () => DiceRules, private readonly inputs: DiceRollInputs) {
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

  public rollDice(formula: string, source?: DiceRollResult['source']): DiceRollResult | null {
    const result = this.parseAndRoll(formula);
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
    
    this.eventBus.emit('dice-rolled', result);

    return result;
  }

  /** Rolls the formula; one without dice (`+3`) is added to the collection's default roll. */
  private parseAndRoll(formula: string): DiceRollResult | null {
    const rules = this.getDiceRules();
    // An empty quick roll keeps the existing default-roll shortcut. Validate raw
    // input first so completing a bonus cannot strip illegal text or evade caps.
    const input = parseFormula(formula === '' ? rules.defaultRoll : formula);
    if (!input.ok) {
      this.inputs.onFormulaError(input);
      return null;
    }
    const complete = input.terms.some(term => term.kind === 'dice') && formula !== ''
      ? formula : withDefaultRoll(formula, rules.defaultRoll);
    const parsed = parseFormula(complete);
    if (!parsed.ok) {
      this.inputs.onFormulaError(parsed);
      return null;
    }
    const { rolls, modifiers, total } = rollFormula(parsed, this.inputs.random, rules);

    return {
      id: this.inputs.rollId(),
      timestamp: Date.now(),
      formula: complete,
      rolls,
      modifiers,
      total,
      crit: getDiceCrit(rolls, rules),
      player: this.inputs.roller()
    };
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

/** `+3` with `1d20` gives `1d20+3`; a bare number counts as a bonus. */
function withDefaultRoll(modifier: string, defaultRoll: string): string {
  const bonus = modifier.replace(/\s+/g, '');
  return bonus === '' || /^[+-]/.test(bonus) ? `${defaultRoll}${bonus}` : `${defaultRoll}+${bonus}`;
}
