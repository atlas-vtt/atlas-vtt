import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { MapIcon } from 'lucide-react';
import type { AssetService } from '../../../services/AssetService';
import { createScene, SceneNameTakenError } from '../../../services/createScene';
import { useAtlasUI } from '../../../react/root/AtlasUIContext';
import { CloseButton } from '../primitives/CloseButton';
import { Button } from '../primitives/button';
import { dialogOverlayMotion, useDialogWindowVariants } from '../primitives/dialogMotion';
import { TagPicker } from './token-creator/TagPicker';
import { useAssetTags } from './token-creator/useAssetTags';
import { t } from '../../../i18n';
import { showNotice } from '../../../ui/notice';

interface CreateSceneModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCollection: string;
  assetService: AssetService | null;
  onSceneCreated: () => void;
  // Optional prefill when invoked from double-clicking a map
  backgroundPath?: string | null;
  defaultName?: string;
}

export default function CreateSceneModal({
  isOpen,
  onClose,
  selectedCollection,
  assetService,
  onSceneCreated,
  backgroundPath,
  defaultName
}: CreateSceneModalProps) {
  const [sceneName, setSceneName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const { tags, createTag, isCreatingTag } = useAssetTags(assetService, isOpen, selectedCollection, 'maps');
  const inputRef = useRef<HTMLInputElement>(null);
  const { app } = useAtlasUI();
  const [hasSetDefaultName, setHasSetDefaultName] = useState(false);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      // Prefill from defaults if provided (only once per modal open)
      if (defaultName && !hasSetDefaultName) {
        setSceneName(defaultName);
        setHasSetDefaultName(true);
        // Select all text only when first setting the default name
        window.setTimeout(() => {
          inputRef.current?.select();
        }, 0);
      }
      inputRef.current.focus();
    }
  }, [isOpen, defaultName, hasSetDefaultName]);
  
  // Reset the flag when modal closes
  useEffect(() => {
    if (!isOpen) {
      setHasSetDefaultName(false);
      setSceneName(''); // Clear the name when closing
      setSelectedTags([]);
    }
  }, [isOpen]);

  // Handle Escape key globally
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => {
        document.removeEventListener('keydown', handleEscape);
      };
    }
  }, [isOpen, onClose]);

  const handleCreate = async () => {
    if (!sceneName.trim() || !assetService || isCreating || isCreatingTag) return;

    setIsCreating(true);
    try {
      const { file: sceneFile } = await createScene(app, assetService, {
        name: sceneName,
        collectionId: selectedCollection,
        // If invoked from a map, the scene starts on its image
        background: backgroundPath ?? null,
        tags: selectedTags,
      });

      await app.workspace.getLeaf(false).openFile(sceneFile);
      
      // Close the modal
      onClose();
      
      // Notify that scene was created (this will close the asset manager)
      onSceneCreated();
    } catch (error) {
      if (error instanceof SceneNameTakenError) {
        showNotice(t('am.scene.nameTaken', { name: error.sceneName }));
        return;
      }
      console.error('[CreateSceneModal] Error creating scene:', error);
      showNotice(t('am.scene.createFailed', { error: error instanceof Error ? error.message : String(error) }));
    } finally {
      setIsCreating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleCreate();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  const windowVariants = useDialogWindowVariants();

  if (!isOpen) return null;

  return (
    <motion.div
      {...dialogOverlayMotion}
      className="atlas-vtt-root atlas-create-scene-modal"
      onClick={(e) => {
        // Prevent propagation to asset manager
        e.stopPropagation();
        // Only close if clicking on the backdrop itself (not its children)
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      onMouseDown={(e) => {
        // Also stop propagation on mousedown
        e.stopPropagation();
      }}
      onKeyDown={(e) => {
        // Stop propagation of keyboard events
        e.stopPropagation();
      }}
      tabIndex={-1}
      style={{ outline: 'none' }}
    >
      <motion.div
        className="atlas-create-scene-container"
        variants={windowVariants}
        onClick={(e) => {
          // Prevent any clicks inside the container from bubbling up
          e.stopPropagation();
        }}
        onMouseDown={(e) => {
          // Also stop propagation on mousedown
          e.stopPropagation();
        }}
        onKeyDown={(e) => {
          // Stop propagation of keyboard events
          e.stopPropagation();
        }}
      >
        <div className="atlas-create-scene-header">
          <h3>
            <MapIcon />
            {t('am.scene.new')}
          </h3>
          <CloseButton onClick={onClose} />
        </div>

        <div className="atlas-create-scene-body">
          <div className="atlas-create-scene-field">
            <label className="atlas-create-scene-label">{t('am.scene.name')}</label>
            <input
              ref={inputRef}
              type="text"
              className="atlas-create-scene-input"
              value={sceneName}
              onChange={(e) => setSceneName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('am.scene.namePlaceholder')}
            />
          </div>

          <TagPicker
            available={tags}
            selected={selectedTags}
            onToggle={(tag) => setSelectedTags((previous) => previous.includes(tag) ? previous.filter((name) => name !== tag) : [...previous, tag])}
            onCreate={createTag}
            disabled={!assetService || isCreating}
          />
        </div>

        <div className="atlas-create-scene-footer">
          <Button variant="outline" size="sm" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="default" size="sm" onClick={() => { void handleCreate(); }} disabled={!sceneName.trim() || !assetService || isCreating || isCreatingTag}>
            {isCreating ? t('am.create.creating') : t('am.scene.create')}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
