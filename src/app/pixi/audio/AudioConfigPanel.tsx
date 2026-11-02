import React, { useState, useEffect, useCallback } from 'react';
import { GripHorizontal, Volume2, Play } from 'lucide-react';
import { createRoot } from 'react-dom/client';
import type { StoreApi } from 'zustand';
import type { ViewAtlasState } from '../../storeFactory';
import { beginHistoryTransaction, endHistoryTransaction } from '../../stores/history';
import type { AudioSource, SoundMeta, SoundCategory } from '../../types/audioTypes';
import type { SoundRegistry } from '../../audio/SoundRegistry';

import './audio-config-panel.scss';
import { useDraggablePosition } from '../../react/hooks/useDraggablePosition';
import { CloseButton } from '../../packages/components/primitives/CloseButton';
import { LabelTooltip } from '../../packages/components/primitives/tooltip';
import { unitLabelFor } from '../../grid/measurementFormat';
import { t } from '../../i18n';
import { levelObjects } from '../../levels/levelObjects';

/** Convert game units (feet/meters) to world pixels. */
function unitsToPixels(units: number, gridSize: number, unitDistance: number): number {
  if (unitDistance <= 0) return units;
  return (units / unitDistance) * gridSize;
}

/** Convert world pixels to game units (feet/meters). */
function pixelsToUnits(pixels: number, gridSize: number, unitDistance: number): number {
  if (gridSize <= 0) return pixels;
  return (pixels / gridSize) * unitDistance;
}

interface AudioConfigPanelProps {
  audio: AudioSource;
  store: StoreApi<ViewAtlasState>;
  registry: SoundRegistry;
  screenX: number;
  screenY: number;
  onClose: () => void;
  onPreview?: ((soundId: string) => void) | undefined;
}

