import { annotationList } from '../../annotations/annotationList';
import type { AnnotationPlace } from '../../annotations/annotationTypes';
import { levelObjects } from '../../levels/levelObjects';
import type { ViewAtlasState } from '../../storeFactory';
import { runUntracked } from '../../stores/history';
import { textFontReady } from '../textFonts';
import { textBreaks } from '../textLayout';

/**
 * Gives every text of the level shown that has a width, and no saved line breaks, its breaks.
 *
 * Two devices can break the same text elsewhere (their browsers measure a run a little
 * differently), so a text keeps where its lines broke on the device that set it, and every device
 * draws it from that. Typing a text and dragging its side save the breaks with what they write.
 * A change that sets a text in other letters without measuring it (the bars' font, size, bold and
 * italic) takes its breaks off; this puts them back at once, as part of that change's undo step.
 * A locked text keeps what it has, and a text whose face is still loading waits for it.
 */
export function keepTextBreaks(store: { getState(): ViewAtlasState }): void {
  const state = store.getState();
  const places: Record<string, AnnotationPlace> = {};
  for (const annotation of annotationList(levelObjects(state))) {
    if (annotation.kind !== 'text' || annotation.width === null || annotation.breaks !== null) continue;
    if (annotation.locked || !textFontReady(annotation.fontFamily)) continue;
    // A text read cut to the most one may have is the file's until it is edited: nothing is written into it.
    if (annotation.text !== annotation.record.text) continue;
    places[annotation.id] = { breaks: textBreaks(annotation, annotation.width) };
  }
  if (Object.keys(places).length > 0) runUntracked(store, () => state.placeAnnotations(places));
}
