import type { App } from 'obsidian';
import { AssetService, type Asset } from '../AssetService';
import { refersToFiles, rewriteText, toBuffer } from '../collectionBundle/bundleContent';
import type { BundleFile } from '../collectionBundle/bundleFormat';
import { CollectionReferenceCollector } from '../collectionBundle/collectionReferences';
import { saveOpenMaps } from '../collectionBundle/importJournal';
import type { PathMap } from '../collectionBundle/pathRemap';
import { collectionMapFiles, viewOnScene } from '../collectionScenes';
import { collectionSnapshotFiles, snapshotFolderOf, trashEmptySnapshotFolder } from '../../snapshots/sceneSnapshotFolders';
import { snapshotOwnerOf } from '../../snapshots/snapshotPaths';
import { dropSceneLinksFromJson } from '../sceneLinks';
import { sceneAdoption, unlessUnreadable, type SceneAdoption, type TextRewrite } from './sceneAdoption';
import { TransferFiles } from './transferFiles';
import { planTransfer, tokenArtwork, type TransferMode, type TransferStep } from './transferPlan';
import { tagsToRegister, transferredRecord } from './transferRecords';

export interface AssetTransferRequest {
  assetIds: readonly string[];
  targetCollectionId: string;
  mode: TransferMode;
}

export interface AssetTransferResult {
  /** The records as the target collection now holds them. */
  assets: Asset[];
}

/** The asset types the asset manager shows; only these go between collections. */
const TRANSFERABLE_TYPES: ReadonlySet<Asset['type']> = new Set<Asset['type']>(['token', 'map', 'scene', 'encounter']);

const decoder = new TextDecoder();

/**
 * Moves or copies assets into another collection together with the files they
 * need (`planTransfer` decides which). Moved assets keep their ids, so
 * encounters and updates of installed collections still recognise them; copies
 * get new ones, and copies made together point at each other. Scenes take on
 * the target collection's rules (`sceneAdoption`). Scene links never cross
 * collections: pins to scenes left behind are removed, and so, on a move, are
 * the pins of scenes staying behind that open a moved one (`linkedScenesFor`
 * finds the scenes to offer along instead). If anything fails, the files are
 * put back and no record changes.
 */
export async function transferAssets(app: App, assetService: AssetService, request: AssetTransferRequest): Promise<AssetTransferResult> {
  const result: AssetTransferResult = { assets: [] };
  try {
    await assetService.runExclusive(() => runTransfer(app, assetService, request, result));
    return result;
  } finally {
    if (result.assets.length > 0) app.workspace.trigger('atlas-vtt:refresh-assets');
  }
}

/** Transfers the assets of each source collection in turn, adding what arrived to `result`. */
async function runTransfer(app: App, assetService: AssetService, request: AssetTransferRequest, result: AssetTransferResult): Promise<void> {
  const { assetIds, targetCollectionId, mode } = request;
  if (!(await assetService.getCollection(targetCollectionId))) throw new Error('The collection no longer exists.');
  const bySource = new Map<string, Asset[]>();
  for (const id of assetIds) {
    const asset = await assetService.getAssetById(id);
    if (!asset || !TRANSFERABLE_TYPES.has(asset.type) || asset.collection === targetCollectionId) continue;
    bySource.set(asset.collection, [...(bySource.get(asset.collection) ?? []), asset]);
  }

  for (const [sourceCollectionId, assets] of bySource) {
    try {
      await transferGroup(app, assetService, { sourceCollectionId, targetCollectionId, mode }, assets, result);
    } catch (error) {
      if (result.assets.length === 0) throw error;
      const done = `${result.assets.length} ${result.assets.length === 1 ? 'asset' : 'assets'} from other collections arrived before this.`;
      throw new Error(`${error instanceof Error ? error.message : String(error)} ${done}`);
    }
  }
}

interface GroupTransfer {
  sourceCollectionId: string;
  targetCollectionId: string;
  mode: TransferMode;
}

async function transferGroup(app: App, assetService: AssetService, transfer: GroupTransfer, assets: readonly Asset[], result: AssetTransferResult): Promise<void> {
  const { sourceCollectionId, targetCollectionId, mode } = transfer;
  // The files are read below, so they must hold what the open maps show.
  await saveOpenMaps(app, new Set(collectionMapFiles(app, sourceCollectionId).map((file) => file.path)));

  const { files } = await new CollectionReferenceCollector(app, assetService).collect(assets);
  const leaving = new Set(assets.map((asset) => asset.id));
  const staying = (await assetService.getAssets(sourceCollectionId)).filter((asset) => !leaving.has(asset.id));
  const newIds = new Map(mode === 'copy' ? assets.map((asset) => [asset.id, AssetService.newAssetId(asset.type)]) : []);
  const plan = planTransfer({
    mode, sourceCollectionId, targetCollectionId, assets, newIds, files,
    usedBySource: mode === 'move' ? await filesUsedBy(app, assetService, staying) : new Set(),
    ownedBySource: tokenArtwork(staying),
    existsInVault: (path) => app.vault.getAbstractFileByPath(path) !== null,
  });
  const rewrite = contentRewriter(plan.rewrites, sceneAdoption(targetCollectionId, assetService.getCollectionSettings(targetCollectionId)));

  const transferFiles = new TransferFiles(app);
  try {
    if (mode === 'move') await unlinkStayingScenes(app, transferFiles, sourceCollectionId, plan.steps);
    await carryOut(app, transferFiles, plan.steps, rewrite);
    const now = Date.now();
    const records = assets.map((asset) => transferredRecord(asset, { targetCollectionId, newIds, plan, now }));
    for (const record of records) {
      const recordFile = assetService.pendingRecordFile(record);
      if (recordFile) await transferFiles.write(recordFile.path, recordFile.content);
    }
    const tags = tagsToRegister(
      assets,
      (await assetService.getCollection(sourceCollectionId))?.tags ?? {},
      (await assetService.getCollection(targetCollectionId))?.tags ?? {},
    );
    await assetService.commitAssetTransfer({ collectionId: targetCollectionId, records, tags });
    if (mode === 'move') await removeEmptiedSnapshotFolders(app, assets);
    result.assets.push(...records);
  } catch (error) {
    const unrestored = await transferFiles.undo();
    const reason = (error instanceof Error ? error.message : String(error)).replace(/\.$/, '');
    const note = unrestored.length > 0 ? ` These files could not be put back: ${unrestored.join(', ')}.` : ' Nothing was changed.';
    throw new Error(`${reason}.${note}`);
  }
}

