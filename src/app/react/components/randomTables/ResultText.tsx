import React from 'react';
import type { TableResultRoll } from '../../../loot/lootHistory';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { LootInlineText } from '../loot/LootInlineText';
import { t } from '../../../i18n';

interface ResultTextProps {
  text: string;
  /** Numbers rolled with the result: underlined, their dice on hover. */
  rolls: readonly TableResultRoll[];
  onOpenLink?: (link: string) => void;
}

/** A result's text with its inline Markdown, and the numbers its dice rolled marked. */
export function ResultText({ text, rolls, onOpenLink }: ResultTextProps): React.ReactElement {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const roll of [...rolls].sort((a, b) => a.at - b.at)) {
    if (roll.at < last) continue;
    const end = roll.at + String(roll.total).length;
    parts.push(<LootInlineText key={`text-${last}`} text={text.slice(last, roll.at)} {...(onOpenLink && { onOpenLink })} />);
    parts.push(
      <LabelTooltip key={`roll-${roll.at}`} describe label={t('tables.card.dice', { formula: roll.formula })}>
        <span className="atlas-table-card__rolled" tabIndex={0}>{text.slice(roll.at, end)}</span>
      </LabelTooltip>,
    );
    last = end;
  }
  parts.push(<LootInlineText key={`text-${last}`} text={text.slice(last)} {...(onOpenLink && { onOpenLink })} />);
  return <>{parts}</>;
}
