import type { StoreApi } from 'zustand';
import type { ViewAtlasState } from '../storeFactory';
import type { AudioSource } from '../types/audioTypes';
import type { AudioBufferCache } from './AudioBufferCache';
import { countWallsBetween, computeWallDampening, computeDistanceGain } from './audioOcclusion';
import { runInBackground } from '../utils/backgroundTask';
import { mapTokens } from '../tokens/offMap';

const UPDATE_THROTTLE_MS = 100; // ~10fps during drag
const FADE_DURATION = 0.2; // 200ms fade for start/stop
const SPATIAL_SCALE = 100; // Normalize world pixels to Web Audio units
const DEFAULT_WALL_DAMPEN = 0.25;

interface ActiveSource {
  sourceNode: AudioBufferSourceNode;
  gainNode: GainNode;
  pannerNode: PannerNode;
  audioSourceId: string;
  soundId: string;
}

export class SpatialAudioEngine {
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private activeSources: Map<string, ActiveSource> = new Map();
  private bufferCache: AudioBufferCache;
  private store: StoreApi<ViewAtlasState>;
  private unsubscribers: Array<() => void> = [];
  private lastUpdateTime: number = 0;
  private isDisposed: boolean = false;
  private wallDampenFactor: number = DEFAULT_WALL_DAMPEN;

  constructor(store: StoreApi<ViewAtlasState>, bufferCache: AudioBufferCache) {
    this.store = store;
    this.bufferCache = bufferCache;
    this.setupStoreSubscriptions();
  }

  private ensureContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
      this.compressor = this.audioContext.createDynamicsCompressor();
      this.compressor.threshold.value = -24;
      this.compressor.knee.value = 30;
      this.compressor.ratio.value = 12;
      this.compressor.attack.value = 0.003;
      this.compressor.release.value = 0.25;
      this.compressor.connect(this.audioContext.destination);

