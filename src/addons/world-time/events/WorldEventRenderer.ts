import { Container, Graphics, Text, TextStyle, type FederatedPointerEvent } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { App } from 'obsidian';
import type { NotePin } from 'src/app/types';
import type { ViewAtlasStore } from 'src/app/storeFactory';
import { SettingsService } from 'src/app/services/SettingsService';
import { hexLayoutOfGrid, pinDisplayPoint } from 'src/app/grid/hexLinks';
import { destroyTree } from 'src/app/pixi/utils/destroyTree';
import { openContextMenuGlobal } from 'src/app/react/root/ContextMenuContext';
import { CalendarService } from '../calendar/CalendarService';
import { viewingSpan } from '../dating/dateRange';
import { WorldNoteIndex } from '../notes/WorldNoteIndex';
import { effectiveViewingDate } from '../WorldTimeController';
import { worldSettingsOf } from '../worldSettings';
import { placeEvents, type EventMarker } from './eventPlacement';

const MARKER_RADIUS = 7;
/** Screen distance from the pin centre to the first marker, and between stacked markers. */
const MARKER_OFFSET = 16;
const CURRENT_COLOR = 0xe0ac00;
const RUMOUR_COLOR = 0x9a9a9a;

/**
 * Shows world events as small markers beside the pins of the places they
 * happened at. GM-only like pins: hidden in player views
 * and left out of every player frame (`getContainer` is a DM layer).
 */
/** What the markers depend on of the pins: which there are, their notes and hex links, not where they stand. */
function pinIdentity(pins: Readonly<Record<string, NotePin>>): string {
  return Object.values(pins).map((pin) => `${pin.id}|${pin.notePath}|${pin.hex ? 1 : 0}`).join(';');
}

export class WorldEventRenderer {
  private readonly container = new Container();
  private readonly unsubscribers: Array<() => void> = [];
  private readonly zoomHandler = (): void => this.updateScale();
  private scheduled = false;
  /** Which pins and notes the markers were built from; positions are not part of it. */
  private builtFrom = '';
  /** The pin each marker hangs from, to move markers with a dragged pin. */
  private readonly markerPins = new Map<Container, string>();
  private destroyed = false;

  constructor(
    private readonly app: App,
    private readonly viewport: Viewport,
    private readonly store: ViewAtlasStore,
  ) {
    this.container.label = 'worldEvents';
    this.container.zIndex = 950;
    this.container.sortableChildren = true;
    viewport.addChild(this.container);
    viewport.on('zoomed', this.zoomHandler);
    viewport.on('zoomed-end', this.zoomHandler);

    const notes = WorldNoteIndex.forApp(app);
    const calendars = CalendarService.forApp(app);
    this.unsubscribers.push(
      // A pin that only moved moves its markers; anything else builds them anew
      store.subscribe((state) => state.objects.pins, (pins) => {
        if (pinIdentity(pins) === this.builtFrom) this.reposition();
        else this.schedule();
      }),
      store.subscribe((state) => state.worldTimeMask, () => this.schedule()),
      store.subscribe((state) => state.worldTime, () => this.schedule()),
      store.subscribe((state) => state.grid, () => this.schedule()),
      store.subscribe((state) => state.isGMView, () => this.schedule()),
      notes.subscribe(() => this.schedule()),
      calendars.subscribe(() => this.schedule()),
    );
    const settings = SettingsService.forApp(app);
    if (settings) this.unsubscribers.push(settings.onChange(() => this.schedule()));
    this.rebuild();
  }

  /** The DM-only layer, for the player-safe frame. */
  getContainer(): Container {
    return this.container;
  }

  destroy(): void {
    this.destroyed = true;
    for (const unsubscribe of this.unsubscribers) unsubscribe();
    this.unsubscribers.length = 0;
    this.viewport.off('zoomed', this.zoomHandler);
    this.viewport.off('zoomed-end', this.zoomHandler);
    destroyTree(this.container);
  }

