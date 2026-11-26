import type { Plugin } from 'obsidian';
import { watchInput } from '../packages/components/primitives/lastInput';
import { inEveryDocument } from './atlasDocuments';

/** Notes what the user last used (a mouse, a pen, a finger, a key) in every window Atlas renders in, for as long as Atlas is loaded. */
export function registerLastInput(plugin: Plugin): void {
  inEveryDocument(plugin, watchInput);
}