      this.masterGain = this.audioContext.createGain();
      this.masterGain.gain.value = 1.0;
      this.masterGain.connect(this.compressor);
    }
    return this.audioContext;
  }

  private setupStoreSubscriptions(): void {
    let prevAudioDirty = false;
    const unsub1 = this.store.subscribe((state) => {
      const dirty = state._audioDirty;
      if (dirty && !prevAudioDirty) {
        this.scheduleUpdate();
      }
      prevAudioDirty = dirty;
    });
    this.unsubscribers.push(unsub1);

    // Mark dirty on any objects change (catches hydration, bulk loads, undo/redo)
    let prevObjects = this.store.getState().objects;
    const unsubObjects = this.store.subscribe((state) => {
      if (state.objects !== prevObjects) {
        prevObjects = state.objects;
        state.markAudioDirty();
      }
    });
    this.unsubscribers.push(unsubObjects);

    let prevSelectedIds: string[] = [];
    const unsub2 = this.store.subscribe((state) => {
      const curr = state.selectedIds;
      if (curr !== prevSelectedIds) {
        prevSelectedIds = curr;
        this.onSelectionChanged();
      }
    });
    this.unsubscribers.push(unsub2);
  }

  private scheduleUpdate(): void {
    const now = performance.now();
    if (now - this.lastUpdateTime < UPDATE_THROTTLE_MS) return;
    this.lastUpdateTime = now;
    this.update();
  }

  /** Main update loop — recompute all spatial audio parameters */
  private update(): void {
    if (this.isDisposed) return;

    const state = this.store.getState();
    const dirty = state.consumeAudioDirty();
    if (!dirty && this.activeSources.size === 0) return;

    const selectedToken = this.getSelectedToken(state);
    if (!selectedToken) {
      this.stopAllSources();
      return;
    }

    if (state.activeTool === 'audio') {
      this.stopAllSources();
      return;
    }

    const listenerX = selectedToken.x;
    const listenerY = selectedToken.y;
    const audioSources = state.objects.audios;
    const walls = state.objects.walls;

    const inRangeSources = new Set<string>();
    for (const source of Object.values(audioSources)) {
      const dx = source.x - listenerX;
      const dy = source.y - listenerY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < source.outerRadius) {
        inRangeSources.add(source.id);
      }
    }

    // Stop sources that went out of range
    for (const id of this.activeSources.keys()) {
      if (!inRangeSources.has(id)) {
        this.stopSource(id);
      }
    }

    // Start or update in-range sources
    for (const sourceId of inRangeSources) {
      const source = audioSources[sourceId];
      if (!source) continue;

      const dx = source.x - listenerX;
      const dy = source.y - listenerY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      const distanceGain = computeDistanceGain(distance, source.innerRadius, source.outerRadius);
      const wallCount = countWallsBetween(
        { x: source.x, y: source.y },
        { x: listenerX, y: listenerY },
        walls,
      );
      const wallGain = computeWallDampening(wallCount, this.wallDampenFactor);
      const finalGain = source.volume * distanceGain * wallGain;

      const active = this.activeSources.get(sourceId);
      if (active) {
        this.updateSourcePosition(active, dx, dy, finalGain);
      } else {
        runInBackground(this.startSource(source, dx, dy, finalGain), `Starting audio source ${source.id}`);
      }
    }
  }

  private getSelectedToken(state: ViewAtlasState): { x: number; y: number } | null {
    if (state.selectedIds.length === 0) return null;

    for (const id of state.selectedIds) {
      const token = mapTokens(state.objects)[id];
      if (token) return { x: token.x, y: token.y };
    }

    return null;
  }

  private async startSource(
    source: AudioSource,
    dx: number,
    dy: number,
    gain: number,
  ): Promise<void> {
    const buffer = await this.bufferCache.getBuffer(source.soundId);
    if (!buffer || this.isDisposed) return;

    // Source might have been started while we were loading
    if (this.activeSources.has(source.id)) return;

    const ctx = this.ensureContext();

    const sourceNode = ctx.createBufferSource();
    sourceNode.buffer = buffer;
    sourceNode.loop = source.loop;

    const gainNode = ctx.createGain();
    gainNode.gain.value = 0; // Start silent for fade-in

    const pannerNode = ctx.createPanner();
    pannerNode.panningModel = 'equalpower';
    pannerNode.distanceModel = 'linear';
    pannerNode.refDistance = 1;
    pannerNode.maxDistance = 10000;
    pannerNode.rolloffFactor = 0; // We handle distance ourselves
    pannerNode.positionX.value = dx / SPATIAL_SCALE;
    pannerNode.positionY.value = 0;
    pannerNode.positionZ.value = dy / SPATIAL_SCALE;

    sourceNode.connect(gainNode);
    gainNode.connect(pannerNode);
    pannerNode.connect(this.masterGain!);

    sourceNode.start();

    // Fade in
    gainNode.gain.linearRampToValueAtTime(gain, ctx.currentTime + FADE_DURATION);

    this.activeSources.set(source.id, {
      sourceNode,
      gainNode,
      pannerNode,
      audioSourceId: source.id,
      soundId: source.soundId,
    });
  }

  private updateSourcePosition(active: ActiveSource, dx: number, dy: number, gain: number): void {
    if (!this.audioContext) return;

    const now = this.audioContext.currentTime;
    active.pannerNode.positionX.linearRampToValueAtTime(dx / SPATIAL_SCALE, now + 0.05);
    active.pannerNode.positionZ.linearRampToValueAtTime(dy / SPATIAL_SCALE, now + 0.05);
    active.gainNode.gain.linearRampToValueAtTime(gain, now + 0.05);
  }

  private stopSource(id: string): void {
    const active = this.activeSources.get(id);
    if (!active || !this.audioContext) return;

    const now = this.audioContext.currentTime;
    active.gainNode.gain.linearRampToValueAtTime(0, now + FADE_DURATION);

    // Capture references before deleting from map
    const { sourceNode, gainNode, pannerNode } = active;

    // Schedule actual stop after fade completes
    window.setTimeout(() => {
      try {
        sourceNode.stop();
        sourceNode.disconnect();
        gainNode.disconnect();
        pannerNode.disconnect();
      } catch {
        // Source may already be stopped
      }
    }, FADE_DURATION * 1000 + 50);

    this.activeSources.delete(id);
  }

  private stopAllSources(): void {
    for (const id of Array.from(this.activeSources.keys())) {
      this.stopSource(id);
    }
  }

  private onSelectionChanged(): void {
    this.stopAllSources();
    this.store.getState().markAudioDirty();
  }

  /** Preview a sound at flat volume (for audio tool authoring) */
  async previewSound(soundId: string): Promise<void> {
    const buffer = await this.bufferCache.getBuffer(soundId);
    if (!buffer) return;

    const ctx = this.ensureContext();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = false;

    const gain = ctx.createGain();
    gain.gain.value = 0.5;

    source.connect(gain);
    gain.connect(this.masterGain!);
    source.start();

    // Stop after 3 seconds for preview
    window.setTimeout(() => {
      try {
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);
        window.setTimeout(() => {
          try { source.stop(); } catch { /* already stopped */ }
          source.disconnect();
          gain.disconnect();
        }, 350);
      } catch { /* already stopped */ }
    }, 3000);
  }

  dispose(): void {
    this.isDisposed = true;
    this.stopAllSources();

    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers = [];

    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }

    this.masterGain = null;
    this.compressor = null;
  }
}
