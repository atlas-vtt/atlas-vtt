import React, { useId, useMemo } from 'react';
import type { App } from 'obsidian';
import { cn } from '../../../utils/cn';
import type { TokenVitals } from '../../services/statblockVitalsSync';
import type { Lookups } from '../expressions/filters';
import { slugify } from '../model/templateIds';
import type { StatblockTemplate } from '../model/templateTypes';
import type { FieldRecord } from '../values/fieldValues';
import { valueText } from '../values/valueText';
import { BlockList } from './BlockView';
import { StatblockHeader } from './StatblockHeader';
import { useStatblockDiceRolling } from './shared/useStatblockDiceRolling';
import { armableValues } from '../rollBonuses/armableValues';
import { ArmedBonuses } from '../rollBonuses/armedBonuses';
import { RollBonusContext, statblockBonusKey, type RollBonusTarget } from '../rollBonuses/rollBonusContext';
import { SheetContext, type SheetContextValue } from './sheetContext';
import { sheetState } from './sheetState';
import { OpenTabsContext, useOpenTabsState } from './tabs/openTabs';
import type { SheetMode, SheetVariant, StatblockTokenContext } from './sheetTypes';
import type { TokenRollContext } from '../../types/diceRollOrigin';
import '../../react/components/statblock/statblock.scss';
import './statblock-sheet.scss';

const DEFAULT_COLUMN_WIDTH_EM = 22;

type ColumnStyle = React.CSSProperties & Record<`--${string}`, string | number>;

export interface StatblockSheetProps {
  template: StatblockTemplate;
  /** The template's name (a file's basename, a built-in's name); `data-template` and `data-layout` carry its slug. */
  name: string;
  /** The statblock's values: the note's frontmatter. A new object means new values: blocks are worked out again. */
  fields: FieldRecord;
  variant: SheetVariant;
  /** Lookup tables beside the template's own; one of the same name replaces the template's. */
  lookups?: Lookups | undefined;
  /** The token the statblock is shown for: its art, and its resource values in Track blocks. Keep the object while it is unchanged. */
  token?: StatblockTokenContext | undefined;
  /** Every token the statblock stands for, whose hit points its hit dice roll; defaults to `token`. */
  rollTokens?: readonly TokenVitals[] | undefined;
  /** The map view that owns the statblock, where it renders outside one; rolls go to that map. */
  viewId?: string | undefined;
  /** The view, scene and tokens the statblock was opened for; rolls for them name it. */
  originContext?: TokenRollContext | undefined;
  mode?: SheetMode | undefined;
  /** Renders Markdown, resolves images and rolls dice; without it values show as plain text. */
  app?: App | undefined;
  /** The statblock note, which links and images resolve from and rolls are tagged with. */
  sourcePath?: string | undefined;
  /** Shown above the statblock's header, across the card (a note on the template it is drawn with). */
  header?: React.ReactNode;
  /** Shown under the blocks, across the card (the DM screen's token resources). */
  footer?: React.ReactNode;
  /** Empty headed sections folded into chips under the card (`foldRule.ts`); keep the set while it is unchanged. */
  folded?: ReadonlySet<string> | undefined;
  /** A block whose tabs open whenever it or the layout changes (the template editor's selection). */
  reveal?: string | null | undefined;
  /**
   * `preview` where the card only shows what a template looks like (the template editor, a gallery): its
   * "Add to next roll" switches are drawn inert. Default `live`: they arm the statblock's values.
   */
  rollBonuses?: 'live' | 'preview' | undefined;
}

/**
 * A statblock drawn natively from its template: the runtime card. The header
 * Atlas draws for every statblock comes first (`StatblockHeader`). Top-level
 * blocks flow into CSS columns (`columns: <columnWidth>em <maxColumns>`),
 * which take their count from the width the card gets, so it reads as one
 * column in the hover preview and the DM screen and as two in a wide pane.
 * Nothing here measures, and no element is a size container: a container
 * would collapse the hover preview, which takes its width from its content.
 */
export function StatblockSheet({
  template,
  name,
  fields,
  variant,
  lookups,
  token,
  rollTokens,
  viewId,
  originContext,
  mode = 'view',
  app,
  sourcePath,
  header,
  footer,
  folded,
  reveal = null,
  rollBonuses = 'live',
}: StatblockSheetProps): React.JSX.Element {
  const state = useMemo(
    () => sheetState({ template, record: fields, lookups, mode, token, folded }),
    [template, fields, lookups, mode, token, folded],
  );
  const sheet = useMemo((): SheetContextValue => ({ state, app, sourcePath }), [state, app, sourcePath]);
  const openTabs = useOpenTabsState(template.layout, reveal);
  const statblockName = valueText(state.reader('name')) || undefined;
  const sheetId = useId();
  const bonusKey = statblockBonusKey(sourcePath, statblockName, sheetId);
  const live = rollBonuses === 'live' && app !== undefined;
  const bonuses = useMemo((): RollBonusTarget => ({
    key: bonusKey,
    armable: armableValues(template.layout.blocks, state),
    store: live ? ArmedBonuses.forApp(app) : null,
  }), [bonusKey, template, state, live, app]);
  const [diceRef, rollMenu] = useStatblockDiceRolling({
    app,
    notePath: sourcePath,
    tokens: rollTokens ?? (token ? [token] : []),
    name: statblockName,
    viewId,
    originContext,
    bonuses: bonuses.store ? bonuses : undefined,
  });

  const slug = slugify(name) || undefined;
  const columns: ColumnStyle = {
    '--atlas-sb-column-width': `${template.layout.columnWidth ?? DEFAULT_COLUMN_WIDTH_EM}em`,
    '--atlas-sb-max-columns': template.layout.maxColumns,
  };

  return (
    <SheetContext.Provider value={sheet}>
      <RollBonusContext.Provider value={bonuses}>
        <OpenTabsContext.Provider value={openTabs}>
          <div
            ref={diceRef}
            className={cn('atlas-statblock', 'atlas-sb-sheet', `atlas-sb-sheet--${variant}`, mode === 'editing' && 'is-editing')}
            data-template={slug}
            data-layout={slug}
            data-variant={variant}
          >
            <div className="atlas-statblock-body">
              {header}
              <StatblockHeader template={template} />
              <div className="atlas-sb-columns" style={columns}>
                <BlockList blocks={template.layout.blocks} />
              </div>
              {footer}
            </div>
            {rollMenu}
          </div>
        </OpenTabsContext.Provider>
      </RollBonusContext.Provider>
    </SheetContext.Provider>
  );
}
