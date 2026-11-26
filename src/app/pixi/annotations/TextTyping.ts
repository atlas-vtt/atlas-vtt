import type { Viewport } from 'pixi-viewport';
import { annotationRoom, readText, withinTextLength } from '../../annotations/annotationList';
import { isLocked } from '../../annotations/annotationLock';
import type { TextAnnotation } from '../../annotations/annotationTypes';
import { drawCell } from '../../annotations/drawSizes';
import { FONT_FAMILIES, madeText } from '../../annotations/madeText';
import { levelObjects } from '../../levels/levelObjects';
import type { Point } from '../../types/visionTypes';
import { textFontReady } from '../textFonts';
import { wordsOffset } from '../textElementView';
import { textBreaks, textLayout, type TextLayout } from '../textLayout';
import type { TypingState, TypingStore } from './drawToolState';
import { fieldLook, TextField } from './TextField';
import { anchorOf, centreFrom, typedWords } from './textTypingRules';
import { TypingWatch } from './TypingWatch';

export interface TextTypingDeps {
  readonly viewport: Viewport;
  readonly store: TypingStore;
  /** Whether the canvas shows the GM's view: a text is typed there alone. */
  gmView(): boolean;
  /** Hides the words of the text `id` on the canvas while its field shows them; null shows them again. */
  typing(id: string | null): void;
  /** Tells the GM that the level shown holds as many texts as it may. */
  full(): void;
  /** A text is being typed, or no longer: the selection's frame hides and shows by it. */
  changed(): void;
  /** What a press on leaves the keyboard with the field, as a selector: the tool's own bars. Unset, the Draw tool's bars. */
  readonly bars?: string;
}

/** What lies over the whole map once it is open: the GM then works there. */
const COVERS_MAP = ['isDMScreenOpen', 'isCommandPaletteOpen', 'isAssetManagerOpen'] as const;

interface Session {
  readonly field: TextField;
  /** The text that is edited; null for one that is new. */
  readonly id: string | null;
  /** The width a new text wraps at; null for one as wide as its words. An edited text's is its record's. */
  readonly width: number | null;
  /** The point of the words' box that stays where it is while the words change (`anchorOf`). */
  anchor: Point;
  /** The text as it would be written now, and how it is set. */
  draft: TextAnnotation;
  layout: TextLayout;
  /** The pixels to each of the text's units the field was last set for; null once the text is another. */
  shownAt: number | null;
}

/**
 * Typing a text on the map: a field (`TextField`) stands where the text stands, set as the text
 * is, and follows the camera in the view's tick. While it shows, the text's own drawing is hidden
 * on the canvas and the store hears nothing: what is typed is written once, when it is done
 * (`finish`), so one edit is one undo step and nobody else sees a half-typed text.
 *
 * Enter finishes, and so does a press anywhere but in the field and the tool's bars (the press
 * then does what it does there), another tool or mode, the players' picture on the canvas,
 * something opening over the map, the view being left and the window closing. Escape leaves the
 * text as it was, and drops a new one; so does another scene or level shown without a press,
 * where what was typed has no place. A text left empty is deleted. The words grow from the top
 * of their box, at the side their alignment names, so what was typed stays where it stands.
 *
 * The tool's bars change the text live: a new text follows the tool's choices, an edited one its
 * record, which the bars write. A press on the bars does not take the keyboard from the field
 * (`TypingWatch`).
 */
export class TextTyping {
  private session: Session | null = null;
  /** A new text waits for its face to load before its field opens. */
  private pending: (() => void) | null = null;
  private readonly watch: TypingWatch;

  constructor(private readonly deps: TextTypingDeps) {
    this.watch = new TypingWatch(() => this.canvas, () => this.finish(), deps.bars);
  }

  /** A text is being typed. */
  get active(): boolean {
    return this.session !== null;
  }

