import type { App } from 'obsidian';
import { payloadBytes } from './recordPayload';
import type { Asset, AssetService, CollectionMetadata } from '../AssetService';
import { zipPathFor } from './bundleFormat';
import { rewriteContent } from './bundleContent';
import { reportFileStep, type BundleProgressListener } from './bundleProgress';
import { bundleCover, bundleFileReader, openBundle, type BundleFileReader } from './bundleReader';
import { assetFingerprint, fieldFingerprint } from './fingerprints';
import { gatherImportInputs, installedAsset, ownAsset, planTargets, referencedStrings, vaultFileHash, type ImportTargets } from './importInputs';
import { storeLegacyCollectionResources } from '../collectionScenes';
import { systemPresetsOf } from '../mapCollectionRules';
import { idOf, mergedCollection, nextInstallRecord, type ImportContext } from './importCommit';
import { ImportJournal, saveOpenMaps } from './importJournal';
import { planImport, resolvePlan, type ImportAction, type PlannedItem, type Resolution } from './importPlan';
import { buildReview, type ImportReview } from './importReview';
import { planTemplateImport, reusedNotesOf, switchReusedNotes, templateReview, templatesChangedSinceReview, writeTemplates } from './importTemplates';
import { readInstallRecord, writeInstallRecord, type CollectionField } from './installRecord';
import { DICE_SET_RECORDS } from './bundleDiceSetFiles';
import { PRESET_RECORDS, withPresetDiceSet } from './bundlePresetFiles';
import { planRecordImport, recordsChangedSinceReview, writeRecords } from './bundleRecordFiles';
import { recordIdMap } from '../vaultRecords/bundleRecords';
import { t } from '../../i18n';

export interface ImportDecision {
  /** Name for a new collection; defaults to the bundle's, or the suggested free name when that is taken. */
  name?: string | undefined;
  /** Conflict unit → choice; unresolved conflicts keep the user's version. */
  resolutions?: ReadonlyMap<string, Resolution> | undefined;
  /** Re-applies the bundle over the user's changes too. */
  restore?: boolean | undefined;
  /** Switches the vault's notes the review lists (`templates.reusedNotes`) to the copies of their templates. */
  switchReusedNotes?: boolean | undefined;
}

export interface CollectionImportResult {
  collectionId: string;
  collectionName: string;
  version: number;
  created: boolean;
  written: number;
  removed: number;
  /** Units where the user's version was kept. */
  keptLocal: number;
  backupCount: number;
  backupFolder: string;
  /** The vault's own notes switched to the copies of their templates. */
  switchedNotes: number;
}

/** A read and checked bundle, planned against the vault, waiting for the user's decision. */
export interface ImportSession {
  review: ImportReview;
  /** The bundle's files, for showing its token art and statblocks before the import. */
  files: BundleFileReader;
  apply(decision: ImportDecision, onProgress?: BundleProgressListener): Promise<CollectionImportResult>;
}

/**
 * Reads a collection bundle, verifies it and compares it with the vault: a new
 * collection, or the three-way difference between the installed release, the
 * vault's copy and the bundle. Nothing is written until `apply`.
 */
export async function openCollectionImport(
  app: App,
  assets: AssetService,
  data: Blob,
  onProgress: BundleProgressListener = () => undefined,
): Promise<ImportSession> {
  const bundle = await openBundle(data, onProgress);
  const { manifest } = bundle;
  const existing = await assets.findCollectionByUid(manifest.collection.uid);
  const record = existing ? await readInstallRecord(app, existing) : null;
  const nameTaken = await assets.isCollectionNameTaken(manifest.collection.name, existing?.id);
  const suggestedName = !existing && nameTaken ? await assets.freeCollectionName(manifest.collection.name) : undefined;
  const collectionId = existing?.id ?? await assets.freeCollectionIdFor(manifest.collection.name);

  onProgress({ message: t('bundle.comparing'), fraction: 0.6 });
  const reader = bundleFileReader(bundle);
  const collectionName = existing?.name ?? suggestedName ?? manifest.collection.name;
  // Sets first: a preset or template the bundle carries names a set that came in as a copy by the copy's id.
  const diceSets = await planRecordImport(app, DICE_SET_RECORDS, manifest, reader, record?.diceSets, collectionName);
  const diceSetIds = recordIdMap(diceSets);
  const templates = await planTemplateImport(app, manifest, reader, record, collectionName, diceSetIds);
  const presets = await planRecordImport(app, PRESET_RECORDS, manifest, reader, record?.presets, collectionName, (entry) => withPresetDiceSet(entry, diceSetIds));
  const targets = await planTargets(app, assets, bundle, collectionId, record, templates.planned, { presets, diceSets });
  // Compare against what the user sees: open maps may hold unsaved changes.
  await saveOpenMaps(app, new Set([...targets.paths.values(), ...Object.values(record?.files ?? {}).map((file) => file.target)]));
  const { items, unitAssets } = await gatherImportInputs(app, assets, bundle, targets, existing, record);
  const plan = planImport(items);
  const restorePlan = planImport(items, { restore: true });
  // Notes the import keeps as the vault has them are never rewritten: the review offers to switch them.
  const reusedNotes = reusedNotesOf(app, [...targets.shared].flatMap((path) => targets.paths.get(path) ?? []), targets.templates);
  onProgress({ message: t('bundle.ready'), fraction: 1 });

  return {
    review: {
      ...buildReview(manifest, await assets.knownVaultId(), existing, record, plan, restorePlan, unitAssets, suggestedName, targets.skipped),
      cover: await bundleCover(bundle),
      templates: templateReview(targets.templates, reusedNotes),
    },
    files: { ...reader, templates: templates.bundle.map((template) => template.entry) },
    // Nothing may re-read or check the index while the import writes files and commits them.
    apply: (decision, progress = () => undefined) => assets.runExclusive(() =>
      applyImport(app, assets, { bundle, existing, record, targets, plan: decision.restore ? restorePlan : plan, reusedNotes }, decision, progress)),
  };
}

