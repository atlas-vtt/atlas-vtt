/**
 * PartyImagePicker — A player's picture: the vault's pictures as thumbnails, or one uploaded.
 */

import React, { useMemo, useRef, useState } from 'react';
import type { App, TFile } from 'obsidian';
import { ImageOff, Upload } from 'lucide-react';
import { Button } from '../../../packages/components/primitives/button';
import { Skeleton } from '../../../packages/components/primitives/Skeleton';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { useImageThumbnail } from '../../hooks/useImageThumbnail';
import { savePartyPicture, vaultImages } from './partyImages';
import { t } from '../../../i18n';

interface PartyImagePickerProps {
  app: App;
  onSelect: (path: string) => void;
}

export function PartyImagePicker({ app, onSelect }: PartyImagePickerProps): React.ReactElement {
  const [query, setQuery] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadFailed, setUploadFailed] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const images = useMemo(() => vaultImages(app.vault.getFiles(), query), [app, query]);

  const upload = async (file: File): Promise<void> => {
    setUploading(true);
    setUploadFailed(false);
    try {
      onSelect(await savePartyPicture(app, file));
    } catch (error) {
      console.error('[PartyImagePicker] Could not save the picture:', error);
      setUploadFailed(true);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="atlas-csm-party-picker">
      <div className="atlas-csm-party-picker-bar">
        <input
          type="search"
          className="atlas-csm-input"
          aria-label={t('csm.party.searchImages')}
          placeholder={t('csm.party.searchImages')}
          value={query}
          autoFocus
          onChange={(e) => setQuery(e.target.value)}
        />
        <Button variant="outline" disabled={uploading} onClick={() => fileInput.current?.click()}>
          <Upload />
          {t('csm.party.upload')}
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            // Cleared, so picking the same file again uploads it again
            e.target.value = '';
            if (file) void upload(file);
          }}
        />
      </div>
      {uploadFailed && <p className="atlas-csm-hint atlas-csm-hint--error" role="alert">{t('csm.party.uploadFailed')}</p>}
      {images.length > 0 ? (
        <div className="atlas-csm-party-images" role="list">
          {images.map((file) => <ImageChoice key={file.path} app={app} file={file} onSelect={onSelect} />)}
        </div>
      ) : (
        <div className="atlas-csm-empty">{t('csm.party.noImages')}</div>
      )}
    </div>
  );
}

function ImageChoice({ app, file, onSelect }: { app: App; file: TFile; onSelect: (path: string) => void }): React.ReactElement {
  const cell = useRef<HTMLDivElement>(null);
  const thumbnail = useImageThumbnail(app, file, cell);
  return (
    <div ref={cell} className="atlas-csm-party-image-cell" role="listitem">
      <LabelTooltip label={file.basename}>
        <button type="button" className="atlas-csm-party-image" aria-label={file.basename} onClick={() => onSelect(file.path)}>
          {thumbnail === 'pending' && <Skeleton className="atlas-image-placeholder" live />}
          {thumbnail === 'failed' && <ImageOff />}
          {typeof thumbnail === 'object' && <img src={thumbnail.url} alt="" draggable={false} />}
        </button>
      </LabelTooltip>
    </div>
  );
}
