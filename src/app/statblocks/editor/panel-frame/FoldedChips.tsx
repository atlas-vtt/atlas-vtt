import React from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../../packages/components/primitives/button';
import type { FoldedBlock } from '../../render/foldRule';
import { t } from '../../../i18n';
import './folded-chips.scss';

export interface FoldedChipsProps {
  /** The card's folded blocks, in reading order (`foldedBlocks`). */
  folded: readonly FoldedBlock[];
  /** A chip was chosen: the section unfolds in its place. */
  onUnfold: (blockId: string) => void;
}

/**
 * The row under the note view's card (spec §8.2): one chip per section, or
 * value its template folds while empty, that this statblock has nothing in
 * ("+ Spells", "+ Reactions", "+ Damage Resistances"), so the card shows what
 * the hover card and the DM screen show, and every section is one click away.
 * The template editor folds nothing: it shows every block to edit it.
 */
export function FoldedChips({ folded, onUnfold }: FoldedChipsProps): React.JSX.Element | null {
  if (folded.length === 0) return null;
  return (
    <div className="atlas-sb-folded" role="group" aria-label={t('statblockEditor.emptySections')}>
      {folded.map((block) => (
        <Button
          key={block.blockId}
          type="button"
          variant="ghost"
          size="sm"
          className="atlas-sb-folded__chip"
          data-block-id-chip={block.blockId}
          onClick={() => onUnfold(block.blockId)}
        >
          <Plus aria-hidden="true" />
          {block.heading}
        </Button>
      ))}
    </div>
  );
}
