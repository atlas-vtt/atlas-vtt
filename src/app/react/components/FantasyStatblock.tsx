import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { App } from 'obsidian';
import {
  getFantasyStatblocksApi,
  layoutForCreature,
  resolveCreatureFromFence,
  resolveLayout,
  type FantasyStatblocksCreature,
} from '../../services/FantasyStatblocksService';
import { frontmatterOfText, statblockSourceFromText } from '../../statblocks/notes/statblockSource';
import { bestiaryLookup, frontmatterCreature, resolveLinkedCreature } from '../../creatures/linkedCreature';
import { boundedStatblock } from '../../creatures/statblockValues';
import { syncStatblockVitals, type TokenVitals } from '../../services/statblockVitalsSync';
import { StatblockRenderer } from './statblock/StatblockRenderer';
import { useStatblockDiceRolling } from '../../statblocks/render/shared/useStatblockDiceRolling';
import { useTokenPortrait } from '../../statblocks/render/shared/tokenPortrait';
import { StatblockTokenResources, type StatblockTokenActions } from './statblock/StatblockTokenResources';
import { useBestiaryRevision } from '../hooks/useBestiaryRevision';
import { StatblockSkeleton } from './statblock/StatblockSkeleton';
import { t } from '../../i18n';
import { AtlasUIContext } from '../root/AtlasUIContext';
import type { TokenRollContext } from '../../types/diceRollOrigin';

interface FantasyStatblockProps {
  /** Owning map when this block renders in a separate React root. */
  viewId?: string | undefined;
  /** Vault path of the note backing the Fantasy Statblocks creature */
  notePath: string;
  /** The note's text when it is not in the vault, e.g. inside a collection being imported; `notePath` then names it. */
  noteContent?: string | undefined;
  /** Obsidian app — used for markdown, images and click-to-roll dice */
  app: App;
  /** Tokens whose resources drive the statblock's vitals — one block per token */
  tokens?: TokenVitals[];
  /** The view, scene and tokens the statblock was opened for, taken with `tokens`; rolls for them name it. */
  originContext?: TokenRollContext | undefined;
  className?: string;
  tokenActions?: StatblockTokenActions;
}

/** Signature of the values mirrored into the statblock, for change detection. */
function vitalsKey(tokens: TokenVitals[]): string {
  return JSON.stringify(tokens.map((t) => [t.name, t.resources]));
}

/**
 * Renders a Fantasy Statblocks creature with Atlas' own statblock components.
 */
