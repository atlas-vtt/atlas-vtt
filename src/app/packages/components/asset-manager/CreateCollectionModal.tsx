import { savedResources } from '../../../react/components/collection-settings/useCollectionSettingsDraft';
import { HP_RESOURCE } from '../../../resources/resourceDefinitions';
import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, FolderPlus } from 'lucide-react';
import { DEFAULT_GRID_DEFAULTS } from '../../../gameSystems/systemRules';
import { areRangeBandsValid } from '../../../grid/measurementFormat';
import { isUnitDistance } from '../../../grid/unitDistance';
import { useSystemPresets } from '../../../react/hooks/useSystemPresets';
import { useAtlasUI } from '../../../react/root/AtlasUIContext';
import { createCollectionWithSystem } from '../../../services/collectionCreation';
import { collectionNameProblem } from '../../../services/assetPaths';
import type { SystemPreset } from '../../../types/systemPresetTypes';
import { Button } from '../primitives/button';
import { CloseButton } from '../primitives/CloseButton';
import { LabelTooltip } from '../primitives/tooltip';
import { showAtlasToast } from '../../../react/components/AtlasToast';
import { dialogOverlayMotion, useDialogWindowVariants } from '../primitives/dialogMotion';
import { useDialogEscape } from '../primitives/useDialogEscape';
import { DEFAULT_INITIATIVE_RULES, isValidInitiativeRules, savedInitiativeRules } from '../../../gameSystems/initiativeRules';
import { CustomSystemStep, type CustomSystemRules } from './create-collection/CustomSystemStep';
import { SystemChoiceList, type SystemChoice } from './create-collection/SystemChoiceList';
import { t } from '../../../i18n';

interface CreateCollectionModalProps {
  /** Names already in use, compared without case. */
  existingNames: readonly string[];
  onClose: () => void;
  /** Called with the new collection's id once it exists. */
  onCreated: (collectionId: string) => void;
}

type Step = 'details' | 'custom';

function blankRules(): CustomSystemRules {
  return { gridDefaults: structuredClone(DEFAULT_GRID_DEFAULTS), conditions: [], defaultWidgets: {}, initiative: { ...DEFAULT_INITIATIVE_RULES }, resources: [{ ...HP_RESOURCE }] };
}

/**
 * Creates a collection with a name and a game system: none, a saved preset, or
 * one set up in a second step that is saved as a preset for other collections.
 */
