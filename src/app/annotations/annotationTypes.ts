/**
 * Annotations as data: what the Draw tool makes. A drawing is a `DrawingStroke` in
 * `objects.drawings`, a text a `TextElement` in `objects.texts`; both arrive from a map file
 * unchecked, so everything reads them through `annotationList`, which answers in the read forms
 * below. Pure types and limits, shared with whatever draws or sends them.
 */

import type { DrawingStroke, TextElement } from '../types';
import type { Point } from '../types/visionTypes';

/** The drawings one level may have, and the most a list reads (the online message's limit too). */
export const MAX_DRAWINGS = 2000;
/** The texts one level may have, and the most a list reads. */
export const MAX_TEXTS = 500;
/**
 * The points one drawing may have; one with more is no annotation. Far above what a hand draws in
 * one stroke (a pen that was never thinned leaves a point per pointer move: three minutes without
 * lifting at 120 Hz), so no drawing made before is passed over.
 */
export const MAX_STROKE_POINTS = 20_000;
/**
 * The characters one text may have, as a string counts them: a longer one reads cut to this, and
 * the field takes no more. The message to online players carries as many (`MAX_TEXT_LENGTH` in
 * `online/protocol/annotations.ts`): the two must stay one number, which a test holds, since this
 * file is shared code and cannot read that one.
 */
export const MAX_TEXT_LENGTH = 2000;
/** The rings cut out of one drawing's fill (`DrawingStroke.holes`); a drawing with more reads without the rest. */
export const MAX_HOLES = 256;
/** The longest `group` and `by` a reader takes; a longer one reads as unset. */
export const MAX_ANNOTATION_NAME = 128;
/** The points an ellipse is sampled at, at even steps around it; its `points` are these and the first again. */
export const ELLIPSE_STEPS = 64;

/** The side of a cell on a map without a grid, world pixels: what sizes are shares of there. */
export const DEFAULT_CELL = 70;

export type DrawSize = 's' | 'm' | 'l' | 'xl';
export const DRAW_SIZES: readonly DrawSize[] = ['s', 'm', 'l', 'xl'];

/**
 * What a drawing is, as its handles take it: `'ellipse'` is a record of type `'circle'`, `'stamp'`
 * one of type `'icon'`, and `'free'` a drawing whose `type` or `anchors` no longer fit its points
 * (a cut piece, a shape an older Atlas moved): its points are all it is.
 */
export type DrawShape = 'pen' | 'line' | 'rectangle' | 'ellipse' | 'stamp' | 'free';
export type DrawFill = 'soft' | 'solid';
export type DrawDash = 'dashed' | 'dotted';
/** Arrowheads: at the end of the line, or at both ends. */
export type DrawEnds = 'end' | 'both';
/** Where an annotation lies: above the tokens (a record without `layer`), or on the floor. */
export type DrawLayer = 'above' | 'map';
export type TextLook = 'outline' | 'plate' | 'plain';
export const TEXT_LOOKS: readonly TextLook[] = ['outline', 'plate', 'plain'];
export type TextAlign = 'left' | 'center' | 'right';
export const TEXT_ALIGNS: readonly TextAlign[] = ['left', 'center', 'right'];
/** The faces the tool offers; a text keeps the `fontFamily` it was written with. */
export type DrawFont = 'medieval' | 'scifi' | 'mono';
export const DRAW_FONTS: readonly DrawFont[] = ['medieval', 'scifi', 'mono'];

/** What every read annotation says, whatever it is. */
interface ReadAnnotation {
  readonly id: string;
  /** Only the GM sees it. */
  readonly hidden: boolean;
  readonly layer: DrawLayer;
  readonly locked: boolean;
  /** Its place in the one order of drawings and texts, a later one lying over an earlier one; 0 for a record without one. */
  readonly order: number;
  readonly group: string | null;
  /** The online player who made it; null is the GM. */
  readonly by: string | null;
  /** The level it stands on, as the record names it; unset is the first. */
  readonly level: string | undefined;
}

/**
 * A drawing as it is read. `record` is the entry of `objects.drawings` it was read from, with
 * every field the file gave it: whoever writes a changed copy starts from the record, never from
 * this view, so nothing this Atlas does not know is lost.
 */
