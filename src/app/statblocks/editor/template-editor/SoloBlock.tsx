import React, { useMemo } from 'react';
import type { App } from 'obsidian';
import { cn } from '../../../../utils/cn';
import { findBlock } from '../../model/treeQueries';
import type { StatblockTemplate } from '../../model/templateTypes';
import { BlockChromeContext, type BlockChrome } from '../../render/blockChrome';
import { BlockView } from '../../render/BlockView';
import { SheetContext, type SheetContextValue } from '../../render/sheetContext';
import { sheetState } from '../../render/sheetState';
import { ValueEditingContext } from '../../render/valueSlot';
import type { FieldRecord } from '../../values/fieldValues';
import { PREVIEW_VALUE_EDITING } from './editorValueSlot';
import { armableValues } from '../../rollBonuses/armableValues';
import { RollBonusContext, type RollBonusTarget } from '../../rollBonuses/rollBonusContext';

/** A drawing beside the card carries no block id: the canvas's frame stays the one block of that id. */
const SOLO_CHROME: BlockChrome = { decorate: () => ({ attributes: { 'data-block-id': undefined } }) };

const NO_VALUES: FieldRecord = {};

export interface SoloBlockProps {
  template: StatblockTemplate;
  id: string;
  record?: FieldRecord | undefined;
  app?: App | undefined;
  sourcePath?: string | undefined;
  className?: string | undefined;
}

/**
 * One block of a template drawn alone by the card's own renderer, as the
 * template editor draws it on the card (a tile not named yet included), but
 * without the card's header: what a drag carries and what the insert menu
 * previews. It takes the width it is given.
 */
export function SoloBlock({ template, id, record = NO_VALUES, app, sourcePath, className }: SoloBlockProps): React.JSX.Element | null {
  const state = useMemo(() => sheetState({ template, record, mode: 'editing' }), [template, record]);
  const sheet = useMemo((): SheetContextValue => ({ state, app, sourcePath }), [state, app, sourcePath]);
  // Drawn as on the card, its "Add to next roll" switches inert.
  const bonuses = useMemo((): RollBonusTarget => ({ key: id, armable: armableValues(template.layout.blocks, state), store: null }), [id, template, state]);
  const block = findBlock(template.layout.blocks, id)?.block;
  if (!block) return null;
  return (
    <SheetContext.Provider value={sheet}>
      <RollBonusContext.Provider value={bonuses}>
        <BlockChromeContext.Provider value={SOLO_CHROME}>
          <ValueEditingContext.Provider value={PREVIEW_VALUE_EDITING}>
            <div className={cn('atlas-statblock atlas-sb-sheet atlas-sb-sheet--full is-editing', className)}>
              <BlockView block={block} />
            </div>
          </ValueEditingContext.Provider>
        </BlockChromeContext.Provider>
      </RollBonusContext.Provider>
    </SheetContext.Provider>
  );
}
