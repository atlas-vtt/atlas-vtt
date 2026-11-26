import React from 'react';
import { SegmentedControl } from '../../../packages/components/primitives/SegmentedControl';
import type { AdvantageSide } from '../../../types/diceSetTypes';
import type { TrayAdvantageChoice } from '../../../tools/diceTrayMemory';
import { sideLabel, type TrayAdvantage } from './diceTrayStatus';
import { TRAY_SURFACE } from './diceTrayPool';
import { t } from '../../../i18n';

/** The keys that choose a side while the tray is open (`useDiceTrayKeys`), shown in each option's tooltip. */
export const SIDE_KEYS: Readonly<Record<TrayAdvantageChoice, string>> = { normal: 'n', advantage: 'a', disadvantage: 'd' };

interface DiceTrayAdvantageProps {
  advantage: TrayAdvantage;
  side: TrayAdvantageChoice;
  /** Dice stand that advantage does not change: Normal shows, the sides are held off with the reason. */
  moot: boolean;
  onChange: (side: TrayAdvantageChoice) => void;
}

/**
 * Normal, Advantage, Disadvantage. A radio group with one tab stop whose arrow keys choose (WAI-ARIA),
 * passing sides that are held off; N, A and D choose from anywhere in the open tray.
 */
export function DiceTrayAdvantage({ advantage, side, moot, onChange }: DiceTrayAdvantageProps): React.ReactElement {
  const sideOption = (value: AdvantageSide): { value: AdvantageSide; label: string; shortcut: string; disabled?: boolean; hint?: string } => ({
    value,
    label: sideLabel(value),
    shortcut: SIDE_KEYS[value].toUpperCase(),
    ...(moot && { disabled: true, hint: t('diceRoll.advantageOnly', { dice: advantage.dice }) }),
  });
  return (
    <SegmentedControl<TrayAdvantageChoice>
      className="atlas-segmented--fit atlas-dice-tray__advantage"
      ariaLabel={t('dice.trayAdvantage')}
      value={moot ? 'normal' : side}
      roving
      followFocus
      tooltipOutside={TRAY_SURFACE}
      // A middle option's tooltip stands under it, over the share row's words, never over a control.
      tooltipSide="bottom"
      options={[{ value: 'normal', label: t('dice.normal'), shortcut: SIDE_KEYS.normal.toUpperCase() }, ...advantage.sides.map(sideOption)]}
      onChange={onChange}
    />
  );
}
