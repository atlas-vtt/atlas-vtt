import type React from 'react';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { App } from 'obsidian';
import { t } from '../../../../i18n';
import type { AssetService } from '../../../../services/AssetService';
import { hasBestiaryTokens, installBestiaryTokens } from '../../../../services/stockPacks/bestiaryTokens';
import type { StatblockSet } from '../../../../services/stockPacks/starterStatblocks';
import { builtInPresetId } from '../../../../gameSystems/presets/presetHelpers';
import { showNotice } from '../../../../ui/notice';
import type { StarterChoice } from '../components/StarterTokensChoice';

const FAILED_NOTICE_MS = 12_000;

export type DownloadPhase = { phase: 'idle' } | { phase: 'downloading'; collection: string; share: number };

interface DownloadState {
  current: DownloadPhase;
  listeners: Set<() => void>;
}

const IDLE: DownloadPhase = { phase: 'idle' };

// One download per library at a time, whichever asset manager or control started it: every offer shows the same.
const downloads = new WeakMap<AssetService, DownloadState>();

function stateOf(assets: AssetService): DownloadState {
  let state = downloads.get(assets);
  if (!state) {
    state = { current: IDLE, listeners: new Set() };
    downloads.set(assets, state);
  }
  return state;
}

function announce(state: DownloadState, next: DownloadPhase): void {
  state.current = next;
  for (const listener of state.listeners) listener();
}

function startDownload(app: App, assets: AssetService, collection: string, statblocks: StatblockSet | undefined): void {
  const state = stateOf(assets);
  if (state.current.phase === 'downloading') return;
  announce(state, { phase: 'downloading', collection, share: 0 });
  installBestiaryTokens(app, assets, collection, { ...(statblocks && { statblocks }), onStep: (share) => announce(state, { phase: 'downloading', collection, share }) }).then(
    (count) => {
      announce(state, IDLE);
      showNotice(t('am.bestiary.added', { count, collection }));
    },
    (error: unknown) => {
      console.error('[Atlas] Could not download the starter tokens', error);
      announce(state, IDLE);
      showNotice(t('am.bestiary.failed'), FAILED_NOTICE_MS);
    },
  );
}

function useDownload(assets: AssetService | undefined): DownloadPhase {
  const subscribe = useCallback((listener: () => void): (() => void) => {
    if (!assets) return () => undefined;
    const state = stateOf(assets);
    state.listeners.add(listener);
    return () => state.listeners.delete(listener);
  }, [assets]);
  return useSyncExternalStore(subscribe, () => (assets ? stateOf(assets).current : IDLE));
}

/** Whether the collection holds the pack; null until known. Read again whenever the library changes. */
function usePackPresent(app: App, assets: AssetService | undefined, collection: string, download: DownloadPhase): boolean | null {
  const [present, setPresent] = useState<boolean | null>(null);
  useEffect(() => {
    if (!assets) return undefined;
    let current = true;
    const read = (): void => {
      hasBestiaryTokens(assets, collection).then((found) => {
        if (current) setPresent(found);
      }, () => {
        if (current) setPresent(null);
      });
    };
    read();
    const ref = app.workspace.on('atlas-vtt:refresh-assets', read);
    return () => {
      current = false;
      app.workspace.offref(ref);
    };
  }, [app, assets, collection, download.phase]);
  return present;
}

/** What a collection's game system suggests: its own statblocks where the pack has them. */
function suggestedChoice(assets: AssetService | undefined, collection: string): StarterChoice {
  const preset = assets?.getCollectionSettings(collection).systemPresetId;
  if (preset === builtInPresetId('dnd5e')) return '5e';
  if (preset === builtInPresetId('cairn')) return 'cairn';
  return 'none';
}

/** The starter tokens as one collection sees them: whether it holds them, the download under way and the statblocks chosen. */
export interface StarterTokens {
  /** Whether the collection holds the pack; null until known. */
  present: boolean | null;
  /** Any download, into whichever collection. */
  download: DownloadPhase;
  /** A download into this collection is under way. */
  downloading: boolean;
  /** A download into any collection is under way: no other may start. */
  busy: boolean;
  choice: StarterChoice;
  setChoice: (choice: StarterChoice) => void;
  /** Downloads the pack into the collection with the statblocks chosen. */
  start: () => void;
}

/** The starter tokens of `collection`, shared by every control that offers them. */
export function useStarterTokens(app: App, assets: AssetService | undefined, collection: string): StarterTokens {
  const download = useDownload(assets);
  const present = usePackPresent(app, assets, collection, download);
  const [choice, setChoice] = useState<StarterChoice>(() => suggestedChoice(assets, collection));
  useEffect(() => setChoice(suggestedChoice(assets, collection)), [assets, collection]);
  return {
    present,
    download,
    downloading: download.phase === 'downloading' && download.collection === collection,
    busy: download.phase === 'downloading',
    choice,
    setChoice,
    start: () => {
      if (assets) startDownload(app, assets, collection, choice === 'none' ? undefined : choice);
    },
  };
}

/** Closes a popover on a press outside `ref` (its button and the popover), in the document they are in. */
export function useCloseOutside(ref: React.RefObject<HTMLElement | null>, open: boolean, close: () => void): void {
  useEffect(() => {
    const doc = ref.current?.ownerDocument;
    if (!open || !doc) return undefined;
    const press = (event: MouseEvent | TouchEvent): void => {
      if (event.target instanceof Node && ref.current?.contains(event.target)) return;
      close();
    };
    doc.addEventListener('mousedown', press);
    doc.addEventListener('touchstart', press);
    return () => {
      doc.removeEventListener('mousedown', press);
      doc.removeEventListener('touchstart', press);
    };
  }, [ref, open, close]);
}
