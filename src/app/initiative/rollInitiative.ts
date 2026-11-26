import type { App } from 'obsidian';
import { playedSystemCampaignName } from '../campaigns/playedSystemCampaignName';
import { t } from '../i18n';
import { isBestiaryResolved } from '../services/FantasyStatblocksService';
import { readStatblockRecord } from '../statblocks/resolve/statblockRecord';
import type { ViewAtlasStore } from '../storeFactory';
import type { InitiativeRules } from '../types/initiativeRulesTypes';
import { showNotice } from '../ui/notice';
import { ownModifier } from './initiativeModifier';
import { readStatblockModifiers } from './statblockModifiers';

/**
 * Where the rules name a field and some linked statblocks that were read hold no number there, the
 * GM is told how many, the field, and where it is chosen (the played campaign's game system where
 * its rules apply): a field that reads nothing is the usual setup mistake.
 */
function noticeMissedModifiers(app: App, rules: InitiativeRules, missed: number): void {
  const field = rules.modifier?.field ?? rules.modifierFallback?.field;
  if (!field) return;
  const campaign = playedSystemCampaignName(app);
  showNotice(campaign === undefined
    ? t('initiative.modifierMissing', { count: missed, field })
    : t('initiative.modifierMissingCampaign', { count: missed, field, campaign }));
}

interface RollOptions {
  /** Only this combatant rolls; unset, all do. */
  entryId?: string | undefined;
  /** Asked once the statblocks are read: false rolls nothing. */
  wanted?: () => boolean;
}

/** Stores whose combatants are being rolled: another roll is not started meanwhile. */
const rolling = new WeakSet<object>();

/** A roll of `store`'s combatants runs (`rollInitiative`), so another would roll nothing. */
export function isRollingInitiative(store: object): boolean {
  return rolling.has(store);
}

/**
 * Rolls every combatant of `store`, or the one of `entryId`, with their statblocks' modifiers, as the
 * tracker's Roll buttons do. The statblocks are read first, through the resolver, for the modifier
 * field the map's rules name. While Fantasy Statblocks still reads the vault a statblock may not be
 * readable yet: the roll goes ahead with what is known, and the GM is told how many combatants rolled
 * without their statblock's modifier. Nothing is rolled when the scene changed or started loading
 * meanwhile, or `wanted` says no more, nor while a roll of the same store runs.
 */
export async function rollInitiative(
  app: App,
  store: Pick<ViewAtlasStore, 'getState'>,
  rules: InitiativeRules,
  options: RollOptions = {},
): Promise<void> {
  if (isRollingInitiative(store)) return;
  rolling.add(store);
  try {
    await rollNow(app, store, rules, options);
  } catch (error: unknown) {
    console.error('[Atlas VTT] Could not read the initiative modifiers of the combatants:', error);
    showNotice(t('initiative.modifierReadError'));
  } finally {
    rolling.delete(store);
  }
}

async function rollNow(app: App, store: Pick<ViewAtlasStore, 'getState'>, rules: InitiativeRules, { entryId, wanted }: RollOptions): Promise<void> {
  const before = store.getState();
  if (before.isMapLoading) return;
  const entries = before.initiative.entries.filter((entry) => entryId === undefined || entry.id === entryId);
  if (entries.length === 0) return;
  // Asked before the read: a parse that ends meanwhile does not make what was read whole.
  const parsing = !isBestiaryResolved();
  const { modifiers, unread, without } = await readStatblockModifiers(entries, before.objects.tokens, rules, async (path) => {
    const read = await readStatblockRecord(app, path);
    return read && { fields: read.record, meanings: read.meanings, labels: read.labels, fantasy: read.fantasy };
  });

  // Another scene, or the tracker gone, while the statblocks were read: nothing is rolled.
  const now = store.getState();
  if (wanted?.() === false || now.isMapLoading || now.mapPath !== before.mapPath) return;
  if (entryId === undefined) now.rollAllInitiative(rules.roll, modifiers);
  else now.rollEntryInitiative(entryId, rules.roll, modifiers.get(entryId) ?? null);
  // A combatant with a modifier of the GM's own missed nothing
  const missedOf = (ids: readonly string[]): number => entries.filter((entry) => ownModifier(entry) === undefined && ids.includes(entry.id)).length;
  if (parsing) {
    const missed = missedOf([...unread, ...without]);
    if (missed > 0) showNotice(t('initiative.statblocksLoading', { count: missed }));
    return;
  }
  const missed = missedOf(without);
  if (missed > 0) noticeMissedModifiers(app, rules, missed);
}
