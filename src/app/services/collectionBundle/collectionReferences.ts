import { TFile, type App } from 'obsidian';
import type { Asset, AssetService, GroupTokenRef, SceneAsset } from '../AssetService';
import { isPersistedMapEnvelope, type PersistedMapEnvelope } from '../MapPersistence';
import { SceneSnapshotService } from '../../snapshots/SceneSnapshotService';
import { snapshotFolderOf } from '../../snapshots/sceneSnapshotFolders';
import { isRecord } from '../../utils/guards';
import { localImage, statblockImageField } from '../statblockImportCandidates';
import { linkedFilePath } from '../sceneLinks';
import { readLootBaseItems } from '../../loot/lootBaseItems';
import { withTemplateFiles } from '../../statblocks/bundles/bundleTemplates';
import { collectionStatblockRoles } from '../../statblocks/roles/collectionStatblockRoles';
import type { CollectionSettings } from '../../types/collectionSettingsTypes';
import { systemPresetsOf } from '../mapCollectionRules';
import { sceneImagePaths } from '../../levels/levelFile';
import type { BundleFile, BundleFileRole } from './bundleFormat';

/** The scene thumbnail lives next to its map file. */
export const sceneThumbnailPath = (mapPath: string): string => mapPath.replace(/\.atlasmap$/, '.thumb.jpg');

/** A file the collection refers to that is no longer in the vault. */
export interface MissingReference {
  path: string;
  role: BundleFileRole;
  /** Name of the asset that refers to it, or what else does. */
  assetName: string;
}

interface CollectedFiles {
  files: BundleFile[];
  missing: MissingReference[];
}

/** What names a loot base in a report of missing files: the collection's settings refer to it, no asset does. */
const LOOT_TABLE = 'loot table';
const UNREADABLE_LOOT_TABLE = 'loot table, needs the Bases core plugin';
/** What names a random table's note in a report of missing files, for the same reason. */
const RANDOM_TABLE = 'random table';

/** Previews are regenerated when missing, so their absence is not worth a warning. */
const OPTIONAL_ROLES = new Set<BundleFileRole>(['thumbnail', 'scene-thumbnail']);

/**
 * Lists every vault file a collection depends on, so a bundle can carry the
 * whole collection: asset records and images, scene maps and their snapshots
 * with the backgrounds and artwork of tokens placed on them, the notes their
 * pins and characters open, the statblock notes tokens link to together
 * with their artwork, the loot bases the collection's settings pick with
 * the item notes they hold, and the notes its random tables are read from with
 * the bases they draw from. Every file lists the assets that use it; the first
 * role claimed for a path wins. Referenced files that are gone are reported
 * instead of packed.
 */
export class CollectionReferenceCollector {
  private readonly files = new Map<string, BundleFile>();
  private readonly statblockNotes = new Set<string>();
  private readonly missing = new Map<string, MissingReference>();
  private owner: Asset | null = null;

  constructor(private readonly app: App, private readonly assets: AssetService) {}

  async collect(assets: readonly Asset[], lootBases: readonly string[] = [], tableNotes: readonly string[] = []): Promise<CollectedFiles> {
    // Loot and tables come first: an item or table note a pin also opens must still travel with the collection.
    for (const path of lootBases) await this.collectLootBase(path);
    for (const path of tableNotes) await this.collectTableNote(path);
    for (const asset of assets) {
      this.owner = asset;
      await this.collectAsset(asset);
    }
    this.owner = null;
    for (const notePath of this.statblockNotes) this.collectStatblockImage(notePath);
    return { files: [...this.files.values()], missing: [...this.missing.values()] };
  }

  /**
   * A base and the files it holds. They belong to the collection, not to
   * an asset, so they list no owners. A base Obsidian cannot run stays behind:
   * without its items it would arrive empty.
   */
  private async collectLootBase(path: string, linkedFrom?: string): Promise<void> {
    const known = this.files.get(path);
    // A base another table draws from too travels with either; one the settings pick travels anyway.
    if (known && linkedFrom && known.linkedFrom) known.linkedFrom.push(linkedFrom);
    if (known || this.missing.has(path)) return;
    const exists = this.app.vault.getAbstractFileByPath(path) instanceof TFile;
    const items = exists ? await readLootBaseItems(this.app, path) : null;
    if (!items) {
      this.missing.set(path, { path, role: 'loot-base', assetName: exists ? UNREADABLE_LOOT_TABLE : LOOT_TABLE });
      return;
    }
    // A base only a table draws from travels with that table's note.
    this.files.set(path, { vaultPath: path, role: 'loot-base', ...(linkedFrom && { linkedFrom: [linkedFrom] }) });
    for (const item of items) {
      const entry = this.files.get(item);
      if (entry) entry.linkedFrom?.push(path);
      else if (this.app.vault.getAbstractFileByPath(item) instanceof TFile) this.files.set(item, { vaultPath: item, role: 'loot-item', linkedFrom: [path] });
    }
  }

  /**
   * A note the collection's random tables are read from, which travels with the collection like
   * a loot base, and the bases its rows draw from (`[[Loot.base#View]]`). The notes and images it
   * links to follow as any linked note's do (`withLinkedFiles`).
   */
  private async collectTableNote(path: string): Promise<void> {
    if (this.files.has(path) || this.missing.has(path)) return;
    if (!(this.app.vault.getAbstractFileByPath(path) instanceof TFile)) {
      this.missing.set(path, { path, role: 'linked-note', assetName: RANDOM_TABLE });
      return;
    }
    this.files.set(path, { vaultPath: path, role: 'linked-note' });
    for (const target of Object.keys(this.app.metadataCache.resolvedLinks[path] ?? {})) {
      if (target.toLowerCase().endsWith('.base')) await this.collectLootBase(target, path);
    }
  }

