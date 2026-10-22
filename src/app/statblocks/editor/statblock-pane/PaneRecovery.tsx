import React, { useContext, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { t } from '../../../i18n';
import { MENU_SEPARATOR, type ContextMenuEntry } from '../../../react/components/context-menu/AtlasContextMenu';
import { readableFormula } from '../../../recovery/recoveryFormula';
import type { RecoveryButton } from '../../../recovery/recoveryTypes';
import type { RestOffer } from '../../../recovery/restOffer';
import { alwaysRef, type RestChoices, type RuleRef } from '../../../recovery/restTypes';
import type { AllyRests } from '../../../recovery/restWrites';
import { OffMapRollsContext } from '../../render/shared/offMapRolls';
import { CardMenuButton } from './CardMenuButton';
import { usePaneEdit } from './paneEditContext';
import { restOfferNow, takePaneRest, type PaneRestContext } from './paneRest';
import { RestChooserButton } from './RestChooserButton';
import { usePaneRecoveryContext, type PaneRecovery } from './usePaneRecovery';

const hasSpend = (button: RecoveryButton): boolean => button.rules.some((rule) => rule.does === 'spend');
const hasSteps = (button: RecoveryButton): boolean => (button.choices?.length ?? 0) > 0;

/**
 * A player character's recovery buttons under the statblock's header (D5, R4): a press takes the
 * rest at once; a button that spends something (Hit Dice) first opens a menu with a stepper for
 * each thing it spends, from 0 to what the character holds; a button with steps opens the rest
 * chooser, where the player picks its actions. What the rest did is said in a notice.
 */
export function PaneRecoveryButtons({ recovery }: { recovery: PaneRecovery }): React.JSX.Element {
  const pane = usePaneEdit();
  const offMap = useContext(OffMapRollsContext);
  const context: PaneRestContext = { pane, recovery, offMap };
  const [busy, setBusy] = useState(false);
  const [offer, setOffer] = useState<RestOffer | null>(null);
  const [counts, setCounts] = useState<readonly number[]>([]);

  const take = async (buttonId: string, choices: RestChoices, allies?: AllyRests): Promise<void> => {
    setBusy(true);
    try {
      await takePaneRest(context, buttonId, choices, allies);
    } finally {
      setBusy(false);
    }
  };
  const takeSpending = (buttonId: string, spends: ReadonlyMap<RuleRef, number>): Promise<void> => take(buttonId, { picks: [], spends });

  const opened = (button: RecoveryButton) => (open: boolean): void => {
    if (!open) return;
    const now = restOfferNow(pane, recovery, button);
    setOffer(now);
    setCounts(now?.spends.map(() => 0) ?? []);
  };

  const spendEntries = (button: RecoveryButton): ContextMenuEntry[] => {
    const spends = offer?.id === button.id ? offer.spends : [];
    const count = (index: number): number => counts[index] ?? 0;
    const step = (index: number, by: number) => (): void => {
      setCounts((now) => now.map((value, at) => (at === index ? Math.max(0, Math.min(spends[index]!.max, value + by)) : value)));
    };
    const rows = spends.map((spend, index): ContextMenuEntry => ({
      type: 'item',
      label: spend.label,
      detail: t('rest.spendEach', { each: readableFormula(spend.each) }),
      onClick: step(index, 1),
      keepOpen: true,
      disabled: spend.max === 0,
      stepper: {
        value: t('rest.spendCount', { n: count(index), max: spend.max }),
        label: spend.label,
        onDecrement: step(index, -1),
        onIncrement: step(index, 1),
        canDecrement: count(index) > 0,
      },
    }));
    const choices = new Map(spends.map((spend, index) => [alwaysRef(spend.rule), count(index)]));
    const rest: ContextMenuEntry = { type: 'item', label: t('rest.take'), icon: 'rotate-ccw', onClick: () => takeSpending(button.id, choices) };
    return rows.length > 0 ? [...rows, MENU_SEPARATOR, rest] : [rest];
  };

  const content = (button: RecoveryButton): React.ReactNode => (
    <>
      <RotateCcw aria-hidden="true" />
      {button.name}
    </>
  );

  const disabled = busy || !pane.writable;
  const control = (button: RecoveryButton): React.ReactNode => {
    if (hasSteps(button)) {
      return (
        <RestChooserButton key={button.id} button={button} context={context} disabled={disabled} busy={busy} onRest={take}>
          {content(button)}
        </RestChooserButton>
      );
    }
    if (hasSpend(button)) {
      return (
        <CardMenuButton key={button.id} className="atlas-sb-recovery__button" disabled={disabled}
          entries={() => spendEntries(button)} onOpenChange={opened(button)}>
          {content(button)}
        </CardMenuButton>
      );
    }
    return (
      <button key={button.id} type="button" className="atlas-sb-recovery__button" disabled={disabled}
        onClick={() => void takeSpending(button.id, new Map())}>
        {content(button)}
      </button>
    );
  };

  return (
    <div className="atlas-sb-recovery" role="group" aria-label={t('rest.buttons', { name: recovery.character.name })}>
      {recovery.buttons.map(control)}
    </div>
  );
}

function PaneRecoverySlot(): React.JSX.Element | null {
  const recovery = usePaneRecoveryContext();
  return recovery ? <PaneRecoveryButtons recovery={recovery} /> : null;
}

/** The pane's `ValueEditing.recovery`. */
export function renderPaneRecovery(): React.ReactNode {
  return <PaneRecoverySlot />;
}
