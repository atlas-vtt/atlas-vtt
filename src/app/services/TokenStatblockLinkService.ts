import { StatblockTokenImportService } from './StatblockTokenImportService';
import { App, TFile } from 'obsidian';
import { EventEmitter } from 'events';
import { AssetService, type TokenAsset } from './AssetService';
import { difficultyLabel } from '../creatures/statblockRating';
import { mapResources } from '../resources/collectionResources';
import { rulesLookup } from './mapRules';
import { tokenFromFile, tokenToFile } from '../resources/resourceFileFormat';
import type { ResourceDefinition } from '../resources/resourceTypes';
import { startingResources } from '../resources/statblockResourceValues';
import type { StatblockFields } from '../resources/statblockResourceSync';
import type { FieldMeanings } from '../statblocks/resolve/fieldMeanings';
import { readStatblockRecord } from '../statblocks/resolve/statblockRecord';
import { isPersistedMapEnvelope } from './MapPersistence';
import { STATBLOCK_IMAGE_KEYS } from './statblockImageKeys';
import { statblockImageSrc } from '../statblocks/render/shared/statblockImage';
import { NoteFieldWriter } from '../statblocks/notes/NoteFieldWriter';
import type { NotePatch } from '../statblocks/notes/patchTypes';
import type { BaseToken, Character } from '../types';
import { t } from '../i18n';
import { showNotice } from '../ui/notice';

export interface TokenStatblockLink {
  tokenImagePath: string;
  statblockPath: string;
}

/**
 * The statblock-derived fields of a token read from a map file. Linking
 * writes them onto the token whatever its `kind`, so all are optional here.
 */
type StoredStatblockFields = Pick<BaseToken, 'imagePath'>
  & Partial<Pick<Character, 'name' | 'difficulty' | 'statblockPath' | 'statblockName' | 'resources' | 'overriddenMax'>>;

function nonEmpty<T extends object>(record: T): T | undefined {
  return Object.keys(record).length > 0 ? record : undefined;
}

