import { readableFormula } from '../../../recovery/recoveryFormula';
import type { RecoveryButton } from '../../../recovery/recoveryTypes';
import { pickedAction, spendable } from '../../../recovery/restPlan';
import type { PlannedRule, RestChoices, RestPick, RestPlan } from '../../../recovery/restTypes';

const MINUS = '−';

/** A signed whole number with a true minus sign. */
const signed = (value: number): string => (value < 0 ? `${MINUS}${Math.abs(value)}` : `+${value}`);

/** How many units a Spend still has of each source, by its metric: picks that spend one source share what it holds. */
type SpendLeft = Map<string, number>;

const sourceKey = (planned: PlannedRule): string => (planned.source ? `${planned.source.kind}:${'key' in planned.source ? planned.source.key : planned.source.id}` : '');

/** The units a Spend rule will spend: what the player asked, within its cap and what the source has left after the rules before it. */
function spentUnits(planned: PlannedRule, choices: RestChoices, left: SpendLeft): number {
  const key = sourceKey(planned);
  const available = left.get(key) ?? (planned.source ? spendable(planned.source) : 0);
  const units = Math.max(0, Math.min(choices.spends.get(planned.ref) ?? 0, planned.spend?.max ?? 0, available));
  left.set(key, available - units);
  return units;
}

/** What one planned rule will do, as the GM reads it on a request's card; null for a spend of nothing. */
function ruleText(planned: PlannedRule, choices: RestChoices, left: SpendLeft): string | null {
  const { rule, target } = planned;
  const label = target.label;
  switch (rule.does) {
    case 'full': return `${label} to full`;
    case 'amount': return `${label} +${readableFormula(planned.formula?.formula ?? rule.formula)}`;
    case 'share': return `${label} +${rule.share === 0.5 ? '½' : '¼'}`;
    case 'set': return `${label} → ${planned.to ?? 0}`;
    case 'spend': {
      const units = spentUnits(planned, choices, left);
      return units === 0 ? null : `${units} ${planned.spend?.label ?? label}`;
    }
    case 'step': return `${label} ${signed(rule.by)}`;
    case 'clear': return `${label} cleared`;
  }
}

/**
 * What a rest will do, rule by rule, as the request's card shows it behind its line: "HP to full",
 * "2 Hit Dice", "Exhaustion −1", and "Kestrel: HP +1d4" for a rule an action takes for another
 * character than the one resting (`resting`, its id). A Spend rule names how many units it will
 * spend (what the player asked, within what the source has left), and none where it spends nothing; rules the rest skips are left out.
 */
export function restRulesText(plan: RestPlan, choices: RestChoices, resting?: string): string[] {
  const left: SpendLeft = new Map();
  return plan.rules.flatMap((planned) => {
    const text = ruleText(planned, choices, left);
    if (text === null) return [];
    return resting !== undefined && planned.character.id !== resting ? `${planned.character.name}: ${text}` : text;
  });
}

/**
 * The actions a rest picks, in order, as the request's card names them: "Tend to Wounds", and
 * "Tend to Wounds for Kestrel" for one taken for another character (`nameOf` names it by its id).
 */
export function restPicksText(button: RecoveryButton, picks: readonly RestPick[], nameOf: (id: string) => string): string[] {
  return picks.flatMap((pick) => {
    const action = pickedAction(button, pick);
    if (action === null) return [];
    return pick.for === null ? action.name : `${action.name} for ${nameOf(pick.for)}`;
  });
}