export interface DrawingAnnotation extends ReadAnnotation {
  readonly kind: 'drawing';
  readonly record: DrawingStroke;
  readonly shape: DrawShape;
  /**
   * World pixels, never empty. A stamp: its centre first. A rectangle: four corners and the first
   * again. An ellipse: 64 points of `c + a·cos t + b·sin t` and the first again. Otherwise the line.
   */
  readonly points: readonly Point[];
  /** The line ends where it began (at least three corners and the first again): it has an inside. Never for a stamp. */
  readonly closed: boolean;
  /** The line's width, or a stamp's footprint, world pixels; 0 is a fill without a line. */
  readonly width: number;
  /** '#rrggbb'. */
  readonly color: string;
  /** 0 to 1. */
  readonly opacity: number;
  /** A closed outline's inside, in `color`; null for none, and always for an open line. */
  readonly fill: DrawFill | null;
  /** Rings cut out of the fill, each at least three points; empty without a fill. */
  readonly holes: readonly (readonly Point[])[];
  /** A fill made cell by cell, which the Cells mode grows and clears; never without a fill. */
  readonly cells: boolean;
  readonly dash: DrawDash | null;
  /** Arrowheads; null for none, and always for a closed line. */
  readonly ends: DrawEnds | null;
  /**
   * The clicked points of a curved `'line'`, each of them one of `points` and in their order, the
   * first at its start and (on an open line) the last at its end; null for a line with corners.
   */
  readonly anchors: readonly Point[] | null;
  /** A stamp's symbol (a key the icon catalogue may or may not know); null for every other shape. */
  readonly icon: string | null;
  /** A stamp's turn, degrees; 0 for every other shape. */
  readonly rotation: number;
}

/** A text as it is read; `record` is the entry of `objects.texts` it was read from (see `DrawingAnnotation.record`). */
export interface TextAnnotation extends ReadAnnotation {
  readonly kind: 'text';
  readonly record: TextElement;
  /** Its centre, world pixels. */
  readonly x: number;
  readonly y: number;
  readonly text: string;
  /** World pixels before `scale`. */
  readonly fontSize: number;
  readonly scale: number;
  readonly fontFamily: string;
  /** '#rrggbb'. */
  readonly color: string;
  /** `'plate'` where the record has a background colour, else `'outline'` where it asks for one, else `'plain'`. */
  readonly look: TextLook;
  /** The plate's colour, '#rrggbb'; null without a plate. */
  readonly backgroundColor: string | null;
  readonly padding: number;
  readonly borderRadius: number;
  /** The plate's opacity, 0 to 1. */
  readonly opacity: number;
  /** The width its words wrap at, world pixels before `scale`; null for a text as wide as its words. */
  readonly width: number | null;
  /** Where the wrapped lines break (indexes into `text`), if the record saved them. */
  readonly breaks: readonly number[] | null;
  readonly align: TextAlign;
  readonly bold: boolean;
  readonly italic: boolean;
  /** Degrees. */
  readonly rotation: number;
}

export type Annotation = DrawingAnnotation | TextAnnotation;

/** A drawing as it is handed to the store, which gives it its id, its time and, without one, its order and level. */
export type DrawingInput = Omit<DrawingStroke, 'id' | 'kind' | 'timestamp'>;
/** A text as it is handed to the store. */
export type TextInput = Omit<TextElement, 'id' | 'kind'>;

/** What no change to a drawing or a text writes: who made it, and its level, which only the level tools change. */
type Fixed = 'by' | 'level';

/** Changes to drawings: a field given as undefined is removed. */
export type DrawingChanges = { [Field in Exclude<keyof DrawingInput, Fixed>]?: DrawingInput[Field] | undefined };
/** Changes to texts: a field given as undefined is removed. */
export type TextChanges = { [Field in Exclude<keyof TextInput, Fixed>]?: TextInput[Field] | undefined };
/**
 * Changes to annotations of either kind (`updateAnnotations`). A field only one kind has (`points`,
 * `text`) is written to that kind alone; `color`, `rotation`, `hidden`, `layer`, `locked`, `order`
 * and `group` to both. `width` and `opacity` are a drawing's here (a line's width, its see-through
 * ink): on a text they are its wrap width and its plate's opacity, which `placeAnnotations` and
 * `updateText` write.
 */
