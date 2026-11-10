import { App, TFile, type EventRef } from 'obsidian';
import type { ViewAtlasStore } from '../storeFactory';
import type { TokenEntity } from '../types';
import type { TokenUpdates } from '../types/viewState';
import type { ResourceDefsProvider } from '../resources/resourceTypes';
import { fillMissingResources, type StatblockFields } from '../resources/statblockResourceSync';
import { runUntracked } from '../stores/history';
import type { TokenStatblockLinkService, LinkChangeEvent } from '../services/TokenStatblockLinkService';
import { buildStatblockLinkUpdates } from '../pixi/token-renderer/statblockFrontmatter';
import { applyLinkChange, syncLinkedTokens } from '../pixi/token-renderer/statblockTokenSync';
import { runInBackground } from '../utils/backgroundTask';
import { statblockTokenAppearance } from './statblockTokenAppearance';

interface StatblockTokenLinks extends Pick<TokenStatblockLinkService,
  'readStatblockImage' | 'findAssetByAnyPath' | 'getStatblockLinkedToToken' |
  'linkTokenToStatblock' | 'readStatblockRecord'> {
  on(event: 'link-changed', listener: (change: LinkChangeEvent) => void): void;
  off(event: 'link-changed', listener: (change: LinkChangeEvent) => void): void;
}

/** Keeps the tokens of one map in step with their linked notes, read through the statblock resolver. */
export class StatblockTokenSync {
  private readonly metadataChange: EventRef;
  /** Link changes of the statblock link service, applied in the order they came. */
  private linkChanges: Promise<void> = Promise.resolve();
  private destroyed = false;

  constructor(
    private readonly obsApp: App,
    private readonly store: ViewAtlasStore,
    private readonly tokenStatblockLinkService: StatblockTokenLinks,
    private readonly resourceDefsProvider: ResourceDefsProvider,
  ) {
    this.metadataChange = obsApp.metadataCache.on('changed', (file) => this.metadataChanged(file));
    tokenStatblockLinkService.on('link-changed', this.handleLinkChange);
  }

  public prepareToken(token: TokenEntity): Promise<TokenEntity> {
    return statblockTokenAppearance(this.obsApp, token, this.tokenStatblockLinkService, this.resourceDefsProvider);
  }

  public destroy(): void {
    this.destroyed = true;
    this.obsApp.metadataCache.offref(this.metadataChange);
    this.tokenStatblockLinkService.off('link-changed', this.handleLinkChange);
  }

  private async metadataChanged(file: TFile): Promise<void> {
    const frontmatter = this.obsApp.metadataCache.getFileCache(file)?.frontmatter;
    if (!frontmatter) return;

    // A character or statblock note: it has hit points or is marked as one.
    const isCharacter = frontmatter.hp !== undefined ||
                       frontmatter.statblock !== undefined ||
                       frontmatter.isCharacter === true ||
                       frontmatter.type === 'character';
    if (!isCharacter) return;

    const statblockPath = file.path;
    await this.linkTokenNamedByImage(file);

    // Linked tokens follow the statblock as the resolver reads it (renamed keys, meanings),
    // untracked: a statblock edit must not become an undo step of this map. Their art stays:
    // a statblock is shared by many tokens, and its picture is only one of them.
    const statblock = await this.tokenStatblockLinkService.readStatblockRecord(statblockPath);
    if (statblock && !this.destroyed) {
      syncLinkedTokens(this.store, statblockPath, statblock, this.resourceDefsProvider(), null);
    }
  }

  /**
   * A note whose picture names a token that links no statblock links that
   * token too. The picture alone never unlinks a token, takes one from another
   * statblock or changes the art of placed tokens: a statblock is shared by
   * many tokens, and its picture is only one of them.
   */
  private async linkTokenNamedByImage(file: TFile): Promise<void> {
    // Read through the link service so this listener and the writer agree
    // on which frontmatter key holds the statblock's image.
    const image = this.tokenStatblockLinkService.readStatblockImage(file);
    if (!image) return;
    const asset = await this.tokenStatblockLinkService.findAssetByAnyPath(image);
    if (!asset || asset.statblockPath) return;
    await this.tokenStatblockLinkService.linkTokenToStatblock(asset.imagePath, file.path, { updateStatblockAvatar: false, fromNote: true });
  }

  // A link reads its statblock first, so the changes are applied one after another, in order.
  private readonly handleLinkChange = (event: LinkChangeEvent): void => {
    this.linkChanges = this.linkChanges.then(() => this.applyStatblockLinkChange(event));
  };

  /** Linked tokens start the collection's resources they do not hold yet, e.g. one defined after they were placed. */
  public fillMissingResources(): void {
    if (this.store.getState().isPlayerView) return;
    runInBackground(fillMissingResources(
      {
        tokens: () => this.store.getState().objects.tokens,
        // Not an edit of the game master's: it must not become an undo step.
        apply: (entries) => runUntracked(this.store, () => this.store.getState().updateTokens(entries)),
      },
      this.resourceDefsProvider(),
      (path) => this.tokenStatblockLinkService.readStatblockRecord(path),
    ), 'Starting missing token resources');
  }

  /**
   * Applies a link change to the open map. A link reads its statblock through the resolver first,
   * as closed maps are linked, so renamed keys and the template's meanings count.
   */
  private async applyStatblockLinkChange(event: LinkChangeEvent): Promise<void> {
    try {
      const statblock = event.type === 'linked' && event.statblockPath
        ? await this.tokenStatblockLinkService.readStatblockRecord(event.statblockPath)
        : null;
      if (this.destroyed) return;
      applyLinkChange(this.store, event, (token, statblockPath) => statblock && this.statblockLinkUpdates(token, statblockPath, statblock));
    } catch (error) {
      console.error('[StatblockTokenSync] Failed to apply a statblock link change:', error);
    }
  }

  private statblockLinkUpdates(token: TokenEntity, statblockPath: string, statblock: StatblockFields): TokenUpdates {
    const currentName = token.kind === 'character' ? token.name : undefined;
    return {
      statblockPath,
      // Maxima set by hand belonged to the previous statblock.
      overriddenMax: undefined,
      ...buildStatblockLinkUpdates(statblock, currentName, this.resourceDefsProvider(), token.resources),
    };
  }
}
