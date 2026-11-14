import { readDrawing, readText } from '../../annotations/annotationList';
import { placedBy, placesBy, type Transform } from '../../annotations/annotationTransform';
import type { Annotation, AnnotationPlace } from '../../annotations/annotationTypes';
import type { PlaceWriter } from './drawToolState';

/** What shows annotations where a gesture would leave them (`AnnotationLayer`). */
export interface EditLayer {
  preview(shown: readonly Annotation[]): void;
  previewMove(annotations: readonly Annotation[], dx: number, dy: number): void;
  endPreview(): void;
}

export type { PlaceWriter };

const isMove = (transform: Transform): boolean => transform.a === 1 && transform.b === 0 && transform.c === 0 && transform.d === 1 && transform.turn === 0;

/** `annotation` as it reads with `place` written to it; null where that is no annotation any more. */
function placed(annotation: Annotation, place: AnnotationPlace): Annotation | null {
  const record = { ...annotation.record, ...place };
  return annotation.kind === 'text' ? readText(annotation.id, record) : readDrawing(annotation.id, record);
}

/** Where `annotation` lies as its record has it: what puts it back. A field the record lacks is removed again. */
function placeOf(annotation: Annotation): AnnotationPlace {
  if (annotation.kind === 'text') {
    const { x, y, rotation, scale } = annotation.record;
    return { x, y, rotation, scale };
  }
  const { points, anchors, holes, rotation, width } = annotation.record;
  return { points, anchors, holes, rotation, width };
}

/**
 * One gesture on annotations as it is shown and written. While it lasts, the layer shows where it
 * would leave them and the store hears nothing; `commit` writes that in one write, and `drop`
 * shows them as their records have them again. So a gesture is one undo step, and one that is
 * dropped leaves none and has nothing to put back.
 *
 * With tokens it is otherwise (`live`): tokens that are dragged or turned write the store at
 * every step, inside one undo step that whoever moves them holds open, and what is selected with
 * them is marked by what the store says. There every step is written at once, and a drop writes
 * back where the annotations lay.
 */
export class AnnotationEdit {
  private transform: Transform | null = null;
  private places: Readonly<Record<string, AnnotationPlace>> | null = null;
  /** Something was drawn again for the preview: a move after it must be drawn too, not only moved. */
  private drawn = false;
  private over = false;

  /** `touched` is told when a text was scaled or placed on its view alone. */
  constructor(
    readonly annotations: readonly Annotation[],
    private readonly layer: EditLayer,
    private readonly touched: () => void = () => undefined,
    private readonly live: PlaceWriter | null = null,
  ) {}

  /** Whether the gesture has changed anything yet. */
  get changed(): boolean {
    return this.transform !== null || this.places !== null;
  }

  /** Shows every annotation as `transform` leaves it. A move moves what they are drawn in; anything else draws them again. */
  show(transform: Transform): void {
    if (this.over) return;
    this.transform = transform;
    this.places = null;
    if (this.live) {
      this.live(placesBy(this.annotations, transform));
      return;
    }
    if (isMove(transform) && !this.drawn) this.layer.previewMove(this.annotations, transform.tx, transform.ty);
    else this.preview((annotation) => placedBy(annotation, transform));
    this.touched();
  }

  /** Shows the annotations named in `places` as those leave them (a line whose point is dragged). */
  showPlaces(places: Readonly<Record<string, AnnotationPlace>>): void {
    if (this.over) return;
    this.transform = null;
    this.places = places;
    if (this.live) {
      this.live(places);
      return;
    }
    this.preview((annotation) => places[annotation.id] ?? null);
    this.touched();
  }

  /** Writes what was last shown, if anything, and ends the gesture; whether it changed something. */
  commit(write: PlaceWriter): boolean {
    if (this.over) return false;
    const places = this.places ?? (this.transform ? placesBy(this.annotations, this.transform) : null);
    // Written before the preview ends: the layer draws the new records, and never the old ones between.
    if (places && !this.live) write(places, this.places ? undefined : this.transform ?? undefined);
    this.end();
    return places !== null;
  }

  /** Ends the gesture with nothing changed: everything is shown, and lies, as it did. */
  drop(): void {
    if (this.over) return;
    if (this.live && this.changed) this.live(Object.fromEntries(this.annotations.map((annotation) => [annotation.id, placeOf(annotation)])));
    this.end();
  }

  private preview(place: (annotation: Annotation) => AnnotationPlace | null): void {
    this.drawn = true;
    this.layer.preview(this.annotations.flatMap((annotation) => {
      const at = place(annotation);
      return at ? placed(annotation, at) ?? [] : [];
    }));
  }

  private end(): void {
    this.over = true;
    if (this.live) return;
    this.layer.endPreview();
    this.touched();
  }
}
