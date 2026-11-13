import {
  type DrawMine, type DrawOwn, type DrawRefusal, type GmMessage, type PlayerDrawAdd, type PlayerDrawChange, type PlayerDrawErase, type PlayerDrawMessage,
  type PlayerDrawPoints, type PlayerDrawRemove, type PlayerDrawText, type PlayerStroke,
} from '../protocol/index.ts';
import { AnnotationIndex } from '../../annotations/annotationHit';
import { annotationList, annotationRoom, readDrawing, readText } from '../../annotations/annotationList';
import { orderOnTop } from '../../annotations/annotationStack';
import { placedBy } from '../../annotations/annotationTransform';
import type { Annotation, AnnotationPlace } from '../../annotations/annotationTypes';
import { drawCell, eraserRadius } from '../../annotations/drawSizes';
import { sweepChange } from '../../annotations/eraseSweep';
import { madeText } from '../../annotations/madeText';
import { levelObjects } from '../../levels/levelObjects';
import { placedOnViewedLevel } from '../../levels/sceneLevels';
import { styleWrites, type StyleWrite } from '../../packages/components/toolbar/drawStyle';
import { changeDrawing, changeText, newAnnotationId, newDrawing } from '../../stores/annotationWrites';
import type { DrawingStroke, TextElement } from '../../types';
import type { SceneState, SceneStore } from './atlasView.ts';
import { allNearEdge, drawingPoints, drawRate, maxWrap, nearEdge, playerDrawing, playerUse, pointsOf, styleChoice, textChoices, transformOf, withinUse } from './drawCheck.ts';
import { MoveRate, type MapSize } from './moveCheck.ts';
import {
  applyStyle, DRAWING_PLACE_FIELDS, erasedUse, isOwn, ownAnchors, placeAllowed, placedAnnotations, removeFrom, TEXT_PLACE_FIELDS, useAfter, wordsPlace, WORDS_FIELDS,
} from './playerDrawingRules.ts';
import { PlayerAliases, PointsAhead } from './playerDrawingState.ts';

type Request = Exclude<PlayerDrawMessage, PlayerStroke | PlayerDrawPoints>;

export interface PlayerDrawingPorts {
  send(body: GmMessage, to: string): void;
  now(): number;
  /** Whether the GM lets players draw now (Atlas's setting, read at every message). */
  allowed(): boolean;
  /** Whether a player sits at the table and looks at this floor. */
  seated(player: string): boolean;
  /** The map's size, which drawings must stay near; null while it is unknown. */
  map(): MapSize | null;
  /** A request was dealt with: the players are told what is theirs now. */
  changed(): void;
  /** The drawing a player was making (the request `n`) was made, or was not. */
  strokeEnded?(player: string, n: number, made: boolean): void;
}

/** The scene's drawings and texts players are told, by their ids in the GM's scene, as the `annotations` message lists those above the tokens. */
export interface ToldIds {
  readonly drawings: readonly string[];
  readonly texts: readonly string[];
}

/** Refusals a player is told: a burst, then two a second; one over that rate is still counted as dealt with. */
const REFUSAL_BURST = 10;
const REFUSALS_PER_SECOND = 2;

/** What a refused request is answered with; a taken one is answered by what the scene then holds. */
type Verdict = DrawRefusal | null;

/**
 * Players' own drawings and texts on one floor of the shared scene. A player's page asks; this
 * decides and writes, each taken request as one write of the GM's store and so one undo step.
 *
 * Every request is refused unless the GM lets players draw now, its sender sits at the table and
 * names the scene of the floor they see, the map is loaded, and the sender is within their rate.
 * A drawing is made here from what the gesture made and the tool's own words for its look
 * (`playerDrawing`, `madeText`): its width, opacity and size are the GM's tool's, never numbers a
 * page names. It must lie on the map or near its edge (`nearEdge`) and leave its maker within
 * what one player may have (`withinUse`). A change, a removal and an erasing reach only what the
 * sender made (`by`), is shown to players, lies above the tokens and is not locked, named by the
 * ids this player was told (`mine`): never the scene's own ids, never another player's. An eraser
 * is told as its sweep, and what it cuts is worked out here by the rule the GM's own eraser cuts
 * by, over the sender's drawings alone: nothing a page says can remove or reshape anything else.
 * Who sees a drawing, its layer, its lock, its group and its order are never taken from a player.
 */
export class PlayerDrawings {
  private scene: string | null = null;
  private readonly aliases = new PlayerAliases();
  /** The number of each player's last request that was dealt with. */
  private readonly seen = new Map<string, number>();
  private readonly ahead = new PointsAhead();
  private readonly rate: MoveRate = drawRate();
  private readonly refusalRate = new MoveRate(REFUSAL_BURST, REFUSALS_PER_SECOND);

  constructor(private readonly store: SceneStore, private readonly ports: PlayerDrawingPorts) {}

