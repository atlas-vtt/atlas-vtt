import type { App, EventRef } from 'obsidian';
import { mapConditions } from '../gameSystems/mapRules';
import type { MeasurementSettings } from '../grid/measurementFormat';
import { mapResources } from '../resources/collectionResources';
import type { ResourceDefinition } from '../resources/resourceTypes';
import { mapMeasurementSettings } from '../services/mapMeasurementSettings';
import { onMapRulesChange, rulesLookup } from '../services/mapRules';
import type { ViewAtlasState } from '../storeFactory';
import type { ConditionDefinition } from '../types/collectionSettingsTypes';

interface CollectionCallbacks {
  refreshRules: () => void;
  refreshArt: (path: string) => Promise<void>;
}

/** Live rules (the played campaign's system, else the map's collection's) and vault changes used by a map's tokens. */
export class TokenCollectionSync {
  private readonly stopRules: () => void;
  private readonly fileRef: EventRef;
  private destroyed = false;

  constructor(
    private readonly app: App,
    private readonly readState: () => Pick<ViewAtlasState, 'mapPath' | 'grid'>,
    callbacks: CollectionCallbacks,
  ) {
    // Tokens drawn before the index loads need their rules redrawn, as do tokens whose rules changed.
    this.stopRules = onMapRulesChange(app, () => this.readState().mapPath, () => callbacks.refreshRules());
    this.fileRef = app.vault.on('modify', (file) => { void callbacks.refreshArt(file.path); });
  }

  readonly conditions = (): ConditionDefinition[] => mapConditions(rulesLookup(this.app), this.readState().mapPath);

  readonly resources = (): readonly ResourceDefinition[] => mapResources(rulesLookup(this.app), this.readState().mapPath);

  readonly measurement = (): MeasurementSettings => mapMeasurementSettings(rulesLookup(this.app), this.readState());

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stopRules();
    this.app.vault.offref(this.fileRef);
  }
}
