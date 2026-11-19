import type { App } from 'obsidian';
import { toBuffer } from '../collectionBundle/bundleContent';
import { DICE_SET_RECORDS } from '../collectionBundle/bundleDiceSetFiles';
import { recordsChangedSinceReview, writeRecords, type BundledRecordKind } from '../collectionBundle/bundleRecordFiles';
import { ImportJournal } from '../collectionBundle/importJournal';
import { templatesChangedSinceReview, writeTemplates } from '../collectionBundle/importTemplates';
import { recordFingerprint, type PlannedRecord, type RecordOutcome } from '../vaultRecords/bundleRecords';
import type { ItemKind } from './itemBundleFormat';
import type { OpenedItemBundle } from './itemBundleReader';
import { planItemImport, plannedItem, type ItemImportPlan, type ItemOutcome } from './itemImportPlan';
import { provenanceOf, withProvenance, type ArmariumProvenance } from './itemProvenance';
import { ITEM_RECORDS, storedRecordItem } from './vaultItems';

/** What the item review shows. */
export interface ItemReview {
  kind: ItemKind;
  /** The item's name as its bundle carries it. */
  name: string;
  version: number;
  /** What changed in this version. */
  notes?: string | undefined;
  /** Who shared it, where the source knows (an Armarium install). */
  creator?: string | undefined;
  outcome: ItemOutcome;
  /** Its name in this vault after the import: a copy's own name for a copy. */
  localName: string;
  /** The version of the same listing the vault holds; null where it holds none. */
  installedVersion: number | null;
  /** The dice set it brings, with what becomes of it; null where it brings none. */
  diceSet: { name: string; outcome: RecordOutcome } | null;
}

export interface ItemImportResult {
  kind: ItemKind;
  /** The item's id in this vault. */
  localId: string;
  name: string;
  outcome: ItemOutcome;
  version: number;
}

/** A read and checked item bundle, planned against the vault, waiting for the GM's decision. */
export interface ItemImportSession {
  review: ItemReview;
  /** Installs the item; throws, with nothing changed, where the vault changed since the review or a write failed. */
  apply(): Promise<ItemImportResult>;
}

export interface ItemImportOptions {
  /** The creator's display name, where the source knows it. */
  creator?: string | undefined;
  /**
   * The Armarium listing the bytes were downloaded and checked for. Only then may the import update the
   * vault's install of that listing in place: a file from anywhere else names a uid anyone can read.
   */
  listingUid?: string | undefined;
}

/** The record kind the plan's record item is kept as. */
const recordKindOf = (kind: ItemKind): BundledRecordKind | null => (kind === 'statblock-template' ? null : ITEM_RECORDS[kind]);

/** Whether the vault changed what the plan read since the review. */
async function changedSinceReview(app: App, plan: ItemImportPlan): Promise<boolean> {
  const kind = recordKindOf(plan.kind);
  return (plan.template !== undefined && await templatesChangedSinceReview(app, [plan.template]))
    || (kind !== null && plan.record !== undefined && await recordsChangedSinceReview(app, kind, [plan.record]))
    || (plan.diceSet !== null && await recordsChangedSinceReview(app, DICE_SET_RECORDS, [plan.diceSet]));
}

const sameProvenance = (a: ArmariumProvenance | undefined, b: ArmariumProvenance): boolean =>
  a !== undefined && a.uid === b.uid && a.version === b.version && a.source === b.source && a.installed === b.installed;

function withProvenanceText(text: string, provenance: ArmariumProvenance): string {
  return `${JSON.stringify(withProvenance(JSON.parse(text) as Record<string, unknown>, provenance), null, 2)}\n`;
}

