import { useState } from 'react';
import {
  firstRule, kindFits, ruleFor, ruleOfKind, spendRule, withoutRule, withRule,
} from '../../../recovery/editor/recoveryEdits';
import type { RuleScope } from '../../../recovery/editor/recoveryScope';
import type { RecoveryButton, RecoveryRule, RecoveryRuleKind, RecoveryTarget } from '../../../recovery/recoveryTypes';

/** A metric picked on the card: its spot and what a rule on it changes. */
export interface PickedMetric {
  spotId: string;
  target: RecoveryTarget;
}

/** What one Escape took back: picking a source, the card, or the picked metric. */
export type EscapeStep = 'spending' | 'card' | 'metric';

export interface RuleEditing {
  picked: PickedMetric | null;
  /** The picked metric's rule in the selected button's scope. */
  rule: RecoveryRule | undefined;
  cardOpen: boolean;
  /** Waiting for the metric a Spend rule spends: the card makes way meanwhile. */
  spending: boolean;
  /** The card was opened from the keyboard: its chosen kind takes focus. */
  fromKeyboard: boolean;
  /**
   * Adds the metric to the scope where it is not in it yet and opens its card, or closes the card
   * of the metric already picked; picks the source while spending.
   */
  pick: (spotId: string, target: RecoveryTarget, fromKeyboard: boolean) => 'picked' | 'source' | 'full' | 'ignored';
  /** Changes the rule to one of `kind`; Spend without a source waits for one ('spending'). */
  chooseKind: (kind: RecoveryRuleKind) => 'chosen' | 'spending';
  changeRule: (rule: RecoveryRule) => void;
  /** Spend: waits for another metric to spend. */
  pickSource: () => void;
  /** Leaves the picked metric out of the scope, and lets go of it. */
  remove: () => void;
  /** Takes back the innermost of picking a source, the card and the pick; null where nothing was. */
  escape: () => EscapeStep | null;
  closeAll: () => void;
}

/**
 * The picking of metrics on the card for one scope of a button (its own rules, or one action's),
 * and the rules it sets: a metric picked is added to the scope with its first rule and opens its
 * card, where the kind of rule and its numbers are set. Every change goes to `onButton` at once.
 */
export function useRuleEditing(button: RecoveryButton | null, scope: RuleScope, onButton: (button: RecoveryButton) => void): RuleEditing {
  const [picked, setPicked] = useState<PickedMetric | null>(null);
  const [cardOpen, setCardOpen] = useState(false);
  const [spending, setSpending] = useState(false);
  const [fromKeyboard, setFromKeyboard] = useState(false);
  const rule = button && picked ? ruleFor(button, picked.target, scope) : undefined;

  const closeAll = (): void => {
    setPicked(null);
    setCardOpen(false);
    setSpending(false);
  };

  const setRule = (next: RecoveryRule): boolean => {
    const changed = button && withRule(button, next, scope);
    if (changed) onButton(changed);
    return changed !== null;
  };

  const pick: RuleEditing['pick'] = (spotId, target, keyboard) => {
    if (!button) return 'full';
    setFromKeyboard(keyboard);
    if (spending && picked) {
      // Only another metric with a maximum can be spent
      if (picked.target.kind === 'condition' || target.kind === 'condition' || spotId === picked.spotId) return 'ignored';
      setRule(spendRule(picked.target, target, rule));
      setSpending(false);
      setCardOpen(true);
      return 'source';
    }
    if (picked?.spotId === spotId) {
      setCardOpen(!cardOpen);
      return 'picked';
    }
    if (!ruleFor(button, target, scope) && !setRule(firstRule(target))) return 'full';
    setPicked({ spotId, target });
    setCardOpen(true);
    setSpending(false);
    return 'picked';
  };

  /** Spend waits for the metric it spends: the card makes way, so every other metric can be clicked. */
  const startSpending = (): void => {
    setSpending(true);
    setCardOpen(false);
  };

  const chooseKind: RuleEditing['chooseKind'] = (kind) => {
    if (!picked || !kindFits(kind, picked.target)) return 'chosen';
    const next = ruleOfKind(kind, picked.target, rule);
    if (kind === 'spend' && !next) {
      startSpending();
      return 'spending';
    }
    if (next) setRule(next);
    return 'chosen';
  };

  const remove = (): void => {
    if (button && picked) onButton(withoutRule(button, picked.target, scope));
    closeAll();
  };

  const escape = (): EscapeStep | null => {
    if (spending) {
      // Back to the card the Spend kind was chosen on, with the rule it had
      setSpending(false);
      setCardOpen(true);
      setFromKeyboard(true);
      return 'spending';
    }
    if (cardOpen) {
      setCardOpen(false);
      return 'card';
    }
    if (picked) {
      setPicked(null);
      return 'metric';
    }
    return null;
  };

  return {
    picked,
    rule,
    cardOpen,
    spending,
    fromKeyboard,
    pick,
    chooseKind,
    changeRule: (next) => { setRule(next); },
    pickSource: startSpending,
    remove,
    escape,
    closeAll,
  };
}
