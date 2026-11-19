import type { AnnotationPlace, DrawMode, TextChanges, TextInput } from '../../annotations/annotationTypes';
import type { Transform } from '../../annotations/annotationTransform';
import type { OffMapFlag } from '../../tokens/offMap';
import type { DrawingStroke, TextElement } from '../../types';
import type { ViewState } from '../../types/viewState';

/** What tells whether the Draw tool is in hand, and in which mode. */
export type DrawToolState = Pick<ViewState, 'activeTool' | 'drawTool'>;

/** The mode the Draw tool is in while it is the tool in hand; null while another tool is. */
export function activeDrawMode(state: DrawToolState): DrawMode | null {
  return state.activeTool === 'draw' ? state.drawTool.mode : null;
}

/**
 * The drawings and texts a view holds, as selecting and typing read them, with the tokens that may
 * be selected with them. A view's store holds every kind of object; whoever has only drawings and
 * texts (a page that lets its player change their own) hands in those, and no tokens.
 */
export interface AnnotationObjects {
  drawings: Record<string, DrawingStroke>;
  texts: Record<string, TextElement>;
  tokens: Readonly<Record<string, OffMapFlag>>;
}

/** What of a view's state says which annotations are selected and what takes the pointer. */
export type SelectionState = Pick<ViewState, 'levels' | 'viewedLevel' | 'selectedIds' | 'activeTool' | 'drawTool'> & { objects: AnnotationObjects };

/**
 * Writes where annotations lie (`placeAnnotations`): one write. `by` is the one map of the plane
 * that left them there, where a gesture moved, turned or scaled them as one; none for places set
 * each by itself (a line's point, a text's width).
 */
export type PlaceWriter = (places: Readonly<Record<string, AnnotationPlace>>, by?: Transform) => void;

/** What selecting and reshaping read and write of a view's store. */
export interface SelectingState extends SelectionState {
  /** The view is a players' own: nothing is selected or reshaped there. Unset: it is not. */
  isPlayerView?: boolean;
  setSelection(ids: string[]): void;
  placeAnnotations: PlaceWriter;
}

/** A store as selecting and reshaping use it. */
export interface SelectingStore {
  getState(): SelectingState;
}

/** What typing a text on the map reads and writes of a view's store. */
export interface TypingState extends SelectionState, Pick<ViewState, 'grid' | 'mapPath' | 'isMapLoading'>, Partial<Pick<ViewState, 'isDMScreenOpen' | 'isCommandPaletteOpen' | 'isAssetManagerOpen'>> {
  setSelection(ids: string[]): void;
  addText(data: TextInput): string;
  updateText(id: string, changes: TextChanges): void;
  deleteAnnotations(ids: readonly string[]): void;
}

/** A store as typing uses it. */
export interface TypingStore {
  getState(): TypingState;
}