/**
 * Everything that may still name a file after the import: the paths the bundle
 * places, every asset in the vault as it will be, and the maps that stay (tokens
 * placed on the user's own maps name their artwork). A file any of them names is
 * never removed.
 */
async function pathsInUse(app: App, assets: AssetService, targets: ImportTargets, upsert: readonly Asset[], remove: readonly string[], removals: ReadonlySet<string>): Promise<Set<string>> {
  const replaced = new Set([...remove, ...upsert.map((asset) => asset.id)]);
  const staying = (await assets.getAssets()).filter((asset) => !replaced.has(asset.id));
  const inUse = referencedStrings([...staying, ...upsert], new Set(targets.paths.values()));
  for (const file of app.vault.getFiles()) {
    if (file.extension !== 'atlasmap' || removals.has(file.path)) continue;
    try {
      referencedStrings([JSON.parse(await app.vault.read(file))], inUse);
    } catch {
      // An unreadable map names nothing we could protect.
    }
  }
  return inUse;
}

/** What the vault holds now for `item`, fingerprinted like the review did. */
async function currentFingerprint(app: App, assets: AssetService, { existing, targets }: ImportContext, item: PlannedItem): Promise<string | null> {
  const id = idOf(item.key);
  if (item.kind === 'file') return vaultFileHash(app, targets.targetOf(id)!);
  if (item.kind === 'asset') {
    const local = await ownAsset(assets, existing, targets.localIdOf(id));
    return local ? assetFingerprint(local) : null;
  }
  const collection = existing ? await assets.getCollection(existing.id) : null;
  return collection ? fieldFingerprint(collection, id as CollectionField, systemPresetsOf(app)) : null;
}

/**
 * Refuses to apply a plan to a vault that changed after the review: an edit made
 * while the dialog was open would otherwise be replaced without being asked about.
 * Collection fields are all checked, since the merged record starts from the reviewed one.
 */
async function assertUnchangedSinceReview(app: App, assets: AssetService, context: ImportContext, actions: ReadonlyMap<string, ImportAction>): Promise<void> {
  const items = context.plan.units.flatMap((unit) => unit.items).filter((item) => item.kind === 'field' || actions.has(item.key));
  const files = items.filter((item) => item.kind === 'file').map((item) => context.targets.targetOf(idOf(item.key))!);
  await saveOpenMaps(app, new Set(files));
  const { templates, presets, diceSets } = context.targets;
  let changed = await templatesChangedSinceReview(app, templates)
    || await recordsChangedSinceReview(app, PRESET_RECORDS, presets)
    || await recordsChangedSinceReview(app, DICE_SET_RECORDS, diceSets);
  for (const item of items) changed ||= await currentFingerprint(app, assets, context, item) !== item.mine;
  if (changed) throw new Error('Your vault changed since the review. Import the file again to see the current changes');
}

