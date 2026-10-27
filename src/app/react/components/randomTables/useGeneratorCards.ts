import { useMemo, useRef } from 'react';
import type { App } from 'obsidian';
import type { LootRoll, TableResult } from '../../../loot/lootHistory';
import { LootHistoryStore } from '../../../loot/LootHistoryStore';
import { canReroll, rerollPart, rerollUnlocked } from '../../../randomTables/generatorReroll';
import { saveGeneratorNote } from '../../../randomTables/saveGeneratorNote';
import type { CollectionTable } from '../../../randomTables/TableNoteReader';
import { tableSourceId } from '../../../randomTables/tableLookup';
import { runInBackground } from '../../../utils/backgroundTask';
import { showNotice } from '../../../ui/notice';
import { useViewStoreHook } from '../../ViewStoreContext';
import type { GeneratorCardHandlers } from './GeneratorControls';
import { openNote } from './openNote';
import type { RandomTablesLibrary } from './useRandomTables';
import { t } from '../../../i18n';

type Library = Pick<RandomTablesLibrary, 'generators' | 'resolver' | 'currency' | 'rarities'>;

/** Long enough to read the notice and reach its Open. */
const SAVED_NOTICE_MS = 8000;

/** Tells that the result was saved, with a link that opens its note. */
function noticeSaved(app: App, path: string, name: string): void {
  const message = createFragment();
  message.append(`${t('tables.generator.saved', { name })} `);
  const link = createEl('a', { text: t('tables.generator.open'), href: '#' });
  message.append(link);
  const notice = showNotice(message, SAVED_NOTICE_MS);
  link.addEventListener('click', (event) => {
    event.preventDefault();
    notice.hide();
    openNote(app, path, name);
  });
}

/**
 * What generators' result cards do: in Latest, roll a part or every unlocked part again (one
 * after the other, each on the roll as the previous left it), show the roll and put it in the
 * history in place of the one rolled; anywhere, save a result as a note into its generator's
 * save folder.
 */
export function useGeneratorCards(app: App, collectionId: string | null, library: Library): { latest: GeneratorCardHandlers; history: GeneratorCardHandlers } {
  const store = useViewStoreHook();
  const queue = useRef<Promise<void>>(Promise.resolve());
  const { generators, resolver, currency, rarities } = library;

  return useMemo(() => {
    const generatorOf = (result: TableResult): CollectionTable | undefined => {
      const origin = result.generator;
      return origin ? generators.find((found) => found.id === tableSourceId(origin)) : undefined;
    };
    const request = { resolver, currency, rarities };

    /** Rolls again on the latest roll as it stands once the rerolls before have landed. */
    type Reroll = (current: LootRoll, shown: TableResult, found: CollectionTable | undefined) => Promise<LootRoll | null>;
    const reroll = (result: TableResult, roll: Reroll): void => {
      if (!collectionId) return;
      const turn = queue.current.then(async () => {
        const current = store.getState().lootRoller.lastRoll;
        const shown = current?.results?.find((entry) => entry.id === result.id);
        if (!current || !shown) return;
        const next = await roll(current, shown, generatorOf(shown));
        // Another roll made meanwhile is the latest now: this one is left as it was.
        if (!next || store.getState().lootRoller.lastRoll?.id !== next.id) return;
        store.getState().showLootRoll(next);
        LootHistoryStore.forApp(app).replace(collectionId, next);
      });
      queue.current = turn.catch(() => undefined);
      runInBackground(turn, 'Rolling a generator again', t('tables.rollFailed'));
    };

    const canSave = (result: TableResult): boolean => generatorOf(result)?.source.saveFolder !== undefined;
    const onSave = (result: TableResult): void => {
      const folder = generatorOf(result)?.source.saveFolder;
      if (!folder) return;
      runInBackground(
        saveGeneratorNote(app, result, folder).then((file) => noticeSaved(app, file.path, file.basename)),
        'Saving a generator result as a note',
        t('tables.generator.saveFailed'),
      );
    };

    const latest: GeneratorCardHandlers = {
      canReroll: (result) => canReroll(result, generatorOf(result)),
      onRerollPart: (result, row) => reroll(result, (current, shown, found) => rerollPart(current, shown, row, found, request)),
      onRerollUnlocked: (result, locked) => reroll(result, (current, shown, found) => rerollUnlocked(current, shown, locked, found, request)),
      canSave,
      onSave,
    };
    return { latest, history: { ...latest, canReroll: () => false } };
  }, [app, collectionId, store, generators, resolver, currency, rarities]);
}
