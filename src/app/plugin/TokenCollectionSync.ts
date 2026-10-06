import type { App, EventRef } from 'obsidian';
import type { MeasurementSettings } from '../grid/measurementFormat';
import { mapResources } from '../resources/collectionResources';
import type { ResourceDefinition } from '../resources/resourceTypes';
import { AssetService } from '../services/AssetService';
import { mapMeasurementSettings } from '../services/mapMeasurementSettings';
import type { ViewAtlasState } from '../storeFactory';
import type { ConditionDefinition } from '../types/collectionSettingsTypes';

interface CollectionCallbacks {
  refreshRules: () => void;
  refreshArt: (path: string) => Promise<void>;
}

/** Live collection rules and vault changes used by a map's tokens. */
export class TokenCollectionSync {
  private readonly assets: AssetService;
  private readonly collectionRef: EventRef;
  private readonly fileRef: EventRef;
  private destroyed = false;

  constructor(
    private readonly app: App,
    private readonly readState: () => Pick<ViewAtlasState, 'mapPath' | 'grid'>,
    callbacks: CollectionCallbacks,
  ) {
    this.assets = AssetService.getInstance(app);
    // Tokens drawn before the index loads need their collection's rules redrawn.
    this.assets.initialize().then(() => {
      if (!this.destroyed) callbacks.refreshRules();
    }, (error: unknown) => {
      console.error('[TokenRenderer] Failed to initialize AssetService:', error);
    });
    this.collectionRef = app.workspace.on('atlas-vtt:collection-settings-changed', (collectionId) => {
      const { mapPath } = this.readState();
      if (mapPath && this.assets.getCollectionForMap(mapPath) === collectionId) callbacks.refreshRules();
    });
    this.fileRef = app.vault.on('modify', (file) => { void callbacks.refreshArt(file.path); });
  }

  readonly conditions = (): ConditionDefinition[] => {
    const { mapPath } = this.readState();
    if (!mapPath) return [];
    const collectionId = this.assets.getCollectionForMap(mapPath);
    return collectionId ? this.assets.getCollectionSettings(collectionId).conditions : [];
  };

  readonly resources = (): readonly ResourceDefinition[] => mapResources(this.assets, this.readState().mapPath);

  readonly measurement = (): MeasurementSettings => mapMeasurementSettings(this.assets, this.readState());

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.app.workspace.offref(this.collectionRef);
    this.app.vault.offref(this.fileRef);
  }
}