/** Writes the template the plan brings in or updates, or the provenance into the vault's own where it reuses it. */
async function writeTemplateItem(app: App, journal: ImportJournal, plan: ItemImportPlan, base: Omit<ArmariumProvenance, 'installed'>): Promise<void> {
  const template = plan.template!;
  const provenance = { ...base, installed: template.theirs };
  if (template.text !== undefined) {
    await writeTemplates(journal, [{ ...template, text: withProvenanceText(template.text, provenance) }]);
    return;
  }
  const file = template.outcome === 'reuse' ? app.vault.getFileByPath(template.target) : null;
  if (!file) return;
  const text = await app.vault.read(file);
  if (!sameProvenance(provenanceOf(JSON.parse(text) as Record<string, unknown>), provenance)) await journal.write(template.target, toBuffer(withProvenanceText(text, provenance)));
}

/** Writes the record the plan brings in or updates, or the provenance into the vault's own where it reuses it. */
async function writeRecordItem(app: App, journal: ImportJournal, plan: ItemImportPlan, base: Omit<ArmariumProvenance, 'installed'>): Promise<void> {
  const record = plan.record!;
  const kind = plan.kind === 'statblock-template' ? null : plan.kind;
  if (kind === null) return;
  let written: PlannedRecord | null = null;
  if (record.entry) {
    written = { ...record, entry: withProvenance(record.entry, { ...base, installed: await recordFingerprint(record.entry) }) };
  } else if (record.outcome === 'reuse') {
    const stored = await storedRecordItem(app, kind, record.localId);
    const provenance = { ...base, installed: record.theirs };
    if (stored && !sameProvenance(provenanceOf(stored.entry), provenance)) written = { ...record, target: stored.path, entry: withProvenance(stored.entry, provenance) };
  }
  if (written) await writeRecords(app, ITEM_RECORDS[kind], journal, [written]);
}

async function applyItemImport(app: App, bundle: OpenedItemBundle, plan: ItemImportPlan): Promise<ItemImportResult> {
  const { uid, version, id: source } = bundle.manifest.item;
  const journal = new ImportJournal(app, 'items');
  try {
    if (await changedSinceReview(app, plan)) throw new Error('Your vault changed since the review. Import the file again to see the current changes');
    if (plan.diceSet) await writeRecords(app, DICE_SET_RECORDS, journal, [plan.diceSet]);
    if (plan.template) await writeTemplateItem(app, journal, plan, { uid, version, source });
    else await writeRecordItem(app, journal, plan, { uid, version, source });
  } catch (error) {
    const unrestored = await journal.rollback();
    const reason = (error instanceof Error ? error.message : String(error)).replace(/\.$/, '');
    const note = unrestored.length > 0 ? ` ${unrestored.length} files could not be restored; their previous versions are in ${journal.backupFolder}.` : ' Nothing was changed.';
    throw new Error(`The import failed: ${reason}.${note}`);
  }
  const { outcome, localId, name } = plannedItem(plan);
  return { kind: plan.kind, localId, name, outcome, version };
}

/**
 * Plans the import of a checked item bundle against the vault: what becomes of the item and the
 * dice set it brings. Nothing is written until `apply`, which writes the files with the item's
 * provenance (the listing, the version and the item's fingerprint as installed) in its own file.
 */
export async function openItemImport(app: App, bundle: OpenedItemBundle, options: ItemImportOptions = {}): Promise<ItemImportSession> {
  const { item } = bundle.manifest;
  const creator = options.creator?.trim() || undefined;
  const plan = await planItemImport(app, bundle, creator ?? `v${item.version}`, options.listingUid === item.uid);
  const planned = plannedItem(plan);
  const review: ItemReview = {
    kind: item.kind,
    name: item.name,
    version: item.version,
    notes: item.notes?.trim() || undefined,
    creator,
    outcome: planned.outcome,
    localName: planned.name,
    installedVersion: plan.installed?.provenance.version ?? null,
    diceSet: plan.diceSet ? { name: plan.diceSet.name, outcome: plan.diceSet.outcome } : null,
  };
  return { review, apply: () => applyItemImport(app, bundle, plan) };
}
