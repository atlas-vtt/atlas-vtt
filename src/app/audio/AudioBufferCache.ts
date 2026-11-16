import { TFile, type App } from 'obsidian';
import type { SoundRegistry } from './SoundRegistry';

/**
 * Lazy audio buffer cache. Decodes audio files on first use and caches
 * the resulting AudioBuffer for reuse across multiple AudioSource instances.
 */
export class AudioBufferCache {
  private cache: Map<string, AudioBuffer> = new Map();
  private loading: Map<string, Promise<AudioBuffer>> = new Map();
  private audioContext: AudioContext | null = null;
  private createContext: () => AudioContext;
  private app: App;
  private registry: SoundRegistry;

  /** The context is made with the first sound: most views never decode one, and each context costs an output stream. */
  constructor(createContext: () => AudioContext, app: App, registry: SoundRegistry) {
    this.createContext = createContext;
    this.app = app;
    this.registry = registry;
  }

  /** Get or decode a buffer for the given sound ID */
  async getBuffer(soundId: string): Promise<AudioBuffer | null> {
    const cached = this.cache.get(soundId);
    if (cached) return cached;

    const inflight = this.loading.get(soundId);
    if (inflight) return inflight;

    const meta = this.registry.getSound(soundId);
    if (!meta) {
      console.warn(`[AudioBufferCache] Unknown sound ID: ${soundId}`);
      return null;
    }

    const promise = this.loadAndDecode(meta.path, soundId);
    this.loading.set(soundId, promise);

    try {
      const buffer = await promise;
      this.cache.set(soundId, buffer);
      return buffer;
    } catch (err) {
      console.error(`[AudioBufferCache] Failed to load sound: ${soundId}`, err);
      return null;
    } finally {
      this.loading.delete(soundId);
    }
  }

  private async loadAndDecode(path: string, _soundId: string): Promise<AudioBuffer> {
    let arrayBuffer: ArrayBuffer;

    if (path.startsWith(this.registry.getPluginDir())) {
      // Built-in sound: the plugin directory is not indexed by the Vault, so read it through the adapter
      arrayBuffer = await this.app.vault.adapter.readBinary(path);
    } else {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) {
        throw new Error(`Sound file not found in vault: ${path}`);
      }
      arrayBuffer = await this.app.vault.readBinary(file);
    }

    this.audioContext ??= this.createContext();
    return this.audioContext.decodeAudioData(arrayBuffer);
  }

  /** Check if a buffer is already cached (no loading) */
  isLoaded(soundId: string): boolean {
    return this.cache.has(soundId);
  }

  /** Release all cached buffers and the audio context they were decoded with */
  dispose(): void {
    this.cache.clear();
    this.loading.clear();
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => undefined);
    }
  }
}