  /**
   * Opens the field for a new text, whose lines are centred. A click's text (`width` null) is as
   * wide as its words and stands with its middle at `at`; a dragged one starts at `at` and wraps
   * at `width`. Either way its first line is centred on `at` from top to bottom.
   */
  begin(at: Point, width: number | null): void {
    this.finish();
    const state = this.deps.store.getState();
    if (!this.deps.gmView()) return;
    if (annotationRoom(levelObjects(state)).texts <= 0) {
      this.deps.full();
      return;
    }
    if (!textFontReady(FONT_FAMILIES[state.drawTool.font])) {
      this.pending = (): void => this.begin(at, width);
      return;
    }
    const empty = this.drafted(null, width, '');
    if (!empty) return;
    // A width no narrower than one letter is high.
    const wrap = width === null ? null : Math.max(width, empty.fontSize);
    const draft = wrap === null ? empty : { ...empty, width: wrap };
    const layout = textLayout(draft);
    const anchor = { x: wrap === null ? at.x : at.x + wrap / 2, y: at.y - (layout.lineHeight * draft.scale) / 2 };
    this.open({ id: null, width: wrap, anchor, words: '', all: false });
  }

  /** Opens the field on a text of the map; nothing for a locked one. */
  edit(text: TextAnnotation): void {
    this.finish();
    const state = this.deps.store.getState();
    if (!this.deps.gmView() || text.locked || !levelObjects(state).texts[text.id] || !textFontReady(text.fontFamily)) return;
    // The bars show and change the style of what is selected: the text that is typed.
    if (state.selectedIds.length !== 1 || state.selectedIds[0] !== text.id) state.setSelection([text.id]);
    this.open({ id: text.id, width: null, anchor: anchorOf(text, textLayout(text), text), words: text.text, all: true });
  }

  /** Writes what was typed, in one write, and closes the field. */
  finish(): void {
    this.pending = null;
    const session = this.session;
    if (!session) return;
    const words = typedWords(session.field.value);
    const draft = this.drafted(session.id, session.width, words);
    const anchor = session.anchor;
    this.close();
    const state = this.deps.store.getState();
    if (!draft) return;
    const at = centreFrom(anchor, textLayout(draft), draft);
    const breaks = draft.width === null ? null : textBreaks(draft, draft.width);
    if (session.id === null) {
      if (words === '') return;
      if (annotationRoom(levelObjects(state)).texts <= 0) {
        this.deps.full();
        return;
      }
      const made = madeText(words, at, state.drawTool, drawCell(state.grid));
      state.setSelection([state.addText(draft.width === null || !breaks ? made : { ...made, width: draft.width, breaks })]);
      return;
    }
    const record = levelObjects(state).texts[session.id];
    if (!record || isLocked(record)) return;
    if (words === '') {
      state.deleteAnnotations([session.id]);
      return;
    }
    const moved = Math.hypot(at.x - record.x, at.y - record.y) > 1e-6;
    // What the field opened with is the text as it is read: a longer one from a file is written only once it was changed.
    if (words !== withinTextLength(record.text) || moved) state.updateText(session.id, { text: words, x: at.x, y: at.y, ...(breaks && { breaks }) });
  }

  /** Closes the field and writes nothing: an edited text says what it said, a new one is dropped. */
  cancel(): void {
    this.pending = null;
    if (this.session) this.close();
  }

  /** The view's state changed: the field follows the tool's choices and its text's record, and what ends the typing ends it. */
  follow(state: TypingState, previous: TypingState): void {
    const session = this.session;
    if (!session) {
      if (this.pending && (state.activeTool !== previous.activeTool || state.drawTool.mode !== previous.drawTool.mode || state.mapPath !== previous.mapPath)) this.pending = null;
      return;
    }
    // Another scene or level has none of this: every write lands on the level shown, and the text is not on it.
    // (A press that changes the level has finished the text before: this is a level changed by something else.)
    const record = session.id === null ? null : levelObjects(state).texts[session.id];
    if (state.mapPath !== previous.mapPath || state.viewedLevel !== previous.viewedLevel || state.isMapLoading || record === undefined) {
      this.cancel();
      return;
    }
    if (state.activeTool !== previous.activeTool || state.drawTool.mode !== previous.drawTool.mode || COVERS_MAP.some((open) => state[open] === true && previous[open] !== true)) {
      this.finish();
      return;
    }
    const restyled = session.id === null
      ? state.drawTool !== previous.drawTool || state.grid !== previous.grid
      : record !== levelObjects(previous).texts[session.id];
    if (restyled) this.apply(session, true);
  }

