import React from 'react';
import { History, Map as MapIcon, Sparkles, X } from 'lucide-react';
import type { LootDraw } from '../../../loot/lootRoller';
import type { LootRoll, TableResult } from '../../../loot/lootHistory';
import { formatRelativeTime } from '../../../utils/relativeTime';
import { Button } from '../../../packages/components/primitives/button';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { LootResultCard } from './LootResultCard';
import { TableResultCard } from '../randomTables/TableResultCard';
import type { GeneratorCardHandlers } from '../randomTables/GeneratorControls';
import { t } from '../../../i18n';

interface CardHandlers {
  onOpenSource: (draw: LootDraw) => void;
  onOpenLink: (link: string) => void;
  /** Items the players see in their loot window. */
  shownIds: ReadonlySet<string>;
  onShowToPlayers: (draw: LootDraw) => void;
  onOpenResult: (result: TableResult) => void;
  onCopyResult: (result: TableResult) => void;
  /** Rerolls and Save as note on generators' results. */
  generator?: GeneratorCardHandlers;
}

/** The draws of a roll that are no result's own item: those get their own cards. */
function looseDraws(roll: LootRoll): LootDraw[] {
  const owned = new Set((roll.results ?? []).flatMap((result) => (result.item ? [result.item] : [])));
  return roll.draws.filter((draw) => !owned.has(draw.id));
}

type CardProps = Pick<React.ComponentProps<typeof LootResultCard>, 'onOpenSource' | 'onOpenLink' | 'shownToPlayers' | 'onShowToPlayers'>;

function cardProps(draw: LootDraw, { shownIds, onOpenSource, onOpenLink, onShowToPlayers }: CardHandlers): CardProps {
  return { onOpenSource, onOpenLink, onShowToPlayers, shownToPlayers: shownIds.has(draw.id) };
}

/** The cards of one roll: its results, then its items, each staggered after the one before when fresh. */
function RollCards({ roll, fresh, handlers }: { roll: LootRoll; fresh: boolean; handlers: CardHandlers }): React.ReactElement {
  const results = roll.results ?? [];
  const draws = looseDraws(roll);
  return (
    <ul className="atlas-loot-list__cards">
      {results.map((result, index) => (
        <TableResultCard
          key={result.id}
          result={result}
          fresh={fresh}
          order={index}
          onOpenSource={handlers.onOpenResult}
          onOpenLink={handlers.onOpenLink}
          onCopy={handlers.onCopyResult}
          generator={result.generator ? handlers.generator : undefined}
          item={result.item ? roll.draws.find((draw) => draw.id === result.item) : undefined}
        />
      ))}
      {draws.map((draw, index) => (
        <LootResultCard key={draw.id} draw={draw} fresh={fresh} order={results.length + index} {...cardProps(draw, handlers)} />
      ))}
    </ul>
  );
}

/** What a roll gave, counted by its cards: "2 results · 1 item". */
function rollCount(roll: LootRoll): string {
  const results = roll.results?.length ?? 0;
  const items = looseDraws(roll).length;
  return [
    ...(results > 0 ? [t('tables.results', { count: results })] : []),
    ...(items > 0 || results === 0 ? [t('loot.items', { count: items })] : []),
  ].join(' · ');
}

interface LootResultsProps extends CardHandlers {
  roll: LootRoll | undefined;
  /** The roll was just made here: its items land with a highlight. */
  fresh: boolean;
}

/** What the latest roll on this map gave. */
export function LootResults({ roll, fresh, ...handlers }: LootResultsProps): React.ReactElement {
  if (!roll) {
    return (
      <div className="atlas-loot-list__empty">
        <Sparkles />
        <span>{t('loot.results.empty')}</span>
      </div>
    );
  }
  return <RollCards roll={roll} fresh={fresh} handlers={handlers} />;
}

interface LootHistoryProps extends CardHandlers {
  rolls: readonly LootRoll[];
  onRemove: (rollId: string) => void;
}

/** Every roll made in the collection, of every table, newest first, with when and where it was made. */
export function LootHistory({ rolls, onRemove, ...handlers }: LootHistoryProps): React.ReactElement {
  if (rolls.length === 0) {
    return (
      <div className="atlas-loot-list__empty">
        <History />
        <span>{t('loot.history.empty')}</span>
      </div>
    );
  }
  return (
    <ol className="atlas-loot-history">
      {rolls.map((roll) => (
        <li key={roll.id} className="atlas-loot-history__roll">
          <div className="atlas-loot-history__meta">
            <span className="atlas-loot-history__when">{formatRelativeTime(roll.rolledAt)}</span>
            <span className="atlas-loot-history__map"><MapIcon />{roll.mapName}</span>
            <span className="atlas-loot-history__count">{rollCount(roll)}</span>
            <LabelTooltip label={t('loot.history.remove')}>
              <Button variant="ghost" size="icon" className="atlas-loot-history__remove" aria-label={t('loot.history.remove')} onClick={() => onRemove(roll.id)}>
                <X />
              </Button>
            </LabelTooltip>
          </div>
          <RollCards roll={roll} fresh={false} handlers={handlers} />
        </li>
      ))}
    </ol>
  );
}
