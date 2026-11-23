import type { Annotation, TextAnnotation } from '../../annotations/annotationTypes';
import type { ContextMenuEntry } from '../../react/components/context-menu/AtlasContextMenu';
import { annotationActions, type AnnotationActionExtras, type AnnotationActionStore } from '../../selection/annotationActionList';
import { selectionMenu } from '../../selection/selectionMenu';

/** What the menu's rows do to the scene. */
export type AnnotationMenuStore = AnnotationActionStore;

/**
 * The context menu of drawings and texts, one for both, row by row what can be done with them
 * (`annotationActions`, which the bar above a selection is drawn from too).
 */
export function annotationMenu(
  selected: readonly Annotation[], clicked: Annotation | null, store: AnnotationMenuStore, edit: (text: TextAnnotation) => void,
  styles: readonly ContextMenuEntry[] = [], extras: AnnotationActionExtras = {},
): ContextMenuEntry[] {
  return selectionMenu(annotationActions(selected, clicked, store, edit, styles, extras));
}