  /** The shared scene of this floor; another one knows none of the ids and requests of the last. */
  setScene(scene: string | null): void {
    if (scene === this.scene) return;
    this.scene = scene;
    this.aliases.clear();
    this.seen.clear();
    this.ahead.clear();
  }

  /** A player left the table or this floor: what they sent ahead goes, and their next page counts its requests anew. */
  playerLeft(player: string): void {
    this.ahead.playerLeft(player);
    this.seen.delete(player);
  }

  /**
   * What `player` is told is theirs of the drawings and texts players are told (`told`, in the
   * `annotations` message's order): each by its place there and the id the player names it by.
   * A locked one is not among them: its lock is against its maker too.
   */
  mine(player: string, told: ToldIds): Pick<DrawMine, 'drawings' | 'texts' | 'seen'> {
    const { drawings, texts } = levelObjects(this.store.getState());
    const own = (ids: readonly string[], records: Readonly<Record<string, DrawingStroke | TextElement>>): DrawOwn[] => {
      const list: DrawOwn[] = [];
      ids.forEach((id, at) => {
        if (isOwn(records[id], player)) list.push({ at, id: this.aliases.of(player, id), ...ownAnchors(records[id]) });
      });
      return list;
    };
    return { drawings: own(told.drawings, drawings), texts: own(told.texts, texts), seen: this.seen.get(player) ?? 0 };
  }

  /** A message of a player's Draw tool, but the drawing under way, which is no request. */
  receive(from: string, message: Exclude<PlayerDrawMessage, PlayerStroke>): void {
    if (message.t === 'draw-points') {
      if (this.refusal(from, message.scene) === null && message.n > (this.seen.get(from) ?? 0)) this.ahead.take(from, message, this.ports.now());
      return;
    }
    // A request dealt with before, sent again: it was answered then.
    if (message.n <= (this.seen.get(from) ?? 0)) return;
    const verdict = this.deal(from, message);
    this.seen.set(from, message.n);
    this.ahead.done(from, message.n);
    if (message.t === 'draw-add') this.ports.strokeEnded?.(from, message.n, verdict === null);
    if (verdict !== null && this.refusalRate.take(from, this.ports.now())) this.ports.send({ t: 'draw-refused', scene: message.scene, n: message.n, reason: verdict }, from);
    this.ports.changed();
  }

  /** Whether the GM takes anything of `from` in `scene` now, and why not. */
  refusal(from: string, scene: string): Verdict {
    if (!this.ports.allowed()) return 'off';
    if (this.scene === null || scene !== this.scene || !this.ports.seated(from)) return 'scene';
    const state = this.store.getState();
    return !state.mapLoaded || state.isMapLoading ? 'busy' : null;
  }

  private deal(from: string, message: Request): Verdict {
    const refusal = this.refusal(from, message.scene);
    if (refusal !== null) return refusal;
    if (!this.rate.take(from, this.ports.now())) return 'rate';
    switch (message.t) {
      case 'draw-add': return this.add(from, message);
      case 'draw-text': return this.addText(from, message);
      case 'draw-change': return this.change(from, message);
      case 'draw-remove': return this.remove(from, message);
      case 'draw-erase': return this.erase(from, message);
    }
  }

  private add(from: string, message: PlayerDrawAdd): Verdict {
    const state = this.store.getState();
    const cell = drawCell(state.grid);
    const points = this.ahead.all(from, message.n, message.from, message.pts);
    if (points === null) return 'shape';
    const drawing = playerDrawing(message.mode, points, message.closed === true, message.look, cell);
    if (drawing === null) return 'shape';
    if (!allNearEdge(drawing.points, this.ports.map(), cell)) return 'place';
    const objects = levelObjects(state);
    const use = playerUse(annotationList(objects), from);
    use.drawings += 1;
    use.points += drawingPoints(drawing);
    if (!withinUse(use) || annotationRoom(objects).drawings <= 0) return 'full';
    const record = newDrawing(state, { ...drawing, points: [...drawing.points], by: from }, orderOnTop(state));
    this.store.setState((draft) => {
      draft.objects.drawings[record.id] = record;
    });
    return null;
  }

  private addText(from: string, message: PlayerDrawText): Verdict {
    const state = this.store.getState();
    const cell = drawCell(state.grid);
    const map = this.ports.map();
    if (!nearEdge(message, map, cell)) return 'place';
    const made = madeText(message.text, message, textChoices(message.look), cell);
    const { wrap, breaks } = message;
    if (wrap !== undefined && (wrap < made.fontSize || wrap > maxWrap(map, cell))) return 'shape';
    const objects = levelObjects(state);
    const use = playerUse(annotationList(objects), from);
    use.texts += 1;
    if (!withinUse(use) || annotationRoom(objects).texts <= 0) return 'full';
    const id = newAnnotationId('text');
    const record: TextElement = {
      id, kind: 'text', ...made,
      ...(wrap !== undefined && { width: wrap }), ...(wrap !== undefined && breaks !== undefined && { breaks: [...breaks] }),
      order: orderOnTop(state), by: from, ...placedOnViewedLevel(state),
    };
    this.store.setState((draft) => {
      draft.objects.texts[id] = record;
    });
    return null;
  }

