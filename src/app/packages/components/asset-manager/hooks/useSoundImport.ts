import { useEffect, useRef } from 'react';
import type { App } from 'obsidian';
import type { AssetService } from '../../../../services/AssetService';
import { runSoundImport } from '../../../../soundLibrary/runSoundImport';
import { AUDIO_ACCEPT, mayCarryAudio } from '../../../../soundLibrary/soundFiles';
import { pickVaultSounds } from '../../../../soundLibrary/SoundVaultPicker';
import { runInBackground } from '../../../../utils/backgroundTask';

export interface SoundImportOptions {
  app: App;
  assetService: AssetService | null;
  collectionId: string;
  /** The Sounds tab shows: files dropped on the manager's window are sounds then. */
  takesDrops: boolean;
  /** Runs when the GM asks to add sounds, so what arrives is seen. */
  onAdding: () => void;
}

export interface SoundImport {
  addFiles: () => void;
  addFromVault: () => void;
}

const MANAGER_WINDOW = '.atlas-asset-manager-container';

function overManager(event: DragEvent): DataTransfer | null {
  const { target, dataTransfer } = event;
  return dataTransfer && target instanceof Element && target.closest(MANAGER_WINDOW) ? dataTransfer : null;
}

/** Sounds from a file pick or a drop, any number at once, and from what the vault already holds. */
export function useSoundImport(options: SoundImportOptions): SoundImport {
  const latest = useRef(options);
  latest.current = options;

  const importFiles = (files: readonly File[]): void => {
    const { app, assetService, collectionId } = latest.current;
    if (assetService && files.length > 0) runInBackground(runSoundImport(app, assetService, files, collectionId), 'Adding sounds');
  };

  // Ahead of the manager's own handlers, as a folder tile takes every drop on it.
  useEffect(() => {
    if (!options.takesDrops) return;
    const onDragOver = (event: DragEvent): void => {
      const transfer = overManager(event);
      if (!transfer || !mayCarryAudio(transfer)) return;
      event.preventDefault();
      transfer.dropEffect = 'copy';
    };
    const onDrop = (event: DragEvent): void => {
      const transfer = overManager(event);
      if (!transfer || transfer.files.length === 0) return;
      event.preventDefault();
      event.stopPropagation();
      importFiles(Array.from(transfer.files));
    };
    document.addEventListener('dragover', onDragOver, true);
    document.addEventListener('drop', onDrop, true);
    return () => {
      document.removeEventListener('dragover', onDragOver, true);
      document.removeEventListener('drop', onDrop, true);
    };
  }, [options.takesDrops]);

  return {
    addFiles: () => {
      latest.current.onAdding();
      const input = document.body.createEl('input', { type: 'file', cls: 'atlas-hidden-file-input', attr: { accept: AUDIO_ACCEPT, multiple: true } });
      input.addEventListener('change', () => {
        const files = Array.from(input.files ?? []);
        input.remove();
        importFiles(files);
      });
      input.addEventListener('cancel', () => input.remove());
      input.click();
    },
    addFromVault: () => {
      latest.current.onAdding();
      const { app, assetService, collectionId } = latest.current;
      if (assetService) runInBackground(pickVaultSounds(app, assetService, collectionId), 'Picking sounds from the vault');
    },
  };
}
