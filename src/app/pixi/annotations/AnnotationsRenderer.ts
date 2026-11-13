import { Container } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { StoreApi } from 'zustand';
import { annotationList } from '../../annotations/annotationList';
import type { DrawMode } from '../../annotations/annotationTypes';
import type { GridGeometry } from '../../grid/gridDistance';
import { isTextEntryTarget } from '../../keyboard/textEntry';
import { levelObjects } from '../../levels/levelObjects';
import type { ViewAtlasState } from '../../storeFactory';
import { DrawingInteraction } from '../DrawingInteraction';
import { MAP_LAYER_Z } from '../mapLayerOrder';
import type { TesseraView } from '../mosaicCanvas/levelOfDetail';
import type { LayerVisibility } from '../playerSafeFrame';
import { TextInteraction } from '../TextInteraction';
import { TextSharpening, type TextSharpnessHost } from '../TextSharpening';
import { destroyTree } from '../utils/destroyTree';
import { AnnotationLayer } from './AnnotationLayer';
import { askForText, showAnnotationsFullNotice } from './annotationNotices';
import { AnnotationPlayersView } from './annotationPlayersView';
import { ClickPlacing } from './ClickPlacing';
import { DrawInput } from './DrawInput';
import { DrawToolHost, type FullOf } from './DrawToolHost';
import { activeDrawMode } from './drawToolState';
import { PictureViews } from './PictureViews';

export interface AnnotationsRendererOptions {
  readonly viewport: Viewport;
  readonly store: StoreApi<ViewAtlasState>;
  /** The grid points snap to; null while the view has none. Whether the grid's Snap is on is read from the store. */
  grid(): GridGeometry | null;
  /** What the texts must know of the view's renderer to stay sharp; unset, the screen's pixels to a point. */
  readonly sharpness?: TextSharpnessHost;
  /** Whether a key pressed now is this map's to take (`canRunMapHotkeys`); unset, every key outside a text field is. */
  keysBelongToMap?(event: KeyboardEvent): boolean;
  /**
   * Whether the canvas shows the players' picture now (session view, a peek, the palette's player
   * mode); null where nobody can say yet, and unset: then the store's own view switches say it.
   */
  showsPlayers?(): boolean | null;
  /** A selected text moved or changed: the selection is drawn again. */
  selectionChanged?(): void;
  /** The picture changed in a way PIXI does not see (a stamp's symbol came in). */
  requestRender?(): void;
  /** Tells the GM that the level shown is full; unset, a notice. */
  readonly full?: (of: FullOf) => void;
  /** Asks the GM for a text's words; unset, the text dialog. */
  readonly askText?: () => Promise<string | null>;
}

/** A renderer nothing more is known of: the screen's pixels to a point, as `PixiAppManager` sets up every view's. */
const SCREEN_SHARPNESS_HOST: TextSharpnessHost = { resolution: () => window.devicePixelRatio || 1, maxTextureSide: () => null };

/** What lies over the whole map once it is open: the GM then works there, and no longer on what was being drawn. */
const COVERS_MAP = ['isDMScreenOpen', 'isCommandPaletteOpen', 'isAssetManagerOpen'] as const;

/** The modes in which the tool works on the map by itself: a text then takes no press, so the tool draws and erases over it. */
const WORKING_MODES: readonly DrawMode[] = ['pen', 'line', 'rectangle', 'ellipse', 'eraser', 'stamp', 'text'];

/**
 * The drawings and texts of one map view: owns their layer (`AnnotationLayer`, drawn from the
 * store, so undo, redo and another level show at once), what keeps the texts sharp, the Draw
 * tool's input (`DrawInput`, `ClickPlacing`) with what it writes (`DrawToolHost`), and who sees
 * what (`AnnotationPlayersView`). Selecting, moving and the menus of what is on the map are the
 * two interactions it holds for the select and move tools (`drawings`, and the texts' own).
 *
 * The tool works on the GM's view of the canvas alone: while the canvas shows the players' picture
 * no gesture starts and one under way is dropped, so nothing is drawn or erased that is not shown.
 */
export class AnnotationsRenderer {
  readonly layer: AnnotationLayer;
  /** Selects and drags drawings with the select and move tools: the viewport's dispatch hands it the pointer. */
  readonly drawings: DrawingInteraction;

