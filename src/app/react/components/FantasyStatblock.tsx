import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { TFile, type App } from 'obsidian';
import {
  findCreatureForNotePath,
  getFantasyStatblocksApi,
  layoutForCreature,
  resolveCreatureFromFence,
  resolveLayout,
  type FantasyStatblocksCreature,
} from '../../services/FantasyStatblocksService';
import { resolveStatblockNote, statblockSourceFromText } from '../../services/statblockNoteSource';
import { syncStatblockVitals, type TokenVitals } from '../../services/statblockVitalsSync';
import { attachDiceRolling } from '../../services/statblockDiceLinks';
import { rollHitPoints } from '../../services/statblockHitPoints';
import { StatblockRenderer, type StatblockPortrait } from './statblock/StatblockRenderer';
import { TokenPickerModal } from '../../packages/components/token-picker/TokenPickerModal';
import { TokenStatblockLinkService } from '../../services/TokenStatblockLinkService';
import { StatblockTokenResources, type StatblockTokenActions } from './statblock/StatblockTokenResources';
import type { StatblockEditApi } from './statblock/statblockEditContext';
import { isEditableNote, writeStatblockValue } from '../../services/statblockEditing';
import { useBestiaryRevision } from '../hooks/useBestiaryRevision';
import { StatblockSkeleton } from './statblock/StatblockSkeleton';
import { t } from '../../i18n';
import { AtlasUIContext } from '../root/AtlasUIContext';

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
  /** Allows values to be edited in place, writing back to the note's frontmatter */
  editable?: boolean;
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
  editable = false,
  className,
  tokenActions,
  viewId: suppliedViewId,
}: FantasyStatblockProps): React.JSX.Element {
  const context = useContext(AtlasUIContext);
  const viewId = suppliedViewId ?? context?.view?.viewId;
  const ref = useRef<HTMLDivElement>(null);
  const tokensRef = useRef<TokenVitals[]>(tokens);
  tokensRef.current = tokens;

  const key = useMemo(() => vitalsKey(tokens), [tokens]);

  // Edits made here (and elsewhere in the vault) show up without a manual refresh.
  const revision = useBestiaryRevision(app);

  // A note outside the vault is read from its own text; the bestiary knows only vault notes.
  const bestiaryCreature = useMemo(
    () => (noteContent === undefined ? findCreatureForNotePath(notePath) : null),
    // `revision` is not read by the lookup; it re-runs it when the bestiary changes.
    [notePath, noteContent, revision],
  );

  // Notes that define their statblock in a ```statblock fence never enter the
  // bestiary, so resolve those from the fence itself.
  const [noteCreature, setNoteCreature] = useState<FantasyStatblocksCreature | null>(null);
  // The note whose own statblock has been looked for: until then "no creature" is not known yet.
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
        const basename = notePath.split('/').pop()?.replace(/\.md$/, '') ?? '';
        const resolved = source?.kind === 'frontmatter'
          ? { name: basename, ...source.frontmatter } as FantasyStatblocksCreature
          : source ? await resolveCreatureFromFence(app, source.params, notePath) : null;
        if (!cancelled) setNoteCreature(resolved);
        return;
      }

      const file = app.vault.getAbstractFileByPath(notePath);
      if (!(file instanceof TFile)) return;

      const source = await resolveStatblockNote(app, file);
      if (cancelled || source?.kind !== 'codeblock') return;

      const resolved = await resolveCreatureFromFence(app, source.params, notePath);
      if (!cancelled) setNoteCreature(resolved);
    };
    void readNoteCreature().finally(() => {
      if (!cancelled) setReadNote(notePath);
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

  const portraitToken = tokens.find((token) => token.imagePath);
  const portraitPath = portraitToken?.imagePath;
  const portraitRingColor = portraitToken?.ringColor;
  const portraitShowRing = portraitToken?.showRing;
  const portrait = useMemo((): StatblockPortrait | undefined => {
    if (!portraitPath) return undefined;
    const file = app.vault.getAbstractFileByPath(portraitPath);
    if (!(file instanceof TFile)) return undefined;
    return { src: app.vault.getResourcePath(file), ringColor: portraitRingColor, showRing: portraitShowRing };
  }, [app, portraitPath, portraitRingColor, portraitShowRing]);

  // One block per token, matching the vitals sync. The token portrait replaces
  // the layout's own image block, so the artwork never shows twice.
  const monster = useMemo(
    () =>
      creature
        ? {
            ...creature,
            ...(tokens.length ? { qty: tokens.length } : {}),
            ...(portrait ? { image: undefined } : {}),
          }
        : null,
    [creature, tokens.length, portrait],
  );

  const commit = useCallback(
    (path: Array<string | number>, value: string): void => {
      void writeStatblockValue(app, notePath, path, value);
    },
    [app, notePath],
  );

  const edit = useMemo(
    (): StatblockEditApi => ({
      // Edits write to the note's frontmatter, so they only apply to creatures
      // parsed from it. Fence-defined creatures live in the code block instead.
      editable: editable && Boolean(bestiaryCreature) && isEditableNote(app, notePath),
      commit,
    }),
    [editable, bestiaryCreature, app, notePath, commit],
  );

  /**
   * Assigning a token also becomes the statblock's image: the link service
   * writes the chosen token's art into the note's `image` frontmatter, so the
   * pair stays in lockstep.
   */
  const assignToken = useCallback((): void => {
    const file = app.vault.getAbstractFileByPath(notePath);
    if (!(file instanceof TFile)) return;

    new TokenPickerModal(app, file, (tokenPath: string) => {
      void TokenStatblockLinkService.getInstance(app).linkTokenToStatblock(tokenPath, notePath);
    }).open();
  }, [app, notePath]);

  // Click-to-roll dice, applied to whatever the renderer produced.
  useEffect(() => {
    const el = ref.current;
    if (!el || !monster) return;

    return attachDiceRolling(
      el,
      app,
      () => {
        const [token] = tokensRef.current;
        return {
          viewId,
          tokenId: token?.id,
          statblockPath: notePath,
          tokenName: token?.name ?? (monster.name),
          tokenImagePath: token?.imagePath,
        };
      },
      (formula, abilityName) => rollHitPoints(app, formula, notePath, tokensRef.current, abilityName, viewId),
    );
  }, [app, monster, notePath, viewId]);

  // Mirror the tokens' resources into any vitals track the layout renders.
  useEffect(() => {
    if (ref.current && !tokenActions) {
      syncStatblockVitals(ref.current, tokensRef.current);
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
    <div ref={ref} className={`atlas-fantasy-statblock ${className ?? ''}`}>
      <StatblockRenderer
        monster={monster}
        layout={layout}
        resolveLayout={(id) => resolveLayout(app, id)}
        app={app}
        sourcePath={notePath}
        edit={edit}
        portrait={portrait}
        replaceVitals={Boolean(tokenActions)}
        footer={tokenActions && tokens.length > 0 ? (
          <StatblockTokenResources monster={monster} layout={layout} tokens={tokens} {...tokenActions} />
        ) : undefined}
        {...(editable ? { onAssignToken: assignToken } : {})}
      />
    </div>
  );
}

export default FantasyStatblock;