export function FantasyStatblock({
  notePath,
  noteContent,
  app,
  tokens = [],
  className,
  tokenActions,
  viewId: suppliedViewId,
  originContext,
}: FantasyStatblockProps): React.JSX.Element {
  const context = useContext(AtlasUIContext);
  const viewId = suppliedViewId ?? context?.view?.viewId;
  const ref = useRef<HTMLDivElement>(null);
  // The tokens and the scene they were taken from stay together for the click that reads them.
  const rollsRef = useRef({ tokens, originContext });
  rollsRef.current = { tokens, originContext };

  const key = useMemo(() => vitalsKey(tokens), [tokens]);

  // Edits made here (and elsewhere in the vault) show up without a manual refresh.
  const revision = useBestiaryRevision(app);

  // A note outside the vault is read from its own text; the bestiary knows only vault notes.
  const bestiaryCreature = useMemo(
    () => (noteContent === undefined ? bestiaryLookup().byPath.get(notePath) ?? null : null),
    // `revision` is not read by the lookup; it re-runs it when the bestiary changes.
    [notePath, noteContent, revision],
  );

  // A note the bestiary has not parsed is read from the note itself: its frontmatter (the
  // bestiary may still be parsing the vault) or its ```statblock fence, which never enters it.
  // A note with neither shows the bestiary creature of its name.
  const [noteCreature, setNoteCreature] = useState<FantasyStatblocksCreature | null>(null);
  // The note whose statblock has been looked for with the whole bestiary to look in: until
  // then "no creature" is not known yet.
  const [readNote, setReadNote] = useState<string | null>(null);

  useEffect(() => {
    if (bestiaryCreature) {
      setNoteCreature(null);
      return;
    }

    let cancelled = false;
    const readNoteCreature = async (): Promise<void> => {
      if (noteContent !== undefined) {
        const source = statblockSourceFromText(noteContent);
        const resolved = source?.kind === 'fs-fence'
          ? await resolveCreatureFromFence(app, source.params, notePath)
          : source ? frontmatterCreature(frontmatterOfText(noteContent) ?? {}, notePath) : null;
        if (!cancelled) setNoteCreature(resolved);
        return;
      }

      const resolved = await resolveLinkedCreature(app, notePath);
      if (!cancelled) setNoteCreature(resolved);
    };
    const bestiaryResolved = Boolean(getFantasyStatblocksApi()?.isResolved?.());
    void readNoteCreature().finally(() => {
      if (!cancelled) setReadNote(bestiaryResolved ? notePath : null);
    });

    return () => {
      cancelled = true;
    };
  }, [app, notePath, noteContent, bestiaryCreature, revision]);

  const creature = bestiaryCreature ?? noteCreature;
  const layout = useMemo(
    () => (creature ? layoutForCreature(app, creature) : null),
    [app, creature],
  );

  const portrait = useTokenPortrait(app, tokens);

  // One block per token, matching the vitals sync. The token portrait replaces
  // the layout's own image block, so the artwork never shows twice.
  // Read within the limits every statblock value is read in, whatever its note holds.
  const monster = useMemo(
    () =>
      creature
        ? boundedStatblock({
            ...creature,
            ...(tokens.length ? { qty: tokens.length } : {}),
            ...(portrait ? { image: undefined } : {}),
          })
        : null,
    [creature, tokens.length, portrait],
  );

  // Click-to-roll dice, applied to whatever the renderer produced.
  const [diceRef, rollMenu] = useStatblockDiceRolling({
    app,
    notePath,
    tokens,
    name: typeof monster?.name === 'string' ? monster.name : undefined,
    viewId,
    originContext,
  });
  const containerRef = useCallback((el: HTMLDivElement | null): (() => void) | undefined => {
    ref.current = el;
    return diceRef(el);
  }, [diceRef]);

  // Mirror the tokens' resources into any vitals track the layout renders.
  useEffect(() => {
    if (ref.current && !tokenActions) {
      syncStatblockVitals(ref.current, rollsRef.current.tokens);
    }
  }, [key, monster, tokenActions]);

  const api = getFantasyStatblocksApi();

  if (!api) {
    return (
      <div className="atlas-statblock-missing-hint">
        {t('statblock.pluginMissing')}
      </div>
    );
  }

  if (!monster || !layout) {
    // The bestiary is parsed asynchronously at startup, so an unresolved
    // bestiary means "not ready yet" rather than "no such creature"; so does
    // a note whose own statblock is still being read.
    if (!api.isResolved?.() || (!bestiaryCreature && readNote !== notePath)) {
      return <StatblockSkeleton className={className} />;
    }

    return (
      <div className="atlas-statblock-missing-hint">
        No Fantasy Statblocks creature found for this note. Note-based creatures require
        &quot;Parse Frontmatter for Creatures&quot; to be enabled in Fantasy Statblocks settings.
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`atlas-fantasy-statblock ${className ?? ''}`}>
      <StatblockRenderer
        monster={monster}
        layout={layout}
        resolveLayout={(id) => resolveLayout(app, id)}
        app={app}
        sourcePath={notePath}
        portrait={portrait}
        replaceVitals={Boolean(tokenActions)}
        footer={tokenActions && tokens.length > 0 ? (
          <StatblockTokenResources monster={monster} layout={layout} tokens={tokens} {...tokenActions} />
        ) : undefined}
      />
      {rollMenu}
    </div>
  );
}

export default FantasyStatblock;
