import React, { useId } from 'react';
import { MAX_FLOORS } from '../../../dungeons/model';
import { refusedTags, takesTag } from '../../../dungeons/themes/themes';
import type { ThemeChoice } from '../../../dungeons/themes/themeTypes';
import { type DungeonTag, readTags } from '../../../dungeons/tags';
import type { CollectionMetadata } from '../../../services/AssetService';
import { t } from '../../../i18n';
import { CollectionSelect } from '../asset-manager/token-creator/CollectionSelect';
import { Stepper, SwitchRow } from './fields';
import { StyleGallery } from './StyleGallery';
import { tagName } from './TagChips';
import { FeaturesStep } from './FeaturesStep';
import { ThemeStep } from './ThemeStep';
import type { DungeonState } from './useDungeonState';
import type { Wizard } from './useWizard';
import { ViewSettings } from './ViewSettings';
import type { WizardStep } from './wizardSteps';

/** The collection the scene goes to, and the ones the GM may choose instead. */
export interface CollectionChoice {
  id: string;
  options: CollectionMetadata[];
  onChange: (id: string) => void;
}

interface WizardStepContentProps {
  step: WizardStep;
  wizard: Wizard;
  collection?: CollectionChoice | undefined;
  /** Enter in the name field creates the scene. */
  onSubmit: () => void;
}

/** The tags the chosen theme refuses beside another, with the reason as shown; none for Surprise me, which only picks among themes that take them. */
function refusedOf(choice: ThemeChoice, tags: readonly DungeonTag[]): ReadonlyMap<DungeonTag, string> {
  if (choice === 'any') return new Map();
  // A tag refused always is not offered at all
  return new Map([...refusedTags(choice, tags)].flatMap(([tag, beside]) => (beside ? [[tag, t('dungeon.theme.refused.beside', { tag: tagName(beside) })] as const] : [])));
}

/** Whether the step offers a tag: every tag for Surprise me, else those that change the chosen theme's dungeons. */
function offeredFor(choice: ThemeChoice): (tag: DungeonTag) => boolean {
  return (tag) => choice === 'any' || takesTag(choice, tag);
}

/** What one step of the wizard asks. Every change reaches the preview at once. */
export function WizardStepContent({ step, wizard, collection, onSubmit }: WizardStepContentProps): React.JSX.Element {
  const { state, thumbnails, themePreviews, setArt, setThemeArt } = wizard;
  const { request, settings } = state;
  const theme = request.theme ?? 'any';
  switch (step) {
    case 'theme':
      return <ThemeStep value={theme} picked={state.generated?.theme} previews={themePreviews} onArt={setThemeArt} onChange={state.setTheme} />;
    case 'layout':
      return <LayoutStep state={state} />;
    case 'features':
      return <FeaturesStep picked={readTags(request.tags)} offered={offeredFor(theme)} refused={refusedOf(theme, readTags(request.tags))} onToggle={state.toggleTag} onChoose={state.chooseTag} />;
    case 'style':
      return (
        <div className="atlas-dungeon-wizard__style">
          <StyleGallery value={settings.style} thumbnails={thumbnails} onChange={state.setStyle} onArt={setArt} />
          <ViewSettings view={settings.view} waterLevel={request.waterLevel} onView={state.setView} onWaterLevel={state.setWaterLevel} />
        </div>
      );
    case 'name':
      return <NameStep name={state.name} onName={state.setName} collection={collection} onSubmit={onSubmit} />;
  }
}

/** Floors, and the boss room and five-room switches; a five-room dungeon has one floor and its boss room. */
function LayoutStep({ state }: { state: DungeonState }): React.JSX.Element {
  const floorsId = useId();
  const { request } = state;
  const fiveRoom = request.fiveRoom === true;
  return (
    <div className="atlas-dungeon-fields">
      <div className="atlas-dungeon-field">
        <span id={floorsId} className="atlas-dungeon-field__label">{t('dungeon.floors')}</span>
        <Stepper
          labelledBy={floorsId}
          value={state.floors}
          min={1}
          max={MAX_FLOORS}
          onChange={state.setFloors}
          fewer={t('dungeon.floors.fewer')}
          more={t('dungeon.floors.more')}
          disabled={fiveRoom}
        />
      </div>
      <SwitchRow
        label={t('dungeon.bossRoom')}
        hint={t('dungeon.bossRoom.hint')}
        value={request.bossRoom !== false || fiveRoom}
        disabled={fiveRoom}
        onChange={state.setBossRoom}
      />
      <SwitchRow label={t('dungeon.fiveRoom')} hint={t('dungeon.fiveRoom.hint')} value={fiveRoom} onChange={state.setFiveRoom} />
    </div>
  );
}

interface NameStepProps {
  name: string;
  onName: (name: string) => void;
  collection?: CollectionChoice | undefined;
  onSubmit: () => void;
}

/**
 * The scene's name, typed or brought from the note pin search; the dungeon does not change with it.
 * Where the GM may choose, the collection the scene goes to, offered once there is more than one.
 */
function NameStep({ name, onName, collection, onSubmit }: NameStepProps): React.JSX.Element {
  const id = useId();
  const collectionId = useId();
  const nameField = (
    <div className="atlas-dungeon-field atlas-dungeon-field--stacked">
      <span id={id} className="atlas-dungeon-field__label">{t('dungeon.name')}</span>
      <input
        type="text"
        className="atlas-dungeon-field__text"
        aria-labelledby={id}
        value={name}
        placeholder={t('dungeon.namePlaceholder')}
        autoFocus
        onChange={(event) => onName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
          event.preventDefault();
          onSubmit();
        }}
      />
    </div>
  );
  if (!collection || collection.options.length < 2) return nameField;
  return (
    <div className="atlas-dungeon-fields">
      {nameField}
      <div className="atlas-dungeon-field atlas-dungeon-field--stacked" role="group" aria-labelledby={collectionId}>
        <span id={collectionId} className="atlas-dungeon-field__label">{t('dungeon.collection')}</span>
        <CollectionSelect value={collection.id} options={collection.options} onChange={collection.onChange} />
      </div>
    </div>
  );
}