  /** A face has loaded: a text that waited for it opens, and the field is set in it. */
  fontsArrived(): void {
    const pending = this.pending;
    this.pending = null;
    if (pending) pending();
    else if (this.session) this.apply(this.session, true);
  }

  destroy(): void {
    this.finish();
  }

  private get canvas(): HTMLElement {
    return this.deps.viewport.options.events.domElement;
  }

  /** The text as it would be written with `words`, at the origin: its place is worked out from its anchor. Null where it cannot be read, or is gone. */
  private drafted(id: string | null, width: number | null, words: string): TextAnnotation | null {
    const state = this.deps.store.getState();
    if (id === null) {
      const made = madeText(words, { x: 0, y: 0 }, state.drawTool, drawCell(state.grid));
      return readText('', { id: '', kind: 'text', ...made, ...(width !== null && { width }) });
    }
    const record = levelObjects(state).texts[id];
    return record ? readText(id, { ...record, text: words, breaks: undefined }) : null;
  }

  private open(start: { id: string | null; width: number | null; anchor: Point; words: string; all: boolean }): void {
    const host = this.canvas.parentElement;
    const draft = this.drafted(start.id, start.width, start.words);
    if (!host || !draft) return;
    const field = new TextField(host, {
      input: () => {
        if (this.session) this.apply(this.session, false);
      },
      enter: () => this.finish(),
      escape: () => this.cancel(),
      blurred: () => this.watch.blurred(),
    });
    field.value = start.words;
    const session: Session = { field, id: start.id, width: start.width, anchor: start.anchor, draft, layout: textLayout(draft), shownAt: null };
    this.session = session;
    this.apply(session, false);
    this.deps.typing(start.id);
    this.watch.start(field);
    this.deps.viewport.options.ticker?.add(this.tick);
    field.focus(start.all);
    this.deps.changed();
  }

  private close(): void {
    const session = this.session;
    if (!session) return;
    this.session = null;
    this.watch.stop();
    this.deps.viewport.options.ticker?.remove(this.tick);
    session.field.destroy();
    this.deps.typing(null);
    this.deps.changed();
  }

  /**
   * Sets the field as its text is now. The words' box grows from its anchor; where the text's
   * face or size is another (`restyled`), the anchor is first taken anew from where the box lies.
   */
  private apply(session: Session, restyled: boolean): void {
    const draft = this.drafted(session.id, session.width, session.field.value);
    if (!draft) {
      this.cancel();
      return;
    }
    // A face that is still loading is waited for: the field stays as it is until `fontsArrived`.
    if (!textFontReady(draft.fontFamily)) return;
    if (restyled) session.anchor = anchorOf(session.draft, session.layout, draft);
    const layout = textLayout(draft);
    const at = centreFrom(session.anchor, layout, draft);
    session.draft = { ...draft, x: at.x, y: at.y };
    session.layout = layout;
    session.shownAt = null;
    this.place(session);
  }

  /**
   * Lays the field on its text's place as the camera shows it now. The field is set in the pixels
   * of the screen (its letters as large as the camera shows the text's), and only turned and moved
   * by its transform: a browser puts every line of text on a whole pixel of its own layout, which
   * a field set in the text's units and scaled up would show as lines a pixel or two off.
   */
  private place(session: Session): void {
    const { viewport } = this.deps;
    const { draft, layout } = session;
    const pixels = draft.scale * (Math.abs(viewport.scale.x) || 1);
    if (session.shownAt !== pixels) {
      session.shownAt = pixels;
      session.field.show(fieldLook(draft, layout, pixels));
    }
    const angle = (draft.rotation * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const centre = viewport.toScreen(draft.x, draft.y);
    // From the top left corner of the words' box, with the little PIXI's picture sets the letters off it.
    const off = wordsOffset(draft, layout);
    const left = (off.x - layout.width / 2) * pixels;
    const top = (off.y - layout.height / 2) * pixels;
    session.field.place({
      a: cos, b: sin, c: -sin, d: cos,
      tx: centre.x + this.canvas.offsetLeft + cos * left - sin * top,
      ty: centre.y + this.canvas.offsetTop + sin * left + cos * top,
    });
  }

  /** The camera moves without a word, so the field is laid on its text every frame. */
  private readonly tick = (): void => {
    if (this.session) this.place(this.session);
  };
}
