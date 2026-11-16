import React, { memo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowUpRight, Copy, EyeOff } from 'lucide-react';
import { Button } from '../../../packages/components/primitives/button';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import type { TableResult } from '../../../loot/lootHistory';
import type { LootDraw } from '../../../loot/lootRoller';
import { LootGiveButton } from '../loot/LootGiveButton';
import { PartControls, RerollUnlockedButton, SaveAsNoteButton, toggledLock, type GeneratorCardHandlers } from './GeneratorControls';
import { EASE_OUT_CONTROL_POINTS, PANEL_ENTER_FROM, PANEL_ENTER_MS } from '../../../utils/motion';
import { LootInlineText } from '../loot/LootInlineText';
import { ResultText } from './ResultText';
import { t } from '../../../i18n';

interface TableResultCardProps {
  result: TableResult;
  /** Part of the roll just made: it lands with a highlight. */
  fresh: boolean;
  /** Position within the fresh roll, to stagger several results. */
  order: number;
  onOpenSource: (result: TableResult) => void;
  onOpenLink: (link: string) => void;
  onCopy: (result: TableResult) => void;
  /** A generator's controls; absent for other results. */
  generator?: GeneratorCardHandlers | undefined;
  /** The roll's draw that is this result as an item, handed out with Give. */
  item?: LootDraw | undefined;
}

const NO_LOCKS: ReadonlySet<number> = new Set();

const STAGGER_S = 0.06;

function TableResultCardView({ result, fresh, order, onOpenSource, onOpenLink, onCopy, generator, item }: TableResultCardProps): React.ReactElement {
  const reduceMotion = useReducedMotion();
  // Locks are this card's alone: never stored, gone when the card goes.
  const [locked, setLocked] = useState(NO_LOCKS);
  const rerolls = generator && result.generator && generator.canReroll(result) ? generator : null;
  const enter = reduceMotion ? { opacity: 0 } : { opacity: 0, transform: PANEL_ENTER_FROM };

  return (
    <motion.li
      className={`atlas-loot-card atlas-table-card${fresh ? ' atlas-loot-card--fresh' : ''}`}
      initial={fresh ? enter : false}
      animate={{ opacity: 1, transform: 'translateY(0px) scale(1)' }}
      transition={{ duration: PANEL_ENTER_MS / 1000, ease: EASE_OUT_CONTROL_POINTS, delay: fresh ? order * STAGGER_S : 0 }}
    >
      <div className="atlas-loot-card__head">
        {result.roll && (
          <LabelTooltip label={t('tables.card.rolled', { die: result.roll.die, total: result.roll.total })}>
            <span className="atlas-table-card__roll" tabIndex={0}>{result.roll.total}</span>
          </LabelTooltip>
        )}
        <p className="atlas-table-card__text">
          <ResultText text={result.text} rolls={result.rolls ?? []} onOpenLink={onOpenLink} />
        </p>
        {item && <LootGiveButton draw={item} />}
        {generator?.canSave(result) && <SaveAsNoteButton onSave={() => generator.onSave(result)} />}
        <LabelTooltip label={t('tables.copy')}>
          <Button
            variant="ghost"
            size="icon"
            className="atlas-loot-card__action"
            aria-label={t('tables.copy')}
            onClick={() => onCopy(result)}
          >
            <Copy />
          </Button>
        </LabelTooltip>
      </div>

      {result.fields.length > 0 && (
        <dl className={`atlas-table-card__fields${rerolls ? ' atlas-table-card__fields--parts' : ''}`}>
          {result.fields.map((field) => (
            <div key={field.row ?? field.label} className={`atlas-table-card__field${field.hidden ? ' is-hidden' : ''}`}>
              <dt>
                {field.label}
                {field.hidden && (
                  <LabelTooltip label={t('tables.hiddenColumn')}>
                    <span className="atlas-table-card__only-you" tabIndex={0}><EyeOff /></span>
                  </LabelTooltip>
                )}
              </dt>
              <dd><LootInlineText text={field.value} onOpenLink={onOpenLink} /></dd>
              {rerolls && field.row !== undefined && (
                <PartControls
                  label={field.label}
                  row={field.row}
                  locked={locked.has(field.row)}
                  onLock={(row) => setLocked(toggledLock(locked, row))}
                  onReroll={(row) => rerolls.onRerollPart(result, row)}
                />
              )}
            </div>
          ))}
        </dl>
      )}

      <div className="atlas-loot-card__foot">
        {rerolls && <RerollUnlockedButton onReroll={() => rerolls.onRerollUnlocked(result, locked)} />}
        <LabelTooltip label={t('tables.openNote')}>
          <button type="button" className="atlas-loot-text-button atlas-loot-card__source" onClick={() => onOpenSource(result)}>
            <span>{result.source.join(' › ')}</span>
            <ArrowUpRight />
          </button>
        </LabelTooltip>
      </div>
    </motion.li>
  );
}

/** One rolled result of a Text table or a generator; renders again only when its own props change. */
export const TableResultCard = memo(TableResultCardView);
