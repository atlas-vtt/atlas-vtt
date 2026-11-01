import React, { useEffect, useState } from 'react';
import type { App, TFile } from 'obsidian';
import { t } from '../../../../i18n';
import type { AssetService } from '../../../../services/AssetService';
import { musicFolderOf } from '../../../../soundLibrary/soundFiles';
import { runVaultSoundImport } from '../../../../soundLibrary/runSoundImport';
import { unrecordedAudio } from '../../../../soundLibrary/soundImport';
import { runInBackground } from '../../../../utils/backgroundTask';
import { Button } from '../../primitives/button';
import type { CollectionOption } from '../types';

/** Asked once per collection on each device: a fact of the device, since the question is. */
const offerKey = (collection: CollectionOption): string => `atlas-vtt:music-folder-offered:${collection.uid}`;

/** The one offer to take in what a collection's `music` folder already holds; the files stay where they lie. */
export function MusicFolderOffer({ app, assetService, collection }: {
  app: App;
  assetService: AssetService | null;
  collection: CollectionOption | undefined;
}): React.JSX.Element | null {
  const [files, setFiles] = useState<readonly TFile[]>([]);

  useEffect(() => {
    setFiles([]);
    if (!assetService || !collection || app.loadLocalStorage(offerKey(collection))) return;
    let current = true;
    const look = async (): Promise<void> => {
      const found = await unrecordedAudio(app, assetService, collection.id, musicFolderOf(collection.id));
      if (current) setFiles(found);
    };
    runInBackground(look(), 'Looking into the music folder');
    return () => { current = false; };
  }, [app, assetService, collection]);

  if (!assetService || !collection || files.length === 0) return null;
  const close = (): void => {
    app.saveLocalStorage(offerKey(collection), 'done');
    setFiles([]);
  };

  return (
    <div className="atlas-sound-offer">
      <span>{t('audio.offer', { count: files.length })}</span>
      <Button
        variant="default"
        onClick={() => {
          close();
          runInBackground(runVaultSoundImport(app, assetService, files, collection.id), 'Adding the music folder');
        }}
      >
        {t('audio.offerAdd')}
      </Button>
      <Button variant="ghost" onClick={close}>{t('audio.offerDismiss')}</Button>
    </div>
  );
}