function AudioConfigPanelInner({
  audio,
  store,
  registry,
  screenX,
  screenY,
  onClose,
  onPreview,
}: AudioConfigPanelProps): React.ReactElement {
  const grid = store.getState().grid;
  const gridSize = grid?.size ?? 70;
  const unitDistance = grid?.unitDistance ?? 5;
  const unitLabel = unitLabelFor(grid?.unitType);

  const [soundId, setSoundId] = useState(audio.soundId);
  const [volume, setVolume] = useState(Math.round(audio.volume * 100));
  const [innerUnits, setInnerUnits] = useState(
    Math.round(pixelsToUnits(audio.innerRadius, gridSize, unitDistance)),
  );
  const [outerUnits, setOuterUnits] = useState(
    Math.round(pixelsToUnits(audio.outerRadius, gridSize, unitDistance)),
  );
  const [loop, setLoop] = useState(audio.loop);

  const { position, panelRef, startDrag } = useDraggablePosition({ x: screenX + 20, y: screenY - 40 });

  const soundsByCategory = registry.listByCategory();

  // The whole editing session is one undo step, even though changes apply live
  useEffect(() => {
    beginHistoryTransaction(store);
    return () => endHistoryTransaction(store);
  }, [store]);

  // Apply changes live
  useEffect(() => {
    store.getState().updateAudio(audio.id, {
      soundId,
      volume: volume / 100,
      innerRadius: unitsToPixels(innerUnits, gridSize, unitDistance),
      outerRadius: unitsToPixels(outerUnits, gridSize, unitDistance),
      loop,
    });
  }, [soundId, volume, innerUnits, outerUnits, loop, audio.id, store, gridSize, unitDistance]);

  // Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleDelete = useCallback(() => {
    store.getState().deleteAudio(audio.id);
    onClose();
  }, [audio.id, store, onClose]);

  return (
    <div
      ref={panelRef}
      className="atlas-audio-config"
      style={{ left: position.x, top: position.y }}
    >
      {/* Drag handle + header */}
      <div className="atlas-audio-config__header" onPointerDown={startDrag}>
        <GripHorizontal size={14} className="atlas-audio-config__grip" />
        <span className="atlas-audio-config__title">{t('audio.title')}</span>
        <CloseButton onClick={onClose} />
      </div>

      <div className="atlas-audio-config__body">
        {/* Sound picker */}
        <div className="atlas-audio-config__section-label">{t('audio.sound')}</div>
        <div className="atlas-audio-config__sound-picker">
          <select
            className="atlas-input atlas-audio-config__select"
            value={soundId}
            onChange={(e) => setSoundId(e.target.value)}
          >
            {(
              Object.entries(soundsByCategory) as [SoundCategory, SoundMeta[]][]
            )
              .filter(([, sounds]) => sounds.length > 0)
              .map(([category, sounds]) => (
                <optgroup key={category} label={category}>
                  {sounds.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </optgroup>
              ))}
          </select>
          {onPreview && (
            <LabelTooltip label={t('audio.preview')}>
              <button
                className="atlas-audio-config__preview-btn"
                onClick={() => onPreview(soundId)}
              >
                <Play size={14} />
              </button>
            </LabelTooltip>
          )}
        </div>

        {/* Volume */}
        <div className="atlas-audio-config__section-label">{t('audio.volume')}</div>
        <div className="atlas-audio-config__field">
          <div className="atlas-audio-config__slider-row">
            <Volume2 size={14} className="atlas-audio-config__volume-icon" />
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="atlas-audio-config__slider"
            />
            <span className="atlas-audio-config__value">{volume}%</span>
          </div>
        </div>

        {/* Range */}
        <div className="atlas-audio-config__section-label">{t('audio.range')}</div>
        <div className="atlas-audio-config__field">
          <label className="atlas-audio-config__label">
            Inner Radius{unitLabel ? ` (${unitLabel})` : ''}
          </label>
          <div className="atlas-audio-config__slider-row">
            <input
              type="range"
              min={0}
              max={120}
              step={5}
              value={innerUnits}
              onChange={(e) => setInnerUnits(Number(e.target.value))}
              className="atlas-audio-config__slider"
            />
            <input
              type="number"
              className="atlas-input atlas-audio-config__number"
              value={innerUnits}
              onChange={(e) => setInnerUnits(Math.max(0, Number(e.target.value)))}
              min={0}
            />
          </div>
        </div>

        <div className="atlas-audio-config__field">
          <label className="atlas-audio-config__label">
            Outer Radius{unitLabel ? ` (${unitLabel})` : ''}
          </label>
          <div className="atlas-audio-config__slider-row">
            <input
              type="range"
              min={0}
              max={240}
              step={5}
              value={outerUnits}
              onChange={(e) => setOuterUnits(Number(e.target.value))}
              className="atlas-audio-config__slider"
            />
            <input
              type="number"
              className="atlas-input atlas-audio-config__number"
              value={outerUnits}
              onChange={(e) => setOuterUnits(Math.max(0, Number(e.target.value)))}
              min={0}
            />
          </div>
        </div>

        {/* Loop toggle */}
        <div className="atlas-audio-config__loop-row">
          <label className="atlas-audio-config__label">{t('audio.loop')}</label>
          <input
            type="checkbox"
            checked={loop}
            onChange={(e) => setLoop(e.target.checked)}
          />
        </div>

        {/* Delete */}
        <button className="atlas-audio-config__delete-btn" onClick={handleDelete}>
          Delete Sound Source
        </button>
      </div>
    </div>
  );
}

/**
 * Imperatively opens an Audio Configuration panel near the audio source.
 */
export function openAudioConfigPanel(
  audioId: string,
  store: StoreApi<ViewAtlasState>,
  registry: SoundRegistry,
  onPreview?: (soundId: string) => void,
  screenX?: number,
  screenY?: number,
): void {
  const audio = levelObjects(store.getState()).audios[audioId];
  if (!audio) return;

  const container = document.body.createDiv({ cls: 'atlas-vtt-plugin atlas-vtt-root' });

  const root = createRoot(container);

  const cleanup = (): void => {
    root.unmount();
    container.remove();
  };

  root.render(
    <AudioConfigPanelInner
      audio={audio}
      store={store}
      registry={registry}
      screenX={screenX ?? window.innerWidth / 2}
      screenY={screenY ?? window.innerHeight / 2}
      onClose={cleanup}
      onPreview={onPreview}
    />,
  );
}