/** A frontmatter scalar usable as text; YAML may hold a name or tier as a number. */
function frontmatterLabel(value: unknown): string | undefined {
  if (typeof value === 'number') return String(value);
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/** A note's name as a notice names it: its file name without the folder and extension. */
function noteName(path: string): string {
  return (path.split('/').pop() ?? path).replace(/\.md$/, '');
}

function setOrDelete<T, K extends keyof T>(target: T, key: K, value: T[K] | undefined): void {
  if (value === undefined) {
    delete target[key];
  } else {
    target[key] = value;
  }
}

export interface LinkChangeEvent {
  type: 'linked' | 'unlinked';
  tokenImagePath: string;
  statblockPath: string | null;
  previousStatblockPath?: string | null;
  /** A statblock note's image moved the link: open maps apply it untracked, as no edit of theirs. */
  fromNote?: boolean;
}

/**
 * Centralized service for managing token-statblock relationships. A token
 * links one statblock; a statblock may be linked by any number of tokens
 * (colour variants, NPCs sharing a creature). The statblock's picture is the
 * note's own `image`: linking fills it only where the note has none.
 */
export class TokenStatblockLinkService extends EventEmitter {
  private static instance: TokenStatblockLinkService | null = null;
  private app: App;
  private assetService: AssetService;
  
  private constructor(app: App) {
    super();
    this.app = app;
    this.assetService = AssetService.getInstance(app);
    // Initialize the AssetService
    this.assetService.initialize().catch(err => {
      console.error('[TokenStatblockLinkService] Failed to initialize AssetService:', err);
    });
  }
  
  static getInstance(app?: App): TokenStatblockLinkService {
    if (!TokenStatblockLinkService.instance) {
      if (!app) {
        throw new Error('TokenStatblockLinkService must be initialized with an App instance');
      }
      TokenStatblockLinkService.instance = new TokenStatblockLinkService(app);
    }
    return TokenStatblockLinkService.instance;
  }
  
  /**
   * Links the token asset identified by its image path to a statblock. Other
   * tokens linked to the statblock stay linked; this token's previous
   * statblock, if any, is unlinked. Map tokens spawned from the image are
   * updated too. With `updateStatblockAvatar` the token's art becomes the
   * statblock's picture when the note has none it can show (none, or a file
   * the vault no longer holds); a picture that shows is never replaced.
   * One notice at most: that the token moved here from another statblock,
   * else that it was linked, unless `notice` is false (a panel that shows
   * the link itself).
   */
  async linkTokenToStatblock(
    tokenImagePath: string, 
    statblockPath: string,
    options: {
      updateStatblockAvatar?: boolean;
      /** The note's image named the token (`StatblockTokenSync`); passed on with every event. */
      fromNote?: boolean;
      /** Whether a plain link is announced; a token moved from another statblock always is. */
      notice?: boolean;
    } = {}
  ): Promise<boolean> {
    const { updateStatblockAvatar = true, fromNote = false, notice = true } = options;
    
    // Get the statblock file
    const statblockFile = this.app.vault.getAbstractFileByPath(statblockPath);
    if (!(statblockFile instanceof TFile)) {
      showNotice(t('link.notFound', { path: statblockPath }));
      return false;
    }
    
    // Check if this token is already linked to another statblock
    const currentStatblockPath = await this.getStatblockLinkedToToken(tokenImagePath);
    if (currentStatblockPath && currentStatblockPath !== statblockPath) {
      // A token links one statblock: it leaves its current one, which the notice below names.
      await this.unlinkToken(tokenImagePath, { updateStatblockAvatar: true, notify: false, notice: false, fromNote });
    }
    
    // Find the asset using improved path matching
    const asset = await this.findAssetByAnyPath(tokenImagePath);
    // Use the asset's canonical imagePath for consistency
    const finalTokenPath = asset?.imagePath ?? tokenImagePath;
    if (asset) await this.assetService.updateAsset(asset.id, { statblockPath });

    if (updateStatblockAvatar && !this.showsStatblockImage(statblockFile)) {
      await this.updateStatblockImage(statblockPath, finalTokenPath);
    }
    
    // Wait a bit to ensure the save has completed
    await new Promise(resolve => window.setTimeout(resolve, 100));
    
    // Force the AssetService to reload its metadata
    await this.assetService.refreshMetadata();
    
    // Emit event
    this.emit('link-changed', {
      type: 'linked',
      tokenImagePath: finalTokenPath,
      statblockPath,
      previousStatblockPath: currentStatblockPath,
      ...(fromNote && { fromNote }),
    });
    
    // Update all spawned tokens on all maps
    await this.updateAllSpawnedTokens(finalTokenPath, statblockPath);
    
    this.app.workspace.trigger('atlas-vtt:refresh-assets');
    
    const moved = currentStatblockPath !== null && currentStatblockPath !== statblockPath;
    if (moved) {
      showNotice(t('link.moved', { token: asset?.name ?? t('link.unknown'), previous: noteName(currentStatblockPath) }));
    } else if (notice) {
      showNotice(t('link.linked'));
    }
    
    return true;
  }
  
  /**
   * Unlinks a token from its statblock.
   * `notify` fires the asset-manager refresh event; pass false when the unlink
   * is one step of a larger operation that refreshes once at the end.
   * `fromNote` marks the event as one a statblock note's image caused.
   * `notice: false` shows no notice, for an unlink that is one step of a link.
   */
  async unlinkToken(
    tokenImagePath: string,
    options: { 
      updateStatblockAvatar?: boolean;
      notify?: boolean;
      fromNote?: boolean;
      notice?: boolean;
    } = {}
  ): Promise<boolean> {
    const { updateStatblockAvatar = true, notify = true, fromNote = false, notice = true } = options;
    
    // Get current statblock
    const statblockPath = await this.getStatblockLinkedToToken(tokenImagePath);
    if (!statblockPath) return true; // Already unlinked
    
    // Update the asset service
    const tokenAssets = (await this.assetService.getTokenAssets())
      .filter(asset => asset.imagePath === tokenImagePath);

    for (const asset of tokenAssets) {
      // Explicitly set statblockPath to undefined to trigger removal
      await this.assetService.updateAsset(asset.id, { statblockPath: undefined });
    }
    
    // Wait a bit to ensure the save has completed
    await new Promise(resolve => window.setTimeout(resolve, 100));
    
    // Force the AssetService to reload its metadata to avoid cache issues
    await this.assetService.refreshMetadata();
    
    if (notify) this.app.workspace.trigger('atlas-vtt:refresh-assets');
    
    if (notice) showNotice(t('link.unlinked'));
    
    if (updateStatblockAvatar) await this.releaseStatblockImage(statblockPath, tokenImagePath);
    
    // Emit event
    this.emit('link-changed', {
      type: 'unlinked',
      tokenImagePath,
      statblockPath: null,
      previousStatblockPath: statblockPath,
      ...(fromNote && { fromNote }),
    });
    
    // Update all spawned tokens on all maps
    await this.updateAllSpawnedTokens(tokenImagePath, null);
    
    return true;
  }

  /**
   * A statblock whose picture is the art of a token that left it shows the
   * art of a token still linked to it, or no picture when none is left.
   */
  private async releaseStatblockImage(statblockPath: string, tokenImagePath: string): Promise<void> {
    const statblockFile = this.app.vault.getAbstractFileByPath(statblockPath);
    if (!(statblockFile instanceof TFile)) return;
    const currentImage = this.readStatblockImage(statblockFile);
    // Path comparison handles differing formats (app:// URLs, relative paths).
    if (!currentImage || !this.arePathsEquivalent(currentImage, tokenImagePath)) return;
    const [remaining] = await this.getTokensLinkedToStatblock(statblockPath);
    if (remaining) await this.updateStatblockImage(statblockPath, remaining);
    else await this.updateStatblockImage(statblockPath, tokenImagePath, false);
  }
  
  /**
   * Gets the statblock linked to a token.
   */
  async getStatblockLinkedToToken(tokenImagePath: string): Promise<string | null> {
    const tokenAssets = await this.assetService.getTokenAssets();
    const linked = tokenAssets.find(asset => asset.imagePath === tokenImagePath && asset.statblockPath);
    return linked?.statblockPath ?? null;
  }
  
  /** The image paths of every token asset linked to a statblock, in index order. */
  async getTokensLinkedToStatblock(statblockPath: string): Promise<string[]> {
    const tokenAssets = await this.assetService.getTokenAssets();
    return tokenAssets.filter(asset => asset.statblockPath === statblockPath).map(asset => asset.imagePath);
  }

  /**
   * Creates a token asset from the statblock's own artwork and links it.
   *
   * The reverse of the usual flow: rather than making a token first and linking
   * it, this imports a statblock that already carries an image.
   *
   * Returns the created token's image path, or null when there is nothing to
   * import or a token is already linked. The token goes into `collectionId`,
   * else the default collection.
   */
  async createTokenFromStatblockImage(statblockPath: string, collectionId?: string): Promise<string | null> {
    try {
      const collection = collectionId ?? this.assetService.getDefaultCollectionId();
      const result = await new StatblockTokenImportService(this.app, this.assetService).import([statblockPath], collection);
      const item = result.items[0];
      if (item?.asset) {
        this.emit('link-changed', { type: 'linked', tokenImagePath: item.asset.imagePath, statblockPath });
        showNotice(t('link.created', { name: item.name }));
        return item.asset.imagePath;
      }
      showNotice(item?.message ?? t('link.noneCreated'));
    } catch (error) {
      showNotice(error instanceof Error ? error.message : t('link.importFailed'));
    }
    return null;
  }

  /**
   * The statblock's image. Fantasy Statblocks' `image` is authoritative; a
   * `token` property and the legacy `token-image` from the removed in-house
   * system are read where it names none.
   */
  public readStatblockImage(file: TFile): string | null {
    const frontmatter: Record<string, unknown> | undefined = this.app.metadataCache.getFileCache(file)?.frontmatter;
    const images = STATBLOCK_IMAGE_KEYS.map((key) => frontmatter?.[key]);
    return images.find((image): image is string => typeof image === 'string' && image.length > 0) ?? null;
  }

  /** Whether the statblock has a picture that shows: a web address, or a file the vault holds. */
  private showsStatblockImage(file: TFile): boolean {
    const image = this.readStatblockImage(file);
    return image !== null && statblockImageSrc(this.app, image, file.path) !== '';
  }

  /**
   * Writes the token image into the statblock's frontmatter, through the note's
   * open editor when it has one, so unsaved typing there is kept.
   *
   * Fantasy Statblocks renders the `image` field, so that is the source of
   * truth. The legacy `token-image` field (from the removed in-house statblock
   * system) is still read elsewhere as a fallback but is no longer written; it
   * is cleared alongside `image` on unlink so a stale value cannot resurface.
   * A `token` property is the user's own: an unlink clears it only when it
   * names the token being unlinked.
   */
  private async updateStatblockImage(statblockPath: string, tokenImagePath: string, linked = true): Promise<void> {
    if (!this.app.vault.getFileByPath(statblockPath)) return;
    const outcome = await NoteFieldWriter.forApp(this.app).patchNow(statblockPath, (frontmatter): NotePatch[] => {
      if (linked) return [{ op: 'set', path: ['image'], base: frontmatter?.image, next: tokenImagePath }];
      const cleared = (['image', 'token-image'] as const).flatMap((key): NotePatch[] => {
        const value = frontmatter?.[key];
        return value === undefined ? [] : [{ op: 'delete', path: [key], base: value }];
      });
      const token = frontmatter?.token;
      return typeof token === 'string' && this.arePathsEquivalent(token, tokenImagePath)
        ? [...cleared, { op: 'delete', path: ['token'], base: token }]
        : cleared;
    });
    if (outcome.problem) console.error(`[TokenStatblockLinkService] Could not write the image of ${statblockPath}: ${outcome.problem}`);
  }

  /**
   * Updates all spawned tokens on all maps that use the given image. A link whose
   * statblock is not known whole yet gives them the link alone.
   */
  private async updateAllSpawnedTokens(tokenImagePath: string, statblockPath: string | null): Promise<void> {
    const mapFiles = this.app.vault.getFiles().filter(f => f.extension === 'atlasmap');
    const statblockData = statblockPath ? await this.extractStatblockData(statblockPath, true) : null;

    /** Returns the rewritten map JSON, or null when no token on the map uses the image. */
    const rewriteMap = (content: string, definitions: readonly ResourceDefinition[]): string | null => {
      const mapData: unknown = JSON.parse(content);
      if (!isPersistedMapEnvelope(mapData)) return null;

      const tokens = mapData.state?.objects?.tokens;
      if (!tokens) return null;

      let modified = false;

      for (const [id, stored] of Object.entries<StoredStatblockFields>(tokens)) {
        if (stored.imagePath !== tokenImagePath) continue;
        const token = tokenFromFile(stored);
        if (statblockPath) {
          token.statblockPath = statblockPath;

          if (statblockData) {
            token.name = statblockData.name;
            // As on an open map: what the statblock supplies starts anew, the rest stays
            setOrDelete(token, 'resources', nonEmpty({ ...token.resources, ...startingResources(statblockData.record, definitions, statblockData.meanings) }));
            setOrDelete(token, 'difficulty', statblockData.difficulty);
            delete token.overriddenMax;
          }
        } else {
          // Unlink from statblock - clear ALL statblock-derived data
          delete token.statblockPath;
          delete token.name;
          delete token.statblockName;
          delete token.resources;
          delete token.overriddenMax;
          delete token.difficulty;
        }
        (tokens as Record<string, object>)[id] = tokenToFile(token);
        modified = true;
      }

      return modified ? JSON.stringify(mapData, null, 2) : null;
    };

    for (const mapFile of mapFiles) {
      try {
        // Only a link reads the map's resources; an unlink clears whatever the token holds.
        const definitions = statblockData ? mapResources(rulesLookup(this.app, this.assetService), mapFile.path) : [];
        if (rewriteMap(await this.app.vault.read(mapFile), definitions) === null) continue;
        await this.app.vault.process(mapFile, (latest) => rewriteMap(latest, definitions) ?? latest);
      } catch (error) {
        console.error(`Error updating tokens in map ${mapFile.path}:`, error);
      }
    }
  }
  
  /** The fields of a statblock note with its template's meanings, as resources read them; null when the note is no statblock. */
  async readStatblockRecord(statblockPath: string): Promise<StatblockFields | null> {
    const data = await this.extractStatblockData(statblockPath);
    return data && { fields: data.record, meanings: data.meanings };
  }

  /**
   * Extracts relevant data from a statblock. While Fantasy Statblocks still parses
   * the vault, a creature read by name is not there yet and one that extends
   * another comes without it: with `wholeOnly` such a statblock gives no data.
   */
  private async extractStatblockData(statblockPath: string, wholeOnly = false): Promise<{
    name: string;
    difficulty?: string;
    /** The statblock's fields as the resolver gives them, with the note's frontmatter laid over them. */
    record: Record<string, unknown>;
    /** What the fields of the statblock's template mean (hit points, rating under other keys). */
    meanings: FieldMeanings;
  } | null> {
    const read = await readStatblockRecord(this.app, statblockPath, wholeOnly);
    if (!read) return null;
    const { record, meanings } = read;
    const displayKey = meanings['display-name'];
    const difficulty = difficultyLabel(record, meanings);
    return {
      // The name the statblock goes by on its card (`statblockDisplayName`); `name` stays its identity
      name: frontmatterLabel(displayKey === undefined ? undefined : record[displayKey]) ?? frontmatterLabel(record.name) ?? t('link.unknown'),
      ...(difficulty !== undefined && { difficulty }),
      record,
      meanings,
    };
  }
  
  /**
   * Normalizes a resource path for comparison by extracting the essential file path.
   */
  private normalizeResourcePath(path: string): string {
    if (!path) return '';
    
    // Handle resource URLs (app://) - extract the actual file path
    if (path.startsWith('app://')) {
      // Find the start of the actual file path (after the protocol and ID)
      // Pattern: app://[hash]/[actual-path]?[timestamp]
      const match = path.match(/app:\/\/[^/]+\/(.+?)(?:\?.*)?$/);
      if (match && match[1]) {
        const extractedPath = match[1];
        // Check if it contains atlas-vtt path - find the LAST occurrence to handle nested paths
        if (extractedPath.includes('/atlas-vtt/')) {
          // Find the last atlas-vtt anchor point to handle paths like /test-vault/atlas-vtt/
          const atlasIndex = extractedPath.lastIndexOf('/atlas-vtt/');
          if (atlasIndex !== -1) {
            const normalizedPath = extractedPath.substring(atlasIndex + 1); // Remove leading slash
            return normalizedPath;
          }
        }
        
        // Also check for atlas-vtt without leading slash
        if (extractedPath.includes('atlas-vtt/')) {
          const atlasIndex = extractedPath.lastIndexOf('atlas-vtt/');
          if (atlasIndex !== -1) {
            const normalizedPath = extractedPath.substring(atlasIndex);
            return normalizedPath;
          }
        }
        
        // If no atlas-vtt anchor, return as-is (might already be normalized)
        return extractedPath;
      }
    }
    
    // For regular paths, ensure they start with atlas-vtt/ if they don't already
    let normalized = path;
    if (normalized.startsWith('/')) {
      normalized = normalized.substring(1);
    }
    
    return normalized;
  }
  
  /**
   * Compares two paths to determine if they reference the same file.
   * Handles resource URLs vs file paths and timestamp differences.
   */
  public arePathsEquivalent(path1: string, path2: string): boolean {
    if (!path1 || !path2) return path1 === path2;
    
    const normalized1 = this.normalizeResourcePath(path1);
    const normalized2 = this.normalizeResourcePath(path2);
    
    const result = normalized1 === normalized2;
    return result;
  }
  
  /**
   * The token asset an image path names, in any path format (resource URL or
   * file path); null when the image is no token's art.
   */
  async findAssetByAnyPath(path: string): Promise<TokenAsset | null> {
    const tokenAssets = await this.assetService.getTokenAssets();
    const normalizedSearchPath = this.normalizeResourcePath(path);
    
    for (const tokenAsset of tokenAssets) {
      if (tokenAsset.imagePath) {
        const assetNormalized = this.normalizeResourcePath(tokenAsset.imagePath);
        // Try both direct path match and normalized path match
        if (tokenAsset.imagePath === path || assetNormalized === normalizedSearchPath) {
          return tokenAsset;
        }
      }
    }
    
    return null;
  }
  
  /**
   * Cleanup method
   */
  destroy(): void {
    this.removeAllListeners();
    TokenStatblockLinkService.instance = null;
  }
}