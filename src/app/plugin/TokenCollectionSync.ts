import type { App, EventRef } from 'obsidian';
import { mapConditions } from '../gameSystems/mapRules';
import type { MeasurementSettings } from '../grid/measurementFormat';
import type { MovementRules } from '../measure/movementRules';
import { mapResources } from '../resources/collectionResources';
import type { ResourceDefinition } from '../resources/resourceTypes';
import { mapMeasurementSettings } from '../services/mapMeasurementSettings';
import { mapMovementRules } from '../services/mapMovementRules';
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
  /** The movement rules as last read, with the map they were read for (`movement`). */
  private movementRead: { mapPath: string | null; rules: MovementRules } | null = null;

  constructor(
    private readonly app: App,
    private readonly readState: () => Pick<ViewAtlasState, 'mapPath' | 'grid'>,
    callbacks: CollectionCallbacks,
  ) {
    // Tokens drawn before the index loads need their rules redrawn, as do tokens whose rules changed.
    this.stopRules = onMapRulesChange(app, () => this.readState().mapPath, () => {
      this.movementRead = null;
      callbacks.refreshRules();
    });
    this.fileRef = app.vault.on('modify', (file) => { void callbacks.refreshArt(file.path); });
  }

  readonly conditions = (): ConditionDefinition[] => mapConditions(rulesLookup(this.app), this.readState().mapPath);

  readonly resources = (): readonly ResourceDefinition[] => mapResources(rulesLookup(this.app), this.readState().mapPath);

  readonly measurement = (): MeasurementSettings => mapMeasurementSettings(rulesLookup(this.app), this.readState());

  /**
   * The map's movement rules, kept until its rules change or it is another map: a token drag asks
   * at every pointer move, and reading them reads every game system preset of the vault.
   */
  readonly movement = (): MovementRules => {
    const mapPath = this.readState().mapPath;
    if (this.movementRead?.mapPath !== mapPath) this.movementRead = { mapPath, rules: mapMovementRules(this.app, mapPath) };
    return this.movementRead.rules;
  };

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stopRules();
    this.app.vault.offref(this.fileRef);
  }
}