export type AnnotationChanges = DrawingChanges & TextChanges;

/**
 * Where one annotation lies after its group was moved, turned or scaled (`placeAnnotations`): the
 * fields of its geometry, each its own kind's (`width` is a line's width or a stamp's footprint on
 * a drawing, the wrap width on a text, which goes with the `breaks` its lines then have).
 */
export type AnnotationPlace = Pick<AnnotationChanges, 'points' | 'anchors' | 'holes' | 'x' | 'y' | 'rotation' | 'scale' | 'width' | 'fontSize' | 'breaks'>;

/** The fields of a drawing and of a text that the store's changes write; anything else in a change is passed over. */
export const DRAWING_FIELDS: readonly (keyof DrawingChanges)[] = [
  'type', 'points', 'color', 'width', 'opacity', 'icon', 'fill', 'holes', 'dash', 'ends', 'anchors', 'rotation',
  'hidden', 'layer', 'locked', 'order', 'group',
];
export const TEXT_FIELDS: readonly (keyof TextChanges)[] = [
  'x', 'y', 'text', 'fontSize', 'fontFamily', 'color', 'backgroundColor', 'padding', 'borderRadius', 'opacity', 'width', 'height',
  'align', 'bold', 'italic', 'rotation', 'scale', 'outline', 'breaks', 'hidden', 'layer', 'locked', 'order', 'group',
];
/** The fields of a text that a change to annotations of either kind writes: all but the two that are a drawing's there. */
export const TEXT_FIELDS_BESIDE_DRAWINGS: readonly (keyof TextChanges)[] = TEXT_FIELDS.filter((field) => field !== 'width' && field !== 'opacity');

/** What the Draw tool does with a press. */
export type DrawMode = 'select' | 'pen' | 'line' | 'rectangle' | 'ellipse' | 'text' | 'stamp' | 'cells' | 'eraser';
export const DRAW_MODES: readonly DrawMode[] = ['select', 'pen', 'line', 'rectangle', 'ellipse', 'text', 'stamp', 'cells', 'eraser'];

/** The Draw tool's choices, held in the view's store: its bars set them, the tool reads them. Never saved with the scene. */
export interface DrawToolChoices {
  mode: DrawMode;
  /** '#rrggbb' of what is drawn next. */
  color: string;
  size: DrawSize;
  /** Players see what is drawn next. */
  players: boolean;
  layer: DrawLayer;
  /** The next line is half see-through. */
  seeThrough: boolean;
  dash: DrawDash | null;
  ends: DrawEnds | null;
  /** The next path made with Line is a curve through its clicked points. */
  curved: boolean;
  fill: DrawFill | null;
  font: DrawFont;
  look: TextLook;
  align: TextAlign;
  bold: boolean;
  italic: boolean;
  /** The symbol the Stamp mode places. */
  icon: string;
  /** The eraser removes each whole drawing it touches. */
  eraseWhole: boolean;
  /** Where the Cells mode's fills lie: its own choice, since a coloured cell is map more often than a mark. */
  cellsLayer: DrawLayer;
  /** The Cells mode clears cells where it would fill them. */
  cellsUnfill: boolean;
}

export const DEFAULT_DRAW_TOOL: DrawToolChoices = {
  mode: 'pen',
  color: '#ffffff',
  size: 'm',
  players: true,
  layer: 'above',
  seeThrough: false,
  dash: null,
  ends: null,
  curved: false,
  fill: null,
  font: 'medieval',
  look: 'outline',
  align: 'center',
  bold: false,
  italic: false,
  icon: 'door',
  eraseWhole: false,
  cellsLayer: 'map',
  cellsUnfill: false,
};

/** What `clearAnnotations` removes: the annotations above the tokens, all of the level, or the ones players made. */
export type ClearScope = 'above' | 'level' | 'players';