  private readonly store: StoreApi<ViewAtlasState>;
  private readonly viewport: Viewport;
  private readonly sharpening: TextSharpening;
  /**
   * Where the tool's own marks go (the eraser's ring; handles and hover belong here too): above
   * the drawings, and the GM's alone. Never in a players' frame or a picture of the scene, and
   * hidden while the canvas shows the players' picture.
   */
  readonly chrome = new Container({ label: 'annotation-chrome', zIndex: MAP_LAYER_Z.annotations, eventMode: 'none', interactiveChildren: false });
  private readonly players: AnnotationPlayersView;
  private readonly views: PictureViews;
  private readonly texts: TextInteraction | null;
  private readonly host: DrawToolHost;
  private readonly input: DrawInput;
  private readonly clicks: ClickPlacing;
  private readonly unsubscribe: () => void;
  /** The records the list was last read from. */
  private drawingsRecord: unknown = null;
  private textsRecord: unknown = null;
  /** The camera is followed in the view's tick: only while there is something to show or hide. */
  private ticking = false;

  constructor(private readonly options: AnnotationsRendererOptions) {
    const { viewport, store } = options;
    this.viewport = viewport;
    this.store = store;
    this.sharpening = new TextSharpening(viewport, options.sharpness ?? SCREEN_SHARPNESS_HOST);
    this.layer = new AnnotationLayer(viewport, {
      zoom: () => Math.abs(viewport.scale.x) || 1,
      sharpness: this.sharpening,
      changed: () => options.requestRender?.(),
      textView: (text, view) => this.texts?.adopt(text.id, view),
    });
    viewport.addChild(this.chrome);
    this.players = new AnnotationPlayersView([...this.layer.gmLayers, this.chrome]);
    this.views = new PictureViews(viewport, (views, whole) => this.layer.setViews(views, whole));
    // Before the texts' interaction listens: a changed text is drawn before its handles are placed by it.
    this.unsubscribe = store.subscribe((state, previous) => this.follow(state, previous));
    this.drawings = new DrawingInteraction(viewport, store, (drawing) => !drawing.hidden || !this.showsPlayers());
    // A view that is the players' own takes no press on a text.
    this.texts = store.getState().isPlayerView
      ? null
      : new TextInteraction(viewport, store, () => options.selectionChanged?.(), { view: (id) => this.layer.node('text', id), touched: () => this.sharpening.touch() });
    this.host = new DrawToolHost({
      viewport,
      store,
      layerOf: (place, hidden) => this.layer.layerOf(place, hidden),
      measure: this.layer.measure,
      chrome: this.chrome,
      snapGrid: () => ((store.getState().grid?.snapToGrid ?? true) ? options.grid() : null),
      gmView: () => !this.showsPlayers(),
      full: options.full ?? showAnnotationsFullNotice,
      askText: options.askText ?? askForText,
    });
    this.input = new DrawInput(viewport, this.host.gestures, {
      typed: (event) => isTextEntryTarget(event.target),
      areMaps: (event) => options.keysBelongToMap?.(event) ?? true,
    });
    this.clicks = new ClickPlacing(viewport, this.host.clicks);

    const state = store.getState();
    this.read(state);
    this.toolChanged(state, null);
    this.refreshVisibility();
  }

  /** A gesture of the Draw tool is under way: a press belongs to it, wherever it lands. */
  get drawing(): boolean {
    return this.input.drawing;
  }

  /** What a players' frame changes for its one render: what only the GM sees is left out, and so are a selected text's handles. */
  getPlayerViewLayers(): LayerVisibility[] {
    return [...this.players.playerViewLayers(), ...this.handleLayers()];
  }

  /** What a picture of the scene changes for its render: it is the GM's, without what the GM keeps from the players and without the tool's and the selection's marks. */
  getPictureLayers(): LayerVisibility[] {
    return [...this.players.pictureLayers(), ...this.handleLayers()];
  }

  /**
   * The canvas shows the players' picture, or the GM's again: what only the GM sees shows by it.
   * In the players' picture the tool does not work, and what it hides is selected no longer, so
   * nothing stands around a place where the players see nothing.
   */
  refreshVisibility(): void {
    const players = this.showsPlayers();
    this.players.showOnCanvas(players);
    if (players) {
      this.input.stop();
      this.deselectHidden();
    }
    this.host.toolChanged();
  }

  /**
   * Keeps what `region` shows drawn, and its texts as fine as its pixels need, until the returned
   * function is called: a picture of the map rendered with a camera of its own (the player window's frame).
   */
  addDemandRegion(region: TesseraView): () => void {
    const releases = [this.sharpening.addDemandRegion(region), this.views.addRegion(region)];
    // Told at once: the picture may be rendered before the next tick.
    if (this.ticking) this.views.look();
    return (): void => {
      for (const release of releases) release();
    };
  }

