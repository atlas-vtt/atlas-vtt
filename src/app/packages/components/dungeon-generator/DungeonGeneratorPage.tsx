import React from 'react';
import type { App } from 'obsidian';
import { ContextMenuProvider } from '../../../react/root/ContextMenuContext';
import { useAssetCatalog } from '../asset-manager/token-creator/useAssetCatalog';
import type { CreatedDungeonScene } from './useGeneratorActions';
import { useWizard } from './useWizard';
import { WizardPanel } from './WizardPanel';
import { WizardPreview } from './WizardPreview';

export interface DungeonGeneratorPageProps {
  app: App;
  collectionId: string;
  onCollectionChange: (id: string) => void;
  onCreated: (scene: CreatedDungeonScene) => void;
  /** The panel's close button: closes the tab. */
  onClose: () => void;
}

/**
 * The dungeon generator in a tab of its own (`DungeonGeneratorView`), open without any scene: the
 * wizard's steps in a panel on the left and the live map filling the rest of the tab. The GM
 * chooses the collection the scene goes to on the Name step.
 */
export function DungeonGeneratorPage(props: DungeonGeneratorPageProps): React.JSX.Element {
  return (
    <ContextMenuProvider local>
      <Page {...props} />
    </ContextMenuProvider>
  );
}

function Page({ app, collectionId, onCollectionChange, onCreated, onClose }: DungeonGeneratorPageProps): React.JSX.Element {
  const wizard = useWizard({ app, collectionId, onCreated });
  const { collections } = useAssetCatalog(app, true);
  return (
    <div className="atlas-dungeon-generator-page" inert={wizard.actions.creating}>
      <div className="atlas-dungeon-generator-page__grid">
        <div ref={wizard.setPanel} className="atlas-dungeon-wizard atlas-dungeon-wizard--page" role="group" aria-labelledby={wizard.titleId}>
          <WizardPanel wizard={wizard} collection={{ id: collectionId, options: collections, onChange: onCollectionChange }} onClose={onClose} />
        </div>
        <WizardPreview wizard={wizard} />
      </div>
    </div>
  );
}