export function CreateCollectionModal({ existingNames, onClose, onCreated }: CreateCollectionModalProps): React.ReactElement {
  const { app } = useAtlasUI();
  const { service, presets } = useSystemPresets(app);
  const windowVariants = useDialogWindowVariants();
  const dialogRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('details');
  const [name, setName] = useState('');
  const [choice, setChoice] = useState<SystemChoice>({ kind: 'none' });
  const [presetName, setPresetName] = useState('');
  const [rules, setRules] = useState<CustomSystemRules>(blankRules);
  const [showErrors, setShowErrors] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => { if (step === 'details') nameRef.current?.focus(); }, [step]);
  useDialogEscape(dialogRef, step === 'custom' ? () => setStep('details') : onClose);

  const trimmedName = name.trim();
  // The name is also the collection's folder name, so it must be a valid one.
  const nameError = collectionNameProblem(name)
    ?? (existingNames.some((existing) => existing.toLowerCase() === trimmedName.toLowerCase())
      ? t('am.collection.nameTaken', { name: trimmedName })
      : null);
  const presetNameError = service?.nameError(presetName) ?? null;
  const rulesValid = areRangeBandsValid(rules.gridDefaults.abstractRangeBands)
    && isUnitDistance(rules.gridDefaults.unitDistance)
    && isValidInitiativeRules(rules.initiative)
    && rules.resources.every((resource) => resource.name.trim() !== '' && resource.field.trim() !== '');

  const create = async (): Promise<void> => {
    if (!app || !service || isCreating) return;
    setIsCreating(true);
    try {
      let preset: SystemPreset | undefined;
      if (choice.kind === 'preset') preset = presets.find((candidate) => candidate.id === choice.presetId);
      if (choice.kind === 'custom') preset = service.create(presetName, { ...rules, initiative: savedInitiativeRules(rules.initiative), resources: savedResources(rules.resources) });
      const collection = await createCollectionWithSystem(app, trimmedName, preset, service.list());
      onCreated(collection.id);
      onClose();
    } catch (error) {
      console.error('[CreateCollectionModal] Could not create the collection:', error);
      showAtlasToast(t('am.collection.createFailed'));
      setIsCreating(false);
    }
  };

  const primary = (): void => {
    setShowErrors(true);
    if (nameError) {
      setStep('details');
      return;
    }
    if (step === 'details' && choice.kind === 'custom') {
      setShowErrors(false);
      setStep('custom');
      return;
    }
    if (step === 'custom' && (presetNameError || !rulesValid)) return;
    void create();
  };

  const isCustomStep = step === 'custom';
  const primaryLabel = isCreating ? t('am.create.creating') : !isCustomStep && choice.kind === 'custom' ? t('am.create.next') : t('am.create.collection');

  return (
    <motion.div
      {...dialogOverlayMotion}
      className="atlas-vtt-root atlas-create-collection-overlay"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        ref={dialogRef}
        className="atlas-create-collection"
        variants={windowVariants}
        role="dialog"
        aria-modal="true"
        aria-labelledby="atlas-create-collection-title"
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter' && e.target instanceof HTMLInputElement && e.target.type === 'text' && !isCustomStep) {
            e.preventDefault();
            primary();
          }
        }}
      >
        <div className="atlas-create-collection__header">
          <h3 id="atlas-create-collection-title">
            {isCustomStep ? (
              <LabelTooltip label={t('common.back')}>
                <Button variant="ghost" size="icon" className="atlas-create-collection__back" onClick={() => setStep('details')}>
                  <ArrowLeft />
                </Button>
              </LabelTooltip>
            ) : <FolderPlus />}
            {isCustomStep ? t('am.create.newSystem') : t('am.create.newCollection')}
          </h3>
          <CloseButton onClick={onClose} />
        </div>

        <div className="atlas-create-collection__body">
          {isCustomStep ? (
            <CustomSystemStep
              presetName={presetName}
              onPresetNameChange={setPresetName}
              presetNameError={showErrors ? presetNameError : null}
              rules={rules}
              onRulesChange={setRules}
            />
          ) : (
            <>
              <div className="atlas-csm-field">
                <label className="atlas-csm-label" htmlFor="atlas-new-collection-name">{t('am.create.name')}</label>
                <input
                  ref={nameRef}
                  id="atlas-new-collection-name"
                  type="text"
                  className="atlas-csm-input"
                  placeholder="e.g. Curse of the Crimson Throne"
                  value={name}
                  aria-invalid={(showErrors && nameError !== null) || undefined}
                  onChange={(e) => setName(e.target.value)}
                />
                {showErrors && nameError && <p className="atlas-csm-hint atlas-csm-hint--error" role="alert">{nameError}</p>}
              </div>
              <section className="atlas-create-collection__section" aria-labelledby="atlas-new-collection-system">
                <h4 id="atlas-new-collection-system" className="atlas-create-collection__heading">{t('am.create.system')}</h4>
                <p className="atlas-csm-hint">Sets how distances are measured and which conditions tokens can have. You can change it later in the collection&apos;s settings.</p>
                <SystemChoiceList presets={presets} choice={choice} onChange={setChoice} />
              </section>
            </>
          )}
        </div>

        <div className="atlas-create-collection__footer">
          <Button variant="outline" size="sm" onClick={isCustomStep ? () => setStep('details') : onClose}>
            {isCustomStep ? t('common.back') : t('common.cancel')}
          </Button>
          <Button variant="default" size="sm" disabled={isCreating || !service} onClick={primary}>
            {primaryLabel}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
