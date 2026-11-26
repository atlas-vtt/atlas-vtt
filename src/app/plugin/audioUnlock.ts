import type { Plugin } from 'obsidian';
import { inEveryDocument } from '../platform/atlasDocuments';
import { resetAudioUnlock, watchForGesture } from '../sound/engine/audioUnlock';

/**
 * Lets Atlas' sound start with the user's first tap or key in any of its windows: dice, ambience
 * and music whose audio context was made before that would otherwise stay silent.
 */
export function registerAudioUnlock(plugin: Plugin): void {
  inEveryDocument(plugin, watchForGesture);
  plugin.register(resetAudioUnlock);
}
