import React, { useState, useRef, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import type { App } from 'obsidian';
import type { StoreApi } from 'zustand';
import type { ViewAtlasState } from '../../storeFactory';
import type { TokenUpdates } from '../../types/viewState';
import type { TokenEntity } from '../../types';
import { CloseButton } from '../../packages/components/primitives/CloseButton';
import { Button } from '../../packages/components/primitives/button';
import { TooltipProvider } from '../../packages/components/primitives/tooltip';
import { useAnchoredTop } from '../../packages/components/primitives/useAnchoredTop';
import { AssetService } from '../../services/AssetService';
import { mapMeasurementSettings } from '../../services/mapMeasurementSettings';
import type { SenseRules } from '../../creatures/tokenSensesResolver';
import { mapLightPresets } from '../../services/mapCollectionRules';
import { mapSenseRules } from '../../services/mapSenseRules';
import { rulesLookup } from '../../services/mapRules';
import { useStatblockSenses, type StatblockLink } from './useStatblockSenses';
import { useStatblockResourceDefaults } from './useStatblockResourceDefaults';
import { parseNumberInput } from './NumberOverrideField';
import { buildResourceEdits } from '../../resources/resourceEdits';
import type { ResourceDefinition, ResourceValue } from '../../resources/resourceTypes';
import { handledByAnotherControl } from '../../keyboard/tooltipEscape';
import { TokenIdentitySection, TokenResourcesSection } from './EditTokenSections';
import { TokenLightSection, TokenVisionSection, type TokenLightingContext } from './TokenLightingFields';
import { TokenSoundsSection } from './TokenSoundsSection';
import { MAX_TOKEN_SOUNDS, tokenSounds } from '../../audio/tokenSounds';
import { pickTokenSound } from '../../audio/AudioFileModal';
import { playTokenSound } from '../../audio/playTokenSound';
import { TokenSoundPlayer } from '../../audio/TokenSoundPlayer';
import type { TokenSound } from '../../types/audioTypes';
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
  sounds: Required<TokenSound>[];
}

/** What the Sounds section asks of Obsidian: a sound file chosen in the vault, and a sound played. */
interface SoundActions {
  pick: (onPicked: (sound: Required<TokenSound>) => void) => void;
  play: (sound: Required<TokenSound>) => void;
}

interface EditTokenModalProps {
  initial: EditTokenValues;
  /** The resources of the map's collection, in the order they show. */
  definitions: readonly ResourceDefinition[];
  lighting: TokenLightingContext;
  /** Whether the token's vision and light can be edited: only with dynamic lighting switched on. */
  showLighting: boolean;
  /** The statblock the token links, whose senses it follows while it has none of its own. */
  statblock: StatblockLink | null;
  soundActions: SoundActions;
  /** Saves the form; `resourceDefaults` is what the linked statblock gives each resource. */
  onSave: (values: EditTokenValues, resourceDefaults: Record<string, ResourceValue>) => void;
  onClose: () => void;
}

/**
 * The Edit Token dialog: two columns of sections, the token's own on the left (name, resources,
 * vision) and on the right the light it carries and its sounds, so the fields are read and tabbed
 * through column by column. A dialog too narrow for two columns stacks them in the same order.
 */
function EditTokenModalInner({ initial, definitions, lighting, showLighting, statblock, soundActions, onSave, onClose }: EditTokenModalProps): React.ReactElement {
  const inherited = useStatblockSenses(statblock);
  const resourceDefaults = useStatblockResourceDefaults(statblock, definitions);
  const [name, setName] = useState(initial.name);
  const [showNameplate, setShowNameplate] = useState(initial.showNameplate);
  const [maxInputs, setMaxInputs] = useState<Record<string, string>>(
    () => Object.fromEntries(definitions.map(({ key }) => [key, numberText(initial.maxima[key])])),
  );
  const [vision, setVision] = useState(initial.vision);
  const [light, setLight] = useState(initial.light);
  const [sounds, setSounds] = useState(initial.sounds);
  const [dialog, setDialog] = useState<HTMLDivElement | null>(null);
  useAnchoredTop(dialog);
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
      sounds,
    }, resourceDefaults);
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
      <div ref={setDialog} className="atlas-modal atlas-edit-token-modal" onClick={(e) => e.stopPropagation()}>
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
          <div className="atlas-edit-token__column">
            {showLighting && <TokenLightSection light={light} onChange={setLight} context={context} />}
            <TokenSoundsSection
              sounds={sounds}
              onChange={setSounds}
              onAdd={() => soundActions.pick((sound) => setSounds((current) => [...current, sound].slice(0, MAX_TOKEN_SOUNDS)))}
              onPlay={soundActions.play}
            />
          </div>
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

/** What the rules the token's map plays by say about vision and light. */
function lightingContext(state: ViewAtlasState, app: App, rules: SenseRules): TokenLightingContext {
  const { unitType, unitDistance } = mapMeasurementSettings(rulesLookup(app), state);
  return {
    unit: unitLabelFor(unitType),
    unitDistance,
    maxLightRange: maxLightRange(unitScaleOf({ unitDistance }, state.grid)),
    senses: rules.definitions,
    lightPresets: mapLightPresets(app, state),
  };
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
  // The senses of the map's rules and what they measure in, as its statblocks are read with.
  const rules = mapSenseRules(app, AssetService.getInstance(app), store.getState());
  const lighting = lightingContext(store.getState(), app, rules);
  const statblock = character?.statblockPath ? { app, path: character.statblockPath, rules } : null;
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
    sounds: tokenSounds(token),
  };
  const soundActions: SoundActions = {
    pick: (onPicked) => pickTokenSound(app, onPicked),
    play: (sound) => void playTokenSound(TokenSoundPlayer.forApp(app), sound),
  };

  /**
   * Saves what the form changed onto the token as the store has it now: the map goes on while
   * the modal is open (damage, a carried light, a move), and a field the GM did not touch must
   * not put back what the token had when the modal opened.
   */
  const handleSave = (values: EditTokenValues, resourceDefaults: Record<string, ResourceValue>): void => {
    const current = store.getState().objects.tokens[token.id];
    const changed = <K extends keyof EditTokenValues>(key: K): boolean => JSON.stringify(values[key]) !== JSON.stringify(initial[key]);
    const maxima = definitions.filter(({ key }) => values.maxima[key] !== initial.maxima[key]);
    const updates: TokenUpdates = {
      ...(changed('name') && { name: values.name }),
      ...(changed('showNameplate') && { showNameplate: values.showNameplate }),
      ...(changed('vision') && { vision: visionFromForm(values.vision) }),
      ...(changed('light') && { light: lightFromForm(values.light) }),
      ...(changed('sounds') && { sounds: values.sounds.length > 0 ? values.sounds : undefined }),
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
        soundActions={soundActions}
        definitions={definitions}
        onSave={handleSave}
        onClose={cleanup}
      />
    </TooltipProvider>,
  );
}