  private schedule(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      if (!this.destroyed) this.rebuild();
    });
  }

  private markers(): EventMarker[] {
    const state = this.store.getState();
    if (state.isPlayerView || !state.isGMView) return [];
    const settings = worldSettingsOf(SettingsService.forApp(this.app));
    const calendar = CalendarService.forApp(this.app).calendar();
    const viewing = viewingSpan(calendar, effectiveViewingDate(state.worldTime, settings));
    if (!viewing) return [];
    const visiblePins: Record<string, NotePin> = {};
    for (const [id, pin] of Object.entries(state.objects.pins)) {
      if (!state.worldTimeMask.hidden[id]) visiblePins[id] = pin;
    }
    const notes = WorldNoteIndex.forApp(this.app);
    return placeEvents({
      calendar,
      events: notes.events(),
      pins: visiblePins,
      parentOf: (path) => notes.parentOf(path),
      viewing,
      rumourDays: Math.round(settings.rumourYears * calendar.daysPerYear),
    });
  }

  private rebuild(): void {
    for (const child of this.container.removeChildren()) destroyTree(child);
    this.markerPins.clear();
    const state = this.store.getState();
    this.builtFrom = pinIdentity(state.objects.pins);
    const layout = hexLayoutOfGrid(state.grid);
    const stackByPin = new Map<string, number>();
    for (const marker of this.markers()) {
      const pin = state.objects.pins[marker.pinId];
      if (!pin) continue;
      const index = stackByPin.get(marker.pinId) ?? 0;
      stackByPin.set(marker.pinId, index + 1);
      const anchor = pinDisplayPoint(pin, layout);
      const node = this.createMarker(marker, index);
      node.position.set(anchor.x, anchor.y);
      this.container.addChild(node);
      this.markerPins.set(node, marker.pinId);
    }
    this.updateScale();
  }

  /** Moves every marker to its pin's place, building nothing. */
  private reposition(): void {
    const state = this.store.getState();
    const layout = hexLayoutOfGrid(state.grid);
    for (const [node, pinId] of this.markerPins) {
      const pin = state.objects.pins[pinId];
      if (!pin) continue;
      const anchor = pinDisplayPoint(pin, layout);
      node.position.set(anchor.x, anchor.y);
    }
  }

  private createMarker(marker: EventMarker, stackIndex: number): Container {
    const node = new Container();
    node.label = `event-${marker.key}`;
    node.zIndex = marker.event.importance;
    const body = new Container();
    body.position.set(MARKER_OFFSET, -MARKER_OFFSET - stackIndex * MARKER_OFFSET);
    node.addChild(body);

    const isRumour = marker.mode === 'rumour';
    const size = MARKER_RADIUS + (marker.event.importance - 3);
    const shape = new Graphics()
      .poly([0, -size, size, 0, 0, size, -size, 0])
      .fill({ color: isRumour ? RUMOUR_COLOR : CURRENT_COLOR, alpha: isRumour ? 0.7 : 0.95 })
      .stroke({ width: 1.5, color: 0x1e1e1e, alpha: 0.8 });
    body.addChild(shape);

    const label = new Text({
      text: isRumour ? `Rumour: ${marker.event.title}` : marker.event.title,
      style: new TextStyle({ fill: 0xffffff, fontSize: 12, fontFamily: 'Arial, sans-serif', stroke: { color: 0x000000, width: 3 } }),
      resolution: 4,
    });
    label.anchor.set(0, 0.5);
    label.position.set(size + 4, 0);
    label.visible = false;
    body.addChild(label);

    body.eventMode = 'static';
    body.cursor = 'pointer';
    body.on('pointerover', () => { label.visible = true; });
    body.on('pointerout', () => { label.visible = false; });
    body.on('pointerdown', (e: FederatedPointerEvent) => {
      e.stopPropagation();
      if (e.button === 2) this.showMenu(marker, e);
    });
    body.on('pointertap', (e: FederatedPointerEvent) => {
      if (e.button === 0) void this.app.workspace.openLinkText(marker.event.path, '', 'tab');
    });
    return node;
  }

  private showMenu(marker: EventMarker, e: FederatedPointerEvent): void {
    const original = e.originalEvent as unknown;
    const position = original instanceof MouseEvent ? { x: original.clientX, y: original.clientY } : { x: e.global.x, y: e.global.y };
    const { event } = marker;
    openContextMenuGlobal([
      { type: 'item', label: 'Open event note', icon: 'file-text', onClick: () => this.app.workspace.openLinkText(event.path, '', 'tab') },
      ...(event.date ? [{
        type: 'item' as const,
        label: 'Go to event date',
        icon: 'calendar-clock',
        onClick: () => this.store.getState().setViewingDate(event.date ?? null),
      }] : []),
    ], position);
  }

  /** Markers keep their screen size, like pins. */
  private updateScale(): void {
    const scale = Math.max(0.15, 1 / this.viewport.scale.x);
    for (const child of this.container.children) child.scale.set(scale);
  }
}