  /**
   * Shows what `picture` shows of the map for a render that follows at once (all of it for null),
   * also where no camera or region has asked for it yet; the returned function puts it back.
   */
  showFor(picture: TesseraView | null): () => void {
    return this.views.showFor(picture);
  }

  /** The dispatch that claims presses listens now: the Draw tool hears them after it. */
  hearPressesLast(): void {
    this.input.hearPressesLast();
    this.clicks.hearPressesLast();
  }

  /** The map is no longer what the GM looks at (another tab, another scene): a shape under way is dropped, a sweep ends where it is. */
  leave(): void {
    this.input.stop();
  }

  destroy(): void {
    this.unsubscribe();
    this.watch(false);
    this.input.destroy();
    this.clicks.destroy();
    this.host.destroy();
    this.texts?.destroy();
    this.drawings.destroy();
    this.layer.destroy();
    this.sharpening.destroy();
    destroyTree(this.chrome);
  }

  /** A selected text's handles as a frame for others shows them: not at all. They show and hide by the selection, so only a frame's one render overrides them. */
  private handleLayers(): LayerVisibility[] {
    return (this.texts?.handleLayers ?? []).map((layer) => ({ layer, visible: false }));
  }

  /** Takes what only the GM sees out of the selection. */
  private deselectHidden(): void {
    const state = this.store.getState();
    if (state.selectedIds.length === 0) return;
    const hidden = new Set(annotationList(levelObjects(state)).filter((annotation) => annotation.hidden).map(({ id }) => id));
    if (state.selectedIds.some((id) => hidden.has(id))) state.setSelection(state.selectedIds.filter((id) => !hidden.has(id)));
  }

  private showsPlayers(): boolean {
    const { isGMView, isPlayerView } = this.store.getState();
    return this.options.showsPlayers?.() ?? (!isGMView || isPlayerView === true);
  }

  private follow(state: ViewAtlasState, previous: ViewAtlasState): void {
    const mode = activeDrawMode(state);
    const before = activeDrawMode(previous);
    const sameScene = state.mapPath === previous.mapPath && state.viewedLevel === previous.viewedLevel;
    // Another mode, scene or level, or something opened over the map (by a key too): what was being drawn belongs to none of them.
    if (mode !== before || !sameScene || COVERS_MAP.some((open) => state[open] && !previous[open])) this.input.stop();
    if (state.isGMView !== previous.isGMView || state.isPlayerView !== previous.isPlayerView) this.refreshVisibility();
    if (mode !== before) this.toolChanged(state, before);
    else if (state.drawTool.size !== previous.drawTool.size || state.grid !== previous.grid) this.host.toolChanged();
    this.read(state);
  }

  /** Draws the annotations of the level shown when a record of theirs is another. */
  private read(state: ViewAtlasState): void {
    const objects = levelObjects(state);
    if (objects.drawings === this.drawingsRecord && objects.texts === this.textsRecord) return;
    this.drawingsRecord = objects.drawings;
    this.textsRecord = objects.texts;
    const list = annotationList(objects);
    this.watch(list.length > 0);
    this.layer.setList(list);
  }

  /** Follows the camera in the view's tick, or stops: nothing is shown, hidden or drawn while there is nothing on the map. */
  private watch(on: boolean): void {
    if (on === this.ticking) return;
    this.ticking = on;
    const ticker = this.viewport.options.ticker;
    if (!on) {
      ticker?.remove(this.tick);
      return;
    }
    ticker?.add(this.tick);
    this.views.look();
  }

  /** The camera moves without a word, so it is read every frame; what a picture shows for the first time is drawn a part at a frame. */
  private readonly tick = (): void => {
    this.views.look();
    if (this.layer.building) this.layer.build();
  };

  /** The Draw tool came into hand, went, or works in another mode. */
  private toolChanged(state: ViewAtlasState, before: DrawMode | null): void {
    const mode = activeDrawMode(state);
    this.input.setEnabled(mode !== null);
    this.clicks.setEnabled(mode === 'stamp' || mode === 'text');
    this.layer.setTextsTakePointer(mode === null || !WORKING_MODES.includes(mode));
    if (mode === 'text') this.viewport.cursor = 'text';
    else if (before === 'text') this.viewport.cursor = 'default';
    this.host.toolChanged();
  }
}
