import type { Plugin } from 'obsidian';
import { inEveryDocument } from './atlasDocuments';
import { deviceProfile, type DeviceProfile } from './deviceProfile';

/** On the `body` of every document Atlas renders in while the pointer is coarse; menus and dialogs are portaled there, so one place covers them. */
export const POINTER_ATTRIBUTE = 'data-atlas-pointer';

/**
 * Marks every window's `body` with the pointer's kind (`atlas-coarse-pointer` in `_mixins.scss`
 * selects it), follows the pointer as it changes, and takes the mark away with Atlas.
 */
export function registerPointerAttribute(plugin: Plugin, profile: DeviceProfile = deviceProfile()): void {
  const bodies = new Set<HTMLElement>();
  const mark = (body: HTMLElement): void => {
    if (profile.pointer === 'coarse') body.setAttribute(POINTER_ATTRIBUTE, 'coarse');
    else body.removeAttribute(POINTER_ATTRIBUTE);
  };
  inEveryDocument(plugin, (doc) => {
    const { body } = doc;
    bodies.add(body);
    mark(body);
    return () => {
      bodies.delete(body);
      body.removeAttribute(POINTER_ATTRIBUTE);
    };
  });
  plugin.register(profile.onPointerChange(() => bodies.forEach(mark)));
}
