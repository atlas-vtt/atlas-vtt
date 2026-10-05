import React, { useState, useRef, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { TFile, type App } from 'obsidian';
import type { StoreApi } from 'zustand';
import type { ViewAtlasState } from '../../storeFactory';
import type { TokenUpdates } from '../../types/viewState';
import type { TokenEntity } from '../../types';
import { CloseButton } from '../../packages/components/primitives/CloseButton';
import { Button } from '../../packages/components/primitives/button';
import { TooltipProvider } from '../../packages/components/primitives/tooltip';
import { AssetService } from '../../services/AssetService';
import { mapMeasurementSettings } from '../../services/mapMeasurementSettings';
import type { SenseRules } from '../../creatures/tokenSensesResolver';
import { mapLightPresets } from '../../services/mapCollectionRules';
import { mapSenseRules } from '../../services/mapSenseRules';
import { useStatblockSenses, type StatblockLink } from './useStatblockSenses';
import { parseNumberInput } from './NumberOverrideField';
import { buildResourceEdits } from '../../resources/resourceEdits';
import type { ResourceDefinition, ResourceValue } from '../../resources/resourceTypes';
import { startingResources } from '../../resources/statblockResourceValues';
import { handledByAnotherControl } from '../../keyboard/tooltipEscape';
import { TokenIdentitySection, TokenResourcesSection } from './EditTokenSections';
import { TokenLightSection, TokenVisionSection, type TokenLightingContext } from './TokenLightingFields';
import { dynamicLightingOn } from '../../experimental/experimentalFeatures';
import { unitLabelFor } from '../../grid/measurementFormat';
import { unitScaleOf } from '../../lighting/lightingUnits';
import { maxLightRange } from '../../lighting/lightRanges';
import { lightForm, lightFromForm, visionForm, visionFromForm, type LightForm, type VisionForm } from '../../lighting/tokenLighting';
import { numberText } from '../../utils/numberInput';
import { t } from '../../i18n';

interface EditTokenValues {
  name: string;
  showNameplate: boolean;
  /** Maximum per resource key; undefined follows the statblock, or removes a resource the statblock lacks. */
  maxima: Record<string, number | undefined>;
  vision: VisionForm;
  light: LightForm;
}

interface EditTokenModalProps {
  initial: EditTokenValues;
  /** The resources of the map's collection, in the order they show. */
  definitions: readonly ResourceDefinition[];
  /** What the linked statblock gives each resource. */
  resourceDefaults: Record<string, ResourceValue>;
  lighting: TokenLightingContext;
  /** Whether the token's vision and light can be edited: only with dynamic lighting switched on. */
  showLighting: boolean;
  /** The statblock the token links, whose senses it follows while it has none of its own. */
  statblock: StatblockLink | null;
  onSave: (values: EditTokenValues) => void;
  onClose: () => void;
}

/**
 * The Edit Token dialog: two columns of sections, the token's own on the left (name, resources,
 * vision) and the light it carries on the right, so the fields are read and tabbed through
 * column by column. A dialog too narrow for two columns stacks them in the same order.
 */
function EditTokenModalInner({ initial, definitions, resourceDefaults, lighting, showLighting, statblock, onSave, onClose }: EditTokenModalProps): React.ReactElement {
  const inherited = useStatblockSenses(statblock);
  const [name, setName] = useState(initial.name);
  const [showNameplate, setShowNameplate] = useState(initial.showNameplate);
  const [maxInputs, setMaxInputs] = useState<Record<string, string>>(
    () => Object.fromEntries(definitions.map(({ key }) => [key, numberText(initial.maxima[key])])),
  );
  const [vision, setVision] = useState(initial.vision);
  const [light, setLight] = useState(initial.light);
  const inputRef = useRef<HTMLInputElement>(null);
  const context = { ...lighting, inherited };

  useEffect(() => {
    window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 50);
  }, []);

  const handleSave = (): void => {
    onSave({
      name,
      showNameplate,
      maxima: Object.fromEntries(definitions.map(({ key }) => [key, parseNumberInput(maxInputs[key] ?? '')])),
      vision,
      light,
    });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      // A control that took the key itself (a switch, an open list) has prevented the default.
      if (handledByAnotherControl(e)) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      } else if (e.key === 'Enter' && !takesEnter(e.target)) {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  return (
    <div className="atlas-modal-overlay" onClick={onClose}>
      <div className="atlas-modal atlas-edit-token-modal" onClick={(e) => e.stopPropagation()}>
        <div className="atlas-modal-header">
          <h3>{t('editToken.title')}</h3>
          <CloseButton onClick={onClose} />
        </div>

        <div className="atlas-modal-body atlas-edit-token__body">
          <div className="atlas-edit-token__column">
            <TokenIdentitySection name={name} onNameChange={setName} showNameplate={showNameplate} onShowNameplateChange={setShowNameplate} nameRef={inputRef} />
            {definitions.length > 0 && (
              <TokenResourcesSection
                definitions={definitions}
                values={maxInputs}
                onChange={(key, value) => setMaxInputs((current) => ({ ...current, [key]: value }))}
                defaults={resourceDefaults}
              />
            )}
            {showLighting && <TokenVisionSection vision={vision} onChange={setVision} context={context} />}
          </div>
          {showLighting && (
            <div className="atlas-edit-token__column">
              <TokenLightSection light={light} onChange={setLight} context={context} />
            </div>
          )}
        </div>

        <div className="atlas-modal-footer">
          <Button variant="outline" size="sm" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="default" size="sm" onClick={handleSave}>{t('common.save')}</Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Enter on a button presses it and on a colour cell opens the picker; anywhere else in the modal
 * it saves. A popout's elements are not `instanceof` this window's classes.
 */
function takesEnter(target: EventTarget | null): boolean {
  return (target as Element | null)?.closest?.('button, input[type="color"]') != null;
}

/** What the token's map and its collection say about vision and light. */
function lightingContext(state: ViewAtlasState, app: App, rules: SenseRules): TokenLightingContext {
  const { unitType, unitDistance } = mapMeasurementSettings(AssetService.getInstance(app), state);
  return {
    unit: unitLabelFor(unitType),
    unitDistance,
    maxLightRange: maxLightRange(unitScaleOf({ unitDistance }, state.grid)),
    senses: rules.definitions,
    lightPresets: mapLightPresets(app, state),
  };
}

function readResourceDefaults(app: App, statblockPath: string | undefined, definitions: readonly ResourceDefinition[]): Record<string, ResourceValue> {
  const file = statblockPath ? app.vault.getAbstractFileByPath(statblockPath) : null;
  const frontmatter = file instanceof TFile ? app.metadataCache.getFileCache(file)?.frontmatter : undefined;
  return frontmatter ? startingResources(frontmatter, definitions) : {};
}

/**
 * Imperatively opens an Edit Token modal by mounting a React root.
 * Call from non-React code (e.g. InteractionController).
 */
export function openEditTokenModal(
  token: TokenEntity,
  store: StoreApi<ViewAtlasState>,
  app: App,
  definitions: readonly ResourceDefinition[],
): void {
  const character = token.kind === 'character' ? token : undefined;
  // The senses of the map's collection and what it measures in, as its statblocks are read with.
  const rules = mapSenseRules(app, AssetService.getInstance(app), store.getState());
  const lighting = lightingContext(store.getState(), app, rules);
  const statblock = character?.statblockPath ? { app, path: character.statblockPath, rules } : null;
  const resourceDefaults = readResourceDefaults(app, character?.statblockPath, definitions);
  const container = document.body.createDiv({ cls: 'atlas-vtt-plugin atlas-vtt-root' });
  const root = createRoot(container);

  const cleanup = (): void => {
    root.unmount();
    container.remove();
  };

  const initial: EditTokenValues = {
    name: character?.name ?? '',
    showNameplate: token.showNameplate ?? false,
    maxima: Object.fromEntries(definitions.map(({ key }) => [key, character?.resources?.[key]?.max])),
    vision: visionForm(token.vision, lighting.senses),
    light: lightForm(token.light, lighting.lightPresets),
  };

  /**
   * Saves what the form changed onto the token as the store has it now: the map goes on while
   * the modal is open (damage, a carried light, a move), and a field the GM did not touch must
   * not put back what the token had when the modal opened.
   */
  const handleSave = (values: EditTokenValues): void => {
    const current = store.getState().objects.tokens[token.id];
    const changed = <K extends keyof EditTokenValues>(key: K): boolean => JSON.stringify(values[key]) !== JSON.stringify(initial[key]);
    const maxima = definitions.filter(({ key }) => values.maxima[key] !== initial.maxima[key]);
    const updates: TokenUpdates = {
      ...(changed('name') && { name: values.name }),
      ...(changed('showNameplate') && { showNameplate: values.showNameplate }),
      ...(changed('vision') && { vision: visionFromForm(values.vision) }),
      ...(changed('light') && { light: lightFromForm(values.light) }),
      ...(maxima.length > 0 && current && buildResourceEdits(
        current.kind === 'character' ? current : {},
        maxima.map((definition) => ({ definition, max: values.maxima[definition.key] })),
        resourceDefaults,
      )),
    };
    if (current && Object.keys(updates).length > 0) store.getState().updateToken(token.id, updates);
    cleanup();
  };

  // Its own React root, so no provider above it: the vision switch's tooltip needs one.
  root.render(
    <TooltipProvider delayDuration={300}>
      <EditTokenModalInner
        initial={initial}
        lighting={lighting}
        showLighting={dynamicLightingOn(app)}
        statblock={statblock}
        definitions={definitions}
        resourceDefaults={resourceDefaults}
        onSave={handleSave}
        onClose={cleanup}
      />
    </TooltipProvider>,
  );
}
