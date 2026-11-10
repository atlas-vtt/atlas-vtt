import React from 'react';
import type { App } from 'obsidian';
import { useLoadingReveal } from '../../packages/components/primitives/useLoadingReveal';
import FantasyStatblock from '../../react/components/FantasyStatblock';
import { StatblockSkeleton } from '../../react/components/statblock/StatblockSkeleton';
import type { StatblockTokenActions } from '../../react/components/statblock/StatblockTokenResources';
import { useBestiaryRevision } from '../../react/hooks/useBestiaryRevision';
import { getFantasyStatblocksApi } from '../../services/FantasyStatblocksService';
import type { TokenVitals } from '../../services/statblockVitalsSync';
import type { LibraryTemplate } from '../model/resolvedTypes';
import type { TemplateId } from '../model/templateTypes';
import { LinkedSheet, type DrawnStatblock } from './LinkedSheet';
import type { SheetVariant } from './sheetTypes';
import { useLinkedStatblock, useNativeTemplateId, type LinkedStatblockResult } from './useLinkedStatblock';
import type { TokenRollContext } from '../../types/diceRollOrigin';
import { t } from '../../i18n';

export interface LinkedStatblockProps {
  app: App;
  /** Vault path of the statblock note; with `noteText`, the path the text stands for. */
  path: string;
  /** The note's text when it is not in the vault, such as a note of a bundle under review. */
  noteText?: string | undefined;
  /** Templates that travel with `noteText` (the bundle's own), found before the library's. Keep the array while unchanged. */
  bundleTemplates?: readonly LibraryTemplate[] | undefined;
  /** Where the statblock shows: a note or a pane (`full`), a hover preview, a DM screen feed. */
  variant: SheetVariant;
  /** Tokens the statblock is shown for: their art replaces its image, their hit points roll from it. */
  tokens?: TokenVitals[] | undefined;
  /** The map view that owns the statblock, where it renders outside one; rolls go to that map. */
  viewId?: string | undefined;
  /** The view, scene and tokens the statblock was opened for; rolls for them name it. */
  originContext?: TokenRollContext | undefined;
  /** The DM screen's controls for each token's resources. */
  tokenActions?: StatblockTokenActions | undefined;
  /** Offered beside "Template not found"; without it the notice offers nothing. */
  onChooseTemplate?: ((path: string) => void) | undefined;
  className?: string | undefined;
}

const NO_TOKENS: TokenVitals[] = [];

/** Today's renderer for a Fantasy Statblocks statblock while the plugin is loaded (§6.1, until M7). */
function FantasyView({ app, path, noteText, tokens, viewId, originContext, tokenActions, className }: LinkedStatblockProps): React.JSX.Element {
  return (
    <FantasyStatblock
      app={app}
      notePath={path}
      noteContent={noteText}
      {...(tokens ? { tokens } : {})}
      viewId={viewId}
      originContext={originContext}
      {...(tokenActions ? { tokenActions } : {})}
      {...(className ? { className } : {})}
    />
  );
}

function Hint({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <div className="atlas-statblock-missing-hint">{children}</div>;
}

const isDrawn = (result: LinkedStatblockResult | null): result is { kind: 'statblock'; statblock: DrawnStatblock } =>
  result?.kind === 'statblock' && result.statblock.template !== null;

/** A note Atlas reads itself: a native statblock, or any statblock while Fantasy Statblocks is missing. */
function ResolvedView(props: LinkedStatblockProps & { templateId: TemplateId | null }): React.JSX.Element {
  const { app, path, noteText, bundleTemplates, templateId, className } = props;
  const { loading, result } = useLinkedStatblock(app, { path, text: noteText, bundleTemplates }, templateId);
  // A note read at mount shows its skeleton at once; a note read in place of another keeps that one a moment.
  const skeleton = useLoadingReveal(loading);
  if (skeleton || result === null) return <StatblockSkeleton className={className} />;

  if (isDrawn(result)) {
    return (
      <LinkedSheet
        app={app}
        statblock={result.statblock}
        variant={props.variant}
        tokens={props.tokens ?? NO_TOKENS}
        viewId={props.viewId}
        originContext={props.originContext}
        tokenActions={props.tokenActions}
        onChooseTemplate={props.onChooseTemplate}
        className={className}
      />
    );
  }
  // The note stopped being native while Fantasy Statblocks is loaded: the plugin draws it.
  if (result.kind === 'statblock') return <FantasyView {...props} />;
  if (result.kind === 'unreadable') return <Hint>{t('statblockEditor.unreadable')}</Hint>;
  if (result.fence) return <Hint>{t('statblockEditor.needFs')}</Hint>;
  return <Hint>{t('statblockEditor.noStatblock')}</Hint>;
}

/**
 * The one mount of a statblock (§4.10, §6.1), for vault notes and for note
 * text outside the vault. Native statblocks are drawn with their template;
 * Fantasy Statblocks' statblocks with today's renderer while the plugin is
 * loaded, and with the auto template while it is missing. It follows the note,
 * its template and the plugin's bestiary, and never writes.
 */
export function LinkedStatblock(props: LinkedStatblockProps): React.JSX.Element {
  const { app, path, noteText } = props;
  // The plugin may load after this mounts, or parse a note anew: either can change who draws the note.
  useBestiaryRevision(app);
  const templateId = useNativeTemplateId(app, path, noteText);
  if (templateId === null && getFantasyStatblocksApi()) return <FantasyView {...props} />;
  return <ResolvedView {...props} templateId={templateId} />;
}