  private async collectAsset(asset: Asset): Promise<void> {
    this.add(this.assets.getAssetFilePath(asset), asset.type === 'token' ? 'token-image' : 'asset-file');
    switch (asset.type) {
      case 'token':
        this.add(asset.thumbnailPath, 'thumbnail');
        this.addStatblockNote(asset.statblockPath);
        break;
      case 'map':
        this.add(asset.mapFilePath, 'background');
        this.add(asset.thumbnailPath, 'thumbnail');
        break;
      case 'scene':
        await this.collectScene(asset, asset.data?.mapPath ?? await this.readSceneMapPath(asset));
        break;
      case 'encounter':
      case 'player':
        this.collectTokenRefs(asset.tokens ?? asset.data?.tokens ?? []);
        break;
      default:
        break;
    }
  }

  private collectTokenRefs(refs: readonly GroupTokenRef[]): void {
    for (const ref of refs) {
      this.add(ref.imagePath, 'token-image');
      this.addStatblockNote(ref.statblockPath);
    }
  }

  /** Older scene records keep the map path only inside their JSON file. */
  private async readSceneMapPath(asset: Asset): Promise<string | undefined> {
    const file = this.app.vault.getAbstractFileByPath(this.assets.getAssetFilePath(asset));
    if (!(file instanceof TFile)) return undefined;
    try {
      const parsed: unknown = JSON.parse(await this.app.vault.read(file));
      return isRecord(parsed) && typeof parsed.mapPath === 'string' ? parsed.mapPath : undefined;
    } catch {
      return undefined;
    }
  }

  private async collectScene(scene: SceneAsset, mapPath: string | undefined): Promise<void> {
    if (!mapPath) return;
    const mapFile = this.app.vault.getAbstractFileByPath(mapPath);
    if (!(mapFile instanceof TFile)) return;
    this.add(mapPath, 'scene-map');
    this.add(sceneThumbnailPath(mapPath), 'scene-thumbnail');

    let envelope: unknown;
    try {
      envelope = JSON.parse(await this.app.vault.read(mapFile));
    } catch {
      envelope = null;
    }
    if (isPersistedMapEnvelope(envelope)) this.collectMapState(envelope);

    for (const { snapshot, path, thumbnailPath } of await new SceneSnapshotService(this.app).list(snapshotFolderOf(scene))) {
      this.add(path, 'scene-snapshot');
      this.add(thumbnailPath ?? undefined, 'scene-snapshot-thumbnail');
      this.collectMapState(snapshot);
    }
  }

  /** The backgrounds of every level, token artwork, character statblocks and linked notes a saved map state shows. */
  private collectMapState({ state }: PersistedMapEnvelope): void {
    if (!state) return;
    for (const image of sceneImagePaths(state)) this.add(image, 'background');
    for (const token of Object.values(state.objects?.tokens ?? {})) {
      this.add(token.imagePath, 'token-image');
      if (token.kind !== 'character') continue;
      this.addStatblockNote(token.statblockPath);
      this.addLinkedNote(token.notePath);
    }
    for (const pin of Object.values(state.objects?.pins ?? {})) this.addLinkedNote(pin.notePath);
  }

  /** Only Markdown notes travel as notes; a pin may also open a scene's map, which travels with its scene. */
  private addLinkedNote(link: string | undefined): void {
    const path = link ? linkedFilePath(link) : '';
    if (path.toLowerCase().endsWith('.md')) this.add(path, 'linked-note');
  }

  private addStatblockNote(path: string | undefined): void {
    if (path && this.add(path, 'statblock-note')) this.statblockNotes.add(path);
  }

  /** The artwork a statblock note's frontmatter points at, recorded on the note's entry for rewriting on import. */
  private collectStatblockImage(notePath: string): void {
    const note = this.app.vault.getAbstractFileByPath(notePath);
    const entry = this.files.get(notePath);
    if (!(note instanceof TFile) || !entry) return;
    const field = statblockImageField(this.app.metadataCache.getFileCache(note)?.frontmatter ?? {});
    const image = field ? localImage(this.app, field.reference, notePath) : null;
    if (!field || !image) return;
    this.add(image.path, 'statblock-image', entry.owners);
    entry.statblockImage = { key: field.key, path: image.path };
  }

  /** Records `path` for the current asset (or `owners`); returns whether it was newly added. */
  private add(path: string | undefined, role: BundleFileRole, owners: readonly string[] = this.owner ? [this.owner.id] : []): boolean {
    if (!path) return false;
    const existing = this.files.get(path);
    if (existing) {
      // Loot has no owners: it travels with the collection, whichever assets also use it.
      if (existing.owners) existing.owners = [...new Set([...existing.owners, ...owners])];
      return false;
    }
    if (!(this.app.vault.getAbstractFileByPath(path) instanceof TFile)) {
      if (!OPTIONAL_ROLES.has(role) && this.owner && !this.missing.has(path)) {
        this.missing.set(path, { path, role, assetName: this.owner.name });
      }
      return false;
    }
    this.files.set(path, { vaultPath: path, role, owners: [...owners] });
    return true;
  }
}

/**
 * `files` with the statblock templates the collection needs: those its roles start from (its
 * own roles, or its system's), and those its notes name, once
 * every note is known (`withLinkedFiles` first). Built-in templates never travel.
 */
export function withStatblockTemplates(app: App, files: readonly BundleFile[], settings: CollectionSettings): Promise<BundleFile[]> {
  const presets = systemPresetsOf(app);
  const roles = collectionStatblockRoles(settings, presets).map((role) => role.templateId);
  return withTemplateFiles(app, files, [...new Set(roles)]);
}