/** A moved scene's snapshots left one by one, so its old folder is left empty; it goes too. */
async function removeEmptiedSnapshotFolders(app: App, moved: readonly Asset[]): Promise<void> {
  for (const scene of moved) {
    if (scene.type !== 'scene') continue;
    try {
      await trashEmptySnapshotFolder(app, snapshotFolderOf(scene));
    } catch (error) {
      console.error('[Atlas] Could not remove an emptied snapshot folder:', error);
    }
  }
}

/** Every file `assets` use; a move leaves these where they are for the assets staying behind. */
async function filesUsedBy(app: App, assetService: AssetService, assets: readonly Asset[]): Promise<Set<string>> {
  const { files } = await new CollectionReferenceCollector(app, assetService).collect(assets);
  return new Set(files.map((file) => file.vaultPath));
}

type ContentRewriter = (file: BundleFile) => TextRewrite;

/** The new text of a transferred file: what it refers to follows the plan, and a scene adopts the target's rules. */
function contentRewriter(rewrites: PathMap, adoption: SceneAdoption): ContentRewriter {
  return (file) => (text) => {
    const remapped = rewriteText(file, text, rewrites);
    const adopt = file.role === 'scene-map' ? adoption.map : file.role === 'scene-snapshot' ? adoption.snapshot : null;
    const adopted = adopt?.(remapped) ?? remapped;
    return adopted === text ? null : adopted;
  };
}

/**
 * Runs the plan's file operations. Copies come first, so every file a moved
 * scene will point at exists by then. Maps move last and every moved file is
 * rewritten once everything is in place.
 */
async function carryOut(app: App, files: TransferFiles, steps: readonly TransferStep[], rewrite: ContentRewriter): Promise<void> {
  for (const { file, to } of steps.filter((step) => step.op === 'copy')) {
    await files.copy(file.vaultPath, to, (raw) => {
      if (!refersToFiles(file)) return raw;
      const content = rewrite(file)(decoder.decode(raw));
      return content === null ? raw : toBuffer(content);
    });
  }

  const moves = steps.filter((step) => step.op === 'move');
  for (const { file, to } of moves.filter((step) => step.file.role !== 'scene-map')) await files.move(file.vaultPath, to);
  for (const { file, to } of moves.filter((step) => step.file.role === 'scene-map')) await files.move(file.vaultPath, to);

  for (const { file, to } of moves.filter((step) => refersToFiles(step.file))) {
    if (file.role === 'scene-map') await rewriteSceneMap(app, files, to, rewrite(file));
    else await files.rewrite(to, rewrite(file));
  }
}

/**
 * Takes the pins that open a scene about to move away off the scenes staying
 * behind (maps and snapshots), before it moves: links never cross collections.
 */
async function unlinkStayingScenes(app: App, files: TransferFiles, sourceCollectionId: string, steps: readonly TransferStep[]): Promise<void> {
  const leavingMaps = steps.filter((step) => step.op === 'move' && step.file.role === 'scene-map');
  if (leavingMaps.length === 0) return;
  const leaving = new Set(leavingMaps.map((step) => step.file.vaultPath));
  const leavingScenes = new Set(leavingMaps.flatMap((step) => step.file.owners ?? []));
  const rewrite = unlessUnreadable((content) => dropSceneLinksFromJson(content, (mapPath) => !leaving.has(mapPath)));
  for (const path of collectionSnapshotFiles(app, sourceCollectionId)) {
    if (!leavingScenes.has(snapshotOwnerOf(path)?.sceneId ?? '')) await files.rewrite(path, rewrite);
  }
  for (const { path } of collectionMapFiles(app, sourceCollectionId).filter((file) => !leaving.has(file.path))) {
    await rewriteSceneMap(app, files, path, rewrite);
  }
}

/** Rewrites a scene's map; if a view is on the scene, it reloads from the result so its store cannot save the old state over it. */
async function rewriteSceneMap(app: App, files: TransferFiles, path: string, rewrite: TextRewrite): Promise<void> {
  const file = app.vault.getFileByPath(path);
  if (!file || rewrite(await app.vault.read(file)) === null) return;
  const apply = (): Promise<void> => files.rewrite(path, rewrite);
  const view = viewOnScene(app, path);
  if (view) await view.reloadActiveScene(apply);
  else await apply();
}