  private change(from: string, message: PlayerDrawChange): Verdict {
    const state = this.store.getState();
    const own = this.ownOf(from, message.ids, state);
    if (own === null) return 'gone';
    const cell = drawCell(state.grid);
    const map = this.ports.map();
    let places: Record<string, AnnotationPlace> = {};
    let writes: StyleWrite[] = [];
    if ('map' in message) {
      const transform = transformOf(message.map);
      for (const annotation of own) places[annotation.id] = placedBy(annotation, transform);
    } else if ('style' in message) {
      const { field, value } = styleChoice(message.style);
      writes = styleWrites(field, value, own, cell);
      // A pick that styles none of them changes nothing: there is nothing to refuse.
      if (writes.length === 0) return null;
    } else if ('line' in message) {
      const place = this.linePlace(from, message.n, own[0], message.line);
      if (place === null) return 'shape';
      places = { [own[0]!.id]: place };
    } else {
      const place = wordsPlace(own[0], message.words, maxWrap(map, cell));
      if (place === null) return 'shape';
      places = { [own[0]!.id]: place };
    }
    for (const write of writes) if (write.kind === 'place') places = { ...places, ...write.places };
    const after = placedAnnotations(own, places);
    if (after === null) return 'shape';
    if (!after.every((annotation) => placeAllowed(annotation, map, cell))) return 'place';
    if (!withinUse(useAfter(annotationList(levelObjects(state)), from, own, after))) return 'full';
    this.store.setState((draft) => {
      for (const [id, place] of Object.entries(places)) {
        const drawing = draft.objects.drawings[id];
        const text = draft.objects.texts[id];
        if (drawing) changeDrawing(drawing, place, DRAWING_PLACE_FIELDS);
        if (text) changeText(text, place, 'words' in message ? WORDS_FIELDS : TEXT_PLACE_FIELDS);
      }
      for (const write of writes) applyStyle(draft, write);
    });
    return null;
  }

  /** A line's points set anew as a place; null for anything but a drawing with a line, or points that are none. */
  private linePlace(from: string, n: number, annotation: Annotation | undefined, line: Extract<PlayerDrawChange, { line: unknown }>['line']): AnnotationPlace | null {
    if (annotation?.kind !== 'drawing' || annotation.shape === 'stamp') return null;
    const points = this.ahead.all(from, n, line.from, line.pts);
    if (points === null || points.length === 0) return null;
    // A drawing without the points it was clicked with is a line with corners; the reader drops anchors that do not lie on the line.
    return { points, anchors: line.anchors === undefined ? undefined : pointsOf(line.anchors) };
  }

  private remove(from: string, message: PlayerDrawRemove): Verdict {
    const own = this.ownOf(from, message.ids, this.store.getState());
    if (own === null) return 'gone';
    const ids = new Set(own.map(({ id }) => id));
    this.store.setState((draft) => removeFrom(draft, ids));
    return null;
  }

  private erase(from: string, message: PlayerDrawErase): Verdict {
    const state = this.store.getState();
    const cell = drawCell(state.grid);
    const points = pointsOf(message.pts);
    if (!allNearEdge(points, this.ports.map(), cell)) return 'place';
    const objects = levelObjects(state);
    const list = annotationList(objects);
    // The sweep is run over the sender's own alone: nothing else can be reached by it.
    const own = list.filter((annotation) => isOwn(annotation.record, from));
    const change = sweepChange(new AnnotationIndex(own), { points, radius: eraserRadius(message.size, cell) }, message.whole === true);
    // A sweep that reaches nothing of theirs changes nothing.
    if (change === null) return null;
    // A cut leaves more drawings than it takes: where the level or the player cannot hold them, nothing is cut.
    const use = erasedUse(playerUse(list, from), own, change.removed, change.added);
    if (!withinUse(use) || change.added.length - change.removed.length > annotationRoom(objects).drawings) return 'full';
    const added = change.added.map((piece) => newDrawing(state, piece, undefined));
    const gone = new Set([...change.removed, ...change.texts]);
    this.store.setState((draft) => {
      removeFrom(draft, gone);
      for (const piece of added) draft.objects.drawings[piece.id] = piece;
    });
    return null;
  }

  /** The annotations a player names, where every one of them is theirs to change; null where any is not, is gone, or is named by an id they were never told. */
  private ownOf(from: string, ids: readonly string[], state: SceneState): Annotation[] | null {
    const { drawings, texts } = levelObjects(state);
    const own: Annotation[] = [];
    for (const alias of ids) {
      const id = this.aliases.idOf(from, alias);
      if (id === undefined) return null;
      const record = drawings[id] ?? texts[id];
      const annotation = !isOwn(record, from) ? null : drawings[id] ? readDrawing(id, record) : readText(id, record);
      if (!annotation) return null;
      own.push(annotation);
    }
    return own.length > 0 ? own : null;
  }
}
