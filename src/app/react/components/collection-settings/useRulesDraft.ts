import { useCallback, useRef, useState } from 'react';
import { parseInitiativeRules, savedInitiativeRules } from '../../../gameSystems/initiativeRules';
import { parseLightPresets } from '../../../gameSystems/lightPresetValidation';
import type { RulesSettings } from '../../../gameSystems/mapRules';
import { parseSenseDefinitions } from '../../../gameSystems/senseValidation';
import { DEFAULT_GRID_DEFAULTS, rulesOfPreset, vanillaSystemSettings } from '../../../gameSystems/systemRules';
import { hasVisionDefaults } from '../../../gameSystems/visionDefaults';
import { collectionResources } from '../../../resources/collectionResources';
import { keepingPlayerVisibility, savedResources } from '../../../resources/resourceDefinitions';
import type { ResourceDefinition } from '../../../resources/resourceTypes';
import { barsToShowOnScenes, withChangedBars } from '../../../resources/sceneVisibility';
import type { CollectionGridDefaults, ConditionDefinition } from '../../../types/collectionSettingsTypes';
import type { DiceRules } from '../../../types/diceRulesTypes';
import type { DiceSet } from '../../../types/diceSetTypes';
import type { InitiativeRules } from '../../../types/initiativeRulesTypes';
import type { TokenVisionDefaults } from '../../../types/lightingTypes';
import type { LightPresetDefinition } from '../../../types/lightPresetTypes';
import type { SenseDefinition } from '../../../types/senseTypes';
import type { SystemPreset } from '../../../types/systemPresetTypes';

/** Game system rules as edited in a settings dialog, wherever they are kept (a collection, a campaign). */
export interface RulesDraft {
  gridDefaults: CollectionGridDefaults;
  setGridDefaults: (gridDefaults: CollectionGridDefaults) => void;
  defaultWidgets: Record<string, boolean>;
  setDefaultWidgets: (defaultWidgets: Record<string, boolean>) => void;
  /** What new tokens start with; undefined when the rules set nothing. */
  defaultTokenVision: TokenVisionDefaults | undefined;
  setDefaultTokenVision: (vision: TokenVisionDefaults | undefined) => void;
  /** Unset while the rules take the senses of their preset; read with `collectionSenses`. */
  senses: readonly SenseDefinition[] | undefined;
  /** Set only once the GM edits the senses (`editedSenses`), so untouched rules keep following their preset. */
  setSenses: (senses: readonly SenseDefinition[] | undefined) => void;
  /** The rules' own lights; unset while they take those of their preset. Read with `collectionLightPresets`. */
  lightPresets: readonly LightPresetDefinition[] | undefined;
  conditions: ConditionDefinition[];
  setConditions: (conditions: ConditionDefinition[]) => void;
  resources: ResourceDefinition[];
  setResources: (resources: ResourceDefinition[]) => void;
  /** The dice rules that rules which picked no set stored; unset while they take their preset's. Read with `collectionDiceSet`. */
  dice: DiceRules | undefined;
  /** The dice set picked from the library; unset where the rules roll `dice` or their preset's. */
  diceSetId: string | undefined;
  /** Picks a set from the library as the rules' dice. */
  pickDiceSet: (set: DiceSet) => void;
  /** Unset while the rules take the initiative rules of their preset; read with `collectionInitiativeRules`. */
  initiative: InitiativeRules | undefined;
  setInitiative: (initiative: InitiativeRules | undefined) => void;
  systemPresetId: string | undefined;
  setSystemPresetId: (presetId: string | undefined) => void;
  /** Starts the draft from stored rules. The same function on every render. */
  load: (settings: RulesSettings) => void;
  applyPreset: (preset: SystemPreset) => void;
  /** Leaves the rules without a game system, as if they had never been set up. */
  clearSystem: () => void;
  /** The draft as the rules to save; a part that follows the preset is given as undefined. */
  toSettings: () => RulesSettings;
  /** The bars that saving the draft shows on the scenes the rules' collection already has. */
  barsToShowOnScenes: () => string[];
}

