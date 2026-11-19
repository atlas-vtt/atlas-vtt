import React, { useState, useEffect, useCallback, useId } from 'react';
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
import { ToggleSwitch } from '../../packages/components/primitives/Toggle';
import { Select, type SelectOption } from '../../packages/components/primitives/Select';
import { Slider } from '../../packages/components/primitives/slider';
import { handledByAnotherControl } from '../../keyboard/tooltipEscape';
import { unitLabelFor } from '../../grid/measurementFormat';
import { t } from '../../i18n';
import { levelObjects } from '../../levels/levelObjects';
import { portalHost } from '../../host/portalHost';

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

  const loopLabelId = useId();
  const soundLabelId = useId();
  const volumeLabelId = useId();
  const innerLabelId = useId();
  const outerLabelId = useId();
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

  const soundOptions: SelectOption<string>[] = (Object.entries(registry.listByCategory()) as [SoundCategory, SoundMeta[]][])
    .flatMap(([category, sounds]) => sounds.map((sound) => ({ value: sound.id, label: sound.name, group: category })));

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
      // An open sound list closes on Escape by itself and keeps the panel open.
      if (e.key === 'Escape' && !handledByAnotherControl(e)) {
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
        <div id={soundLabelId} className="atlas-audio-config__section-label">{t('audio.sound')}</div>
        <div className="atlas-audio-config__sound-picker">
          <Select labelledBy={soundLabelId} value={soundId} options={soundOptions} onChange={setSoundId} />
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
        <div id={volumeLabelId} className="atlas-audio-config__section-label">{t('audio.volume')}</div>
        <div className="atlas-audio-config__field">
          <div className="atlas-audio-config__slider-row">
            <Volume2 size={14} className="atlas-audio-config__volume-icon" />
            <Slider
              aria-labelledby={volumeLabelId}
              min={0}
              max={100}
              step={1}
              value={[volume]}
              onValueChange={(next: number[]) => setVolume(next[0] ?? volume)}
            />
            <span className="atlas-audio-config__value">{volume}%</span>
          </div>
        </div>

        {/* Range */}
        <div className="atlas-audio-config__section-label">{t('audio.range')}</div>
        <div className="atlas-audio-config__field">
          <label id={innerLabelId} className="atlas-audio-config__label">
            Inner Radius{unitLabel ? ` (${unitLabel})` : ''}
          </label>
          <div className="atlas-audio-config__slider-row">
            <Slider
              aria-labelledby={innerLabelId}
              min={0}
              max={120}
              step={5}
              value={[innerUnits]}
              onValueChange={(next: number[]) => setInnerUnits(next[0] ?? innerUnits)}
            />
            <input
              type="number"
              aria-labelledby={innerLabelId}
              className="atlas-audio-config__number"
              value={innerUnits}
              onChange={(e) => setInnerUnits(Math.max(0, Number(e.target.value)))}
              min={0}
            />
          </div>
        </div>

        <div className="atlas-audio-config__field">
          <label id={outerLabelId} className="atlas-audio-config__label">
            Outer Radius{unitLabel ? ` (${unitLabel})` : ''}
          </label>
          <div className="atlas-audio-config__slider-row">
            <Slider
              aria-labelledby={outerLabelId}
              min={0}
              max={240}
              step={5}
              value={[outerUnits]}
              onValueChange={(next: number[]) => setOuterUnits(next[0] ?? outerUnits)}
            />
            <input
              type="number"
              aria-labelledby={outerLabelId}
              className="atlas-audio-config__number"
              value={outerUnits}
              onChange={(e) => setOuterUnits(Math.max(0, Number(e.target.value)))}
              min={0}
            />
          </div>
        </div>

        {/* Loop toggle */}
        <div className="atlas-audio-config__loop-row">
          <span id={loopLabelId} className="atlas-audio-config__label">{t('audio.loop')}</span>
          <ToggleSwitch size="s" labelledBy={loopLabelId} value={loop} onChange={() => setLoop(!loop)} />
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

  const container = portalHost().createDiv({ cls: 'atlas-vtt-plugin atlas-vtt-root' });

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