async function applyImport(
  app: App,
  assets: AssetService,
  context: ImportContext,
  decision: ImportDecision,
  onProgress: BundleProgressListener,
): Promise<CollectionImportResult> {
  const { bundle: { manifest, zip }, existing, targets, plan } = context;
  const actions = resolvePlan(plan, decision.resolutions ?? new Map());
  const items = plan.units.flatMap((unit) => unit.items);
  const name = (existing ? null : decision.name?.trim()) || manifest.collection.name;
  if (!existing && await assets.isCollectionNameTaken(name)) throw new Error(`A collection named "${name}" already exists. Choose another name.`);

  const journal = new ImportJournal(app, targets.collectionId);
  const filesByPath = new Map(manifest.files.map((file) => [file.vaultPath, file]));
  const assetsById = new Map(manifest.assets.map((asset) => [asset.id, asset]));
  let written = 0;
  let removed = 0;
  let collection: CollectionMetadata;
  try {
    await assertUnchangedSinceReview(app, assets, context, actions);
    const upsert: Asset[] = [];
    const remove: string[] = [];
    for (const item of items.filter((entry) => entry.kind === 'asset' && actions.has(entry.key))) {
      const bundleId = idOf(item.key);
      if (actions.get(item.key) === 'remove') remove.push(targets.localIdOf(bundleId));
      else upsert.push(installedAsset(assetsById.get(bundleId)!, targets));
    }
    const fileItems = items.filter((item) => item.kind === 'file' && actions.has(item.key));
    const writes = fileItems.filter((item) => actions.get(item.key) === 'write');
    const removals = fileItems.filter((item) => actions.get(item.key) === 'remove');
    for (const [index, item] of writes.entries()) {
      reportFileStep(onProgress, 'bundle.step.writing', index, fileItems.length, 0, 0.9);
      const bundlePath = idOf(item.key);
      const target = targets.targetOf(bundlePath);
      if (!target) continue;
      const file = filesByPath.get(bundlePath)!;
      const raw = payloadBytes(file.vaultPath, await zip.file(zipPathFor(bundlePath))!.async('arraybuffer'));
      await journal.write(target, rewriteContent(file, raw, targets.rewrites, targets.templateIds));
      written += 1;
    }
    written += await writeTemplates(journal, targets.templates);
    written += await writeRecords(app, PRESET_RECORDS, journal, targets.presets);
    written += await writeRecords(app, DICE_SET_RECORDS, journal, targets.diceSets);
    // Removals come last, checked against the vault as the writes left it.
    const removalTargets = new Set(removals.map((item) => targets.targetOf(idOf(item.key))!));
    const inUse = removalTargets.size > 0 ? await pathsInUse(app, assets, targets, upsert, remove, removalTargets) : new Set<string>();
    for (const [index, item] of removals.entries()) {
      reportFileStep(onProgress, 'bundle.step.cleaning', writes.length + index, fileItems.length, 0, 0.9);
      const target = targets.targetOf(idOf(item.key));
      if (!target || inUse.has(target)) continue;
      await journal.remove(target);
      removed += 1;
    }

    onProgress({ message: t('bundle.registering'), fraction: 0.95 });
    const merged = await mergedCollection(assets, context, actions, name);
    collection = await assets.commitCollectionImport({ collectionId: targets.collectionId, collection: merged, upsert, remove });
  } catch (error) {
    const unrestored = await journal.rollback();
    const reason = (error instanceof Error ? error.message : String(error)).replace(/\.$/, '');
    const note = unrestored.length > 0 ? ` ${unrestored.length} files could not be restored; their previous versions are in ${journal.backupFolder}.` : ' Nothing was changed.';
    throw new Error(`The import failed: ${reason}.${note}`);
  }

  try {
    await writeInstallRecord(app, await nextInstallRecord(context, actions, collection, systemPresetsOf(app)));
  } catch (error) {
    console.error('[collectionImport] Could not record the install:', error);
  }
  try {
    // A bundle of an older Atlas names no resources: store them now, with its scenes, before anything else saves the settings
    await storeLegacyCollectionResources(app, assets);
  } catch (error) {
    console.error('[collectionImport] Could not store the collection\'s resources:', error);
  }
  const switchedNotes = decision.switchReusedNotes ? await switchNotes(app, context) : 0;
  // A collection is named like its folder: a new name from the review or an update moves the folder, install record included.
  const installed = await assets.matchCollectionFolder(targets.collectionId) ?? collection;
  onProgress({ message: t('bundle.done'), fraction: 1 });
  return {
    collectionId: installed.id,
    collectionName: installed.name,
    version: manifest.collection.version,
    created: !existing,
    written,
    removed,
    keptLocal: plan.units.filter((unit) => unit.status === 'kept' || (unit.status === 'conflict' && decision.resolutions?.get(unit.key) !== 'theirs')).length,
    backupCount: journal.backupCount,
    backupFolder: journal.backupFolder,
    switchedNotes,
  };
}

/** Switches the notes the review listed; the import itself is done, so a failure here is reported, not undone. */
async function switchNotes(app: App, { reusedNotes }: ImportContext): Promise<number> {
  try {
    return await switchReusedNotes(app, reusedNotes);
  } catch (error) {
    console.error('[collectionImport] Could not switch notes to the collection\'s templates:', error);
    return 0;
  }
}
