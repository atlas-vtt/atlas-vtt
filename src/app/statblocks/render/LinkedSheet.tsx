import React, { useMemo } from 'react';
import type { App } from 'obsidian';
import { Button } from '../../packages/components/primitives/button';
import { StatblockTokenResources, type StatblockTokenActions } from '../../react/components/statblock/StatblockTokenResources';
import type { StatblockMonster } from '../../react/components/statblock/statblockTypes';
import { templateQuantityLook } from '../../resources/quantityLooks';
import type { ResourceDefinition } from '../../resources/resourceTypes';
import type { TokenVitals } from '../../services/statblockVitalsSync';
import type { TokenRollContext } from '../../types/diceRollOrigin';
import { cn } from '../../../utils/cn';
import { AUTO_TEMPLATE_ID } from '../model/autoTemplate';
import type { ResolvedStatblock } from '../model/resolvedTypes';
import type { StatblockTemplate } from '../model/templateTypes';
import { withoutFormerKeys } from '../resolve/fieldMeanings';
import { useTokenPortrait } from './shared/tokenPortrait';
import type { SheetVariant, StatblockTokenContext } from './sheetTypes';
import { StatblockSheet } from './StatblockSheet';
import './linked-statblock.scss';

/** A resolved statblock that Atlas draws itself: it has a template. */
export type DrawnStatblock = ResolvedStatblock & { template: StatblockTemplate };

export interface LinkedSheetProps {
  app: App;
  statblock: DrawnStatblock;
  variant: SheetVariant;
  /** Every token the statblock is shown for; their hit points roll from it, the first one's art replaces its image. */
  tokens: TokenVitals[];
  /** The map view that owns the statblock, where it renders outside one; rolls go to that map. */
  viewId?: string | undefined;
  /** The view, scene and tokens the statblock was opened for; rolls for them name it. */
  originContext?: TokenRollContext | undefined;
  /** The DM screen's controls for each token's resources, under the blocks. */
  tokenActions?: StatblockTokenActions | undefined;
  /** Offered where the note's template is missing; not offered without it. */
  onChooseTemplate?: ((path: string) => void) | undefined;
  className?: string | undefined;
}

/** The statblock's fields for the DM screen's quantities: a renamed field once, under its current key. */
function monsterOf({ fields, template }: DrawnStatblock): StatblockMonster {
  const { name, ...rest } = withoutFormerKeys(fields, template.fields);
  return typeof name === 'string' ? { ...rest, name } : rest;
}

/** What the card says about the template it is drawn with, above its blocks. */
function TemplateNotice({ statblock, onChooseTemplate }: Pick<LinkedSheetProps, 'statblock' | 'onChooseTemplate'>): React.JSX.Element | null {
  switch (statblock.templateStatus) {
    case 'auto':
      return <p className="atlas-linked-statblock__caption">Shown with Atlas&apos; field layout</p>;
    case 'missing':
      return (
        <div className="atlas-linked-statblock__bar">
          <span className="atlas-linked-statblock__bar-text">Template not found</span>
          {onChooseTemplate && (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChooseTemplate(statblock.path)}>
              Choose a template
            </Button>
          )}
        </div>
      );
    case 'newer':
      return (
        <div className="atlas-linked-statblock__bar">
          <span className="atlas-linked-statblock__bar-text">Made with a newer Atlas</span>
        </div>
      );
    default:
      return null;
  }
}

/**
 * The token the card stands for: the first token's art, and with exactly one
 * token its resource values for Track blocks. A card that stands for several
 * tokens shows the statblock's own values; the DM screen lists each token's.
 */
function useTokenContext(app: App, tokens: TokenVitals[], definitions: readonly ResourceDefinition[] | undefined): StatblockTokenContext | undefined {
  const art = useTokenPortrait(app, tokens);
  // Most mounts pass new token objects on every render: the context follows their values, not them.
  const single = tokens.length === 1 ? tokens[0] : undefined;
  const isSingle = single !== undefined;
  const { id, name, imagePath, resources } = single ?? {};
  return useMemo((): StatblockTokenContext | undefined => {
    if (!art && !isSingle) return undefined;
    return { id, name, imagePath, resources, art, definitions };
  }, [art, isSingle, id, name, imagePath, resources, definitions]);
}

/** A statblock drawn with its template (or the auto template) through `StatblockSheet`. */
export function LinkedSheet({ app, statblock, variant, tokens, viewId, originContext, tokenActions, onChooseTemplate, className }: LinkedSheetProps): React.JSX.Element {
  const token = useTokenContext(app, tokens, tokenActions?.definitions);
  // The DM screen draws as boxes and names what the template's Track blocks and Scores slots do.
  const look = useMemo(() => templateQuantityLook(statblock.template), [statblock.template]);
  const footer = tokenActions && tokens.length > 0
    ? <StatblockTokenResources monster={monsterOf(statblock)} look={look} tokens={tokens} {...tokenActions} />
    : undefined;

  return (
    <div className={cn('atlas-fantasy-statblock', 'atlas-linked-statblock', className)} data-template-status={statblock.templateStatus ?? undefined}>
      <StatblockSheet
        template={statblock.template}
        name={statblock.lookName ?? AUTO_TEMPLATE_ID}
        fields={statblock.fields}
        variant={variant}
        token={token}
        rollTokens={tokens}
        viewId={viewId}
        originContext={originContext}
        app={app}
        sourcePath={statblock.path}
        header={<TemplateNotice statblock={statblock} onChooseTemplate={onChooseTemplate} />}
        footer={footer}
      />
    </div>
  );
}