/** Game system rules as edited in a dialog; nothing is written until the caller saves `toSettings`. */
export function useRulesDraft(): RulesDraft {
  const [gridDefaults, setGridDefaults] = useState<CollectionGridDefaults>(() => structuredClone(DEFAULT_GRID_DEFAULTS));
  const [defaultWidgets, setDefaultWidgets] = useState<Record<string, boolean>>({});
  const [defaultTokenVision, setDefaultTokenVision] = useState<TokenVisionDefaults | undefined>(undefined);
  const [senses, setSenses] = useState<readonly SenseDefinition[] | undefined>(undefined);
  const [lightPresets, setLightPresets] = useState<readonly LightPresetDefinition[] | undefined>(undefined);
  const [conditions, setConditions] = useState<ConditionDefinition[]>([]);
  const [resources, setResources] = useState<ResourceDefinition[]>([]);
  /** The resources the rules had when the draft was loaded; a bar switch follows only a resource that came or went. */
  const loadedResources = useRef<readonly ResourceDefinition[]>([]);
  /** Whether the GM picked or reset a system since the draft was loaded. */
  const systemApplied = useRef(false);
  const [dice, setDice] = useState<DiceRules | undefined>(undefined);
  const [diceSetId, setDiceSetId] = useState<string | undefined>(undefined);
  const [initiative, setInitiative] = useState<InitiativeRules | undefined>(undefined);
  const [systemPresetId, setSystemPresetId] = useState<string | undefined>(undefined);

  const load = useCallback((settings: RulesSettings): void => {
    setGridDefaults(settings.gridDefaults ?? structuredClone(DEFAULT_GRID_DEFAULTS));
    setDefaultWidgets(settings.defaultWidgets ?? {});
    setDefaultTokenVision(settings.defaultTokenVision);
    setSenses(parseSenseDefinitions(settings.senses));
    // An empty list is no list of its own: the rules then read their preset's.
    const ownLights = parseLightPresets(settings.lightPresets);
    setLightPresets(ownLights?.length ? ownLights : undefined);
    setConditions(settings.conditions ?? []);
    const loaded = collectionResources(settings);
    loadedResources.current = loaded;
    systemApplied.current = false;
    setResources(loaded);
    setDice(settings.dice);
    setDiceSetId(settings.diceSetId);
    setInitiative(parseInitiativeRules(settings.initiative));
    setSystemPresetId(settings.systemPresetId);
  }, []);

  const applyPreset = (preset: SystemPreset): void => {
    const rules = rulesOfPreset(preset);
    systemApplied.current = true;
    setGridDefaults(rules.gridDefaults);
    setConditions(rules.conditions);
    setResources(keepingPlayerVisibility(rules.resources, resources));
    setDefaultWidgets(rules.defaultWidgets);
    setDice(rules.dice);
    setDiceSetId(rules.diceSetId);
    setDefaultTokenVision(rules.defaultTokenVision);
    // The rules read their preset's senses, light presets and initiative rules until they are edited.
    setSenses(undefined);
    setLightPresets(undefined);
    setInitiative(undefined);
    setSystemPresetId(preset.id);
  };

  const clearSystem = (): void => {
    const vanilla = vanillaSystemSettings();
    setGridDefaults(vanilla.gridDefaults);
    setConditions(vanilla.conditions);
    setResources(vanilla.resources);
    setDefaultWidgets(vanilla.defaultWidgets);
    setDice(vanilla.dice);
    setDiceSetId(vanilla.diceSetId);
    setDefaultTokenVision(vanilla.defaultTokenVision);
    setSenses(vanilla.senses);
    setLightPresets(vanilla.lightPresets);
    setInitiative(vanilla.initiative);
    setSystemPresetId(undefined);
  };

  const pickDiceSet = (set: DiceSet): void => {
    setDiceSetId(set.id);
  };

  /**
   * A picked set is the rules' dice: the dice rules stored before are removed, so a set that goes
   * missing falls back to the system's dice and never to a choice the GM replaced.
   */
  const toSettings = (): RulesSettings => {
    const saved = savedResources(resources);
    return {
      gridDefaults,
      defaultWidgets: withChangedBars(defaultWidgets, loadedResources.current, saved),
      defaultTokenVision: hasVisionDefaults(defaultTokenVision) ? defaultTokenVision : undefined,
      senses,
      lightPresets,
      conditions,
      resources: saved,
      ...(diceSetId ? { dice: undefined } : dice && { dice: { ...dice, defaultRoll: dice.defaultRoll.trim() } }),
      diceSetId,
      initiative: initiative && savedInitiativeRules(initiative),
      systemPresetId,
    };
  };

  const barsOnScenes = (): string[] => {
    const saved = savedResources(resources);
    const widgets = withChangedBars(defaultWidgets, loadedResources.current, saved);
    return barsToShowOnScenes(widgets, loadedResources.current, saved, systemApplied.current);
  };

  return {
    gridDefaults, setGridDefaults,
    defaultWidgets, setDefaultWidgets,
    defaultTokenVision, setDefaultTokenVision,
    senses, setSenses,
    lightPresets,
    conditions, setConditions,
    resources, setResources,
    dice, diceSetId, pickDiceSet,
    initiative, setInitiative,
    systemPresetId, setSystemPresetId,
    load, applyPreset, clearSystem, toSettings, barsToShowOnScenes: barsOnScenes,
  };
}
