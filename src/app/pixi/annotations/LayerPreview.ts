import type { Container } from 'pixi.js';
import type { Annotation } from '../../annotations/annotationTypes';
import { placeTextElementView } from '../textElementView';

/** What the preview reads and marks of one annotation as the layer draws it. */
export interface PreviewEntry {
  /** The annotation as its record has it. */
  readonly annotation: Annotation;
  /** What it is drawn in; null until a picture first shows it. */
  readonly node: Container | null;
  readonly kind: 'text' | 'stamp' | 'ink';
  /** Its node shows where a gesture under way would leave it, not what its record says. */
  previewed: boolean;
}

const kindOf = (annotation: Annotation): PreviewEntry['kind'] => (annotation.kind === 'text' ? 'text' : annotation.shape === 'stamp' ? 'stamp' : 'ink');

/**
 * Shows annotations of an `AnnotationLayer` where a gesture under way would leave them, before the
 * store hears of it, and as their records have them again once the gesture wrote or was dropped.
 * What no picture has shown yet is shown by none now either.
 */
export class LayerPreview {
  /** The texts set anew for the preview under way: from then on each of its steps sets them anew. */
  private readonly reset = new Set<PreviewEntry>();

  /**
   * `entry` finds what an annotation of the layer's list is drawn in (by its kind and id), `all`
   * lists every one, and `draw` draws an entry from its record, or as the annotation handed in.
   */
  constructor(
    private readonly entry: (annotation: Annotation) => PreviewEntry | undefined,
    private readonly all: () => Iterable<PreviewEntry>,
    private readonly draw: (entry: PreviewEntry, shown?: Annotation) => void,
  ) {}

  /**
   * Shows `shown` in the place of the list's own annotations of their ids, until `endPreview`. A
   * text whose words are set as its record has them is only placed; one that wraps elsewhere (a
   * side handle changes its width) is set anew, and a drawing is drawn again.
   */
  preview(shown: readonly Annotation[]): void {
    for (const annotation of shown) {
      const entry = this.entry(annotation);
      if (!entry?.node || kindOf(annotation) !== entry.kind) continue;
      if (annotation.kind === 'text' && !this.reset.has(entry) && setAlike(entry.annotation, annotation)) {
        placeTextElementView(entry.node, annotation);
      } else {
        if (annotation.kind === 'text') this.reset.add(entry);
        this.draw(entry, annotation);
      }
      entry.previewed = true;
    }
  }

  /**
   * Shows `annotations` moved by (dx, dy) from where their records have them, until `endPreview`.
   * Nothing is drawn again: what they are drawn in is moved.
   */
  previewMove(annotations: readonly Annotation[], dx: number, dy: number): void {
    for (const annotation of annotations) {
      const entry = this.entry(annotation);
      const node = entry?.node;
      if (!entry || !node) continue;
      // A line is drawn in the world's own coordinates; a text and a stamp stand at their place.
      const base = annotation.kind === 'text' ? annotation : annotation.shape === 'stamp' ? annotation.points[0]! : { x: 0, y: 0 };
      node.position.set(base.x + dx, base.y + dy);
      entry.previewed = true;
    }
  }

  /** Shows every annotation as its record has it again: after a gesture wrote what it showed, or was dropped. */
  endPreview(): void {
    this.reset.clear();
    for (const entry of this.all()) {
      if (entry.previewed && entry.node) this.draw(entry);
      entry.previewed = false;
    }
  }
}

/** Whether a text shown in the place of `record` has its words set as the record has them: only where it stands differs. */
function setAlike(record: Annotation, shown: Annotation): boolean {
  return record.kind === 'text' && shown.kind === 'text' && record.width === shown.width && record.breaks === shown.breaks && record.text === shown.text;
}
